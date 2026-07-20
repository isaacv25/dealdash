import type { PaymentFrequency, TermUnit } from "./types";

/**
 * Centralized, currency-safe math for funded-deal calculations. Every stored financial value that
 * this module produces is an integer number of cents; the only float in the whole pipeline is the
 * factor rate and dollar-denominated user input, both of which are converted to integers (cents /
 * basis points) at the boundary before any arithmetic happens. This keeps totals exact and repeatable
 * regardless of platform or JS float rounding behavior.
 *
 * The client (deal edit form) imports these same functions for its live preview, and the server
 * (workspace.ts / schedule.ts) re-runs them as the authoritative source of truth before persisting.
 * Never duplicate this math elsewhere.
 */

export const MIN_FACTOR_RATE = 1.0;
export const MAX_SYNDICATION_PERCENT = 100;
export const MIN_SYNDICATION_PERCENT = 0;

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Factor rates (e.g. 1.4) are stored/entered as decimals but multiplying floats compounds rounding
 * error. Converting to integer basis points (1.4 -> 14000) makes the payback calculation exact
 * integer arithmetic.
 */
export function factorRateToBasisPoints(factorRate: number): number {
  if (!Number.isFinite(factorRate)) return 0;
  return Math.round(factorRate * 10000);
}

export function totalPaybackCents(fundedAmountCents: number, factorRate: number): number {
  const basisPoints = factorRateToBasisPoints(factorRate);
  return Math.round((fundedAmountCents * basisPoints) / 10000);
}

/**
 * Term unit must always match payment frequency going forward (a weekly deal has a weekly term,
 * etc.), so termValue directly equals the number of scheduled payments for newly edited deals.
 */
export function termUnitForFrequency(frequency: PaymentFrequency): TermUnit {
  if (frequency === "daily") return "days";
  if (frequency === "monthly") return "months";
  return "weeks";
}

/**
 * Splits totalPaybackCents across `periods` equal-as-possible installments. Every installment
 * except the last is floor-divided; the last installment absorbs whatever remainder is left so the
 * sum of the schedule always equals totalPaybackCents exactly (never over- or under-collects).
 */
export function buildEvenScheduleAmountsCents(totalCents: number, periods: number): number[] {
  if (periods <= 0 || totalCents <= 0) return [];
  const base = Math.floor(totalCents / periods);
  const amounts = new Array<number>(periods).fill(base);
  const remainder = totalCents - base * periods;
  amounts[amounts.length - 1] += remainder;
  return amounts;
}

export function scheduledPaymentCents(totalCents: number, periods: number): number {
  if (periods <= 0) return 0;
  return Math.floor(totalCents / periods);
}

export interface DealCalculationInput {
  fundedAmount: number;
  factorRate: number;
  termValue: number;
  paymentFrequency: PaymentFrequency;
  syndicationPercent: number;
}

export interface DealValidationError {
  field: string;
  message: string;
}

/**
 * Server and client run this exact same validation so a value the client preview accepts can never
 * be silently rejected (or worse, silently miscalculated) once it reaches the server action.
 */
export function validateDealCalculationInput(input: DealCalculationInput): DealValidationError[] {
  const errors: DealValidationError[] = [];

  if (!Number.isFinite(input.fundedAmount) || input.fundedAmount < 0) {
    errors.push({ field: "fundedAmount", message: "Funded amount cannot be negative." });
  }
  if (!Number.isFinite(input.factorRate) || input.factorRate < MIN_FACTOR_RATE) {
    errors.push({ field: "factorRate", message: `Factor rate must be at least ${MIN_FACTOR_RATE.toFixed(2)}.` });
  }
  if (!Number.isInteger(input.termValue) || input.termValue <= 0) {
    errors.push({ field: "termValue", message: "Term must be a whole number of payments greater than zero." });
  }
  if (
    !Number.isFinite(input.syndicationPercent) ||
    input.syndicationPercent < MIN_SYNDICATION_PERCENT ||
    input.syndicationPercent > MAX_SYNDICATION_PERCENT
  ) {
    errors.push({ field: "syndicationPercent", message: "Syndication percent must be between 0 and 100." });
  }

  return errors;
}

export interface DealCalculationResult {
  totalPaybackCents: number;
  totalPaybackDollars: number;
  scheduledPaymentCents: number;
  scheduledPaymentDollars: number;
  periods: number;
  termUnit: TermUnit;
  scheduleAmountsCents: number[];
}

/**
 * The single function the UI calls on every keystroke to preview recalculated values, and that the
 * server calls again before persisting. Throws only on structurally invalid input (NaN); business
 * validation (negative amounts, etc.) is surfaced via validateDealCalculationInput instead so the UI
 * can show inline errors without a thrown exception.
 */
export function calculateDeal(input: DealCalculationInput): DealCalculationResult {
  const fundedAmountCents = dollarsToCents(Math.max(0, input.fundedAmount || 0));
  const periods = Math.max(0, Math.trunc(input.termValue || 0));
  const totalCents = totalPaybackCents(fundedAmountCents, input.factorRate || 0);
  const scheduleAmountsCents = buildEvenScheduleAmountsCents(totalCents, periods);
  const perPaymentCents = scheduledPaymentCents(totalCents, periods);

  return {
    totalPaybackCents: totalCents,
    totalPaybackDollars: centsToDollars(totalCents),
    scheduledPaymentCents: perPaymentCents,
    scheduledPaymentDollars: centsToDollars(perPaymentCents),
    periods,
    termUnit: termUnitForFrequency(input.paymentFrequency),
    scheduleAmountsCents,
  };
}

/**
 * Normalizes a syndication percent typed as a whole percentage (e.g. "12.5") to the fractional
 * value the database stores (0.125), matching the convention already used by
 * housePointsPercent/commissionPercent elsewhere in this codebase.
 */
export function normalizeSyndicationPercent(inputPercent: number): number {
  const clamped = Math.min(MAX_SYNDICATION_PERCENT, Math.max(MIN_SYNDICATION_PERCENT, inputPercent || 0));
  return Math.round(clamped * 100) / 100 / 100;
}

export function syndicationPercentToDisplay(fraction: number): number {
  return Math.round(fraction * 100 * 100) / 100;
}
