import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createBlankFollowUp, createBlankFundedDeal, createBlankPipelineDeal } from "./defaults";
import { createRealDataset, loadSeedDataset } from "./data";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, SeedDataset, TrashRecord, TrashRecordType, ViewerProfile } from "./types";

const TRASH_RETENTION_DAYS = 30;

function toIso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function viewerFromUser(user: User & { company: { name: string } }): ViewerProfile {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.role === "admin",
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.company.name,
    hideFinancialsByDefault: user.hideFinancialsByDefault,
  };
}

function serializeFundedDeal(record: Prisma.FundedDealGetPayload<object>): FundedDeal {
  return {
    id: record.id,
    businessName: record.businessName,
    contactName: record.contactName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    fundedDate: toIso(record.fundedDate),
    funder: record.funder ?? undefined,
    fundedAmount: record.fundedAmount,
    factorRate: record.factorRate,
    termValue: record.termValue,
    termUnit: record.termUnit as FundedDeal["termUnit"],
    paymentAmount: record.paymentAmount,
    paymentFrequency: record.paymentFrequency as FundedDeal["paymentFrequency"],
    syndicationPercent: record.syndicationPercent,
    pointsPercent: record.pointsPercent,
    housePointsPercent: record.housePointsPercent,
    commissionPercent: record.commissionPercent,
    commissionAmount: record.commissionAmount,
    commissionStatus: record.commissionStatus as FundedDeal["commissionStatus"],
    clawbackAmount: record.clawbackAmount,
    statusRaw: record.statusRaw,
    statusStage: record.statusStage as FundedDeal["statusStage"],
    fundedTags: record.fundedTags as FundedDeal["fundedTags"],
    notes: record.notes,
    sourceLabel: record.sourceLabel,
    manualBalanceRemaining: record.manualBalanceRemaining ?? undefined,
    manualRenewalDate: toIso(record.manualRenewalDate),
    deletedAt: toIso(record.deletedAt),
    paymentWeekday: record.paymentWeekday ?? undefined,
    firstPaymentDate: toIso(record.firstPaymentDate),
    scheduleCompletedAt: toIso(record.scheduleCompletedAt),
    balanceOverrideAmount: record.balanceOverrideCents != null ? record.balanceOverrideCents / 100 : undefined,
    balanceOverrideEffectiveDate: toIso(record.balanceOverrideEffectiveDate),
    balanceOverrideReason: record.balanceOverrideReason ?? undefined,
    balanceOverrideSetByUserId: record.balanceOverrideSetByUserId ?? undefined,
    balanceOverrideSetAt: toIso(record.balanceOverrideSetAt),
  };
}

function serializePipelineDeal(record: Prisma.PipelineDealGetPayload<object>): PipelineDeal {
  return {
    id: record.id,
    contactName: record.contactName,
    businessName: record.businessName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    city: record.city ?? undefined,
    state: record.state ?? undefined,
    submittedDate: toIso(record.submittedDate),
    requestLabel: record.requestLabel,
    requestedAmountMin: record.requestedAmountMin ?? undefined,
    requestedAmountMax: record.requestedAmountMax ?? undefined,
    statusRaw: record.statusRaw,
    stage: record.stage as PipelineDeal["stage"],
    notes: record.notes,
    sheetLabel: record.sheetLabel,
    nextFollowUpDate: toIso(record.nextFollowUpDate),
    sourceLabel: record.sourceLabel,
    deletedAt: toIso(record.deletedAt),
  };
}

function serializeFollowUp(record: Prisma.FollowUpItemGetPayload<object>): FollowUpItem {
  return {
    id: record.id,
    contactName: record.contactName,
    businessName: record.businessName,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    requestLabel: record.requestLabel,
    notes: record.notes,
    lastContactLabel: record.lastContactLabel,
    dueDate: toIso(record.dueDate),
    priority: record.priority as FollowUpItem["priority"],
    appSubmitted: record.appSubmitted,
    completed: record.completed,
    sheetLabel: record.sheetLabel,
    sourceLabel: record.sourceLabel,
    deletedAt: toIso(record.deletedAt),
  };
}

function serializeImportBatch(record: Prisma.ImportBatchGetPayload<object>): ImportBatch {
  return {
    id: record.id,
    filename: record.filename,
    importType: record.importType as ImportBatch["importType"],
    rowsImported: record.rowsImported,
    rowsSkipped: record.rowsSkipped,
    detectedColumns: record.detectedColumns,
    importedAt: record.importedAt.toISOString(),
    notes: record.notes ?? undefined,
  };
}

function companyScopedSeedId(companyId: string, id: string) {
  return `${companyId}:${id}`;
}

/**
 * Seed rows are deterministic per company. That gives imports a stable dedupe key so re-importing
 * the same sheet updates existing rows instead of creating doubles.
 */
function scopeSeedDataset(companyId: string, dataset: SeedDataset): SeedDataset {
  return {
    ...dataset,
    fundedDeals: dataset.fundedDeals.map((deal) => ({ ...deal, id: companyScopedSeedId(companyId, deal.id) })),
    pipelineDeals: dataset.pipelineDeals.map((deal) => ({ ...deal, id: companyScopedSeedId(companyId, deal.id) })),
    followUps: dataset.followUps.map((item) => ({ ...item, id: companyScopedSeedId(companyId, item.id) })),
    importBatches: dataset.importBatches.map((batch) => ({ ...batch, id: companyScopedSeedId(companyId, batch.id) })),
  };
}

async function persistSeedDataset(companyId: string, userId: string, dataset: SeedDataset) {
  const scoped = scopeSeedDataset(companyId, dataset);

  await prisma.$transaction([
    prisma.fundedDeal.deleteMany({ where: { companyId } }),
    prisma.pipelineDeal.deleteMany({ where: { companyId } }),
    prisma.followUpItem.deleteMany({ where: { companyId } }),
    prisma.importBatch.deleteMany({ where: { companyId } }),
  ]);

  if (scoped.fundedDeals.length) {
    await prisma.fundedDeal.createMany({
      data: scoped.fundedDeals.map((deal) => ({
        id: deal.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        businessName: deal.businessName,
        contactName: deal.contactName,
        phone: deal.phone,
        email: deal.email,
        fundedDate: deal.fundedDate ? new Date(deal.fundedDate) : null,
        funder: deal.funder,
        fundedAmount: deal.fundedAmount,
        factorRate: deal.factorRate,
        termValue: deal.termValue,
        termUnit: deal.termUnit,
        paymentAmount: deal.paymentAmount,
        paymentFrequency: deal.paymentFrequency,
        syndicationPercent: deal.syndicationPercent,
        pointsPercent: deal.pointsPercent,
        housePointsPercent: deal.housePointsPercent,
        commissionPercent: deal.commissionPercent,
        commissionAmount: deal.commissionAmount,
        commissionStatus: deal.commissionStatus,
        clawbackAmount: deal.clawbackAmount,
        statusRaw: deal.statusRaw,
        statusStage: deal.statusStage,
        fundedTags: deal.fundedTags,
        notes: deal.notes,
        sourceLabel: deal.sourceLabel,
        manualBalanceRemaining: deal.manualBalanceRemaining ?? null,
        manualRenewalDate: deal.manualRenewalDate ? new Date(deal.manualRenewalDate) : null,
      })),
    });
  }

  if (scoped.pipelineDeals.length) {
    await prisma.pipelineDeal.createMany({
      data: scoped.pipelineDeals.map((deal) => ({
        id: deal.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        contactName: deal.contactName,
        businessName: deal.businessName,
        phone: deal.phone,
        email: deal.email,
        city: deal.city,
        state: deal.state,
        submittedDate: deal.submittedDate ? new Date(deal.submittedDate) : null,
        requestLabel: deal.requestLabel,
        requestedAmountMin: deal.requestedAmountMin ?? null,
        requestedAmountMax: deal.requestedAmountMax ?? null,
        statusRaw: deal.statusRaw,
        stage: deal.stage,
        notes: deal.notes,
        sheetLabel: deal.sheetLabel,
        nextFollowUpDate: deal.nextFollowUpDate ? new Date(deal.nextFollowUpDate) : null,
        sourceLabel: deal.sourceLabel,
      })),
    });
  }

  if (scoped.followUps.length) {
    await prisma.followUpItem.createMany({
      data: scoped.followUps.map((item) => ({
        id: item.id,
        companyId,
        createdByUserId: userId,
        updatedByUserId: userId,
        contactName: item.contactName,
        businessName: item.businessName,
        phone: item.phone,
        email: item.email,
        requestLabel: item.requestLabel,
        notes: item.notes,
        lastContactLabel: item.lastContactLabel,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        priority: item.priority,
        appSubmitted: item.appSubmitted,
        completed: item.completed,
        sheetLabel: item.sheetLabel,
        sourceLabel: item.sourceLabel,
      })),
    });
  }

  if (scoped.importBatches.length) {
    await prisma.importBatch.createMany({
      data: scoped.importBatches.map((batch) => ({
        id: batch.id,
        companyId,
        createdByUserId: userId,
        filename: batch.filename,
        importType: batch.importType,
        rowsImported: batch.rowsImported,
        rowsSkipped: batch.rowsSkipped,
        detectedColumns: batch.detectedColumns,
        importedAt: new Date(batch.importedAt),
        notes: batch.notes,
      })),
    });
  }
}

export async function seedFirstCompanyWorkspace(companyId: string, userId: string) {
  const seed = await loadSeedDataset().catch(() => createRealDataset());
  await persistSeedDataset(companyId, userId, seed);
}

export async function resetWorkspaceToSeed(companyId: string, userId: string) {
  await seedFirstCompanyWorkspace(companyId, userId);
  return loadWorkspace(companyId);
}

export async function loadWorkspace(companyId: string): Promise<SeedDataset> {
  const [fundedDeals, pipelineDeals, followUps, importBatches] = await Promise.all([
    prisma.fundedDeal.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ fundedDate: "desc" }, { createdAt: "desc" }] }),
    prisma.pipelineDeal.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ submittedDate: "desc" }, { createdAt: "desc" }] }),
    prisma.followUpItem.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ completed: "asc" }, { updatedAt: "desc" }] }),
    prisma.importBatch.findMany({ where: { companyId }, orderBy: { importedAt: "desc" } }),
  ]);

  return {
    fundedDeals: fundedDeals.map(serializeFundedDeal),
    pipelineDeals: pipelineDeals.map(serializePipelineDeal),
    followUps: followUps.map(serializeFollowUp),
    importBatches: importBatches.map(serializeImportBatch),
    sourceMode: "database",
  };
}

export async function loadWorkspaceForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
  if (!user) {
    throw new Error("User not found.");
  }
  return {
    viewer: viewerFromUser(user),
    data: await loadWorkspace(user.companyId),
  };
}

function fundedUpdateData(patch: Partial<FundedDeal>, userId: string): Prisma.FundedDealUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.fundedDate !== undefined ? { fundedDate: patch.fundedDate ? new Date(patch.fundedDate) : null } : {}),
    ...(patch.funder !== undefined ? { funder: patch.funder || null } : {}),
    ...(patch.fundedAmount !== undefined ? { fundedAmount: patch.fundedAmount } : {}),
    ...(patch.factorRate !== undefined ? { factorRate: patch.factorRate } : {}),
    ...(patch.termValue !== undefined ? { termValue: patch.termValue } : {}),
    ...(patch.termUnit !== undefined ? { termUnit: patch.termUnit } : {}),
    ...(patch.paymentAmount !== undefined ? { paymentAmount: patch.paymentAmount } : {}),
    ...(patch.paymentFrequency !== undefined ? { paymentFrequency: patch.paymentFrequency } : {}),
    ...(patch.syndicationPercent !== undefined ? { syndicationPercent: patch.syndicationPercent } : {}),
    ...(patch.pointsPercent !== undefined ? { pointsPercent: patch.pointsPercent } : {}),
    ...(patch.housePointsPercent !== undefined ? { housePointsPercent: patch.housePointsPercent } : {}),
    ...(patch.commissionPercent !== undefined ? { commissionPercent: patch.commissionPercent } : {}),
    ...(patch.commissionAmount !== undefined ? { commissionAmount: patch.commissionAmount } : {}),
    ...(patch.commissionStatus !== undefined ? { commissionStatus: patch.commissionStatus } : {}),
    ...(patch.clawbackAmount !== undefined ? { clawbackAmount: patch.clawbackAmount } : {}),
    ...(patch.statusRaw !== undefined ? { statusRaw: patch.statusRaw } : {}),
    ...(patch.statusStage !== undefined ? { statusStage: patch.statusStage } : {}),
    ...(patch.fundedTags !== undefined ? { fundedTags: patch.fundedTags } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
    ...(patch.manualBalanceRemaining !== undefined ? { manualBalanceRemaining: patch.manualBalanceRemaining ?? null } : {}),
    ...(patch.manualRenewalDate !== undefined ? { manualRenewalDate: patch.manualRenewalDate ? new Date(patch.manualRenewalDate) : null } : {}),
    ...(patch.paymentWeekday !== undefined ? { paymentWeekday: patch.paymentWeekday ?? null } : {}),
    ...(patch.firstPaymentDate !== undefined ? { firstPaymentDate: patch.firstPaymentDate ? new Date(patch.firstPaymentDate) : null } : {}),
    // balanceOverride* fields are intentionally excluded here: they may only be written through
    // setBalanceOverride/resetBalanceOverride (schedule-service.ts), which enforce an effective
    // date, a reason, and an audit-trail entry. A generic field patch must never bypass that.
  };
}

function pipelineUpdateData(patch: Partial<PipelineDeal>, userId: string): Prisma.PipelineDealUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.city !== undefined ? { city: patch.city || null } : {}),
    ...(patch.state !== undefined ? { state: patch.state || null } : {}),
    ...(patch.submittedDate !== undefined ? { submittedDate: patch.submittedDate ? new Date(patch.submittedDate) : null } : {}),
    ...(patch.requestLabel !== undefined ? { requestLabel: patch.requestLabel } : {}),
    ...(patch.requestedAmountMin !== undefined ? { requestedAmountMin: patch.requestedAmountMin ?? null } : {}),
    ...(patch.requestedAmountMax !== undefined ? { requestedAmountMax: patch.requestedAmountMax ?? null } : {}),
    ...(patch.statusRaw !== undefined ? { statusRaw: patch.statusRaw } : {}),
    ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.sheetLabel !== undefined ? { sheetLabel: patch.sheetLabel } : {}),
    ...(patch.nextFollowUpDate !== undefined ? { nextFollowUpDate: patch.nextFollowUpDate ? new Date(patch.nextFollowUpDate) : null } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
  };
}

function followUpUpdateData(patch: Partial<FollowUpItem>, userId: string): Prisma.FollowUpItemUpdateInput {
  return {
    updatedByUser: { connect: { id: userId } },
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
    ...(patch.email !== undefined ? { email: patch.email || null } : {}),
    ...(patch.requestLabel !== undefined ? { requestLabel: patch.requestLabel } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.lastContactLabel !== undefined ? { lastContactLabel: patch.lastContactLabel } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.appSubmitted !== undefined ? { appSubmitted: patch.appSubmitted } : {}),
    ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
    ...(patch.sheetLabel !== undefined ? { sheetLabel: patch.sheetLabel } : {}),
    ...(patch.sourceLabel !== undefined ? { sourceLabel: patch.sourceLabel } : {}),
  };
}

export async function requireOwnedFundedDeal(companyId: string, id: string) {
  const record = await prisma.fundedDeal.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Funded deal not found for this company.");
}

async function requireOwnedPipelineDeal(companyId: string, id: string) {
  const record = await prisma.pipelineDeal.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Pipeline deal not found for this company.");
}

async function requireOwnedFollowUp(companyId: string, id: string) {
  const record = await prisma.followUpItem.findFirst({ where: { id, companyId } });
  if (!record) throw new Error("Follow-up item not found for this company.");
}

export async function createFundedDeal(companyId: string, userId: string, fundedDate?: string) {
  const draft = createBlankFundedDeal(fundedDate || new Date().toISOString());
  const created = await prisma.fundedDeal.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      businessName: draft.businessName,
      contactName: draft.contactName,
      phone: draft.phone,
      email: draft.email,
      fundedDate: draft.fundedDate ? new Date(draft.fundedDate) : null,
      funder: draft.funder,
      fundedAmount: draft.fundedAmount,
      factorRate: draft.factorRate,
      termValue: draft.termValue,
      termUnit: draft.termUnit,
      paymentAmount: draft.paymentAmount,
      paymentFrequency: draft.paymentFrequency,
      syndicationPercent: draft.syndicationPercent,
      pointsPercent: draft.pointsPercent,
      housePointsPercent: draft.housePointsPercent,
      commissionPercent: draft.commissionPercent,
      commissionAmount: draft.commissionAmount,
      commissionStatus: draft.commissionStatus,
      clawbackAmount: draft.clawbackAmount,
      statusRaw: draft.statusRaw,
      statusStage: draft.statusStage,
      fundedTags: draft.fundedTags,
      notes: draft.notes,
      sourceLabel: draft.sourceLabel,
    },
  });
  return serializeFundedDeal(created);
}

export async function updateFundedDeal(companyId: string, userId: string, id: string, patch: Partial<FundedDeal>) {
  await requireOwnedFundedDeal(companyId, id);
  const updated = await prisma.fundedDeal.update({ where: { id }, data: fundedUpdateData(patch, userId) });
  return serializeFundedDeal(updated);
}

export async function deleteFundedDeal(companyId: string, id: string) {
  await requireOwnedFundedDeal(companyId, id);
  await prisma.fundedDeal.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function createPipelineDeal(companyId: string, userId: string, submittedDate?: string) {
  const draft = createBlankPipelineDeal(submittedDate);
  const created = await prisma.pipelineDeal.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      contactName: draft.contactName,
      businessName: draft.businessName,
      submittedDate: draft.submittedDate ? new Date(draft.submittedDate) : null,
      requestLabel: draft.requestLabel,
      statusRaw: draft.statusRaw,
      stage: draft.stage,
      notes: draft.notes,
      sheetLabel: draft.sheetLabel,
      sourceLabel: draft.sourceLabel,
    },
  });
  return serializePipelineDeal(created);
}

export async function updatePipelineDeal(companyId: string, userId: string, id: string, patch: Partial<PipelineDeal>) {
  await requireOwnedPipelineDeal(companyId, id);
  const updated = await prisma.pipelineDeal.update({ where: { id }, data: pipelineUpdateData(patch, userId) });
  return serializePipelineDeal(updated);
}

export async function deletePipelineDeal(companyId: string, id: string) {
  await requireOwnedPipelineDeal(companyId, id);
  await prisma.pipelineDeal.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function createFollowUp(companyId: string, userId: string) {
  const draft = createBlankFollowUp();
  const created = await prisma.followUpItem.create({
    data: {
      companyId,
      createdByUserId: userId,
      updatedByUserId: userId,
      contactName: draft.contactName,
      businessName: draft.businessName,
      requestLabel: draft.requestLabel,
      notes: draft.notes,
      lastContactLabel: draft.lastContactLabel,
      priority: draft.priority,
      appSubmitted: draft.appSubmitted,
      completed: draft.completed,
      sheetLabel: draft.sheetLabel,
      sourceLabel: draft.sourceLabel,
    },
  });
  return serializeFollowUp(created);
}

export async function updateFollowUp(companyId: string, userId: string, id: string, patch: Partial<FollowUpItem>) {
  await requireOwnedFollowUp(companyId, id);
  const updated = await prisma.followUpItem.update({ where: { id }, data: followUpUpdateData(patch, userId) });
  return serializeFollowUp(updated);
}

export async function deleteFollowUp(companyId: string, id: string) {
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.update({ where: { id }, data: { deletedAt: new Date() } });
}

function daysRemainingFromDeletedAt(deletedAt: Date) {
  const expiresAt = new Date(deletedAt);
  expiresAt.setDate(expiresAt.getDate() + TRASH_RETENTION_DAYS);
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function trashCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);
  return cutoff;
}

function trashRecord(type: TrashRecordType, record: { id: string; deletedAt: Date | null }, label: string, detail: string): TrashRecord | null {
  if (!record.deletedAt) return null;
  const daysRemaining = daysRemainingFromDeletedAt(record.deletedAt);
  if (daysRemaining <= 0) return null;
  return {
    id: record.id,
    type,
    label,
    detail,
    deletedAt: record.deletedAt.toISOString(),
    daysRemaining,
  };
}

export async function loadTrash(companyId: string): Promise<TrashRecord[]> {
  const cutoff = trashCutoffDate();
  const [fundedDeals, pipelineDeals, followUps] = await Promise.all([
    prisma.fundedDeal.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
    prisma.pipelineDeal.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
    prisma.followUpItem.findMany({ where: { companyId, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
  ]);

  return [
    ...fundedDeals.map((record) => trashRecord("funded", record, record.businessName, `${record.contactName} - ${record.funder || "No funder"}`)),
    ...pipelineDeals.map((record) => trashRecord("pipeline", record, record.businessName, `${record.contactName} - ${record.stage}`)),
    ...followUps.map((record) => trashRecord("follow-up", record, record.businessName, `${record.contactName} - ${record.priority}`)),
  ]
    .filter((record): record is TrashRecord => Boolean(record))
    .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

export async function restoreTrashRecord(companyId: string, type: TrashRecordType, id: string) {
  if (type === "funded") {
    await requireOwnedFundedDeal(companyId, id);
    await prisma.fundedDeal.update({ where: { id }, data: { deletedAt: null } });
    return;
  }
  if (type === "pipeline") {
    await requireOwnedPipelineDeal(companyId, id);
    await prisma.pipelineDeal.update({ where: { id }, data: { deletedAt: null } });
    return;
  }
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.update({ where: { id }, data: { deletedAt: null } });
}

export async function permanentlyDeleteTrashRecord(companyId: string, type: TrashRecordType, id: string) {
  if (type === "funded") {
    await requireOwnedFundedDeal(companyId, id);
    await prisma.fundedDeal.delete({ where: { id } });
    return;
  }
  if (type === "pipeline") {
    await requireOwnedPipelineDeal(companyId, id);
    await prisma.pipelineDeal.delete({ where: { id } });
    return;
  }
  await requireOwnedFollowUp(companyId, id);
  await prisma.followUpItem.delete({ where: { id } });
}

/**
 * Imports reuse the normalized row IDs from the browser parser, but they get company-scoped before
 * saving. That is the key dedupe rule: same company plus same source row id means update, not insert.
 */
export async function importWorkspaceData(
  companyId: string,
  userId: string,
  payload: { fundedDeals: FundedDeal[]; pipelineDeals: PipelineDeal[]; followUps: FollowUpItem[]; batch: ImportBatch },
) {
  await prisma.$transaction(async (tx) => {
    for (const deal of payload.fundedDeals) {
      const scopedId = companyScopedSeedId(companyId, deal.id);
      await tx.fundedDeal.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          businessName: deal.businessName,
          contactName: deal.contactName,
          phone: deal.phone,
          email: deal.email,
          fundedDate: deal.fundedDate ? new Date(deal.fundedDate) : null,
          funder: deal.funder,
          fundedAmount: deal.fundedAmount,
          factorRate: deal.factorRate,
          termValue: deal.termValue,
          termUnit: deal.termUnit,
          paymentAmount: deal.paymentAmount,
          paymentFrequency: deal.paymentFrequency,
          syndicationPercent: deal.syndicationPercent,
          pointsPercent: deal.pointsPercent,
          housePointsPercent: deal.housePointsPercent,
          commissionPercent: deal.commissionPercent,
          commissionAmount: deal.commissionAmount,
          commissionStatus: deal.commissionStatus,
          clawbackAmount: deal.clawbackAmount,
          statusRaw: deal.statusRaw,
          statusStage: deal.statusStage,
          fundedTags: deal.fundedTags,
          notes: deal.notes,
          sourceLabel: deal.sourceLabel,
          manualBalanceRemaining: deal.manualBalanceRemaining ?? null,
          manualRenewalDate: deal.manualRenewalDate ? new Date(deal.manualRenewalDate) : null,
        },
        update: fundedUpdateData({ ...deal, sourceLabel: deal.sourceLabel }, userId),
      });
    }

    for (const deal of payload.pipelineDeals) {
      const scopedId = companyScopedSeedId(companyId, deal.id);
      await tx.pipelineDeal.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          contactName: deal.contactName,
          businessName: deal.businessName,
          phone: deal.phone,
          email: deal.email,
          city: deal.city,
          state: deal.state,
          submittedDate: deal.submittedDate ? new Date(deal.submittedDate) : null,
          requestLabel: deal.requestLabel,
          requestedAmountMin: deal.requestedAmountMin ?? null,
          requestedAmountMax: deal.requestedAmountMax ?? null,
          statusRaw: deal.statusRaw,
          stage: deal.stage,
          notes: deal.notes,
          sheetLabel: deal.sheetLabel,
          nextFollowUpDate: deal.nextFollowUpDate ? new Date(deal.nextFollowUpDate) : null,
          sourceLabel: deal.sourceLabel,
        },
        update: pipelineUpdateData({ ...deal, sourceLabel: deal.sourceLabel }, userId),
      });
    }

    for (const item of payload.followUps) {
      const scopedId = companyScopedSeedId(companyId, item.id);
      await tx.followUpItem.upsert({
        where: { id: scopedId },
        create: {
          id: scopedId,
          companyId,
          createdByUserId: userId,
          updatedByUserId: userId,
          contactName: item.contactName,
          businessName: item.businessName,
          phone: item.phone,
          email: item.email,
          requestLabel: item.requestLabel,
          notes: item.notes,
          lastContactLabel: item.lastContactLabel,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          priority: item.priority,
          appSubmitted: item.appSubmitted,
          completed: item.completed,
          sheetLabel: item.sheetLabel,
          sourceLabel: item.sourceLabel,
        },
        update: followUpUpdateData({ ...item, sourceLabel: item.sourceLabel }, userId),
      });
    }

    await tx.importBatch.create({
      data: {
        id: companyScopedSeedId(companyId, payload.batch.id),
        companyId,
        createdByUserId: userId,
        filename: payload.batch.filename,
        importType: payload.batch.importType,
        rowsImported: payload.batch.rowsImported,
        rowsSkipped: payload.batch.rowsSkipped,
        detectedColumns: payload.batch.detectedColumns,
        importedAt: new Date(payload.batch.importedAt),
        notes: payload.batch.notes,
      },
    });
  });

  return loadWorkspace(companyId);
}

export async function updateViewerPreferences(userId: string, patch: { hideFinancialsByDefault?: boolean }) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.hideFinancialsByDefault !== undefined ? { hideFinancialsByDefault: patch.hideFinancialsByDefault } : {}),
    },
    include: { company: true },
  });
  return viewerFromUser(updated);
}
