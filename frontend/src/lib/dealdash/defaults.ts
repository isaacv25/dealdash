import type { FollowUpItem, FundedDeal, PipelineDeal } from "./types";

export function createBlankFundedDeal(fundedDate = new Date().toISOString()): FundedDeal {
  return {
    id: "",
    businessName: "New funded deal",
    contactName: "Brokered contact",
    fundedDate,
    fundedAmount: 0,
    factorRate: 1.35,
    termValue: 24,
    termUnit: "weeks",
    paymentAmount: 0,
    paymentFrequency: "weekly",
    syndicationPercent: 0,
    pointsPercent: 0,
    housePointsPercent: 0,
    commissionPercent: 0.3,
    commissionAmount: 0,
    commissionStatus: "pending",
    clawbackAmount: 0,
    statusRaw: "Active",
    statusStage: "active",
    fundedTags: ["active"],
    notes: "",
    sourceLabel: "manual",
  };
}

export function createBlankPipelineDeal(submittedDate?: string): PipelineDeal {
  return {
    id: "",
    contactName: "New lead",
    businessName: "Untitled business",
    submittedDate,
    requestLabel: "",
    statusRaw: "New Lead",
    stage: "new-lead",
    notes: "",
    sheetLabel: "",
    sourceLabel: "manual",
  };
}

export function createBlankFollowUp(): FollowUpItem {
  return {
    id: "",
    contactName: "Follow-up lead",
    businessName: "Untitled business",
    requestLabel: "",
    notes: "",
    lastContactLabel: "",
    priority: "medium",
    appSubmitted: false,
    completed: false,
    sheetLabel: "",
    sourceLabel: "manual",
  };
}
