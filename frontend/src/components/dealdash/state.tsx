"use client";

import { createContext, startTransition, useContext, useRef, useState } from "react";
import {
  createFollowUpAction,
  createFundedDealAction,
  createPipelineDealAction,
  deleteFollowUpAction,
  deleteFundedDealAction,
  deletePipelineDealAction,
  importWorkspaceDataAction,
  resetWorkspaceAction,
  updateFinancialVisibilityAction,
  updateFollowUpAction,
  updateFundedDealAction,
  updatePipelineDealAction,
} from "@/app/(app)/actions";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, SeedDataset, ViewerProfile } from "@/lib/dealdash";

interface DealdashContextValue {
  data: SeedDataset;
  viewer: ViewerProfile;
  showFinancials: boolean;
  toggleFinancials: () => void;
  addFundedDeal: (fundedDate?: string) => void;
  updateFundedDeal: (id: string, patch: Partial<FundedDeal>) => void;
  deleteFundedDeal: (id: string) => void;
  addPipelineDeal: (submittedDate?: string) => void;
  updatePipelineDeal: (id: string, patch: Partial<PipelineDeal>) => void;
  deletePipelineDeal: (id: string) => void;
  addFollowUp: () => void;
  updateFollowUp: (id: string, patch: Partial<FollowUpItem>) => void;
  deleteFollowUp: (id: string) => void;
  importData: (payload: { fundedDeals: FundedDeal[]; pipelineDeals: PipelineDeal[]; followUps: FollowUpItem[]; batch: ImportBatch }) => void;
  resetToSeed: () => void;
}

const DealdashContext = createContext<DealdashContextValue | null>(null);

function logPersistFailure(scope: string, error: unknown) {
  console.error(`DealDash failed to persist ${scope}`, error);
}

type PatchBuffers = {
  funded: Record<string, Partial<FundedDeal>>;
  pipeline: Record<string, Partial<PipelineDeal>>;
  followUp: Record<string, Partial<FollowUpItem>>;
};

type PatchTimers = {
  funded: Record<string, ReturnType<typeof setTimeout>>;
  pipeline: Record<string, ReturnType<typeof setTimeout>>;
  followUp: Record<string, ReturnType<typeof setTimeout>>;
};

export function DealdashProvider({ initialData, viewer, children }: Readonly<{ initialData: SeedDataset; viewer: ViewerProfile; children: React.ReactNode }>) {
  const [data, setData] = useState<SeedDataset>(initialData);
  const [viewerState, setViewerState] = useState<ViewerProfile>(viewer);
  const [showFinancials, setShowFinancials] = useState<boolean>(() => !viewer.hideFinancialsByDefault);
  const patchBuffers = useRef<PatchBuffers>({ funded: {}, pipeline: {}, followUp: {} });
  const patchTimers = useRef<PatchTimers>({ funded: {}, pipeline: {}, followUp: {} });

  function queuePatch<K extends keyof PatchBuffers>(
    kind: K,
    id: string,
    patch: PatchBuffers[K][string],
    persist: (id: string, patch: PatchBuffers[K][string]) => Promise<unknown>,
    scope: string,
  ) {
    const buffers = patchBuffers.current[kind] as Record<string, PatchBuffers[K][string]>;
    const timers = patchTimers.current[kind] as Record<string, ReturnType<typeof setTimeout>>;
    buffers[id] = { ...buffers[id], ...patch };
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      const pending = buffers[id];
      delete buffers[id];
      delete timers[id];
      // Debouncing prevents keystroke saves from racing each other and remounting focused fields.
      startTransition(() => {
        void persist(id, pending).catch((error) => logPersistFailure(scope, error));
      });
    }, 450);
  }

  const value: DealdashContextValue = {
    data,
    viewer: viewerState,
    showFinancials,
    toggleFinancials() {
      const nextHidden = showFinancials;
      setShowFinancials(!showFinancials);
      startTransition(() => {
        void updateFinancialVisibilityAction(nextHidden)
          .then((updatedViewer) => setViewerState(updatedViewer))
          .catch((error) => {
            setShowFinancials(showFinancials);
            logPersistFailure("financial visibility", error);
          });
      });
    },
    addFundedDeal(fundedDate) {
      startTransition(() => {
        void createFundedDealAction(fundedDate)
          .then((created) => setData((current) => ({ ...current, fundedDeals: [created, ...current.fundedDeals] })))
          .catch((error) => logPersistFailure("funded deal creation", error));
      });
    },
    updateFundedDeal(id, patch) {
      setData((current) => ({ ...current, fundedDeals: current.fundedDeals.map((deal) => (deal.id === id ? { ...deal, ...patch } : deal)) }));
      queuePatch("funded", id, patch, updateFundedDealAction, "funded deal update");
    },
    deleteFundedDeal(id) {
      setData((current) => ({ ...current, fundedDeals: current.fundedDeals.filter((deal) => deal.id !== id) }));
      startTransition(() => {
        void deleteFundedDealAction(id).catch((error) => logPersistFailure("funded deal delete", error));
      });
    },
    addPipelineDeal(submittedDate) {
      startTransition(() => {
        void createPipelineDealAction(submittedDate)
          .then((created) => setData((current) => ({ ...current, pipelineDeals: [created, ...current.pipelineDeals] })))
          .catch((error) => logPersistFailure("pipeline deal creation", error));
      });
    },
    updatePipelineDeal(id, patch) {
      setData((current) => ({ ...current, pipelineDeals: current.pipelineDeals.map((deal) => (deal.id === id ? { ...deal, ...patch } : deal)) }));
      queuePatch("pipeline", id, patch, updatePipelineDealAction, "pipeline deal update");
    },
    deletePipelineDeal(id) {
      setData((current) => ({ ...current, pipelineDeals: current.pipelineDeals.filter((deal) => deal.id !== id) }));
      startTransition(() => {
        void deletePipelineDealAction(id).catch((error) => logPersistFailure("pipeline deal delete", error));
      });
    },
    addFollowUp() {
      startTransition(() => {
        void createFollowUpAction()
          .then((created) => setData((current) => ({ ...current, followUps: [created, ...current.followUps] })))
          .catch((error) => logPersistFailure("follow-up creation", error));
      });
    },
    updateFollowUp(id, patch) {
      setData((current) => ({ ...current, followUps: current.followUps.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      queuePatch("followUp", id, patch, updateFollowUpAction, "follow-up update");
    },
    deleteFollowUp(id) {
      setData((current) => ({ ...current, followUps: current.followUps.filter((item) => item.id !== id) }));
      startTransition(() => {
        void deleteFollowUpAction(id).catch((error) => logPersistFailure("follow-up delete", error));
      });
    },
    importData(payload) {
      startTransition(() => {
        void importWorkspaceDataAction(payload)
          .then((snapshot) => setData(snapshot))
          .catch((error) => logPersistFailure("csv import", error));
      });
    },
    resetToSeed() {
      startTransition(() => {
        void resetWorkspaceAction()
          .then((snapshot) => setData(snapshot))
          .catch((error) => logPersistFailure("workspace reset", error));
      });
    },
  };

  return <DealdashContext.Provider value={value}>{children}</DealdashContext.Provider>;
}

export function useDealdash() {
  const context = useContext(DealdashContext);
  if (!context) throw new Error("useDealdash must be used inside DealdashProvider");
  return context;
}
