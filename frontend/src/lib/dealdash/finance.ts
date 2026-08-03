import { HELOC_TERM_YEARS } from "./types.ts";
import type { FundedDealType, PaymentFrequency, TermUnit } from "./types";

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

// ── HELOC ────────────────────────────────────────────────────────────────────
// A HELOC prices on APR + term (years) rather than a factor rate, so it needs its own calculation
// path. This treats the HELOC as a single fixed-rate amortizing loan over its full term -- a
// deliberate simplification (a real HELOC has a separate draw period before repayment begins) made
// for a directional payment/payback estimate, in the same spirit as this codebase's other documented
// simplifications (see rate-scenario.ts). Always pays monthly. See HELOC_TERM_YEARS in types.ts for
// the canonical list of supported term lengths.

/**
 * Standard level-payment amortization formula: the fixed monthly payment that pays off
 * `principalCents` over `termMonths` months at `aprPercent` annual rate. Falls back to a straight
 * even split when the rate is zero (the formula divides by zero at r=0).
 */
export function helocMonthlyPaymentCents(principalCents: number, aprPercent: number, termMonths: number): number {
  if (termMonths <= 0 || principalCents <= 0) return 0;
  const monthlyRate = Math.max(0, aprPercent) / 100 / 12;
  if (monthlyRate <= 0) return Math.round(principalCents / termMonths);
  const payment = (principalCents * monthlyRate) / (1 - (1 + monthlyRate) ** -termMonths);
  return Math.round(payment);
}

export interface HelocCalculationInput {
  fundedAmount: number;
  aprPercent: number;
  /** Whole years -- must be one of HELOC_TERM_YEARS (types.ts). */
  termYears: number;
}

export function validateHelocCalculationInput(input: HelocCalculationInput): DealValidationError[] {
  const errors: DealValidationError[] = [];
  if (!Number.isFinite(input.fundedAmount) || input.fundedAmount < 0) {
    errors.push({ field: "fundedAmount", message: "Funded amount cannot be negative." });
  }
  if (!Number.isFinite(input.aprPercent) || input.aprPercent < 0) {
    errors.push({ field: "aprPercent", message: "APR cannot be negative." });
  }
  if (!(HELOC_TERM_YEARS as readonly number[]).includes(input.termYears)) {
    errors.push({ field: "termYears", message: "Term must be 10, 15, 20, or 30 years." });
  }
  return errors;
}

export function calculateHelocDeal(input: HelocCalculationInput): DealCalculationResult {
  const principalCents = dollarsToCents(Math.max(0, input.fundedAmount || 0));
  const periods = Math.max(0, Math.trunc((input.termYears || 0) * 12));
  const perPaymentCents = helocMonthlyPaymentCents(principalCents, input.aprPercent || 0, periods);
  // The level payment IS the amortization schedule's per-period amount by construction, so the total
  // is exactly perPayment * periods (buildEvenScheduleAmountsCents then absorbs any cent remainder
  // into the final installment, consistent with how every other deal type's schedule is built).
  const totalCents = perPaymentCents * periods;

  return {
    totalPaybackCents: totalCents,
    totalPaybackDollars: centsToDollars(totalCents),
    scheduledPaymentCents: perPaymentCents,
    scheduledPaymentDollars: centsToDollars(perPaymentCents),
    periods,
    termUnit: "months",
    scheduleAmountsCents: buildEvenScheduleAmountsCents(totalCents, periods),
  };
}

/**
 * Dispatches to the HELOC or factor-rate calculation based on dealType. Renewal and Add-on deals are
 * still MCA-shaped economically (they just add a link back to an original deal), so they fall
 * through to the same calculateDeal path as "mca".
 */
export function calculateAnyDeal(input: DealCalculationInput & { dealType: FundedDealType; aprPercent?: number; termYears?: number }): DealCalculationResult {
  if (input.dealType === "heloc") {
    return calculateHelocDeal({ fundedAmount: input.fundedAmount, aprPercent: input.aprPercent ?? 0, termYears: input.termYears ?? 0 });
  }
  return calculateDeal(input);
}

export interface HelocDerivedFields {
  factorRate: number;
  termValue: number;
  termUnit: TermUnit;
  paymentFrequency: PaymentFrequency;
  paymentAmount: number;
}

/**
 * HELOC deals price on Amount/APR/Term-years, not the MCA fundedAmount/factorRate/termValue/
 * paymentFrequency shape -- but every other piece of this app (progress bar, dashboard totals, CSV
 * export, the cron poster, funded-deal-panel's live preview) reads exactly that shape. Rather than
 * thread a dealType branch through every one of those call sites, a HELOC deal's factorRate/
 * termValue/termUnit/paymentFrequency/paymentAmount are *derived* fields, recomputed here from
 * Amount/APR/Term whenever any of them change (see updateFundedDeal in workspace.ts) and persisted
 * like normal. factorRate becomes a synthetic value (totalPayback / fundedAmount) purely so
 * `fundedAmount * factorRate` -- used everywhere else in the codebase -- still recovers the correct
 * HELOC total payback. This is a deliberate simplification: it reuses the existing MCA schedule/
 * progress engine as-is instead of a parallel HELOC-aware code path throughout the app.
 */
export function deriveHelocFields(fundedAmount: number, aprPercent: number, termYears: number): HelocDerivedFields {
  const calc = calculateHelocDeal({ fundedAmount, aprPercent, termYears });
  return {
    factorRate: fundedAmount > 0 ? calc.totalPaybackDollars / fundedAmount : MIN_FACTOR_RATE,
    termValue: calc.periods,
    termUnit: "months",
    paymentFrequency: "monthly",
    paymentAmount: calc.scheduledPaymentDollars,
  };
}
