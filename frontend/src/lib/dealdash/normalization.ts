import { parseBoolean, parseCurrency, parseDate, parsePercent, parseRequestRange } from "./calculations";
import type { FollowUpItem, FundedDeal, PipelineDeal, PipelineStage } from "./types";

/** Rows arriving here are already re-keyed to canonical field names by applyColumnMapping. */
type CanonicalRow = Record<string, string>;

function field(row: CanonicalRow, key: string) {
  return row[key] ?? "";
}

export function createId(prefix: string, source: string, index: number) {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug}-${index + 1}`;
}

function stageFromRawStatus(rawStatus: string): PipelineStage {
  const normalized = rawStatus.trim().toLowerCase();

  if (!normalized || normalized.includes("did not submit")) return "new-lead";
  if (normalized.includes("submitted")) return "submitted";
  if (normalized.includes("pending review") || normalized.includes("being shopped") || normalized.includes("pending statements")) return "in-review";
  if (normalized.includes("offer") || normalized.includes("limitless offer")) return "approved";
  if (normalized.includes("contract")) return "contract-out";
  if (normalized.includes("funded")) return "funded";
  if (normalized.includes("renew")) return "renewal";
  if (normalized.includes("declined")) return "declined";
  if (normalized.includes("blacklisted") || normalized.includes("unfundable") || normalized.includes("killed") || normalized.includes("sus")) return "dead";
  return "in-review";
}

function fundedStageFromRawStatus(rawStatus: string) {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized.includes("clawback") || normalized === "cb" || normalized.includes("+cb")) return "clawback" as const;
  if (normalized.includes("slow")) return "slow-pay" as const;
  if (normalized.includes("pocb")) return "watch" as const;
  return "active" as const;
}

/**
 * The source funded sheet uses "Paid Out" to mark broker commission payout,
 * so we keep that separate from the advance's repayment progress stage.
 */
function commissionStatusFromRawStatus(rawStatus: string) {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized.includes("clawback") || normalized === "cb" || normalized.includes("+cb")) return "clawback" as const;
  if (normalized.includes("paid out")) return "paid-out" as const;
  return "pending" as const;
}

function splitCityState(value: string) {
  const [city, state] = value.split(",").map((segment) => segment?.trim());
  return { city, state };
}

/**
 * CSV normalization deliberately preserves the sheet's raw labels while also mapping them into
 * canonical app stages. That gives us reliable filters without losing the wording the broker saw.
 *
 * `row` here is already re-keyed to canonical field names (see import-fields.ts / applyColumnMapping)
 * -- these functions no longer assume any specific literal CSV header names.
 */
export function normalizeFundedRow(row: CanonicalRow, sourceLabel: string, index: number): FundedDeal {
  const businessName = field(row, "businessName");
  const contactName = field(row, "contactName");
  const termUnitRaw = field(row, "termUnit").trim().toLowerCase();
  const termUnit = termUnitRaw.startsWith("day") ? "days" : termUnitRaw.startsWith("month") ? "months" : "weeks";
  const paymentFrequency = termUnit === "days" ? "daily" : termUnit === "months" ? "monthly" : "weekly";
  const fundedAmount = parseCurrency(field(row, "fundedAmount"));
  const factorRate = Number.parseFloat(field(row, "factorRate") || "0") || 1;
  const commissionAmount = parseCurrency(field(row, "commissionAmount"));
  const commissionPercent = fundedAmount > 0 && commissionAmount > 0 ? commissionAmount / fundedAmount : 0;
  const statusRaw = field(row, "statusRaw");
  const statusStage = fundedStageFromRawStatus(statusRaw);
  const commissionStatus = commissionStatusFromRawStatus(statusRaw);

  return {
    id: createId("funded", businessName || contactName || sourceLabel, index),
    businessName: businessName || "Unknown business",
    contactName: contactName || "Unknown contact",
    phone: field(row, "phone") || undefined,
    email: field(row, "email") || undefined,
    fundedDate: parseDate(field(row, "fundedDate")),
    funder: field(row, "funder") || undefined,
    fundedAmount,
    factorRate,
    termValue: Number.parseInt(field(row, "termValue") || "0", 10) || 0,
    termUnit,
    paymentAmount: parseCurrency(field(row, "paymentAmount")),
    paymentFrequency,
    syndicationPercent: parsePercent(field(row, "syndicationPercent")),
    pointsPercent: 0,
    housePointsPercent: 0,
    commissionPercent,
    commissionAmount,
    commissionStatus,
    clawbackAmount: commissionStatus === "clawback" ? Math.abs(commissionAmount) : 0,
    statusRaw: statusRaw || "Active",
    statusStage,
    fundedTags: [],
    notes: field(row, "notes"),
    sourceLabel,
  };
}

export function normalizePipelineRow(row: CanonicalRow, sourceLabel: string, index: number): PipelineDeal {
  const contactName = field(row, "contactName");
  const businessName = field(row, "businessName");
  const { city, state } = splitCityState(field(row, "cityState"));
  const requestLabel = field(row, "requestLabel");
  const request = parseRequestRange(requestLabel);
  const statusRaw = field(row, "statusRaw");
  return {
    id: createId("pipeline", businessName || contactName || sourceLabel, index),
    contactName: contactName || "Unknown contact",
    businessName: businessName || "Unknown business",
    phone: field(row, "phone") || undefined,
    email: field(row, "email") || undefined,
    city,
    state,
    submittedDate: parseDate(field(row, "submittedDate")),
    requestLabel,
    requestedAmountMin: request.requestedAmountMin,
    requestedAmountMax: request.requestedAmountMax,
    statusRaw,
    stage: stageFromRawStatus(statusRaw),
    notes: field(row, "notes"),
    sheetLabel: field(row, "sheetLabel"),
    nextFollowUpDate: undefined,
    sourceLabel,
  };
}

export function normalizeFollowUpRow(row: CanonicalRow, sourceLabel: string, index: number): FollowUpItem {
  const contactName = field(row, "contactName");
  const businessName = field(row, "businessName") || `${contactName} lead`.trim();
  const appSubmittedRaw = field(row, "appSubmitted");
  return {
    id: createId("follow-up", businessName || contactName || sourceLabel, index),
    contactName: contactName || "Unknown contact",
    businessName: businessName || "Unknown business",
    phone: field(row, "phone") || undefined,
    email: field(row, "email") || undefined,
    requestLabel: field(row, "requestLabel"),
    notes: [field(row, "notes"), field(row, "monthlyRevenueLabel"), field(row, "positionsLabel")].filter(Boolean).join(" | "),
    lastContactLabel: field(row, "lastContactLabel"),
    dueDate: undefined,
    priority: parseBoolean(appSubmittedRaw) ? "medium" : "high",
    appSubmitted: parseBoolean(appSubmittedRaw),
    completed: false,
    sheetLabel: field(row, "sheetLabel"),
    sourceLabel,
  };
}

/** Best-guess default destination for a freshly-uploaded file, based on its raw (unmapped) headers. */
export function detectImportType(headers: string[]) {
  const headerSet = new Set(headers);

  if (headerSet.has("Amount") && headerSet.has("Funder")) return "funded" as const;
  if (headerSet.has("Date App") && headerSet.has("Business")) return "pipeline" as const;
  if (headerSet.has("Full name") && headerSet.has("Date Last Contacted")) return "follow-up" as const;
  return "unknown" as const;
}

/** rows must already be canonical-keyed (post applyColumnMapping) before calling this. */
export function normalizeImportedRows(
  importType: "funded" | "pipeline" | "follow-up",
  rows: CanonicalRow[],
  sourceLabel: string,
) {
  if (importType === "funded") {
    return {
      fundedDeals: rows.map((row, index) => normalizeFundedRow(row, sourceLabel, index)),
      pipelineDeals: [] as PipelineDeal[],
      followUps: [] as FollowUpItem[],
    };
  }

  if (importType === "pipeline") {
    return {
      fundedDeals: [] as FundedDeal[],
      pipelineDeals: rows.map((row, index) => normalizePipelineRow(row, sourceLabel, index)),
      followUps: [] as FollowUpItem[],
    };
  }

  return {
    fundedDeals: [] as FundedDeal[],
    pipelineDeals: [] as PipelineDeal[],
    followUps: rows.map((row, index) => normalizeFollowUpRow(row, sourceLabel, index)),
  };
}
