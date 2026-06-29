import { promises as fs } from "node:fs";
import path from "node:path";
import { grossPaybackFromDeal } from "./calculations";
import { parseCsvText } from "./csv";
import { createId, detectImportType, normalizeFollowUpRow, normalizeFundedRow, normalizeImportedRows, normalizePipelineRow } from "./normalization";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, SeedDataset } from "./types";

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

export { detectImportType, normalizeFollowUpRow, normalizeFundedRow, normalizeImportedRows, normalizePipelineRow };

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
