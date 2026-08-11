import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createBlankFollowUp, createBlankFundedDeal, createBlankPipelineDeal } from "./defaults";
import { createRealDataset, loadSeedDataset } from "./data";
import { deriveHelocFields } from "./finance";
import { backfillMissingSchedules } from "./schedule-service";
import { easternDateKey } from "./timezone";
import type { FollowUpItem, FundedDeal, ImportBatch, LeadSheet, PipelineDeal, SeedDataset, TrashRecord, TrashRecordType, ViewerProfile } from "./types";

const TRASH_RETENTION_DAYS = 30;

function toIso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function viewerFromUser(user: User & { company: { name: string } }): ViewerProfile {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.role === "admin",
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.company.name,
    hideFinancialsByDefault: user.hideFinancialsByDefault,
  };
}

/** Per-deal rollup of the persisted payment schedule, keyed by fundedDealId. */
interface ScheduleAggregate {
  scheduledPaymentsCount: number;
  postedPaymentsCount: number;
  postedAmountCents: number;
  /** Entries whose due date has arrived (dueDate <= now), whether or not the cron has posted them. */
  duePaymentsCount: number;
  dueAmountCents: number;
  /** Latest due date seen across all of the deal's schedule entries -- its real maturity date. */
  endDate?: Date;
}

function serializeFundedDeal(
  record: Prisma.FundedDealGetPayload<object>,
  scheduleAgg?: ScheduleAggregate,
): FundedDeal {
  return {
    id: record.id,
    businessName: record.businessName,
    contactName: record.contactName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    fundedDate: toIso(record.fundedDate),
    funder: record.funder ?? undefined,
    fundedAmount: record.fundedAmount,
    factorRate: record.factorRate,
    termValue: record.termValue,
    termUnit: record.termUnit as FundedDeal["termUnit"],
    paymentAmount: record.paymentAmount,
    paymentFrequency: record.paymentFrequency as FundedDeal["paymentFrequency"],
    syndicationPercent: record.syndicationPercent,
    pointsPercent: record.pointsPercent,
    housePointsPercent: record.housePointsPercent,
    commissionPercent: record.commissionPercent,
    commissionAmount: record.commissionAmount,
    commissionStatus: record.commissionStatus as FundedDeal["commissionStatus"],
    clawbackAmount: record.clawbackAmount,
    statusRaw: record.statusRaw,
    statusStage: record.statusStage as FundedDeal["statusStage"],
    fundedTags: record.fundedTags as FundedDeal["fundedTags"],
    notes: record.notes,
    sourceLabel: record.sourceLabel,
    manualBalanceRemaining: record.manualBalanceRemaining ?? undefined,
    manualRenewalDate: toIso(record.manualRenewalDate),
    deletedAt: toIso(record.deletedAt),
    paymentWeekday: record.paymentWeekday ?? undefined,
    firstPaymentDate: toIso(record.firstPaymentDate),
    scheduleCompletedAt: toIso(record.scheduleCompletedAt),
    balanceOverrideAmount: record.balanceOverrideCents != null ? record.balanceOverrideCents / 100 : undefined,
    balanceOverrideEffectiveDate: toIso(record.balanceOverrideEffectiveDate),
    balanceOverrideReason: record.balanceOverrideReason ?? undefined,
    balanceOverrideSetByUserId: record.balanceOverrideSetByUserId ?? undefined,
    balanceOverrideSetAt: toIso(record.balanceOverrideSetAt),
    scheduledPaymentsCount: scheduleAgg?.scheduledPaymentsCount,
    postedPaymentsCount: scheduleAgg?.postedPaymentsCount,
    postedAmount: scheduleAgg ? scheduleAgg.postedAmountCents / 100 : undefined,
    duePaymentsCount: scheduleAgg?.duePaymentsCount,
    dueAmount: scheduleAgg ? scheduleAgg.dueAmountCents / 100 : undefined,
    scheduleEndDate: toIso(scheduleAgg?.endDate),
    dealType: record.dealType as FundedDeal["dealType"],
    aprPercent: record.aprPercent ?? undefined,
    termYears: record.termYears ?? undefined,
    relatedDealId: record.relatedDealId ?? undefined,
    psfAmount: record.psfAmount,
    renewalAckAt: toIso(record.renewalAckAt),
  };
}

function serializePipelineDeal(record: Prisma.PipelineDealGetPayload<object>): PipelineDeal {
  return {
    id: record.id,
    contactName: record.contactName,
    businessName: record.businessName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    city: record.city ?? undefined,
    state: record.state ?? undefined,
    submittedDate: toIso(record.submittedDate),
    requestLabel: record.requestLabel,
    requestedAmountMin: record.requestedAmountMin ?? undefined,
    requestedAmountMax: record.requestedAmountMax ?? undefined,
    statusRaw: record.statusRaw,
    stage: record.stage as PipelineDeal["stage"],
    notes: record.notes,
    sheetLabel: record.sheetLabel,
    nextFollowUpDate: toIso(record.nextFollowUpDate),
    sourceLabel: record.sourceLabel,
    deletedAt: toIso(record.deletedAt),
    statementsAckAt: toIso(record.statementsAckAt),
  };
}

function serializeFollowUp(record: Prisma.FollowUpItemGetPayload<object>): FollowUpItem {
  return {
    id: record.id,
    contactName: record.contactName,
    businessName: record.businessName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    requestLabel: record.requestLabel,
    notes: record.notes,
    lastContactLabel: record.lastContactLabel,
    dueDate: toIso(record.dueDate),
    priority: record.priority as FollowUpItem["priority"],
    appSubmitted: record.appSubmitted,
    completed: record.completed,
    sheetLabel: record.sheetLabel,
    sourceLabel: record.sourceLabel,
    deletedAt: toIso(record.deletedAt),
    createdAt: toIso(record.createdAt),
    dashboardAckAt: toIso(record.dashboardAckAt),
  };
}

function serializeLeadSheet(record: Prisma.LeadSheetGetPayload<object>): LeadSheet {
  return { id: record.id, name: record.name };
}

function serializeImportBatch(record: Prisma.ImportBatchGetPayload<object>): ImportBatch {
  return {
    id: record.id,
    filename: record.filename,
    importType: record.importType as ImportBatch["importType"],
    rowsImported: record.rowsImported,
    rowsSkipped: record.rowsSkipped,
    detectedColumns: record.detectedColumns,
    importedAt: record.importedAt.toISOString(),
    notes: record.notes ?? undefined,
  };
}

function companyScopedSeedId(companyId: string, id: string) {
  return `${companyId}:${id}`;
}

/**
 * Seed rows are deterministic per company. That gives imports a stable dedupe key so re-importing
 * the same sheet updates existing rows instead of creating doubles.
 */
function scopeSeedDataset(companyId: string, dataset: SeedDataset): SeedDataset {
  return {
    ...dataset,
    fundedDeals: dataset.fundedDeals.map((deal) => ({ ...deal, id: companyScopedSeedId(companyId, deal.id) })),
    pipelineDeals: dataset.pipelineDeals.map((deal) => ({ ...deal, id: companyScopedSeedId(companyId, deal.id) })),
    followUps: dataset.followUps.map((item) => ({ ...item, id: companyScopedSeedId(companyId, item.id) })),
    importBatches: dataset.importBatches.map((batch) => ({ ...batch, id: companyScopedSeedId(companyId, batch.id) })),
  };
}

async function persistSeedDataset(companyId: string, userId: string, dataset: SeedDataset) {
  const scoped = scopeSeedDataset(companyId, dataset);

  await prisma.$transaction([
    prisma.fundedDeal.deleteMany({ where: { companyId } }),
    prisma.pipelineDeal.deleteMany({ where: { companyId } }),
    prisma.followUpItem.deleteMany({ where: { companyId } }),
    prisma.importBatch.deleteMany({ where: { companyId } }),
  ]);

  if (scoped.fundedDeals.length) {
    await prisma.fundedDeal.createMany({
      data: scoped.fundedDeals.map((deal) => ({
        id: deal.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        businessName: deal.businessName,
        contactName: deal.contactName,
        phone: deal.phone,
        email: deal.email,
        fundedDate: deal.fundedDate ? new Date(deal.fundedDate) : null,
        funder: deal.funder,
        fundedAmount: deal.fundedAmount,
        factorRate: deal.factorRate,
        termValue: deal.termValue,
        termUnit: deal.termUnit,
        paymentAmount: deal.paymentAmount,
        paymentFrequency: deal.paymentFrequency,
        syndicationPercent: deal.syndicationPercent,
        pointsPercent: deal.pointsPercent,
        housePointsPercent: deal.housePointsPercent,
        commissionPercent: deal.commissionPercent,
        commissionAmount: deal.commissionAmount,
        commissionStatus: deal.commissionStatus,
        clawbackAmount: deal.clawbackAmount,
        statusRaw: deal.statusRaw,
        statusStage: deal.statusStage,
        fundedTags: deal.fundedTags,
        notes: deal.notes,
        sourceLabel: deal.sourceLabel,
        manualBalanceRemaining: deal.manualBalanceRemaining ?? null,
        manualRenewalDate: deal.manualRenewalDate ? new Date(deal.manualRenewalDate) : null,
      })),
    });
  }

  if (scoped.pipelineDeals.length) {
    await prisma.pipelineDeal.createMany({
      data: scoped.pipelineDeals.map((deal) => ({
        id: deal.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        contactName: deal.contactName,
        businessName: deal.businessName,
        phone: deal.phone,
        email: deal.email,
        city: deal.city,
        state: deal.state,
        submittedDate: deal.submittedDate ? new Date(deal.submittedDate) : null,
        requestLabel: deal.requestLabel,
        requestedAmountMin: deal.requestedAmountMin ?? null,
        requestedAmountMax: deal.requestedAmountMax ?? null,
        statusRaw: deal.statusRaw,
        stage: deal.stage,
        notes: deal.notes,
        sheetLabel: deal.sheetLabel,
        nextFollowUpDate: deal.nextFollowUpDate ? new Date(deal.nextFollowUpDate) : null,
        sourceLabel: deal.sourceLabel,
      })),
    });
  }

  if (scoped.followUps.length) {
    await prisma.followUpItem.createMany({
      data: scoped.followUps.map((item) => ({
        id: item.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        contactName: item.contactName,
        businessName: item.businessName,
        phone: item.phone,
        email: item.email,
        requestLabel: item.requestLabel,
        notes: item.notes,
        lastContactLabel: item.lastContactLabel,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        priority: item.priority,
        appSubmitted: item.appSubmitted,
        completed: item.completed,
        sheetLabel: item.sheetLabel,
        sourceLabel: item.sourceLabel,
      })),
    });
  }

  if (scoped.importBatches.length) {
    await prisma.importBatch.createMany({
      data: scoped.importBatches.map((batch) => ({
        id: batch.id,
        companyId,
        createdByUserId: userId,
        filename: batch.filename,
        importType: batch.importType,
        rowsImported: batch.rowsImported,
        rowsSkipped: batch.rowsSkipped,
        detectedColumns: batch.detectedColumns,
        importedAt: new Date(batch.importedAt),
        notes: batch.notes,
      })),
    });
  }
}

export async function seedFirstCompanyWorkspace(companyId: string, userId: string) {
  const seed = await loadSeedDataset().catch(() => createRealDataset());
  await persistSeedDataset(companyId, userId, seed);
}

export async function resetWorkspaceToSeed(companyId: string, userId: string) {
  await seedFirstCompanyWorkspace(companyId, userId);
  return loadWorkspace(companyId);
}

export async function loadWorkspace(companyId: string): Promise<SeedDataset> {
  const [fundedDeals, pipelineDeals, followUps, importBatches, leadSheets] = await Promise.all([
    prisma.fundedDeal.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ fundedDate: "desc" }, { createdAt: "desc" }] }),
    prisma.pipelineDeal.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ submittedDate: "desc" }, { createdAt: "desc" }] }),
    prisma.followUpItem.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ completed: "asc" }, { updatedAt: "desc" }] }),
    prisma.importBatch.findMany({ where: { companyId }, orderBy: { importedAt: "desc" } }),
    prisma.leadSheet.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);

  // Two grouped queries roll up the whole company's schedule so the funded board can render
  // repayment progress per deal without firing a request per card:
  //  - scheduleGroups (by deal, status): total entries, and how many/how much have actually posted.
  //  - dueGroups (by deal, entries due on or before today): how many payments the *calendar* says
  //    should be in by now, regardless of whether the cron has posted them. This is what makes the
  //    bar reflect elapsed time immediately instead of sitting at 0 until the cron sweeps.
  //
  // "Due" is evaluated on the America/New_York calendar date, identically to the cron poster
  // (isDueInEastern), so the progress bar advances at the SAME Eastern midnight the cron uses to post
  // -- not ~4 hours early at UTC midnight. dueDates are stored as UTC-midnight of their calendar date,
  // so the cutoff is UTC-midnight of today's Eastern date: an entry counts when its calendar date is
  // on or before today in Eastern. Since the route is server-rendered per request, the next page load
  // after that midnight recomputes with a fresh cutoff and the new payment shows up automatically.
  const dealIds = fundedDeals.map((deal) => deal.id);
  const dueCutoff = new Date(`${easternDateKey(new Date())}T00:00:00.000Z`);
  const [scheduleGroups, dueGroups] = fundedDeals.length
    ? await Promise.all([
        prisma.paymentScheduleEntry.groupBy({
          by: ["fundedDealId", "status"],
          where: { fundedDealId: { in: dealIds } },
          _count: { _all: true },
          _sum: { postedAmountCents: true, scheduledAmountCents: true },
          _max: { dueDate: true },
        }),
        prisma.paymentScheduleEntry.groupBy({
          by: ["fundedDealId"],
          where: { fundedDealId: { in: dealIds }, dueDate: { lte: dueCutoff } },
          _count: { _all: true },
          _sum: { scheduledAmountCents: true },
        }),
      ])
    : [[], []];

  const scheduleByDeal = new Map<string, ScheduleAggregate>();
  const emptyAgg = (): ScheduleAggregate => ({ scheduledPaymentsCount: 0, postedPaymentsCount: 0, postedAmountCents: 0, duePaymentsCount: 0, dueAmountCents: 0 });
  for (const group of scheduleGroups) {
    const agg = scheduleByDeal.get(group.fundedDealId) ?? emptyAgg();
    agg.scheduledPaymentsCount += group._count._all;
    if (group.status === "posted") {
      agg.postedPaymentsCount += group._count._all;
      // Prefer the actually-posted amount; fall back to the scheduled amount if a legacy row lacks it.
      agg.postedAmountCents += group._sum.postedAmountCents ?? group._sum.scheduledAmountCents ?? 0;
    }
    // The overall maturity date is the latest due date across every status group for this deal.
    if (group._max.dueDate && (!agg.endDate || group._max.dueDate > agg.endDate)) {
      agg.endDate = group._max.dueDate;
    }
    scheduleByDeal.set(group.fundedDealId, agg);
  }
  for (const group of dueGroups) {
    const agg = scheduleByDeal.get(group.fundedDealId) ?? emptyAgg();
    agg.duePaymentsCount = group._count._all;
    agg.dueAmountCents = group._sum.scheduledAmountCents ?? 0;
    scheduleByDeal.set(group.fundedDealId, agg);
  }

  // Legacy/imported deals may carry a sheetLabel that was never formally added as a LeadSheet row
  // (e.g. from a CSV's "Sheet" column). Merge those distinct values in too so they're immediately
  // filterable/selectable without forcing a one-time cleanup pass.
  const knownNames = new Set(leadSheets.map((sheet) => sheet.name));
  const legacyNames = new Set(pipelineDeals.map((deal) => deal.sheetLabel).filter((name) => name && !knownNames.has(name)));
  const mergedLeadSheets: LeadSheet[] = [
    ...leadSheets.map(serializeLeadSheet),
    ...Array.from(legacyNames)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: `legacy:${name}`, name })),
  ];

  return {
    fundedDeals: fundedDeals.map((deal) => serializeFundedDeal(deal, scheduleByDeal.get(deal.id))),
    pipelineDeals: pipelineDeals.map(serializePipelineDeal),
    followUps: followUps.map(serializeFollowUp),
    importBatches: importBatches.map(serializeImportBatch),
    leadSheets: mergedLeadSheets,
    sourceMode: "database",
  };
}

/**
 * Creates a named lead sheet the pipeline board can filter/assign by. Idempotent on name (re-adding
 * an existing name just returns the existing row) so the "+ New sheet" control never needs to check
 * for duplicates itself.
 */
export async function createLeadSheet(companyId: string, name: string): Promise<LeadSheet> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lead sheet name cannot be empty.");
  const record = await prisma.leadSheet.upsert({
    where: { companyId_name: { companyId, name: trimmed } },
    create: { companyId, name: trimmed },
    update: {},
  });
  return serializeLeadSheet(record);
}

export async function loadWorkspaceForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
  if (!user) {
    throw new Error("User not found.");
  }
  // Idempotent self-heal: any deal with valid terms but no schedule yet (imported, seeded, or funded
  // before auto-generation existed) gets one generated before the page renders. Cheap once caught up
  // -- the query finds nothing and this is a no-op. Never let a hiccup here block the page load.
  try {
    await backfillMissingSchedules(user.companyId, { userId, reason: "Backfilled on workspace load" });
  } catch {
    // Best-effort; the user can still generate a schedule manually per-deal.
  }
  return {
    viewer: viewerFromUser(user),
    data: await loadWorkspace(user.companyId),
  };
}

function fundedUpdateData(patch: Partial<FundedDeal>, userId: string): Prisma.FundedDealUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.fundedDate !== undefined ? { fundedDate: patch.fundedDate ? new Date(patch.fundedDate) : null } : {}),
    ...(patch.funder !== undefined ? { funder: patch.funder || null } : {}),
    ...(patch.fundedAmount !== undefined ? { fundedAmount: patch.fundedAmount } : {}),
    ...(patch.factorRate !== undefined ? { factorRate: patch.factorRate } : {}),
    ...(patch.termValue !== undefined ? { termValue: patch.termValue } : {}),
    ...(patch.termUnit !== undefined ? { termUnit: patch.termUnit } : {}),
    ...(patch.paymentAmount !== undefined ? { paymentAmount: patch.paymentAmount } : {}),
    ...(patch.paymentFrequency !== undefined ? { paymentFrequency: patch.paymentFrequency } : {}),
    ...(patch.syndicationPercent !== undefined ? { syndicationPercent: patch.syndicationPercent } : {}),
    ...(patch.pointsPercent !== undefined ? { pointsPercent: patch.pointsPercent } : {}),
    ...(patch.housePointsPercent !== undefined ? { housePointsPercent: patch.housePointsPercent } : {}),
    ...(patch.commissionPercent !== undefined ? { commissionPercent: patch.commissionPercent } : {}),
    ...(patch.commissionAmount !== undefined ? { commissionAmount: patch.commissionAmount } : {}),
    ...(patch.commissionStatus !== undefined ? { commissionStatus: patch.commissionStatus } : {}),
    ...(patch.clawbackAmount !== undefined ? { clawbackAmount: patch.clawbackAmount } : {}),
    ...(patch.statusRaw !== undefined ? { statusRaw: patch.statusRaw } : {}),
    ...(patch.statusStage !== undefined ? { statusStage: patch.statusStage } : {}),
    ...(patch.fundedTags !== undefined ? { fundedTags: patch.fundedTags } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
    ...(patch.manualBalanceRemaining !== undefined ? { manualBalanceRemaining: patch.manualBalanceRemaining ?? null } : {}),
    ...(patch.manualRenewalDate !== undefined ? { manualRenewalDate: patch.manualRenewalDate ? new Date(patch.manualRenewalDate) : null } : {}),
    ...(patch.paymentWeekday !== undefined ? { paymentWeekday: patch.paymentWeekday ?? null } : {}),
    ...(patch.firstPaymentDate !== undefined ? { firstPaymentDate: patch.firstPaymentDate ? new Date(patch.firstPaymentDate) : null } : {}),
    ...(patch.dealType !== undefined ? { dealType: patch.dealType } : {}),
    ...(patch.aprPercent !== undefined ? { aprPercent: patch.aprPercent ?? null } : {}),
    ...(patch.termYears !== undefined ? { termYears: patch.termYears ?? null } : {}),
    ...(patch.relatedDealId !== undefined ? { relatedDeal: patch.relatedDealId ? { connect: { id: patch.relatedDealId } } : { disconnect: true } } : {}),
    ...(patch.psfAmount !== undefined ? { psfAmount: patch.psfAmount } : {}),
    ...(patch.renewalAckAt !== undefined ? { renewalAckAt: patch.renewalAckAt ? new Date(patch.renewalAckAt) : null } : {}),
    // Lets a renewal mark the original deal it pays off as fully repaid (see the "Renewal of" picker
    // in views.tsx) using the exact same fields the cron poster sets when a schedule finishes
    // naturally (schedule-service.ts) -- so the derived "Paid in full" tag/badge just falls out of
    // the normal progress math instead of needing its own separate flag.
    ...(patch.scheduleCompletedAt !== undefined ? { scheduleCompletedAt: patch.scheduleCompletedAt ? new Date(patch.scheduleCompletedAt) : null } : {}),
    // balanceOverride* fields are intentionally excluded here: they may only be written through
    // setBalanceOverride/resetBalanceOverride (schedule-service.ts), which enforce an effective
    // date, a reason, and an audit-trail entry. A generic field patch must never bypass that.
  };
}

function pipelineUpdateData(patch: Partial<PipelineDeal>, userId: string): Prisma.PipelineDealUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.city !== undefined ? { city: patch.city || null } : {}),
    ...(patch.state !== undefined ? { state: patch.state || null } : {}),
    ...(patch.submittedDate !== undefined ? { submittedDate: patch.submittedDate ? new Date(patch.submittedDate) : null } : {}),
    ...(patch.requestLabel !== undefined ? { requestLabel: patch.requestLabel } : {}),
    ...(patch.requestedAmountMin !== undefined ? { requestedAmountMin: patch.requestedAmountMin ?? null } : {}),
    ...(patch.requestedAmountMax !== undefined ? { requestedAmountMax: patch.requestedAmountMax ?? null } : {}),
    ...(patch.statusRaw !== undefined ? { statusRaw: patch.statusRaw } : {}),
    ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.sheetLabel !== undefined ? { sheetLabel: patch.sheetLabel } : {}),
    ...(patch.nextFollowUpDate !== undefined ? { nextFollowUpDate: patch.nextFollowUpDate ? new Date(patch.nextFollowUpDate) : null } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
    ...(patch.statementsAckAt !== undefined ? { statementsAckAt: patch.statementsAckAt ? new Date(patch.statementsAckAt) : null } : {}),
  };
}

function followUpUpdateData(patch: Partial<FollowUpItem>, userId: string): Prisma.FollowUpItemUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.requestLabel !== undefined ? { requestLabel: patch.requestLabel } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.lastContactLabel !== undefined ? { lastContactLabel: patch.lastContactLabel } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.appSubmitted !== undefined ? { appSubmitted: patch.appSubmitted } : {}),
    ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
    ...(patch.sheetLabel !== undefined ? { sheetLabel: patch.sheetLabel } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
    ...(patch.dashboardAckAt !== undefined ? { dashboardAckAt: patch.dashboardAckAt ? new Date(patch.dashboardAckAt) : null } : {}),
  };
}

export async function requireOwnedFundedDeal(companyId: string, id: string) {
  const record = await prisma.fundedDeal.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Funded deal not found for this company.");
}

async function requireOwnedPipelineDeal(companyId: string, id: string) {
  const record = await prisma.pipelineDeal.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Pipeline deal not found for this company.");
}

async function requireOwnedFollowUp(companyId: string, id: string) {
  const record = await prisma.followUpItem.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Follow-up item not found for this company.");
}

export async function createFundedDeal(companyId: string, userId: string, fundedDate?: string) {
  const draft = createBlankFundedDeal(fundedDate || new Date().toISOString());
  const created = await prisma.fundedDeal.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      businessName: draft.businessName,
      contactName: draft.contactName,
      phone: draft.phone,
      email: draft.email,
      fundedDate: draft.fundedDate ? new Date(draft.fundedDate) : null,
      funder: draft.funder,
      fundedAmount: draft.fundedAmount,
      factorRate: draft.factorRate,
      termValue: draft.termValue,
      termUnit: draft.termUnit,
      paymentAmount: draft.paymentAmount,
      paymentFrequency: draft.paymentFrequency,
      syndicationPercent: draft.syndicationPercent,
      pointsPercent: draft.pointsPercent,
      housePointsPercent: draft.housePointsPercent,
      commissionPercent: draft.commissionPercent,
      commissionAmount: draft.commissionAmount,
      commissionStatus: draft.commissionStatus,
      clawbackAmount: draft.clawbackAmount,
      statusRaw: draft.statusRaw,
      statusStage: draft.statusStage,
      fundedTags: draft.fundedTags,
      notes: draft.notes,
      sourceLabel: draft.sourceLabel,
      dealType: draft.dealType,
      psfAmount: draft.psfAmount,
    },
  });
  return serializeFundedDeal(created);
}

export async function updateFundedDeal(companyId: string, userId: string, id: string, patch: Partial<FundedDeal>) {
  await requireOwnedFundedDeal(companyId, id);
  // A linked deal (Renewal/Add-on -> original MCA) must belong to the same company and can't be the
  // deal itself, or the "trace a client's history" link would either leak across tenants or cycle.
  if (patch.relatedDealId) {
    if (patch.relatedDealId === id) throw new Error("A deal cannot be linked to itself.");
    await requireOwnedFundedDeal(companyId, patch.relatedDealId);
  }

  // HELOC's factorRate/termValue/termUnit/paymentFrequency/paymentAmount are derived, not directly
  // edited (see deriveHelocFields) -- recompute them whenever the patch touches anything they depend
  // on, merging the current record's values for whichever of the three inputs weren't part of this
  // particular save (the UI saves one field at a time).
  let derivedPatch: Partial<FundedDeal> = {};
  const touchesHelocInputs =
    patch.dealType !== undefined || patch.fundedAmount !== undefined || patch.aprPercent !== undefined || patch.termYears !== undefined;
  if (touchesHelocInputs) {
    const current = await prisma.fundedDeal.findUniqueOrThrow({ where: { id } });
    const effectiveDealType = patch.dealType ?? (current.dealType as FundedDeal["dealType"]);
    if (effectiveDealType === "heloc") {
      derivedPatch = deriveHelocFields(
        patch.fundedAmount ?? current.fundedAmount,
        patch.aprPercent ?? current.aprPercent ?? 0,
        patch.termYears ?? current.termYears ?? 0,
      );
    }
  }

  const updated = await prisma.fundedDeal.update({ where: { id }, data: fundedUpdateData({ ...patch, ...derivedPatch }, userId) });
  return serializeFundedDeal(updated);
}

export async function deleteFundedDeal(companyId: string, id: string) {
  await requireOwnedFundedDeal(companyId, id);
  await prisma.fundedDeal.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function createPipelineDeal(companyId: string, userId: string, submittedDate?: string) {
  const draft = createBlankPipelineDeal(submittedDate);
  const created = await prisma.pipelineDeal.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      contactName: draft.contactName,
      businessName: draft.businessName,
      submittedDate: draft.submittedDate ? new Date(draft.submittedDate) : null,
      requestLabel: draft.requestLabel,
      statusRaw: draft.statusRaw,
      stage: draft.stage,
      notes: draft.notes,
      sheetLabel: draft.sheetLabel,
      sourceLabel: draft.sourceLabel,
    },
  });
  return serializePipelineDeal(created);
}

export async function updatePipelineDeal(companyId: string, userId: string, id: string, patch: Partial<PipelineDeal>) {
  await requireOwnedPipelineDeal(companyId, id);
  const updated = await prisma.pipelineDeal.update({ where: { id }, data: pipelineUpdateData(patch, userId) });
  return serializePipelineDeal(updated);
}

export async function deletePipelineDeal(companyId: string, id: string) {
  await requireOwnedPipelineDeal(companyId, id);
  await prisma.pipelineDeal.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function createFollowUp(companyId: string, userId: string) {
  const draft = createBlankFollowUp();
  const created = await prisma.followUpItem.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      contactName: draft.contactName,
      businessName: draft.businessName,
      requestLabel: draft.requestLabel,
      notes: draft.notes,
      lastContactLabel: draft.lastContactLabel,
      priority: draft.priority,
      appSubmitted: draft.appSubmitted,
      completed: draft.completed,
      sheetLabel: draft.sheetLabel,
      sourceLabel: draft.sourceLabel,
    },
  });
  return serializeFollowUp(created);
}

export async function updateFollowUp(companyId: string, userId: string, id: string, patch: Partial<FollowUpItem>) {
  await requireOwnedFollowUp(companyId, id);
  const updated = await prisma.followUpItem.update({ where: { id }, data: followUpUpdateData(patch, userId) });
  return serializeFollowUp(updated);
}

export async function deleteFollowUp(companyId: string, id: string) {
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.update({ where: { id }, data: { deletedAt: new Date() } });
}

function daysRemainingFromDeletedAt(deletedAt: Date) {
  const expiresAt = new Date(deletedAt);
  expiresAt.setDate(expiresAt.getDate() + TRASH_RETENTION_DAYS);
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function trashCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);
  return cutoff;
}

function trashRecord(type: TrashRecordType, record: { id: string; deletedAt: Date | null }, label: string, detail: string): TrashRecord | null {
  if (!record.deletedAt) return null;
  const daysRemaining = daysRemainingFromDeletedAt(record.deletedAt);
  if (daysRemaining <= 0) return null;
  return {
    id: record.id,
    type,
    label,
    detail,
    deletedAt: record.deletedAt.toISOString(),
    daysRemaining,
  };
}

export async function loadTrash(companyId: string): Promise<TrashRecord[]> {
  const cutoff = trashCutoffDate();
  const [fundedDeals, pipelineDeals, followUps] = await Promise.all([
    prisma.fundedDeal.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
    prisma.pipelineDeal.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
    prisma.followUpItem.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
  ]);

  return [
    ...fundedDeals.map((record) => trashRecord("funded", record, record.businessName, `${record.contactName} - ${record.funder || "No funder"}`)),
    ...pipelineDeals.map((record) => trashRecord("pipeline", record, record.businessName, `${record.contactName} - ${record.stage}`)),
    ...followUps.map((record) => trashRecord("follow-up", record, record.businessName, `${record.contactName} - ${record.priority}`)),
  ]
    .filter((record): record is TrashRecord => Boolean(record))
    .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

export async function restoreTrashRecord(companyId: string, type: TrashRecordType, id: string) {
  if (type === "funded") {
    await requireOwnedFundedDeal(companyId, id);
    await prisma.fundedDeal.update({ where: { id }, data: { deletedAt: null } });
    return;
  }
  if (type === "pipeline") {
    await requireOwnedPipelineDeal(companyId, id);
    await prisma.pipelineDeal.update({ where: { id }, data: { deletedAt: null } });
    return;
  }
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.update({ where: { id }, data: { deletedAt: null } });
}

export async function permanentlyDeleteTrashRecord(companyId: string, type: TrashRecordType, id: string) {
  if (type === "funded") {
    await requireOwnedFundedDeal(companyId, id);
    await prisma.fundedDeal.delete({ where: { id } });
    return;
  }
  if (type === "pipeline") {
    await requireOwnedPipelineDeal(companyId, id);
    await prisma.pipelineDeal.delete({ where: { id } });
    return;
  }
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.delete({ where: { id } });
}

/**
 * Imports reuse the normalized row IDs from the browser parser, but they get company-scoped before
 * saving. That is the key dedupe rule: same company plus same source row id means update, not insert.
 */
export async function importWorkspaceData(
  companyId: string,
  userId: string,
  payload: { fundedDeals: FundedDeal[]; pipelineDeals: PipelineDeal[]; followUps: FollowUpItem[]; batch: ImportBatch },
) {
  await prisma.$transaction(async (tx) => {
    for (const deal of payload.fundedDeals) {
      const scopedId = companyScopedSeedId(companyId, deal.id);
      await tx.fundedDeal.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          businessName: deal.businessName,
          contactName: deal.contactName,
          phone: deal.phone,
          email: deal.email,
          fundedDate: deal.fundedDate ? new Date(deal.fundedDate) : null,
          funder: deal.funder,
          fundedAmount: deal.fundedAmount,
          factorRate: deal.factorRate,
          termValue: deal.termValue,
          termUnit: deal.termUnit,
          paymentAmount: deal.paymentAmount,
          paymentFrequency: deal.paymentFrequency,
          syndicationPercent: deal.syndicationPercent,
          pointsPercent: deal.pointsPercent,
          housePointsPercent: deal.housePointsPercent,
          commissionPercent: deal.commissionPercent,
          commissionAmount: deal.commissionAmount,
          commissionStatus: deal.commissionStatus,
          clawbackAmount: deal.clawbackAmount,
          statusRaw: deal.statusRaw,
          statusStage: deal.statusStage,
          fundedTags: deal.fundedTags,
          notes: deal.notes,
          sourceLabel: deal.sourceLabel,
          manualBalanceRemaining: deal.manualBalanceRemaining ?? null,
          manualRenewalDate: deal.manualRenewalDate ? new Date(deal.manualRenewalDate) : null,
          dealType: deal.dealType,
          psfAmount: deal.psfAmount,
        },
        update: fundedUpdateData({ ...deal, sourceLabel: deal.sourceLabel }, userId),
      });
    }

    for (const deal of payload.pipelineDeals) {
      const scopedId = companyScopedSeedId(companyId, deal.id);
      await tx.pipelineDeal.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          contactName: deal.contactName,
          businessName: deal.businessName,
          phone: deal.phone,
          email: deal.email,
          city: deal.city,
          state: deal.state,
          submittedDate: deal.submittedDate ? new Date(deal.submittedDate) : null,
          requestLabel: deal.requestLabel,
          requestedAmountMin: deal.requestedAmountMin ?? null,
          requestedAmountMax: deal.requestedAmountMax ?? null,
          statusRaw: deal.statusRaw,
          stage: deal.stage,
          notes: deal.notes,
          sheetLabel: deal.sheetLabel,
          nextFollowUpDate: deal.nextFollowUpDate ? new Date(deal.nextFollowUpDate) : null,
          sourceLabel: deal.sourceLabel,
        },
        update: pipelineUpdateData({ ...deal, sourceLabel: deal.sourceLabel }, userId),
      });
    }

    for (const item of payload.followUps) {
      const scopedId = companyScopedSeedId(companyId, item.id);
      await tx.followUpItem.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          contactName: item.contactName,
          businessName: item.businessName,
          phone: item.phone,
          email: item.email,
          requestLabel: item.requestLabel,
          notes: item.notes,
          lastContactLabel: item.lastContactLabel,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          priority: item.priority,
          appSubmitted: item.appSubmitted,
          completed: item.completed,
          sheetLabel: item.sheetLabel,
          sourceLabel: item.sourceLabel,
        },
        update: followUpUpdateData({ ...item, sourceLabel: item.sourceLabel }, userId),
      });
    }

    await tx.importBatch.create({
      data: {
        id: companyScopedSeedId(companyId, payload.batch.id),
        companyId,
        createdByUserId: userId,
        filename: payload.batch.filename,
        importType: payload.batch.importType,
        rowsImported: payload.batch.rowsImported,
        rowsSkipped: payload.batch.rowsSkipped,
        detectedColumns: payload.batch.detectedColumns,
        importedAt: new Date(payload.batch.importedAt),
        notes: payload.batch.notes,
      },
    });
  });

  return loadWorkspace(companyId);
}

export async function updateViewerPreferences(userId: string, patch: { hideFinancialsByDefault?: boolean }) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.hideFinancialsByDefault !== undefined ? { hideFinancialsByDefault: patch.hideFinancialsByDefault } : {}),
    },
    include: { company: true },
  });
  return viewerFromUser(updated);
}
