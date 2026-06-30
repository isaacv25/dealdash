import { z } from "zod";
import { parseBoolean, parseCurrency, parseDate, parsePercent, parseRequestRange } from "./calculations";
import type { FollowUpItem, FundedDeal, PipelineDeal, PipelineStage } from "./types";

const pipelineSchema = z.object({
  "Date App": z.string().optional().default(""),
  Name: z.string().optional().default(""),
  Business: z.string().optional().default(""),
  "City, State": z.string().optional().default(""),
  Number: z.string().optional().default(""),
  Email: z.string().optional().default(""),
  Request: z.string().optional().default(""),
  Status: z.string().optional().default(""),
  Notes: z.string().optional().default(""),
  Sheet: z.string().optional().default(""),
});

const fundedSchema = z.object({
  Date: z.string().optional().default(""),
  "Business Name": z.string().optional().default(""),
  Name: z.string().optional().default(""),
  Number: z.string().optional().default(""),
  Email: z.string().optional().default(""),
  Amount: z.string().optional().default(""),
  Rate: z.string().optional().default(""),
  Term: z.string().optional().default(""),
  "Term Unit": z.string().optional().default(""),
  Payment: z.string().optional().default(""),
  Funder: z.string().optional().default(""),
  Syndication: z.string().optional().default(""),
  Commission: z.string().optional().default(""),
  Status: z.string().optional().default(""),
});

const followUpSchema = z.object({
  "Full name": z.string().optional().default(""),
  Number: z.string().optional().default(""),
  Email: z.string().optional().default(""),
  "Business Name": z.string().optional().default(""),
  Request: z.string().optional().default(""),
  Notes: z.string().optional().default(""),
  Monthly: z.string().optional().default(""),
  Positions: z.string().optional().default(""),
  App: z.string().optional().default(""),
  "Date Last Contacted": z.string().optional().default(""),
  Sheet: z.string().optional().default(""),
});

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
  if (normalized.includes("paid out")) return "paid-out" as const;
  if (normalized.includes("clawback") || normalized === "cb" || normalized.includes("+cb")) return "clawback" as const;
  if (normalized.includes("slow")) return "slow-pay" as const;
  if (normalized.includes("pocb")) return "watch" as const;
  return "active" as const;
}

function splitCityState(value: string) {
  const [city, state] = value.split(",").map((segment) => segment?.trim());
  return { city, state };
}

/**
 * CSV normalization deliberately preserves the sheet's raw labels while also mapping them into
 * canonical app stages. That gives us reliable filters without losing the wording the broker saw.
 */
export function normalizeFundedRow(row: Record<string, string>, sourceLabel: string, index: number): FundedDeal {
  const parsed = fundedSchema.parse(row);
  const termUnitRaw = parsed["Term Unit"].trim().toLowerCase();
  const termUnit = termUnitRaw.startsWith("day") ? "days" : termUnitRaw.startsWith("month") ? "months" : "weeks";
  const paymentFrequency = termUnit === "days" ? "daily" : termUnit === "months" ? "monthly" : "weekly";
  const fundedAmount = parseCurrency(parsed.Amount);
  const factorRate = Number.parseFloat(parsed.Rate || "0") || 1;
  const commissionAmount = parseCurrency(parsed.Commission);
  const commissionPercent = fundedAmount > 0 && commissionAmount > 0 ? commissionAmount / fundedAmount : 0;
  const statusStage = fundedStageFromRawStatus(parsed.Status);

  return {
    id: createId("funded", parsed["Business Name"] || parsed.Name || sourceLabel, index),
    businessName: parsed["Business Name"] || "Unknown business",
    contactName: parsed.Name || "Unknown contact",
    phone: parsed.Number || undefined,
    email: parsed.Email || undefined,
    fundedDate: parseDate(parsed.Date),
    funder: parsed.Funder || undefined,
    fundedAmount,
    factorRate,
    termValue: Number.parseInt(parsed.Term || "0", 10) || 0,
    termUnit,
    paymentAmount: parseCurrency(parsed.Payment),
    paymentFrequency,
    syndicationPercent: parsePercent(parsed.Syndication),
    pointsPercent: 0,
    housePointsPercent: 0,
    commissionPercent,
    commissionAmount,
    commissionStatus: statusStage === "clawback" ? "clawback" : statusStage === "paid-out" ? "paid-out" : "pending",
    clawbackAmount: statusStage === "clawback" ? Math.abs(commissionAmount) : 0,
    statusRaw: parsed.Status || "Active",
    statusStage,
    notes: "",
    sourceLabel,
  };
}

export function normalizePipelineRow(row: Record<string, string>, sourceLabel: string, index: number): PipelineDeal {
  const parsed = pipelineSchema.parse(row);
  const { city, state } = splitCityState(parsed["City, State"]);
  const request = parseRequestRange(parsed.Request);
  return {
    id: createId("pipeline", parsed.Business || parsed.Name || sourceLabel, index),
    contactName: parsed.Name || "Unknown contact",
    businessName: parsed.Business || "Unknown business",
    phone: parsed.Number || undefined,
    email: parsed.Email || undefined,
    city,
    state,
    submittedDate: parseDate(parsed["Date App"]),
    requestLabel: parsed.Request || "",
    requestedAmountMin: request.requestedAmountMin,
    requestedAmountMax: request.requestedAmountMax,
    statusRaw: parsed.Status || "",
    stage: stageFromRawStatus(parsed.Status),
    notes: parsed.Notes || "",
    sheetLabel: parsed.Sheet || "",
    nextFollowUpDate: undefined,
    sourceLabel,
  };
}

export function normalizeFollowUpRow(row: Record<string, string>, sourceLabel: string, index: number): FollowUpItem {
  const parsed = followUpSchema.parse(row);
  const businessName = parsed["Business Name"] || `${parsed["Full name"]} lead`.trim();
  return {
    id: createId("follow-up", businessName || parsed["Full name"] || sourceLabel, index),
    contactName: parsed["Full name"] || "Unknown contact",
    businessName: businessName || "Unknown business",
    phone: parsed.Number || undefined,
    email: parsed.Email || undefined,
    requestLabel: parsed.Request || "",
    notes: [parsed.Notes, parsed.Monthly, parsed.Positions].filter(Boolean).join(" | "),
    lastContactLabel: parsed["Date Last Contacted"] || "",
    dueDate: undefined,
    priority: parseBoolean(parsed.App) ? "medium" : "high",
    appSubmitted: parseBoolean(parsed.App),
    completed: false,
    sheetLabel: parsed.Sheet || "",
    sourceLabel,
  };
}

export function detectImportType(headers: string[]) {
  const headerSet = new Set(headers);

  if (headerSet.has("Amount") && headerSet.has("Funder")) return "funded" as const;
  if (headerSet.has("Date App") && headerSet.has("Business")) return "pipeline" as const;
  if (headerSet.has("Full name") && headerSet.has("Date Last Contacted")) return "follow-up" as const;
  return "unknown" as const;
}

export function normalizeImportedRows(
  importType: "funded" | "pipeline" | "follow-up",
  rows: Record<string, string>[],
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
