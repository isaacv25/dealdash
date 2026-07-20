import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDeal,
  dollarsToCents,
  factorRateToBasisPoints,
  buildEvenScheduleAmountsCents,
  totalPaybackCents,
  validateDealCalculationInput,
  normalizeSyndicationPercent,
  syndicationPercentToDisplay,
  MIN_FACTOR_RATE,
} from "../finance.ts";

test("funded amount change recalculates total payback", () => {
  const result = calculateDeal({
    fundedAmount: 100000,
    factorRate: 1.4,
    termValue: 100,
    paymentFrequency: "daily",
    syndicationPercent: 0,
  });
  assert.equal(result.totalPaybackDollars, 140000);
});

test("factor rate change recalculates total payback", () => {
  const low = calculateDeal({ fundedAmount: 50000, factorRate: 1.2, termValue: 20, paymentFrequency: "weekly", syndicationPercent: 0 });
  const high = calculateDeal({ fundedAmount: 50000, factorRate: 1.5, termValue: 20, paymentFrequency: "weekly", syndicationPercent: 0 });
  assert.equal(low.totalPaybackDollars, 60000);
  assert.equal(high.totalPaybackDollars, 75000);
  assert.ok(high.totalPaybackCents > low.totalPaybackCents);
});

test("term change recalculates per-period payment", () => {
  const shortTerm = calculateDeal({ fundedAmount: 100000, factorRate: 1.4, termValue: 50, paymentFrequency: "daily", syndicationPercent: 0 });
  const longTerm = calculateDeal({ fundedAmount: 100000, factorRate: 1.4, termValue: 100, paymentFrequency: "daily", syndicationPercent: 0 });
  assert.equal(shortTerm.scheduledPaymentDollars, 2800);
  assert.equal(longTerm.scheduledPaymentDollars, 1400);
});

test("daily payment calculation matches worked example", () => {
  const result = calculateDeal({ fundedAmount: 100000, factorRate: 1.4, termValue: 100, paymentFrequency: "daily", syndicationPercent: 0 });
  assert.equal(result.termUnit, "days");
  assert.equal(result.periods, 100);
  assert.equal(result.scheduledPaymentDollars, 1400);
});

test("weekly payment calculation matches worked example", () => {
  const result = calculateDeal({ fundedAmount: 100000, factorRate: 1.4, termValue: 20, paymentFrequency: "weekly", syndicationPercent: 0 });
  assert.equal(result.termUnit, "weeks");
  assert.equal(result.periods, 20);
  assert.equal(result.scheduledPaymentDollars, 7000);
});

test("decimal currency values stay exact in cents", () => {
  assert.equal(dollarsToCents(1234.56), 123456);
  assert.equal(totalPaybackCents(dollarsToCents(10000.5), 1.33), 1330067); // 10000.50 * 1.33 = 13300.665 -> rounds to 13300.67
});

test("final payment absorbs rounding remainder so the schedule sums exactly", () => {
  // 100000 total over 3 periods -> 33333.33... which is not evenly divisible in cents.
  const amounts = buildEvenScheduleAmountsCents(10000000, 3);
  assert.deepEqual(amounts, [3333333, 3333333, 3333334]);
  const sum = amounts.reduce((a, b) => a + b, 0);
  assert.equal(sum, 10000000);
});

test("final payment remainder handling never exceeds or falls short of total payback", () => {
  for (const periods of [1, 2, 3, 7, 13, 29, 100]) {
    for (const totalCents of [1, 99, 100, 12345, 999999, 14000000]) {
      const amounts = buildEvenScheduleAmountsCents(totalCents, periods);
      const sum = amounts.reduce((a, b) => a + b, 0);
      assert.equal(sum, totalCents, `periods=${periods} totalCents=${totalCents}`);
    }
  }
});

test("factor rate basis-point conversion avoids float drift", () => {
  assert.equal(factorRateToBasisPoints(1.4), 14000);
  assert.equal(factorRateToBasisPoints(1.33), 13300);
});

test("syndication percentage normalizes and round-trips", () => {
  assert.equal(normalizeSyndicationPercent(12.5), 0.125);
  assert.equal(syndicationPercentToDisplay(0.125), 12.5);
  assert.equal(normalizeSyndicationPercent(0), 0);
  assert.equal(normalizeSyndicationPercent(100), 1);
});

test("syndication percentage clamps out-of-range input", () => {
  assert.equal(normalizeSyndicationPercent(-5), 0);
  assert.equal(normalizeSyndicationPercent(150), 1);
});

test("rejects negative funded amount", () => {
  const errors = validateDealCalculationInput({ fundedAmount: -100, factorRate: 1.4, termValue: 10, paymentFrequency: "weekly", syndicationPercent: 0 });
  assert.ok(errors.some((e) => e.field === "fundedAmount"));
});

test("rejects zero-length term", () => {
  const errors = validateDealCalculationInput({ fundedAmount: 1000, factorRate: 1.4, termValue: 0, paymentFrequency: "weekly", syndicationPercent: 0 });
  assert.ok(errors.some((e) => e.field === "termValue"));
});

test("rejects factor rate below business minimum", () => {
  const errors = validateDealCalculationInput({ fundedAmount: 1000, factorRate: MIN_FACTOR_RATE - 0.01, termValue: 10, paymentFrequency: "weekly", syndicationPercent: 0 });
  assert.ok(errors.some((e) => e.field === "factorRate"));
});

test("rejects syndication percent outside 0-100", () => {
  const tooLow = validateDealCalculationInput({ fundedAmount: 1000, factorRate: 1.4, termValue: 10, paymentFrequency: "weekly", syndicationPercent: -1 });
  const tooHigh = validateDealCalculationInput({ fundedAmount: 1000, factorRate: 1.4, termValue: 10, paymentFrequency: "weekly", syndicationPercent: 101 });
  assert.ok(tooLow.some((e) => e.field === "syndicationPercent"));
  assert.ok(tooHigh.some((e) => e.field === "syndicationPercent"));
});

test("accepts a valid deal with no errors", () => {
  const errors = validateDealCalculationInput({ fundedAmount: 100000, factorRate: 1.4, termValue: 100, paymentFrequency: "daily", syndicationPercent: 12.5 });
  assert.deepEqual(errors, []);
});
