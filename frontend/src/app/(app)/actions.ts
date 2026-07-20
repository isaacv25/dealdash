"use server";

import { getCurrentUser, requireAuth } from "@/lib/auth";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal } from "@/lib/dealdash";
import {
  createFollowUp,
  createFundedDeal,
  createPipelineDeal,
  deleteFollowUp,
  deleteFundedDeal,
  deletePipelineDeal,
  importWorkspaceData,
  loadWorkspaceForUser,
  permanentlyDeleteTrashRecord,
  requireOwnedFundedDeal,
  resetWorkspaceToSeed,
  restoreTrashRecord,
  updateFollowUp,
  updateFundedDeal,
  updatePipelineDeal,
  updateViewerPreferences,
} from "@/lib/dealdash/workspace";
import type { TrashRecordType } from "@/lib/dealdash/types";
import {
  applyLoweredPaymentAdjustment,
  applyPauseAdjustment,
  generateInitialSchedule,
  getAuditHistoryForDeal,
  getCalculatedBalance,
  getScheduleForDeal,
  recastDealSchedule,
  resetBalanceOverride,
  setBalanceOverride,
} from "@/lib/dealdash/schedule-service";

async function getScopedUser() {
  await requireAuth();
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated user.");
  return user;
}

export async function loadWorkspaceAction() {
  const user = await getScopedUser();
  return loadWorkspaceForUser(user.id);
}

export async function createFundedDealAction(fundedDate?: string) {
  const user = await getScopedUser();
  return createFundedDeal(user.companyId, user.id, fundedDate);
}

export async function updateFundedDealAction(id: string, patch: Partial<FundedDeal>) {
  const user = await getScopedUser();
  return updateFundedDeal(user.companyId, user.id, id, patch);
}

export async function deleteFundedDealAction(id: string) {
  const user = await getScopedUser();
  await deleteFundedDeal(user.companyId, id);
}

export async function createPipelineDealAction(submittedDate?: string) {
  const user = await getScopedUser();
  return createPipelineDeal(user.companyId, user.id, submittedDate);
}

export async function updatePipelineDealAction(id: string, patch: Partial<PipelineDeal>) {
  const user = await getScopedUser();
  return updatePipelineDeal(user.companyId, user.id, id, patch);
}

export async function deletePipelineDealAction(id: string) {
  const user = await getScopedUser();
  await deletePipelineDeal(user.companyId, id);
}

export async function createFollowUpAction() {
  const user = await getScopedUser();
  return createFollowUp(user.companyId, user.id);
}

export async function updateFollowUpAction(id: string, patch: Partial<FollowUpItem>) {
  const user = await getScopedUser();
  return updateFollowUp(user.companyId, user.id, id, patch);
}

export async function deleteFollowUpAction(id: string) {
  const user = await getScopedUser();
  await deleteFollowUp(user.companyId, id);
}

export async function importWorkspaceDataAction(payload: { fundedDeals: FundedDeal[]; pipelineDeals: PipelineDeal[]; followUps: FollowUpItem[]; batch: ImportBatch }) {
  const user = await getScopedUser();
  return importWorkspaceData(user.companyId, user.id, payload);
}

export async function resetWorkspaceAction() {
  const user = await getScopedUser();
  return resetWorkspaceToSeed(user.companyId, user.id);
}

export async function updateFinancialVisibilityAction(hideFinancialsByDefault: boolean) {
  const user = await getScopedUser();
  return updateViewerPreferences(user.id, { hideFinancialsByDefault });
}

export async function restoreTrashRecordAction(type: TrashRecordType, id: string) {
  const user = await getScopedUser();
  await restoreTrashRecord(user.companyId, type, id);
}

export async function permanentlyDeleteTrashRecordAction(type: TrashRecordType, id: string) {
  const user = await getScopedUser();
  await permanentlyDeleteTrashRecord(user.companyId, type, id);
}

// --- Funded-deal payment schedule, adjustments, and balance override ---
// Every one of these first re-verifies the deal belongs to the caller's company (the same tenant
// boundary every other funded-deal action enforces) before touching schedule/adjustment/audit rows.

export async function getDealScheduleAction(dealId: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return getScheduleForDeal(dealId);
}

export async function getDealAuditHistoryAction(dealId: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return getAuditHistoryForDeal(dealId);
}

export async function getDealCalculatedBalanceAction(dealId: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return getCalculatedBalance(dealId);
}

export async function generateDealScheduleAction(dealId: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return generateInitialSchedule(dealId, { userId: user.id, reason: "Initial schedule generated" });
}

export async function recastDealScheduleAction(dealId: string, effectiveDateIso: string, weekday: number | null, reason: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return recastDealSchedule(dealId, {
    effectiveDate: new Date(effectiveDateIso),
    weekday,
    userId: user.id,
    reason: reason || "Deal terms changed",
  });
}

export async function applyLoweredPaymentAction(
  dealId: string,
  input: { newAmount: number; effectiveDateIso: string; endDateIso: string | null; reason: string },
) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return applyLoweredPaymentAdjustment(dealId, {
    newAmount: input.newAmount,
    effectiveDate: new Date(input.effectiveDateIso),
    endDate: input.endDateIso ? new Date(input.endDateIso) : null,
    reason: input.reason,
    userId: user.id,
  });
}

export async function applyPaymentPauseAction(
  dealId: string,
  input: { pauseStartIso: string; resumeDateIso: string | null; reason: string },
) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return applyPauseAdjustment(dealId, {
    pauseStart: new Date(input.pauseStartIso),
    resumeDate: input.resumeDateIso ? new Date(input.resumeDateIso) : null,
    reason: input.reason,
    userId: user.id,
  });
}

export async function setBalanceOverrideAction(dealId: string, input: { overrideAmount: number; effectiveDateIso: string; reason: string }) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return setBalanceOverride(dealId, {
    overrideAmount: input.overrideAmount,
    effectiveDate: new Date(input.effectiveDateIso),
    reason: input.reason,
    userId: user.id,
  });
}

export async function resetBalanceOverrideAction(dealId: string) {
  const user = await getScopedUser();
  await requireOwnedFundedDeal(user.companyId, dealId);
  return resetBalanceOverride(dealId, { userId: user.id, reason: "Reset to calculated balance" });
}
