import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnyDeal,
  calculateDeal,
  calculateHelocDeal,
  dollarsToCents,
  factorRateToBasisPoints,
  buildEvenScheduleAmountsCents,
  helocMonthlyPaymentCents,
  totalPaybackCents,
  validateDealCalculationInput,
  validateHelocCalculationInput,
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

// ── HELOC ────────────────────────────────────────────────────────────────────

test("HELOC at 0% APR is an exact even split with no interest", () => {
  assert.equal(helocMonthlyPaymentCents(1_200_000, 0, 12), 100_000); // $12,000 / 12mo = $1,000/mo exactly
});

test("HELOC monthly payment for $100k/6%/30yr lands in the well-known ballpark (~$599.55)", () => {
  // Loose cent-level bound (not an exact magic number) since this exercises real floating-point
  // amortization math -- still tight enough to catch a gross formula error (wrong rate scaling,
  // wrong period count, etc.) while not being flaky over a single cent of rounding.
  const cents = helocMonthlyPaymentCents(10_000_000, 6, 360);
  assert.ok(cents > 59_900 && cents < 60_000, `expected ~59955, got ${cents}`);
});

test("HELOC payment increases with APR for the same principal and term", () => {
  const low = helocMonthlyPaymentCents(10_000_000, 3, 180);
  const high = helocMonthlyPaymentCents(10_000_000, 9, 180);
  assert.ok(high > low);
});

test("HELOC total payback is exactly the level payment times the period count", () => {
  const result = calculateHelocDeal({ fundedAmount: 100_000, aprPercent: 6, termYears: 15 });
  assert.equal(result.periods, 180);
  assert.equal(result.termUnit, "months");
  assert.equal(result.totalPaybackCents, result.scheduledPaymentCents * 180);
  const sum = result.scheduleAmountsCents.reduce((a, b) => a + b, 0);
  assert.equal(sum, result.totalPaybackCents);
});

test("validateHelocCalculationInput rejects a non-standard term and negative APR", () => {
  const errors = validateHelocCalculationInput({ fundedAmount: 100000, aprPercent: -1, termYears: 25 });
  assert.ok(errors.some((e) => e.field === "aprPercent"));
  assert.ok(errors.some((e) => e.field === "termYears"));
});

test("validateHelocCalculationInput accepts every supported term length", () => {
  for (const termYears of [10, 15, 20, 30]) {
    assert.deepEqual(validateHelocCalculationInput({ fundedAmount: 100000, aprPercent: 6, termYears }), []);
  }
});

test("calculateAnyDeal dispatches to HELOC math for dealType 'heloc'", () => {
  const result = calculateAnyDeal({
    dealType: "heloc",
    fundedAmount: 100_000,
    aprPercent: 6,
    termYears: 15,
    // MCA-only fields are irrelevant for HELOC but still required by the shared input type.
    factorRate: 1,
    termValue: 0,
    paymentFrequency: "monthly",
    syndicationPercent: 0,
  });
  assert.equal(result.periods, 180);
  assert.equal(result.termUnit, "months");
});

test("calculateAnyDeal dispatches to factor-rate math for mca/renewal/addon", () => {
  const input = {
    fundedAmount: 50_000,
    factorRate: 1.4,
    termValue: 20,
    paymentFrequency: "weekly" as const,
    syndicationPercent: 0,
  };
  for (const dealType of ["mca", "renewal", "addon"] as const) {
    const result = calculateAnyDeal({ ...input, dealType });
    assert.equal(result.totalPaybackDollars, 70_000);
  }
});
