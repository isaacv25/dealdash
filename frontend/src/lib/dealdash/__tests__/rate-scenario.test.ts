import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRateScenario } from "../rate-scenario.ts";

test("net funded amount subtracts flat fees from funded amount", () => {
  const result = calculateRateScenario({
    fundedAmount: 50000,
    factorRate: 1.38,
    fees: 995,
    termValue: 24,
    termUnit: "weeks",
    isoPointsPercent: 2,
    repPointsPercent: 50,
    syndicationPercent: 10,
    bonus: 0,
  });
  assert.equal(result.netFundedAmount, 49005);
});

test("total payback is funded amount times factor rate, unaffected by fees", () => {
  const result = calculateRateScenario({
    fundedAmount: 50000,
    factorRate: 1.38,
    fees: 995,
    termValue: 24,
    termUnit: "weeks",
    isoPointsPercent: 0,
    repPointsPercent: 0,
    syndicationPercent: 0,
    bonus: 0,
  });
  assert.equal(result.totalPayback, 69000);
});

test("payment amount splits total payback evenly across term value periods", () => {
  const result = calculateRateScenario({
    fundedAmount: 100000,
    factorRate: 1.4,
    fees: 0,
    termValue: 100,
    termUnit: "days",
    isoPointsPercent: 0,
    repPointsPercent: 0,
    syndicationPercent: 0,
    bonus: 0,
  });
  assert.equal(result.totalPayback, 140000);
  assert.equal(result.paymentAmount, 1400);
});

test("rep points are a percent of ISO points dollars, not of funded amount", () => {
  const result = calculateRateScenario({
    fundedAmount: 100000,
    factorRate: 1.4,
    fees: 0,
    termValue: 10,
    termUnit: "weeks",
    isoPointsPercent: 2, // $2,000 ISO points
    repPointsPercent: 50, // rep gets 50% of that $2,000
    syndicationPercent: 0,
    bonus: 0,
  });
  assert.equal(result.isoPointsAmount, 2000);
  assert.equal(result.repPointsAmount, 1000);
});

test("rep profit sums rep points, syndication profit, and bonus", () => {
  const result = calculateRateScenario({
    fundedAmount: 100000,
    factorRate: 1.4,
    fees: 0,
    termValue: 10,
    termUnit: "weeks",
    isoPointsPercent: 2,
    repPointsPercent: 50,
    syndicationPercent: 10,
    bonus: 250,
  });
  assert.equal(result.repPointsAmount, 1000);
  assert.equal(result.syndicationProfitAmount, 10000);
  assert.equal(result.repProfit, 1000 + 10000 + 250);
});

test("negative or missing inputs are clamped to zero instead of throwing", () => {
  const result = calculateRateScenario({
    fundedAmount: -5000,
    factorRate: 0,
    fees: -100,
    termValue: 0,
    termUnit: "weeks",
    isoPointsPercent: -2,
    repPointsPercent: -50,
    syndicationPercent: -10,
    bonus: -250,
  });
  assert.equal(result.netFundedAmount, 0);
  assert.equal(result.totalPayback, 0);
  assert.equal(result.paymentAmount, 0);
  assert.equal(result.repProfit, 0);
});
