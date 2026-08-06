export type PaymentFrequency = "daily" | "weekly" | "monthly";
export type TermUnit = "days" | "weeks" | "months";
export type CommissionStatus = "pending" | "paid-out" | "clawback";
export type FundedTag = "clawback" | "paid-epa" | "paid-in-full" | "active" | "commission" | "potential-renewal";
/**
 * mca: the default deal shape (factorRate/termValue/termUnit/paymentFrequency).
 * heloc: uses aprPercent + termYears instead; a simple amortized monthly payment.
 * renewal / addon: still MCA-shaped economics, but can link to an original MCA deal via
 * relatedDealId so a client's deal history (renewals, stacked positions) is traceable.
 */
export type FundedDealType = "mca" | "heloc" | "renewal" | "addon";
/** Only the standard HELOC term lengths are offered in the UI. */
export const HELOC_TERM_YEARS = [10, 15, 20, 30] as const;
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
  paymentWeekday?: number;
  firstPaymentDate?: string;
  scheduleCompletedAt?: string;
  /**
   * Live snapshot of the persisted payment schedule, aggregated by the workspace loader so the
   * funded board can show *actual* repayment progress (driven by cron-posted payments) instead of a
   * time-based estimate. Undefined when the deal has no generated schedule yet -- progress then
   * falls back to the elapsed-time estimate. See progressForFundedDeal in calculations.ts.
   */
  scheduledPaymentsCount?: number;
  postedPaymentsCount?: number;
  postedAmount?: number;
  /** Due date of the last persisted schedule entry -- the deal's real maturity date, when a schedule exists. */
  scheduleEndDate?: string;
  dealType: FundedDealType;
  /** HELOC only. */
  aprPercent?: number;
  /** HELOC only -- one of HELOC_TERM_YEARS. */
  termYears?: number;
  /** Renewal/Add-on only: the original MCA deal this one traces back to. */
  relatedDealId?: string;
  /** Flat-dollar Processing/Service Fee; payout = psfAmount * commissionPercent, for every deal type. */
  psfAmount: number;
  /** When the deal was dismissed from the dashboard's "Upcoming renewals" quick view (35%+ paid). */
  renewalAckAt?: string;
  balanceOverrideAmount?: number;
  balanceOverrideEffectiveDate?: string;
  balanceOverrideReason?: string;
  balanceOverrideSetByUserId?: string;
  balanceOverrideSetAt?: string;
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
  /** When the "Need New Statements" dashboard reminder was last acknowledged (monthly cadence). */
  statementsAckAt?: string;
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
  /** DB creation time, surfaced so the dashboard can show a follow-up ~1 month after it was added. */
  createdAt?: string;
  /** When this item was dismissed from the dashboard's "Upcoming follow-ups" quick view. */
  dashboardAckAt?: string;
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
