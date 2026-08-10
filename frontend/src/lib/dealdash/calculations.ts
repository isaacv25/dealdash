import { firstPaymentAnchor, scheduleEndDate } from "./schedule.ts";
import type { FollowUpItem, FundedDeal, PaymentFrequency, PipelineDeal, TermUnit } from "./types";

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseCurrency(value?: string | null) {
  if (!value) return 0;
  const normalized = value.replace(/[$,%\s,]/g, "").trim();
  if (!normalized) return 0;
  const multiplier = /k$/i.test(normalized) ? 1000 : 1;
  const numeric = Number.parseFloat(normalized.replace(/k$/i, ""));
  return Number.isFinite(numeric) ? numeric * multiplier : 0;
}

export function parsePercent(value?: string | null) {
  if (!value) return 0;
  const normalized = value.replace(/[%\s]/g, "").trim();
  if (!normalized) return 0;
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

export function parseBoolean(value?: string | null) {
  return value?.trim().toLowerCase() === "true";
}

export function parseDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function parseRequestRange(value?: string | null) {
  if (!value) return {};
  const normalized = value.replace(/\s/g, "");
  if (normalized.includes("-")) {
    const [min, max] = normalized.split("-");
    return {
      requestedAmountMin: parseCurrency(min),
      requestedAmountMax: parseCurrency(max),
    };
  }

  const amount = parseCurrency(normalized);
  return {
    requestedAmountMin: amount || undefined,
    requestedAmountMax: amount || undefined,
  };
}

export function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

/**
 * PSF (Processing/Service Fee) is a flat house-side dollar figure, paid out to the broker at the
 * same split % as commission -- across every deal type, not just MCA. Total Payout is the broker's
 * full take: the existing commission $ (already the broker's share of house points) plus their share
 * of PSF.
 */
export function psfPayout(deal: Pick<FundedDeal, "psfAmount" | "commissionPercent">) {
  return roundCurrency(deal.psfAmount * Math.max(0, deal.commissionPercent));
}

export function totalPayoutForFundedDeal(deal: Pick<FundedDeal, "commissionAmount" | "psfAmount" | "commissionPercent">) {
  return roundCurrency(deal.commissionAmount + psfPayout(deal));
}

export function grossPaybackFromDeal(deal: Pick<FundedDeal, "fundedAmount" | "factorRate">) {
  return roundCurrency(deal.fundedAmount * deal.factorRate);
}

export function periodsForTerm(termValue: number, termUnit: TermUnit, paymentFrequency: PaymentFrequency) {
  if (!termValue) return 0;

  if (paymentFrequency === "monthly") {
    if (termUnit === "months") return termValue;
    if (termUnit === "weeks") return Math.max(1, Math.round(termValue / 4.33));
    return Math.max(1, Math.round(termValue / 30));
  }

  if (paymentFrequency === "weekly") {
    if (termUnit === "weeks") return termValue;
    if (termUnit === "months") return Math.max(1, Math.round(termValue * 4.33));
    return Math.max(1, Math.round(termValue / 7));
  }

  if (termUnit === "days") return termValue;
  if (termUnit === "weeks") return termValue * 5;
  return Math.max(1, Math.round(termValue * 21));
}

export function periodicPaymentFromDeal(
  deal: Pick<FundedDeal, "fundedAmount" | "factorRate" | "paymentAmount" | "paymentFrequency" | "termValue" | "termUnit">,
) {
  if (deal.paymentAmount > 0) return deal.paymentAmount;
  const periods = periodsForTerm(deal.termValue, deal.termUnit, deal.paymentFrequency);
  if (!periods) return 0;
  return roundCurrency(grossPaybackFromDeal(deal) / periods);
}

/**
 * Funded-progress math intentionally blends exact overrides with a conservative estimate.
 * If the broker knows the live balance, that manual number wins. Otherwise we estimate the
 * amount paid from funded date plus payment cadence so the dashboard can stay useful in between updates.
 */
export function progressForFundedDeal(deal: FundedDeal, now = new Date()) {
  const grossPayback = grossPaybackFromDeal(deal);
  const periodicPayment = periodicPaymentFromDeal(deal);
  const totalPeriods = periodsForTerm(deal.termValue, deal.termUnit, deal.paymentFrequency);

  // The cron poster sets scheduleCompletedAt once every persisted schedule entry is posted -- that
  // is ground truth, not an estimate, and takes priority over everything else so a deal the cron
  // just finished posting never shows a contradictory "$X remaining" next to a "Paid Out" badge.
  if (deal.scheduleCompletedAt) {
    return {
      grossPayback,
      periodicPayment,
      totalPeriods,
      completedPeriods: totalPeriods,
      paymentsRemaining: 0,
      paidAmount: grossPayback,
      balanceRemaining: 0,
      progressPercent: 100,
      usesManualBalance: false,
    };
  }

  // balanceOverrideAmount (Override Calculated Balance) takes priority over the legacy
  // manualBalanceRemaining field it superseded -- both represent the same "manual override" concept.
  const manualBalance = deal.balanceOverrideAmount ?? deal.manualBalanceRemaining;

  if (manualBalance != undefined) {
    const paid = Math.max(0, grossPayback - manualBalance);
    const estimatedPeriodsPaid = periodicPayment > 0 ? Math.min(totalPeriods, Math.round(paid / periodicPayment)) : 0;
    return {
      grossPayback,
      periodicPayment,
      totalPeriods,
      completedPeriods: estimatedPeriodsPaid,
      paymentsRemaining: Math.max(0, totalPeriods - estimatedPeriodsPaid),
      paidAmount: roundCurrency(paid),
      balanceRemaining: roundCurrency(Math.max(0, manualBalance)),
      progressPercent: grossPayback ? Math.min(100, Math.round((paid / grossPayback) * 100)) : 0,
      usesManualBalance: true,
    };
  }

  // When a persisted schedule exists (workspace loader attaches the aggregate), repayment progress
  // tracks the schedule rather than a loose elapsed-time estimate. Progress is driven by how many
  // payments are *due by now* per the calendar (duePaymentsCount) -- i.e. what should have been
  // collected -- so the bar reflects elapsed time immediately, without waiting for the cron poster to
  // sweep. The actually-posted figures still win whenever they run ahead of the calendar (an early
  // payoff / EPA), via the max() below, so a deal paid down faster than schedule never reads low.
  // Note this is deliberately an *expectation*: a merchant who has silently stopped paying still shows
  // as on-schedule here until a manual balance override (above) corrects it -- matching how a broker
  // reads the board ("X payments should be in by now") absent contrary info.
  if (deal.scheduledPaymentsCount && deal.scheduledPaymentsCount > 0) {
    const duePeriods = Math.min(deal.scheduledPaymentsCount, deal.duePaymentsCount ?? 0);
    const postedPeriods = Math.min(deal.scheduledPaymentsCount, deal.postedPaymentsCount ?? 0);
    const completedPeriods = Math.max(duePeriods, postedPeriods);

    const dueAmount = deal.dueAmount ?? 0;
    const postedAmount = deal.postedAmount ?? 0;
    const paidAmount = Math.min(grossPayback, Math.max(dueAmount, postedAmount));
    return {
      grossPayback,
      periodicPayment,
      totalPeriods: deal.scheduledPaymentsCount,
      completedPeriods,
      paymentsRemaining: Math.max(0, deal.scheduledPaymentsCount - completedPeriods),
      paidAmount: roundCurrency(paidAmount),
      balanceRemaining: roundCurrency(Math.max(0, grossPayback - paidAmount)),
      progressPercent: grossPayback ? Math.min(100, Math.round((paidAmount / grossPayback) * 100)) : 0,
      usesManualBalance: false,
    };
  }

  const fundedDate = deal.fundedDate ? new Date(deal.fundedDate) : undefined;
  if (!fundedDate || Number.isNaN(fundedDate.getTime())) {
    return {
      grossPayback,
      periodicPayment,
      totalPeriods,
      completedPeriods: 0,
      paymentsRemaining: totalPeriods,
      paidAmount: 0,
      balanceRemaining: grossPayback,
      progressPercent: 0,
      usesManualBalance: false,
    };
  }

  const elapsedDays = Math.max(0, Math.floor((now.getTime() - fundedDate.getTime()) / (1000 * 60 * 60 * 24)));
  const completedPeriods = deal.paymentFrequency === "daily" ? elapsedDays : deal.paymentFrequency === "weekly" ? Math.floor(elapsedDays / 7) : Math.floor(elapsedDays / 30);
  const boundedPeriods = Math.min(totalPeriods, completedPeriods);
  const paidAmount = Math.min(grossPayback, periodicPayment * boundedPeriods);
  const balanceRemaining = roundCurrency(Math.max(0, grossPayback - paidAmount));

  return {
    grossPayback,
    periodicPayment,
    totalPeriods,
    completedPeriods: boundedPeriods,
    paymentsRemaining: Math.max(0, totalPeriods - boundedPeriods),
    paidAmount: roundCurrency(paidAmount),
    balanceRemaining,
    progressPercent: grossPayback ? Math.min(100, Math.round((paidAmount / grossPayback) * 100)) : 0,
    usesManualBalance: false,
  };
}

// Renewal is marketed once a deal is roughly half paid down, not near the end of term.
const RENEWAL_TERM_FRACTION = 0.5;

export function renewalDateForFundedDeal(deal: FundedDeal) {
  if (deal.manualRenewalDate) return deal.manualRenewalDate;
  if (!deal.fundedDate) return undefined;
  const fundedDate = new Date(deal.fundedDate);
  if (Number.isNaN(fundedDate.getTime())) return undefined;

  const renewal = new Date(fundedDate);
  if (deal.termUnit === "days") {
    renewal.setDate(renewal.getDate() + Math.round(deal.termValue * RENEWAL_TERM_FRACTION));
  } else if (deal.termUnit === "weeks") {
    renewal.setDate(renewal.getDate() + Math.round(deal.termValue * 7 * RENEWAL_TERM_FRACTION));
  } else {
    renewal.setMonth(renewal.getMonth() + Math.max(1, Math.round(deal.termValue * RENEWAL_TERM_FRACTION)));
  }
  return renewal.toISOString();
}

/**
 * The deal's expected maturity / end date -- the due date of its final payment. Prefers the real
 * value derived from the persisted schedule (`scheduleEndDate`, attached by the workspace loader as
 * the max due date). When no schedule exists yet, it estimates the exact same date the schedule
 * generator would produce -- reusing the identical anchor (firstPaymentAnchor) and end-date
 * (scheduleEndDate) math from schedule.ts -- so every funded deal can always show an expected end
 * date, whether or not a schedule has been generated. Returns undefined only when there's no funded
 * date or no term to project from. The result is a UTC-midnight calendar date; render it with
 * formatCalendarDate, not the local-time formatDate.
 */
export function expectedEndDateForFundedDeal(deal: FundedDeal): string | undefined {
  if (deal.scheduleEndDate) return deal.scheduleEndDate;
  if (!deal.fundedDate) return undefined;
  const funded = new Date(deal.fundedDate);
  if (Number.isNaN(funded.getTime())) return undefined;
  const periods = Math.trunc(deal.termValue || 0);
  if (periods <= 0) return undefined;
  const firstPaymentDate = deal.firstPaymentDate ? new Date(deal.firstPaymentDate) : null;
  const anchor = firstPaymentAnchor(funded, deal.paymentFrequency, firstPaymentDate);
  const weekday = deal.paymentFrequency === "weekly" ? (deal.paymentWeekday ?? funded.getUTCDay()) : null;
  return scheduleEndDate(anchor, deal.paymentFrequency, weekday, periods)?.toISOString();
}

// ── Dashboard quick-view eligibility ─────────────────────────────────────────
// Pure predicates for the dashboard's three reminder sections. Kept here (not in the component)
// so they are unit-testable and share one definition of "aged into a new month".

/** Year*12 + month in UTC, so two dates can be compared by calendar month regardless of day/time. */
function utcMonthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

// A pipeline lead that has reached one of these stages is no longer actively being worked toward a
// fresh submission, so it never asks for new statements. "dead" is the Bad Deal/Blacklisted stage
// the user explicitly called out; "declined" and "funded" are the other terminal outcomes.
const TERMINAL_PIPELINE_STAGES = new Set(["dead", "declined", "funded"]);

/**
 * True when a pipeline lead needs fresh statements: it was submitted in an earlier calendar month
 * than now (bank statements are monthly, so last month's are stale), it is still actively in play
 * (not a terminal/blacklisted stage), and the monthly reminder has not already been acknowledged
 * this month. Acknowledging snoozes it until the next month begins; marking it Bad Deal/Blacklisted
 * removes it for good.
 */
export function pipelineNeedsNewStatements(deal: PipelineDeal, now: Date = new Date()): boolean {
  if (deal.deletedAt) return false;
  if (TERMINAL_PIPELINE_STAGES.has(deal.stage)) return false;
  if (!deal.submittedDate) return false;
  const submitted = new Date(deal.submittedDate);
  if (Number.isNaN(submitted.getTime())) return false;
  const nowMonth = utcMonthIndex(now);
  if (utcMonthIndex(submitted) >= nowMonth) return false;
  if (deal.statementsAckAt) {
    const ack = new Date(deal.statementsAckAt);
    if (!Number.isNaN(ack.getTime()) && utcMonthIndex(ack) >= nowMonth) return false;
  }
  return true;
}

/** Percent-paid threshold at which a funded deal becomes a renewal candidate on the dashboard. */
export const RENEWAL_CANDIDATE_MIN_PERCENT = 35;

/**
 * True when a funded deal is far enough along to pitch a renewal (35%+ paid down) and has not been
 * dismissed from the dashboard's "Upcoming renewals" quick view.
 */
export function fundedDealIsRenewalCandidate(deal: FundedDeal, now: Date = new Date()): boolean {
  if (deal.deletedAt) return false;
  if (deal.renewalAckAt) return false;
  return progressForFundedDeal(deal, now).progressPercent >= RENEWAL_CANDIDATE_MIN_PERCENT;
}

/** A follow-up surfaces on the dashboard once it has sat this long since being added. */
export const FOLLOW_UP_DASHBOARD_AGE_DAYS = 30;

/**
 * True when a follow-up should nag on the dashboard: it is still open, not dismissed from the
 * dashboard, and at least ~a month has passed since it was added (createdAt) -- i.e. it is time to
 * actually follow up.
 */
export function followUpIsDueOnDashboard(item: FollowUpItem, now: Date = new Date()): boolean {
  if (item.completed || item.deletedAt || item.dashboardAckAt) return false;
  if (!item.createdAt) return false;
  const created = new Date(item.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return now.getTime() - created.getTime() >= FOLLOW_UP_DASHBOARD_AGE_DAYS * 24 * 60 * 60 * 1000;
}
