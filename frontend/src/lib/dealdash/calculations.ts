import type { FundedDeal, PaymentFrequency, TermUnit } from "./types";

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

  if (deal.manualBalanceRemaining != undefined) {
    const paid = Math.max(0, grossPayback - deal.manualBalanceRemaining);
    const estimatedPeriodsPaid = periodicPayment > 0 ? Math.min(totalPeriods, Math.round(paid / periodicPayment)) : 0;
    return {
      grossPayback,
      periodicPayment,
      totalPeriods,
      completedPeriods: estimatedPeriodsPaid,
      paymentsRemaining: Math.max(0, totalPeriods - estimatedPeriodsPaid),
      paidAmount: roundCurrency(paid),
      balanceRemaining: roundCurrency(Math.max(0, deal.manualBalanceRemaining)),
      progressPercent: grossPayback ? Math.min(100, Math.round((paid / grossPayback) * 100)) : 0,
      usesManualBalance: true,
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

export function renewalDateForFundedDeal(deal: FundedDeal) {
  if (deal.manualRenewalDate) return deal.manualRenewalDate;
  if (!deal.fundedDate) return undefined;
  const fundedDate = new Date(deal.fundedDate);
  if (Number.isNaN(fundedDate.getTime())) return undefined;

  const renewal = new Date(fundedDate);
  if (deal.termUnit === "days") {
    renewal.setDate(renewal.getDate() + Math.round(deal.termValue * 0.7));
  } else if (deal.termUnit === "weeks") {
    renewal.setDate(renewal.getDate() + Math.round(deal.termValue * 7 * 0.7));
  } else {
    renewal.setMonth(renewal.getMonth() + Math.max(1, Math.round(deal.termValue * 0.7)));
  }
  return renewal.toISOString();
}
