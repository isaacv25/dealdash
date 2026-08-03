import { test } from "node:test";
import assert from "node:assert/strict";
import { progressForFundedDeal } from "../calculations.ts";
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
