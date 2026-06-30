"use client";

import { createContext, startTransition, useContext, useEffect, useEffectEvent, useState } from "react";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, SeedDataset } from "@/lib/dealdash";

const STORAGE_KEY = "dealdash-browser-state-v2";

interface DealdashContextValue {
  data: SeedDataset;
  addFundedDeal: () => void;
  updateFundedDeal: (id: string, patch: Partial<FundedDeal>) => void;
  deleteFundedDeal: (id: string) => void;
  addPipelineDeal: () => void;
  updatePipelineDeal: (id: string, patch: Partial<PipelineDeal>) => void;
  deletePipelineDeal: (id: string) => void;
  addFollowUp: () => void;
  updateFollowUp: (id: string, patch: Partial<FollowUpItem>) => void;
  deleteFollowUp: (id: string) => void;
  importData: (payload: {
    fundedDeals: FundedDeal[];
    pipelineDeals: PipelineDeal[];
    followUps: FollowUpItem[];
    batch: ImportBatch;
  }) => void;
  resetToSeed: () => void;
}

const DealdashContext = createContext<DealdashContextValue | null>(null);

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function createBlankFundedDeal(): FundedDeal {
  const now = new Date().toISOString();
  return {
    id: `funded-manual-${Date.now()}`,
    businessName: "New funded deal",
    contactName: "Brokered contact",
    fundedDate: now,
    fundedAmount: 0,
    factorRate: 1.35,
    termValue: 24,
    termUnit: "weeks",
    paymentAmount: 0,
    paymentFrequency: "weekly",
    syndicationPercent: 0,
    pointsPercent: 0,
    housePointsPercent: 0,
    commissionPercent: 0.3, // default 30% broker split
    commissionAmount: 0,
    clawbackAmount: 0,
    statusRaw: "Active",
    statusStage: "active",
    notes: "",
    sourceLabel: "manual",
  };
}

function createBlankPipelineDeal(): PipelineDeal {
  return {
    id: `pipeline-manual-${Date.now()}`,
    contactName: "New lead",
    businessName: "Untitled business",
    requestLabel: "",
    statusRaw: "New Lead",
    stage: "new-lead",
    notes: "",
    sheetLabel: "",
    sourceLabel: "manual",
  };
}

function createBlankFollowUp(): FollowUpItem {
  return {
    id: `follow-up-manual-${Date.now()}`,
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

export function DealdashProvider({
  initialData,
  children,
}: Readonly<{
  initialData: SeedDataset;
  children: React.ReactNode;
}>) {
  const [data, setData] = useState<SeedDataset>(() => {
    if (typeof window === "undefined") return initialData;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialData;

    try {
      return JSON.parse(raw) as SeedDataset;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return initialData;
    }
  });

  const persistState = useEffectEvent((nextData: SeedDataset) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  });

  useEffect(() => {
    persistState(data);
  }, [data]);

  const value: DealdashContextValue = {
    data,
    addFundedDeal() {
      setData((current) => ({
        ...current,
        fundedDeals: [createBlankFundedDeal(), ...current.fundedDeals],
      }));
    },
    updateFundedDeal(id, patch) {
      setData((current) => ({
        ...current,
        fundedDeals: current.fundedDeals.map((deal) => (deal.id === id ? { ...deal, ...patch } : deal)),
      }));
    },
    deleteFundedDeal(id) {
      setData((current) => ({
        ...current,
        fundedDeals: current.fundedDeals.filter((deal) => deal.id !== id),
      }));
    },
    addPipelineDeal() {
      setData((current) => ({
        ...current,
        pipelineDeals: [createBlankPipelineDeal(), ...current.pipelineDeals],
      }));
    },
    updatePipelineDeal(id, patch) {
      setData((current) => ({
        ...current,
        pipelineDeals: current.pipelineDeals.map((deal) => (deal.id === id ? { ...deal, ...patch } : deal)),
      }));
    },
    deletePipelineDeal(id) {
      setData((current) => ({
        ...current,
        pipelineDeals: current.pipelineDeals.filter((deal) => deal.id !== id),
      }));
    },
    addFollowUp() {
      setData((current) => ({
        ...current,
        followUps: [createBlankFollowUp(), ...current.followUps],
      }));
    },
    updateFollowUp(id, patch) {
      setData((current) => ({
        ...current,
        followUps: current.followUps.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
    },
    deleteFollowUp(id) {
      setData((current) => ({
        ...current,
        followUps: current.followUps.filter((item) => item.id !== id),
      }));
    },
    importData(payload) {
      startTransition(() => {
        setData((current) => ({
          ...current,
          fundedDeals: mergeById(current.fundedDeals, payload.fundedDeals),
          pipelineDeals: mergeById(current.pipelineDeals, payload.pipelineDeals),
          followUps: mergeById(current.followUps, payload.followUps),
          importBatches: [payload.batch, ...current.importBatches],
          sourceMode: current.sourceMode,
        }));
      });
    },
    resetToSeed() {
      window.localStorage.removeItem(STORAGE_KEY);
      setData(initialData);
    },
  };

  return <DealdashContext.Provider value={value}>{children}</DealdashContext.Provider>;
}

export function useDealdash() {
  const context = useContext(DealdashContext);
  if (!context) {
    throw new Error("useDealdash must be used inside DealdashProvider");
  }
  return context;
}
