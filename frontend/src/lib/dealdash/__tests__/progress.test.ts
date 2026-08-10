import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expectedEndDateForFundedDeal,
  followUpIsDueOnDashboard,
  fundedDealIsRenewalCandidate,
  pipelineNeedsNewStatements,
  progressForFundedDeal,
  psfPayout,
  renewalDateForFundedDeal,
  totalPayoutForFundedDeal,
} from "../calculations.ts";
import type { FollowUpItem, FundedDeal, PipelineDeal } from "../types.ts";

// Minimal funded-deal fixture: $50k at 1.4 over 20 weekly payments = $70,000 total payback,
// $3,500 per payment. Individual tests override just the fields they exercise.
function deal(overrides: Partial<FundedDeal> = {}): FundedDeal {
  return {
    id: "d1",
    businessName: "Test Co",
    contactName: "Test Contact",
    fundedAmount: 50000,
    factorRate: 1.4,
    termValue: 20,
    termUnit: "weeks",
    paymentAmount: 3500,
    paymentFrequency: "weekly",
    syndicationPercent: 0,
    pointsPercent: 0,
    housePointsPercent: 0,
    commissionPercent: 0,
    commissionAmount: 0,
    commissionStatus: "pending",
    clawbackAmount: 0,
    statusRaw: "Active",
    statusStage: "active",
    fundedTags: [],
    notes: "",
    sourceLabel: "test",
    dealType: "mca",
    psfAmount: 0,
    ...overrides,
  };
}

test("progress tracks payments due by now when the schedule matches (cron caught up)", () => {
  // 6 of 20 payments due AND posted, $21,000 of $70,000.
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, duePaymentsCount: 6, dueAmount: 21000, postedPaymentsCount: 6, postedAmount: 21000 }),
  );
  assert.equal(result.totalPeriods, 20);
  assert.equal(result.completedPeriods, 6);
  assert.equal(result.paymentsRemaining, 14);
  assert.equal(result.paidAmount, 21000);
  assert.equal(result.balanceRemaining, 49000);
  assert.equal(result.progressPercent, 30);
});

test("progress reflects elapsed schedule even when the cron has posted nothing yet", () => {
  // 12 of 20 payments are due by the calendar, but the cron poster has posted zero. The bar must
  // still show 12/20 (60%), not sit at 0 -- this is the Texas-Fence-Pro backdated-schedule case.
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, duePaymentsCount: 12, dueAmount: 42000, postedPaymentsCount: 0, postedAmount: 0 }),
  );
  assert.equal(result.completedPeriods, 12);
  assert.equal(result.paymentsRemaining, 8);
  assert.equal(result.paidAmount, 42000);
  assert.equal(result.balanceRemaining, 28000);
  assert.equal(result.progressPercent, 60);
});

test("actually-posted figures win when they run ahead of the calendar (early payoff / EPA)", () => {
  // Only 6 due by the calendar, but 10 have actually posted (merchant paying ahead) -> show 10.
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, duePaymentsCount: 6, dueAmount: 21000, postedPaymentsCount: 10, postedAmount: 35000 }),
  );
  assert.equal(result.completedPeriods, 10);
  assert.equal(result.paidAmount, 35000);
  assert.equal(result.progressPercent, 50);
});

test("a manual balance override still wins over the schedule aggregate", () => {
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, duePaymentsCount: 6, dueAmount: 21000, postedPaymentsCount: 6, postedAmount: 21000, balanceOverrideAmount: 10000 }),
  );
  assert.equal(result.usesManualBalance, true);
  assert.equal(result.balanceRemaining, 10000);
});

test("scheduleCompletedAt forces 100% regardless of the schedule aggregate", () => {
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, duePaymentsCount: 19, dueAmount: 66500, postedPaymentsCount: 19, postedAmount: 66500, scheduleCompletedAt: "2026-07-01T00:00:00.000Z" }),
  );
  assert.equal(result.progressPercent, 100);
  assert.equal(result.balanceRemaining, 0);
});

test("with no schedule and no override, progress falls back to the elapsed-time estimate", () => {
  // Funded far in the past with no schedule aggregate -> estimate path caps at total payback.
  const result = progressForFundedDeal(deal({ fundedDate: "2020-01-01T00:00:00.000Z" }));
  assert.equal(result.progressPercent, 100); // long elapsed time saturates the estimate
  assert.equal(result.usesManualBalance, false);
});

test("renewal date is marketed at 50% of a weekly term, not 70%", () => {
  const fundedDateIso = "2026-01-01T00:00:00.000Z";
  const result = renewalDateForFundedDeal(deal({ fundedDate: fundedDateIso, termUnit: "weeks", termValue: 20 }));
  // renewalDateForFundedDeal uses local Date#setDate (matching its existing, pre-this-change
  // behavior) -- mirror that exact construction here so the assertion holds regardless of the
  // environment's timezone, rather than asserting a hardcoded UTC instant.
  const expected = new Date(fundedDateIso);
  expected.setDate(expected.getDate() + 20 * 7 * 0.5); // 20 weeks * 50% = 10 weeks = 70 days
  assert.equal(result, expected.toISOString());
});

test("an explicit manualRenewalDate always overrides the computed default", () => {
  const result = renewalDateForFundedDeal(
    deal({ fundedDate: "2026-01-01T00:00:00.000Z", termUnit: "weeks", termValue: 20, manualRenewalDate: "2026-06-01T00:00:00.000Z" }),
  );
  assert.equal(result, "2026-06-01T00:00:00.000Z");
});

// ── PSF / Total Payout ──────────────────────────────────────────────────────

test("PSF payout is the flat PSF amount times the broker split percent", () => {
  const result = psfPayout(deal({ psfAmount: 1000, commissionPercent: 0.3 }));
  assert.equal(result, 300);
});

test("PSF payout is zero when no PSF amount is set", () => {
  assert.equal(psfPayout(deal({ psfAmount: 0, commissionPercent: 0.3 })), 0);
});

test("total payout is commission plus PSF payout, not PSF alone", () => {
  const result = totalPayoutForFundedDeal(deal({ commissionAmount: 500, psfAmount: 1000, commissionPercent: 0.3 }));
  assert.equal(result, 500 + 300); // 500 commission + (1000 * 0.3) PSF payout
});

test("a negative commission percent never turns PSF payout negative", () => {
  const result = psfPayout(deal({ psfAmount: 1000, commissionPercent: -0.5 }));
  assert.equal(result, 0);
});

// ── Expected end date ────────────────────────────────────────────────────────

test("expected end date returns the persisted scheduleEndDate verbatim when present", () => {
  const result = expectedEndDateForFundedDeal(deal({ scheduleEndDate: "2027-03-15T00:00:00.000Z" }));
  assert.equal(result, "2027-03-15T00:00:00.000Z");
});

test("expected end date estimates from terms when no schedule exists yet", () => {
  // Weekly deal funded Thursday 2026-01-01, 20 payments. First payment is a full week out
  // (2026-01-08, a Thursday); the 20th weekly payment lands 19 weeks later = 2026-05-21.
  const result = expectedEndDateForFundedDeal(deal({ fundedDate: "2026-01-01T00:00:00.000Z", termUnit: "weeks", termValue: 20, paymentFrequency: "weekly" }));
  assert.equal(result, "2026-05-21T00:00:00.000Z");
});

test("expected end date is undefined without a funded date or without a term", () => {
  assert.equal(expectedEndDateForFundedDeal(deal({ fundedDate: undefined, termValue: 20 })), undefined);
  assert.equal(expectedEndDateForFundedDeal(deal({ fundedDate: "2026-01-01T00:00:00.000Z", termValue: 0 })), undefined);
});

// ── Dashboard quick-view eligibility ─────────────────────────────────────────

const NOW = new Date("2026-08-15T12:00:00.000Z");

function pipeline(overrides: Partial<PipelineDeal> = {}): PipelineDeal {
  return {
    id: "p1",
    contactName: "Lead Contact",
    businessName: "Lead Co",
    requestLabel: "",
    statusRaw: "",
    stage: "in-review",
    notes: "",
    sheetLabel: "",
    sourceLabel: "test",
    submittedDate: "2026-07-10T00:00:00.000Z", // previous month relative to NOW (August)
    ...overrides,
  };
}

function followUp(overrides: Partial<FollowUpItem> = {}): FollowUpItem {
  return {
    id: "f1",
    contactName: "FU Contact",
    businessName: "FU Co",
    requestLabel: "",
    notes: "",
    lastContactLabel: "",
    priority: "medium",
    appSubmitted: false,
    completed: false,
    sheetLabel: "",
    sourceLabel: "test",
    createdAt: "2026-07-01T00:00:00.000Z", // ~6 weeks before NOW
    ...overrides,
  };
}

test("pipeline lead from a prior month needs new statements", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline(), NOW), true);
});

test("pipeline lead submitted in the current month does not need new statements yet", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ submittedDate: "2026-08-05T00:00:00.000Z" }), NOW), false);
});

test("a blacklisted / bad-deal (dead) lead never asks for new statements", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ stage: "dead" }), NOW), false);
});

test("declined and funded leads are excluded from need-new-statements", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ stage: "declined" }), NOW), false);
  assert.equal(pipelineNeedsNewStatements(pipeline({ stage: "funded" }), NOW), false);
});

test("acknowledging in the current month snoozes the statements reminder", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ statementsAckAt: "2026-08-02T00:00:00.000Z" }), NOW), false);
});

test("an acknowledgment from a prior month no longer suppresses the reminder", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ statementsAckAt: "2026-07-20T00:00:00.000Z" }), NOW), true);
});

test("a deleted pipeline lead never surfaces", () => {
  assert.equal(pipelineNeedsNewStatements(pipeline({ deletedAt: "2026-08-01T00:00:00.000Z" }), NOW), false);
});

test("a funded deal 35%+ paid is a renewal candidate", () => {
  // schedule aggregate: 8 of 20 posted ($28,000 of $70,000) = 40% >= 35%.
  assert.equal(fundedDealIsRenewalCandidate(deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 8, postedAmount: 28000 }), NOW), true);
});

test("a funded deal under 35% paid is not a renewal candidate", () => {
  // 6 of 20 posted ($21,000 of $70,000) = 30% < 35%.
  assert.equal(fundedDealIsRenewalCandidate(deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 6, postedAmount: 21000 }), NOW), false);
});

test("a dismissed renewal (renewalAckAt set) is not a candidate", () => {
  assert.equal(
    fundedDealIsRenewalCandidate(deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 8, postedAmount: 28000, renewalAckAt: "2026-08-01T00:00:00.000Z" }), NOW),
    false,
  );
});

test("a follow-up older than a month is due on the dashboard", () => {
  assert.equal(followUpIsDueOnDashboard(followUp(), NOW), true);
});

test("a follow-up added only days ago is not due yet", () => {
  assert.equal(followUpIsDueOnDashboard(followUp({ createdAt: "2026-08-10T00:00:00.000Z" }), NOW), false);
});

test("a completed or dashboard-acknowledged follow-up does not surface", () => {
  assert.equal(followUpIsDueOnDashboard(followUp({ completed: true }), NOW), false);
  assert.equal(followUpIsDueOnDashboard(followUp({ dashboardAckAt: "2026-08-01T00:00:00.000Z" }), NOW), false);
});
