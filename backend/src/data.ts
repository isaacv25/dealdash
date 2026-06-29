import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { grossPaybackFromDeal, parseBoolean, parseCurrency, parseDate, parsePercent, parseRequestRange } from "./calculations";
import { parseCsvText } from "./csv";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, PipelineStage, SeedDataset } from "./types";

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

function createId(prefix: string, source: string, index: number) {
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
  if (normalized.includes("offer")) return "approved";
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

export function normalizeFundedRow(row: Record<string, string>, sourceLabel: string, index: number): FundedDeal {
  const parsed = fundedSchema.parse(row);
  const termUnitRaw = parsed["Term Unit"].trim().toLowerCase();
  const termUnit =
    termUnitRaw.startsWith("day") ? "days" : termUnitRaw.startsWith("month") ? "months" : "weeks";
  const paymentFrequency = termUnit === "days" ? "daily" : termUnit === "months" ? "monthly" : "weekly";
  const fundedAmount = parseCurrency(parsed.Amount);
  const factorRate = Number.parseFloat(parsed.Rate || "0") || 1;
  const commissionAmount = parseCurrency(parsed.Commission);
  const commissionPercent = fundedAmount > 0 && commissionAmount > 0 ? commissionAmount / fundedAmount : 0;

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
    commissionPercent,
    commissionAmount,
    clawbackAmount: 0,
    statusRaw: parsed.Status || "Active",
    statusStage: fundedStageFromRawStatus(parsed.Status),
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

async function readCsvFiles(importDir: string) {
  try {
    const entries = await fs.readdir(importDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /\.(csv|tsv)$/i.test(entry.name))
      .map((entry) => entry.name);

    const loaded = await Promise.all(
      files.map(async (filename) => {
        const absolutePath = path.join(importDir, filename);
        const content = await fs.readFile(absolutePath, "utf8");
        return { filename, ...parseCsvText(content) };
      }),
    );

    return loaded;
  } catch {
    return [];
  }
}

export async function loadSeedDataset(): Promise<SeedDataset> {
  const importDir = path.join(process.cwd(), "..", "data", "imports");
  const loadedFiles = await readCsvFiles(importDir);

  const fundedDeals: FundedDeal[] = [];
  const pipelineDeals: PipelineDeal[] = [];
  const followUps: FollowUpItem[] = [];
  const importBatches: ImportBatch[] = [];

  for (const file of loadedFiles) {
    const headerSet = new Set(file.headers);
    const sourceLabel = file.filename;

    if (headerSet.has("Amount") && headerSet.has("Funder")) {
      file.rows.forEach((row, index) => fundedDeals.push(normalizeFundedRow(row, sourceLabel, index)));
      importBatches.push({
        id: createId("import", file.filename, 0),
        filename: file.filename,
        importType: "funded",
        rowsImported: file.rows.length,
        rowsSkipped: 0,
        detectedColumns: file.headers,
        importedAt: new Date().toISOString(),
      });
      continue;
    }

    if (headerSet.has("Date App") && headerSet.has("Business")) {
      file.rows.forEach((row, index) => pipelineDeals.push(normalizePipelineRow(row, sourceLabel, index)));
      importBatches.push({
        id: createId("import", file.filename, 0),
        filename: file.filename,
        importType: "pipeline",
        rowsImported: file.rows.length,
        rowsSkipped: 0,
        detectedColumns: file.headers,
        importedAt: new Date().toISOString(),
      });
      continue;
    }

    if (headerSet.has("Full name") && headerSet.has("Date Last Contacted")) {
      file.rows.forEach((row, index) => followUps.push(normalizeFollowUpRow(row, sourceLabel, index)));
      importBatches.push({
        id: createId("import", file.filename, 0),
        filename: file.filename,
        importType: "follow-up",
        rowsImported: file.rows.length,
        rowsSkipped: 0,
        detectedColumns: file.headers,
        importedAt: new Date().toISOString(),
      });
    }
  }

  if (fundedDeals.length || pipelineDeals.length || followUps.length) {
    return {
      fundedDeals,
      pipelineDeals,
      followUps,
      importBatches,
      sourceMode: "csv",
    };
  }

  return createMockDataset();
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

export function createMockDataset(): SeedDataset {
  const fundedDeals: FundedDeal[] = [
    {
      id: "funded-sunbeam-1",
      businessName: "Sunbeam Logistics",
      contactName: "Avery Brooks",
      phone: "(702) 555-0183",
      email: "avery@sunbeamlogistics.com",
      fundedDate: "2026-05-12T00:00:00.000Z",
      funder: "Limitless Advance",
      fundedAmount: 60000,
      factorRate: 1.42,
      termValue: 26,
      termUnit: "weeks",
      paymentAmount: 3276.92,
      paymentFrequency: "weekly",
      syndicationPercent: 0.12,
      pointsPercent: 0.02,
      commissionPercent: 0.05,
      commissionAmount: 3000,
      clawbackAmount: 0,
      statusRaw: "Active",
      statusStage: "active",
      notes: "Renewal candidate in late summer.",
      sourceLabel: "sample-seed",
    },
    {
      id: "funded-metro-2",
      businessName: "Metro Med Supply",
      contactName: "Jordan Lee",
      phone: "(214) 555-0128",
      email: "ops@metromedsupply.com",
      fundedDate: "2026-03-03T00:00:00.000Z",
      funder: "Avanza",
      fundedAmount: 125000,
      factorRate: 1.36,
      termValue: 180,
      termUnit: "days",
      paymentAmount: 944.44,
      paymentFrequency: "daily",
      syndicationPercent: 0.18,
      pointsPercent: 0.03,
      commissionPercent: 0.045,
      commissionAmount: 5625,
      clawbackAmount: 0,
      statusRaw: "Slow payments",
      statusStage: "slow-pay",
      notes: "Monitor ACH consistency.",
      sourceLabel: "sample-seed",
    },
    {
      id: "funded-harbor-3",
      businessName: "Harbor Build Co",
      contactName: "Mina Patel",
      phone: "(617) 555-0104",
      email: "mina@harborbuild.co",
      fundedDate: "2025-12-18T00:00:00.000Z",
      funder: "Pinnacle",
      fundedAmount: 85000,
      factorRate: 1.29,
      termValue: 9,
      termUnit: "months",
      paymentAmount: 12183.33,
      paymentFrequency: "monthly",
      syndicationPercent: 0.07,
      pointsPercent: 0.015,
      commissionPercent: 0.04,
      commissionAmount: 3400,
      clawbackAmount: 500,
      statusRaw: "Paid Out + CB",
      statusStage: "clawback",
      notes: "Clawback reserve still open.",
      sourceLabel: "sample-seed",
      manualBalanceRemaining: 500,
    },
  ];

  const pipelineDeals: PipelineDeal[] = [
    {
      id: "pipeline-apex-1",
      contactName: "Taylor Nash",
      businessName: "Apex Auto Spa",
      phone: "(480) 555-0132",
      email: "taylor@apexautospa.com",
      city: "Phoenix",
      state: "AZ",
      submittedDate: "2026-06-14T00:00:00.000Z",
      requestLabel: "75k",
      requestedAmountMin: 75000,
      requestedAmountMax: 75000,
      statusRaw: "Pending Review",
      stage: "in-review",
      notes: "Bank statements in. Waiting on revised offer.",
      sheetLabel: "6/14",
      nextFollowUpDate: "2026-06-30T00:00:00.000Z",
      sourceLabel: "sample-seed",
    },
    {
      id: "pipeline-luna-2",
      contactName: "Riley Gomez",
      businessName: "Luna Kitchen Group",
      phone: "(305) 555-0190",
      email: "rgomez@lunakitchen.com",
      city: "Miami",
      state: "FL",
      submittedDate: "2026-06-09T00:00:00.000Z",
      requestLabel: "150-200k",
      requestedAmountMin: 150000,
      requestedAmountMax: 200000,
      statusRaw: "Offer from BFG",
      stage: "approved",
      notes: "Needs same-day close breakdown.",
      sheetLabel: "6/9",
      nextFollowUpDate: "2026-06-29T00:00:00.000Z",
      sourceLabel: "sample-seed",
    },
    {
      id: "pipeline-oak-3",
      contactName: "Casey Tran",
      businessName: "Oak Street Dental",
      phone: "(404) 555-0175",
      email: "casey@oakstreetdental.com",
      city: "Atlanta",
      state: "GA",
      submittedDate: "2026-06-24T00:00:00.000Z",
      requestLabel: "40k",
      requestedAmountMin: 40000,
      requestedAmountMax: 40000,
      statusRaw: "Submitted",
      stage: "submitted",
      notes: "Fresh file. Need follow-up tomorrow.",
      sheetLabel: "6/24",
      nextFollowUpDate: "2026-06-30T00:00:00.000Z",
      sourceLabel: "sample-seed",
    },
    {
      id: "pipeline-timber-4",
      contactName: "Morgan Ellis",
      businessName: "Timber Trail Transport",
      phone: "(901) 555-0149",
      email: "morgan@timbertrailtransport.com",
      city: "Memphis",
      state: "TN",
      submittedDate: "2026-05-30T00:00:00.000Z",
      requestLabel: "90k",
      requestedAmountMin: 90000,
      requestedAmountMax: 90000,
      statusRaw: "Declined",
      stage: "declined",
      notes: "Asked to revisit after tax cleanup.",
      sheetLabel: "5/30",
      sourceLabel: "sample-seed",
    },
  ];

  const followUps: FollowUpItem[] = [
    {
      id: "follow-up-aurora-1",
      contactName: "Jamie Cole",
      businessName: "Aurora Salon Studios",
      phone: "(818) 555-0102",
      email: "jamie@aurorasalon.com",
      requestLabel: "30k",
      notes: "Strong call. Waiting for docs.",
      lastContactLabel: "6/26",
      dueDate: "2026-06-30T00:00:00.000Z",
      priority: "high",
      appSubmitted: false,
      completed: false,
      sheetLabel: "6/26",
      sourceLabel: "sample-seed",
    },
    {
      id: "follow-up-ridge-2",
      contactName: "Drew Foster",
      businessName: "Ridge Repair Hub",
      phone: "(615) 555-0140",
      email: "drew@ridgerepairhub.com",
      requestLabel: "50k",
      notes: "Requested weekly payment mockup.",
      lastContactLabel: "6/24",
      dueDate: "2026-07-01T00:00:00.000Z",
      priority: "medium",
      appSubmitted: true,
      completed: false,
      sheetLabel: "6/24",
      sourceLabel: "sample-seed",
    },
    {
      id: "follow-up-golden-3",
      contactName: "Skylar Reed",
      businessName: "Golden Peak Construction",
      phone: "(720) 555-0166",
      email: "skylar@goldenpeakco.com",
      requestLabel: "120k",
      notes: "Closed loop for now.",
      lastContactLabel: "6/20",
      priority: "low",
      appSubmitted: false,
      completed: true,
      sheetLabel: "6/20",
      sourceLabel: "sample-seed",
    },
  ];

  const importBatches: ImportBatch[] = [
    {
      id: "import-sample-1",
      filename: "sample-seed.json",
      importType: "pipeline",
      rowsImported: pipelineDeals.length,
      rowsSkipped: 0,
      detectedColumns: ["sample"],
      importedAt: new Date().toISOString(),
      notes: "Bundled sample data shown because no local CSVs were found.",
    },
  ];

  fundedDeals.forEach((deal) => {
    if (!deal.commissionAmount) {
      deal.commissionAmount = deal.fundedAmount * deal.commissionPercent;
    }
    if (!deal.factorRate) {
      deal.factorRate = grossPaybackFromDeal(deal) / deal.fundedAmount;
    }
  });

  return {
    fundedDeals,
    pipelineDeals,
    followUps,
    importBatches,
    sourceMode: "sample",
  };
}
