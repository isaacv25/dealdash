export type PaymentFrequency = "daily" | "weekly" | "monthly";
export type TermUnit = "days" | "weeks" | "months";
export type CommissionStatus = "pending" | "paid-out" | "clawback";
export type FundedTag = "clawback" | "paid-epa" | "paid-in-full" | "active" | "commission" | "potential-renewal";
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
  housePointsPercent: number;
  commissionPercent: number;
  commissionAmount: number;
  commissionStatus: CommissionStatus;
  clawbackAmount: number;
  statusRaw: string;
  statusStage: "active" | "paid-out" | "clawback" | "slow-pay" | "watch";
  fundedTags: FundedTag[];
  notes: string;
  sourceLabel: string;
  manualBalanceRemaining?: number;
  manualRenewalDate?: string;
  deletedAt?: string;
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
  deletedAt?: string;
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
  deletedAt?: string;
}

export type TrashRecordType = "funded" | "pipeline" | "follow-up";

export interface TrashRecord {
  id: string;
  type: TrashRecordType;
  label: string;
  detail: string;
  deletedAt: string;
  daysRemaining: number;
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
  sourceMode: "csv" | "sample" | "database";
}

export interface ViewerProfile {
  userId: string;
  username: string;
  role: string;
  isAdmin: boolean;
  firstName: string;
  lastName: string;
  companyName: string;
  hideFinancialsByDefault: boolean;
}
