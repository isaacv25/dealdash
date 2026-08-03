import { test } from "node:test";
import assert from "node:assert/strict";
import { progressForFundedDeal, psfPayout, renewalDateForFundedDeal, totalPayoutForFundedDeal } from "../calculations.ts";
import type { FundedDeal } from "../types.ts";

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

test("progress is driven by actually-posted schedule payments when a schedule exists", () => {
  // 6 of 20 payments posted, $21,000 collected of $70,000.
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 6, postedAmount: 21000 }),
  );
  assert.equal(result.totalPeriods, 20);
  assert.equal(result.completedPeriods, 6);
  assert.equal(result.paymentsRemaining, 14);
  assert.equal(result.paidAmount, 21000);
  assert.equal(result.balanceRemaining, 49000);
  assert.equal(result.progressPercent, 30);
});

test("a manual balance override still wins over the schedule aggregate", () => {
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 6, postedAmount: 21000, balanceOverrideAmount: 10000 }),
  );
  assert.equal(result.usesManualBalance, true);
  assert.equal(result.balanceRemaining, 10000);
});

test("scheduleCompletedAt forces 100% regardless of the posted aggregate", () => {
  const result = progressForFundedDeal(
    deal({ scheduledPaymentsCount: 20, postedPaymentsCount: 19, postedAmount: 66500, scheduleCompletedAt: "2026-07-01T00:00:00.000Z" }),
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
