import { Prisma } from "@prisma/client";
import type { FundedDeal as DealRow, PaymentScheduleEntry as EntryRow } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateDeal, centsToDollars, dollarsToCents, validateDealCalculationInput } from "./finance";
import { applyLoweredPayment, applyPause, buildSchedule, recastSchedule, type ScheduleEntry } from "./schedule";
import { isDueInEastern } from "./timezone";
import type { PaymentFrequency } from "./types";

/**
 * Every write to PaymentScheduleEntry / PaymentAdjustment / AuditEntry / the balance-override fields
 * on FundedDeal goes through this module. Keeping it centralized means the client's live-preview
 * math (finance.ts / schedule.ts, imported directly by the UI) and the server's authoritative
 * calculation always run the exact same functions -- the client just never gets to skip validation.
 */

function toScheduleEntry(row: EntryRow): ScheduleEntry {
  return {
    sequence: row.sequence,
    dueDate: row.dueDate,
    scheduledAmountCents: row.scheduledAmountCents,
    status: row.status,
    postedAmountCents: row.postedAmountCents ?? undefined,
    adjustmentId: row.adjustmentId,
  };
}

export interface DealAuditContext {
  userId: string;
  reason?: string;
}

async function writeAuditEntry(
  tx: Prisma.TransactionClient,
  fundedDealId: string,
  category: string,
  previousValue: unknown,
  newValue: unknown,
  context: DealAuditContext,
  effectiveDate?: Date | null,
) {
  await tx.auditEntry.create({
    data: {
      fundedDealId,
      category,
      previousValue: previousValue === undefined || previousValue === null ? Prisma.DbNull : (previousValue as Prisma.InputJsonValue),
      newValue: newValue === undefined || newValue === null ? Prisma.DbNull : (newValue as Prisma.InputJsonValue),
      effectiveDate: effectiveDate ?? null,
      reason: context.reason ?? null,
      userId: context.userId,
    },
  });
}

function dealCalculationInput(deal: Pick<DealRow, "fundedAmount" | "factorRate" | "termValue" | "paymentFrequency" | "syndicationPercent">) {
  return {
    fundedAmount: deal.fundedAmount,
    factorRate: deal.factorRate,
    termValue: deal.termValue,
    paymentFrequency: deal.paymentFrequency as PaymentFrequency,
    syndicationPercent: deal.syndicationPercent * 100,
  };
}

/** Builds the very first persisted schedule for a deal. Safe to call only when no entries exist yet. */
export async function generateInitialSchedule(dealId: string, context: DealAuditContext) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const existingCount = await tx.paymentScheduleEntry.count({ where: { fundedDealId: dealId } });
    if (existingCount > 0) {
      throw new Error("Schedule already exists for this deal; use recastDealSchedule instead.");
    }

    const calcInput = dealCalculationInput(deal);
    const validationErrors = validateDealCalculationInput(calcInput);
    if (validationErrors.length) {
      throw new Error(validationErrors.map((e) => e.message).join(" "));
    }

    const calc = calculateDeal(calcInput);
    if (calc.periods <= 0 || calc.totalPaybackCents <= 0) return [];

    const anchor = deal.firstPaymentDate ?? deal.fundedDate ?? new Date();
    const weekday = deal.paymentFrequency === "weekly" ? (deal.paymentWeekday ?? anchor.getUTCDay()) : null;

    const entries = buildSchedule({
      anchorDate: anchor,
      frequency: deal.paymentFrequency as PaymentFrequency,
      weekday,
      periods: calc.periods,
      totalCents: calc.totalPaybackCents,
    });

    await tx.paymentScheduleEntry.createMany({
      data: entries.map((entry) => ({
        fundedDealId: dealId,
        sequence: entry.sequence,
        dueDate: entry.dueDate,
        scheduledAmountCents: entry.scheduledAmountCents,
        status: entry.status,
      })),
    });

    if (deal.paymentWeekday === null && weekday !== null) {
      await tx.fundedDeal.update({ where: { id: dealId }, data: { paymentWeekday: weekday } });
    }

    await writeAuditEntry(tx, dealId, "schedule-recast", null, { periods: calc.periods, totalPaybackCents: calc.totalPaybackCents }, context);
    return entries;
  });
}

export interface RecastOptions extends DealAuditContext {
  effectiveDate: Date;
  weekday?: number | null;
}

/**
 * Recasts the remaining (not-yet-posted) schedule after deal terms change. Posted history is always
 * preserved -- this is the "safe default" the product spec calls for; callers that explicitly want a
 * full rebuild (no posted payments exist yet) should call generateInitialSchedule after clearing the
 * table themselves, which is intentionally a separate, more deliberate code path.
 */
export async function recastDealSchedule(dealId: string, options: RecastOptions) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const existingRows = await tx.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId }, orderBy: { sequence: "asc" } });
    const existing = existingRows.map(toScheduleEntry);

    const calcInput = dealCalculationInput(deal);
    const validationErrors = validateDealCalculationInput(calcInput);
    if (validationErrors.length) {
      throw new Error(validationErrors.map((e) => e.message).join(" "));
    }

    const calc = calculateDeal(calcInput);
    const postedCents = existing.filter((e) => e.status === "posted").reduce((sum, e) => sum + (e.postedAmountCents ?? e.scheduledAmountCents), 0);
    const postedCount = existing.filter((e) => e.status === "posted").length;
    const remainingTotalCents = Math.max(0, calc.totalPaybackCents - postedCents);
    const remainingPeriods = Math.max(0, calc.periods - postedCount);

    const weekday = options.weekday ?? deal.paymentWeekday;
    const recast = recastSchedule({
      existingEntries: existing,
      frequency: deal.paymentFrequency as PaymentFrequency,
      weekday: deal.paymentFrequency === "weekly" ? weekday : null,
      effectiveDate: options.effectiveDate,
      remainingTotalCents,
      remainingPeriods,
    });

    await tx.paymentScheduleEntry.deleteMany({ where: { fundedDealId: dealId, status: "pending" } });
    const pendingToInsert = recast.filter((e) => e.status === "pending");
    if (pendingToInsert.length) {
      await tx.paymentScheduleEntry.createMany({
        data: pendingToInsert.map((entry) => ({
          fundedDealId: dealId,
          sequence: entry.sequence,
          dueDate: entry.dueDate,
          scheduledAmountCents: entry.scheduledAmountCents,
          status: entry.status,
        })),
      });
    }

    if (weekday !== undefined && weekday !== deal.paymentWeekday) {
      await tx.fundedDeal.update({ where: { id: dealId }, data: { paymentWeekday: weekday } });
    }

    await writeAuditEntry(
      tx,
      dealId,
      "schedule-recast",
      { existingPendingCount: existing.filter((e) => e.status === "pending").length },
      { remainingPeriods, remainingTotalCents },
      options,
      options.effectiveDate,
    );

    return recast;
  });
}

export interface LoweredPaymentInput extends DealAuditContext {
  newAmount: number;
  effectiveDate: Date;
  endDate: Date | null;
}

export async function applyLoweredPaymentAdjustment(dealId: string, input: LoweredPaymentInput) {
  if (!Number.isFinite(input.newAmount) || input.newAmount < 0) {
    throw new Error("Lowered payment amount must be zero or greater.");
  }
  if (!input.reason) {
    throw new Error("A reason is required for a lowered payment adjustment.");
  }

  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const adjustment = await tx.paymentAdjustment.create({
      data: {
        fundedDealId: dealId,
        type: "lowered",
        newAmountCents: dollarsToCents(input.newAmount),
        effectiveDate: input.effectiveDate,
        endDate: input.endDate,
        reason: input.reason,
        createdByUserId: input.userId,
      },
    });

    const existingRows = await tx.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId } });
    const updated = applyLoweredPayment({
      entries: existingRows.map(toScheduleEntry),
      newAmountCents: dollarsToCents(input.newAmount),
      effectiveDate: input.effectiveDate,
      endDate: input.endDate,
      adjustmentId: adjustment.id,
    });

    for (const entry of updated) {
      const row = existingRows.find((r) => r.sequence === entry.sequence);
      if (row && row.scheduledAmountCents !== entry.scheduledAmountCents) {
        await tx.paymentScheduleEntry.update({
          where: { id: row.id },
          data: { scheduledAmountCents: entry.scheduledAmountCents, adjustmentId: entry.adjustmentId ?? null },
        });
      }
    }

    await writeAuditEntry(
      tx,
      dealId,
      "payment-adjustment",
      { contractualPaymentAmount: deal.paymentAmount },
      { type: "lowered", newAmount: input.newAmount, endDate: input.endDate },
      input,
      input.effectiveDate,
    );

    return adjustment;
  });
}

export interface PauseInput extends DealAuditContext {
  pauseStart: Date;
  resumeDate: Date | null;
}

export async function applyPauseAdjustment(dealId: string, input: PauseInput) {
  if (!input.reason) {
    throw new Error("A reason is required for a payment pause.");
  }

  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const adjustment = await tx.paymentAdjustment.create({
      data: {
        fundedDealId: dealId,
        type: "pause",
        effectiveDate: input.pauseStart,
        endDate: input.resumeDate,
        reason: input.reason,
        createdByUserId: input.userId,
      },
    });

    const existingRows = await tx.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId } });
    const updated = applyPause({
      entries: existingRows.map(toScheduleEntry),
      pauseStart: input.pauseStart,
      resumeDate: input.resumeDate,
      frequency: deal.paymentFrequency as PaymentFrequency,
      weekday: deal.paymentWeekday,
    });

    // Reconcile: update changed rows, insert newly appended tail rows.
    const existingBySequence = new Map(existingRows.map((r) => [r.sequence, r]));
    for (const entry of updated) {
      const row = existingBySequence.get(entry.sequence);
      if (row) {
        if (row.status !== entry.status || row.adjustmentId !== (entry.adjustmentId ?? null)) {
          await tx.paymentScheduleEntry.update({
            where: { id: row.id },
            data: { status: entry.status, adjustmentId: entry.status === "paused" ? adjustment.id : row.adjustmentId },
          });
        }
      } else {
        await tx.paymentScheduleEntry.create({
          data: {
            fundedDealId: dealId,
            sequence: entry.sequence,
            dueDate: entry.dueDate,
            scheduledAmountCents: entry.scheduledAmountCents,
            status: entry.status,
          },
        });
      }
    }

    await writeAuditEntry(
      tx,
      dealId,
      "payment-adjustment",
      null,
      { type: "pause", resumeDate: input.resumeDate },
      input,
      input.pauseStart,
    );

    return adjustment;
  });
}

export interface BalanceOverrideInput extends DealAuditContext {
  overrideAmount: number;
  effectiveDate: Date;
}

export async function setBalanceOverride(dealId: string, input: BalanceOverrideInput) {
  if (!Number.isFinite(input.overrideAmount) || input.overrideAmount < 0) {
    throw new Error("Override balance cannot be negative.");
  }
  if (!input.reason) {
    throw new Error("A reason is required to override the calculated balance.");
  }

  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const previousOverrideCents = deal.balanceOverrideCents;
    const newCents = dollarsToCents(input.overrideAmount);

    const updated = await tx.fundedDeal.update({
      where: { id: dealId },
      data: {
        balanceOverrideCents: newCents,
        balanceOverrideEffectiveDate: input.effectiveDate,
        balanceOverrideReason: input.reason,
        balanceOverrideSetByUserId: input.userId,
        balanceOverrideSetAt: new Date(),
      },
    });

    await writeAuditEntry(
      tx,
      dealId,
      "balance-override",
      previousOverrideCents !== null ? centsToDollars(previousOverrideCents) : null,
      input.overrideAmount,
      input,
      input.effectiveDate,
    );

    return updated;
  });
}

export async function resetBalanceOverride(dealId: string, context: DealAuditContext) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
    const previousOverrideCents = deal.balanceOverrideCents;

    const updated = await tx.fundedDeal.update({
      where: { id: dealId },
      data: {
        balanceOverrideCents: null,
        balanceOverrideEffectiveDate: null,
        balanceOverrideReason: null,
        balanceOverrideSetByUserId: null,
        balanceOverrideSetAt: null,
        // Legacy field cleared too so old readers do not resurrect a stale override.
        manualBalanceRemaining: null,
      },
    });

    await writeAuditEntry(
      tx,
      dealId,
      "balance-override",
      previousOverrideCents !== null ? centsToDollars(previousOverrideCents) : null,
      null,
      context,
    );

    return updated;
  });
}

/**
 * One-time, idempotent backfill: deals created before this feature stored their manual balance in
 * `manualBalanceRemaining` with no effective date/reason/audit trail. This copies that value into
 * the new override fields (with a synthetic reason) exactly once per deal, leaving the legacy column
 * untouched so nothing is destroyed if this needs to be re-run.
 */
export async function migrateLegacyBalanceOverrides(companyId: string, context: DealAuditContext) {
  const candidates = await prisma.fundedDeal.findMany({
    where: { companyId, manualBalanceRemaining: { not: null }, balanceOverrideCents: null },
  });

  for (const deal of candidates) {
    if (deal.manualBalanceRemaining == null) continue;
    await setBalanceOverride(deal.id, {
      overrideAmount: deal.manualBalanceRemaining,
      effectiveDate: deal.updatedAt,
      reason: "Migrated from legacy Balance Override field",
      userId: context.userId,
    });
  }

  return candidates.length;
}

export interface CalculatedBalance {
  totalPaybackCents: number;
  paidCents: number;
  calculatedBalanceCents: number;
  overrideCents: number | null;
  effectiveBalanceCents: number;
}

export async function getCalculatedBalance(dealId: string): Promise<CalculatedBalance> {
  const deal = await prisma.fundedDeal.findUniqueOrThrow({ where: { id: dealId } });
  const calc = calculateDeal(dealCalculationInput(deal));
  const postedRows = await prisma.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId, status: "posted" } });
  const paidCents = postedRows.reduce((sum, row) => sum + (row.postedAmountCents ?? row.scheduledAmountCents), 0);
  const calculatedBalanceCents = Math.max(0, calc.totalPaybackCents - paidCents);

  return {
    totalPaybackCents: calc.totalPaybackCents,
    paidCents,
    calculatedBalanceCents,
    overrideCents: deal.balanceOverrideCents,
    effectiveBalanceCents: deal.balanceOverrideCents ?? calculatedBalanceCents,
  };
}

export async function getScheduleForDeal(dealId: string) {
  const rows = await prisma.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId }, orderBy: { sequence: "asc" } });
  return rows;
}

export async function getAuditHistoryForDeal(dealId: string) {
  return prisma.auditEntry.findMany({ where: { fundedDealId: dealId }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------------------------
// Cron poster
// ---------------------------------------------------------------------------------------------

export interface CronRunResult {
  entriesEvaluated: number;
  entriesPosted: number;
  errors: string[];
}

/**
 * Posts every pending schedule entry whose due date has arrived in America/New_York. Designed to
 * run hourly and be fully idempotent / safe to re-run: each posting update is a compare-and-swap
 * (`status: "pending"` in the WHERE clause) so a duplicate/overlapping invocation can never post the
 * same entry twice, and a missed hour simply gets caught up on the next run because "due" means
 * "on or before today", not "exactly today".
 */
export async function postDuePayments(now: Date, triggeredBy: string): Promise<CronRunResult> {
  const windowStart = now;
  const dueCandidates = await prisma.paymentScheduleEntry.findMany({
    where: { status: "pending" },
    orderBy: [{ fundedDealId: "asc" }, { sequence: "asc" }],
  });

  const due = dueCandidates.filter((entry) => isDueInEastern(entry.dueDate, now));
  const errors: string[] = [];
  let posted = 0;

  const byDeal = new Map<string, typeof due>();
  for (const entry of due) {
    const list = byDeal.get(entry.fundedDealId) ?? [];
    list.push(entry);
    byDeal.set(entry.fundedDealId, list);
  }

  for (const [dealId, entries] of byDeal) {
    try {
      posted += await postDueEntriesForDeal(dealId, entries, now, triggeredBy);
    } catch (error) {
      errors.push(`${dealId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.cronRunLog.create({
    data: {
      windowStart,
      windowEnd: now,
      entriesEvaluated: due.length,
      entriesPosted: posted,
      errorCount: errors.length,
      errorDetail: errors.length ? JSON.stringify(errors) : null,
      triggeredBy,
    },
  });

  return { entriesEvaluated: due.length, entriesPosted: posted, errors };
}

async function postDueEntriesForDeal(dealId: string, entries: EntryRow[], now: Date, triggeredBy: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.fundedDeal.findUnique({ where: { id: dealId } });
    if (!deal || deal.deletedAt) return 0;

    const calc = calculateDeal(dealCalculationInput(deal));
    const postedSoFar = await tx.paymentScheduleEntry.findMany({ where: { fundedDealId: dealId, status: "posted" } });
    let remainingCents = Math.max(0, calc.totalPaybackCents - postedSoFar.reduce((s, r) => s + (r.postedAmountCents ?? r.scheduledAmountCents), 0));

    let postedCount = 0;
    for (const entry of entries.sort((a, b) => a.sequence - b.sequence)) {
      if (remainingCents <= 0) {
        // Deal is already paid off -- skip rather than post, and stop this due entry from lingering.
        await tx.paymentScheduleEntry.updateMany({
          where: { id: entry.id, status: "pending" },
          data: { status: "skipped" },
        });
        continue;
      }

      const amountToPost = Math.min(entry.scheduledAmountCents, remainingCents);
      // Compare-and-swap: only succeeds if still "pending", making concurrent/duplicate runs safe.
      const result = await tx.paymentScheduleEntry.updateMany({
        where: { id: entry.id, status: "pending" },
        data: {
          status: "posted",
          postedAt: now,
          postedAmountCents: amountToPost,
          postingSource: triggeredBy,
        },
      });
      if (result.count === 1) {
        postedCount += 1;
        remainingCents -= amountToPost;
      }
    }

    if (remainingCents <= 0 && !deal.scheduleCompletedAt) {
      await tx.fundedDeal.update({ where: { id: dealId }, data: { scheduleCompletedAt: now, statusStage: "paid-out" } });
      await tx.paymentScheduleEntry.updateMany({
        where: { fundedDealId: dealId, status: "pending" },
        data: { status: "skipped" },
      });
    }

    return postedCount;
  });
}
