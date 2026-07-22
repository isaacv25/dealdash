import { centsToDollars, dollarsToCents, scheduledPaymentCents, totalPaybackCents } from "./finance.ts";
import type { TermUnit } from "./types";

/**
 * Standalone "what-if" deal scenario math for the Rate Calculator page. This is deliberately
 * separate from a real funded deal: nothing here is persisted, so the shape only needs to match
 * what the calculator's own inputs/outputs require, not the FundedDeal schema.
 */
export interface RateScenarioInput {
  fundedAmount: number;
  factorRate: number;
  /** Flat-dollar origination/underwriting fee deducted before the net amount reaches the merchant. */
  fees: number;
  termValue: number;
  termUnit: TermUnit;
  /** Whole percent (e.g. 2 for 2%) of fundedAmount the ISO/broker desk earns. */
  isoPointsPercent: number;
  /** Whole percent (e.g. 50 for 50%) of the ISO points DOLLAR amount that goes to the rep. */
  repPointsPercent: number;
  /** Whole percent (e.g. 10 for 10%) of fundedAmount a syndicator funds. */
  syndicationPercent: number;
  /** Flat-dollar bonus added straight to rep profit. */
  bonus: number;
}

export interface RateScenarioResult {
  netFundedAmount: number;
  totalPayback: number;
  paymentAmount: number;
  isoPointsAmount: number;
  repPointsAmount: number;
  syndicationProfitAmount: number;
  repProfit: number;
}

/**
 * Rep Profit is intentionally simple: rep's cut of the ISO points, plus the rep's cut of the
 * syndicated portion, plus any flat bonus. It does not model syndicator management fees -- those
 * vary per syndicator relationship and the broker asked for a subjective, directionally-useful
 * number rather than a fully-loaded one. Payment amount assumes payments occur once per termUnit
 * (e.g. a 24-week term pays weekly for 24 periods); there's no separate payment-frequency input.
 */
export function calculateRateScenario(input: RateScenarioInput): RateScenarioResult {
  const fundedAmountCents = dollarsToCents(Math.max(0, input.fundedAmount || 0));
  const feesCents = dollarsToCents(Math.max(0, input.fees || 0));
  const netFundedAmountCents = Math.max(0, fundedAmountCents - feesCents);

  const paybackCents = totalPaybackCents(fundedAmountCents, input.factorRate || 0);
  const periods = Math.max(0, Math.trunc(input.termValue || 0));
  const paymentCents = scheduledPaymentCents(paybackCents, periods);

  const isoPointsCents = Math.round((fundedAmountCents * Math.max(0, input.isoPointsPercent || 0)) / 100);
  const repPointsCents = Math.round((isoPointsCents * Math.max(0, input.repPointsPercent || 0)) / 100);
  const syndicationProfitCents = Math.round((fundedAmountCents * Math.max(0, input.syndicationPercent || 0)) / 100);
  const bonusCents = dollarsToCents(input.bonus || 0);
  const repProfitCents = repPointsCents + syndicationProfitCents + bonusCents;

  return {
    netFundedAmount: centsToDollars(netFundedAmountCents),
    totalPayback: centsToDollars(paybackCents),
    paymentAmount: centsToDollars(paymentCents),
    isoPointsAmount: centsToDollars(isoPointsCents),
    repPointsAmount: centsToDollars(repPointsCents),
    syndicationProfitAmount: centsToDollars(syndicationProfitCents),
    repProfit: centsToDollars(repProfitCents),
  };
}
