export type PaymentFrequency = "daily" | "weekly" | "monthly";
export type TermUnit = "days" | "weeks" | "months";
export type PipelineStage =
  | "new-lead"
  | "submitted"
  | "in-review"
  | "approved"
  | "contract-out"
  | "funded"
  | "declined"
  | "dead"
  | "renewal";

export interface FundedDeal {
  id: string;
  businessName: string;
  contactName: string;
  phone?: string;
  email?: string;
  fundedDate?: string;
  funder?: string;
  fundedAmount: number;
  factorRate: number;
  termValue: number;
  termUnit: TermUnit;
  paymentAmount: number;
  paymentFrequency: PaymentFrequency;
  syndicationPercent: number;
  pointsPercent: number;
  commissionPercent: number;
  commissionAmount: number;
  clawbackAmount: number;
  statusRaw: string;
  statusStage: "active" | "paid-out" | "clawback" | "slow-pay" | "watch";
  notes: string;
  sourceLabel: string;
  manualBalanceRemaining?: number;
  manualRenewalDate?: string;
}

export interface PipelineDeal {
  id: string;
  contactName: string;
  businessName: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  submittedDate?: string;
  requestLabel: string;
  requestedAmountMin?: number;
  requestedAmountMax?: number;
  statusRaw: string;
  stage: PipelineStage;
  notes: string;
  sheetLabel: string;
  nextFollowUpDate?: string;
  sourceLabel: string;
}

export interface FollowUpItem {
  id: string;
  contactName: string;
  businessName: string;
  phone?: string;
  email?: string;
  requestLabel: string;
  notes: string;
  lastContactLabel: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  appSubmitted: boolean;
  completed: boolean;
  sheetLabel: string;
  sourceLabel: string;
}

export interface ImportBatch {
  id: string;
  filename: string;
  importType: "funded" | "pipeline" | "follow-up";
  rowsImported: number;
  rowsSkipped: number;
  detectedColumns: string[];
  importedAt: string;
  notes?: string;
}

export interface SeedDataset {
  fundedDeals: FundedDeal[];
  pipelineDeals: PipelineDeal[];
  followUps: FollowUpItem[];
  importBatches: ImportBatch[];
  sourceMode: "csv" | "sample";
}
