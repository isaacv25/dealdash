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
  resetWorkspaceToSeed,
  updateFollowUp,
  updateFundedDeal,
  updatePipelineDeal,
  updateViewerPreferences,
} from "@/lib/dealdash/workspace";

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

export async function createFundedDealAction() {
  const user = await getScopedUser();
  return createFundedDeal(user.companyId, user.id);
}

export async function updateFundedDealAction(id: string, patch: Partial<FundedDeal>) {
  const user = await getScopedUser();
  return updateFundedDeal(user.companyId, user.id, id, patch);
}

export async function deleteFundedDealAction(id: string) {
  const user = await getScopedUser();
  await deleteFundedDeal(user.companyId, id);
}

export async function createPipelineDealAction() {
  const user = await getScopedUser();
  return createPipelineDeal(user.companyId, user.id);
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
