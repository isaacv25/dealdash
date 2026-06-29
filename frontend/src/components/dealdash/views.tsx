"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  detectImportType,
  grossPaybackFromDeal,
  normalizeImportedRows,
  parseCsvText,
  periodicPaymentFromDeal,
  progressForFundedDeal,
  renewalDateForFundedDeal,
} from "@dealdash/backend";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineStage } from "@dealdash/backend";
import { CalendarClock, Download, Plus, Upload } from "lucide-react";
import { useDealdash } from "./state";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

const stages: Array<{ key: PipelineStage; label: string }> = [
  { key: "new-lead", label: "New Lead" },
  { key: "submitted", label: "Submitted" },
  { key: "in-review", label: "In Review" },
  { key: "approved", label: "Approved" },
  { key: "contract-out", label: "Contract Out" },
  { key: "funded", label: "Funded" },
  { key: "declined", label: "Declined" },
  { key: "dead", label: "Dead" },
  { key: "renewal", label: "Renewal" },
];

function formatCurrency(value?: number) {
  return currencyFormatter.format(value || 0);
}

function formatNumber(value?: number) {
  return numberFormatter.format(value || 0);
}

function formatPercent(value?: number) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value?: string) {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

function toDateInput(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SectionFrame({
  eyebrow,
  title,
  copy,
  actions,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  copy: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section className="glass-card rounded-[2rem] p-5 lg:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">{eyebrow}</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: Readonly<{
  label: string;
  value: string;
  detail: string;
}>) {
  return (
    <div className="rounded-[1.6rem] border border-white/80 bg-[var(--card-strong)] p-5 shadow-[0_16px_38px_rgba(21,42,74,0.08)]">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
    </div>
  );
}

export function DashboardView() {
  const { data } = useDealdash();
  const [today] = useState(() => Date.now());

  const metrics = useMemo(() => {
    const fundedVolume = data.fundedDeals.reduce((sum, deal) => sum + deal.fundedAmount, 0);
    const commission = data.fundedDeals.reduce((sum, deal) => sum + deal.commissionAmount, 0);
    const grossPayback = data.fundedDeals.reduce((sum, deal) => sum + grossPaybackFromDeal(deal), 0);
    const remaining = data.fundedDeals.reduce((sum, deal) => sum + progressForFundedDeal(deal).balanceRemaining, 0);
    const upcomingRenewals = data.fundedDeals.filter((deal) => {
      const renewalDate = renewalDateForFundedDeal(deal);
      if (!renewalDate) return false;
      const diff = new Date(renewalDate).getTime() - today;
      return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 45;
    }).length;

    return {
      fundedVolume,
      commission,
      grossPayback,
      remaining,
      fundedCount: data.fundedDeals.length,
      pipelineCount: data.pipelineDeals.length,
      followUpCount: data.followUps.filter((item) => !item.completed).length,
      upcomingRenewals,
    };
  }, [data, today]);

  const fundedByMonth = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const deal of data.fundedDeals) {
      const key = deal.fundedDate ? monthFormatter.format(new Date(deal.fundedDate)) : "Undated";
      buckets.set(key, (buckets.get(key) || 0) + deal.fundedAmount);
    }
    return Array.from(buckets.entries()).map(([month, amount]) => ({ month, amount }));
  }, [data.fundedDeals]);

  const fundedByLender = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const deal of data.fundedDeals) {
      const key = deal.funder || "Unassigned";
      buckets.set(key, (buckets.get(key) || 0) + deal.fundedAmount);
    }
    return Array.from(buckets.entries())
      .map(([lender, amount]) => ({ lender, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 8);
  }, [data.fundedDeals]);

  const upcomingFollowUps = useMemo(
    () =>
      [...data.followUps]
        .filter((item) => !item.completed)
        .sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || ""))
        .slice(0, 6),
    [data.followUps],
  );

  return (
    <SectionFrame
      eyebrow="Overview"
      title="Daily operating picture"
      copy="This snapshot mixes funded deal economics, pipeline depth, and follow-up urgency so you can see the whole funnel before you start updating rows."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Funded Volume" value={formatCurrency(metrics.fundedVolume)} detail={`${metrics.fundedCount} funded files on the board`} />
        <MetricCard label="Gross Payback" value={formatCurrency(metrics.grossPayback)} detail={`Remaining balance ${formatCurrency(metrics.remaining)}`} />
        <MetricCard label="Commission Book" value={formatCurrency(metrics.commission)} detail={`${metrics.upcomingRenewals} renewals approaching`} />
        <MetricCard label="Open Follow-Ups" value={formatNumber(metrics.followUpCount)} detail={`${metrics.pipelineCount} active pipeline records`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Funded volume over time</h3>
              <p className="text-sm text-[var(--muted)]">Seeded from your local CSVs when available, otherwise sample data.</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fundedByMonth}>
                <defs>
                  <linearGradient id="fundedGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#155eef" stopOpacity={0.46} />
                    <stop offset="100%" stopColor="#155eef" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(19,34,56,0.08)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                <Area type="monotone" dataKey="amount" stroke="#155eef" strokeWidth={3} fill="url(#fundedGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <h3 className="text-lg font-semibold">Top funders</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundedByLender} layout="vertical">
                <CartesianGrid horizontal={false} stroke="rgba(19,34,56,0.08)" />
                <XAxis type="number" hide />
                <YAxis dataKey="lender" type="category" tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                <Bar dataKey="amount" fill="#0d9488" radius={[0, 12, 12, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-[var(--accent-strong)]" />
            <h3 className="text-lg font-semibold">Upcoming follow-ups</h3>
          </div>
          <div className="mt-4 space-y-3">
            {upcomingFollowUps.map((item) => (
              <div key={item.id} className="rounded-[1.15rem] border border-[var(--line)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.businessName}</p>
                    <p className="text-sm text-[var(--muted)]">{item.contactName}</p>
                  </div>
                  <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    {item.dueDate ? formatDate(item.dueDate) : "No due date"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.notes || "No notes yet."}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <h3 className="text-lg font-semibold">Recent import batches</h3>
          <div className="mt-4 space-y-3">
            {data.importBatches.slice(0, 5).map((batch) => (
              <div key={batch.id} className="rounded-[1.15rem] border border-[var(--line)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{batch.filename}</p>
                  <span className="pill bg-white text-[var(--foreground)]">{batch.importType}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {batch.rowsImported} rows imported, {batch.rowsSkipped} skipped
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}

export function FundedProgressView() {
  const { data, addFundedDeal, updateFundedDeal } = useDealdash();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredDeals = useMemo(
    () =>
      data.fundedDeals.filter((deal) =>
        [deal.businessName, deal.contactName, deal.funder, deal.statusRaw].join(" ").toLowerCase().includes(deferredQuery.toLowerCase()),
      ),
    [data.fundedDeals, deferredQuery],
  );

  return (
    <SectionFrame
      eyebrow="Funded Deal Progress"
      title="Track balances, payback, clawback, and renewal timing"
      copy="All of the main economic levers here are editable. When you change rates, terms, payments, commission, or syndication, the payout math and balance view update immediately."
      actions={
        <div className="flex flex-wrap gap-3">
          <input className="field min-w-[220px]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search funded deals" />
          <button className="ghost-button flex items-center gap-2" onClick={() => addFundedDeal()} type="button">
            <Plus className="h-4 w-4" />
            Add Deal
          </button>
          <button
            className="ghost-button flex items-center gap-2"
            onClick={() =>
              downloadCsv(
                "dealdash-funded-progress.csv",
                ["Business", "Contact", "Funded Amount", "Rate", "Term", "Frequency", "Payment", "Balance Remaining"],
                filteredDeals.map((deal) => {
                  const progress = progressForFundedDeal(deal);
                  return [
                    deal.businessName,
                    deal.contactName,
                    String(deal.fundedAmount),
                    String(deal.factorRate),
                    String(deal.termValue),
                    deal.paymentFrequency,
                    String(periodicPaymentFromDeal(deal)),
                    String(progress.balanceRemaining),
                  ];
                }),
              )
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      }
    >
      <div className="table-wrap border border-white/80 bg-white/76">
        <table className="min-w-[1220px] w-full text-sm">
          <thead className="bg-white/88 text-left text-[var(--muted)]">
            <tr>
              {["Business", "Funded", "Rate", "Term", "Freq", "Payment", "Synd %", "Comm %", "Clawback", "Payback", "Balance", "Renewal"].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((deal) => {
              const progress = progressForFundedDeal(deal);
              const renewalDate = renewalDateForFundedDeal(deal);
              return (
                <tr key={deal.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-4">
                    <input className="field min-w-[220px]" value={deal.businessName} onChange={(event) => updateFundedDeal(deal.id, { businessName: event.target.value })} />
                    <input className="field mt-2 min-w-[220px]" value={deal.contactName} onChange={(event) => updateFundedDeal(deal.id, { contactName: event.target.value })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[120px]" type="number" value={deal.fundedAmount} onChange={(event) => updateFundedDeal(deal.id, { fundedAmount: Number(event.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[92px]" step="0.01" type="number" value={deal.factorRate} onChange={(event) => updateFundedDeal(deal.id, { factorRate: Number(event.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[92px]" type="number" value={deal.termValue} onChange={(event) => updateFundedDeal(deal.id, { termValue: Number(event.target.value) || 0 })} />
                    <select className="field mt-2 w-[120px]" value={deal.termUnit} onChange={(event) => updateFundedDeal(deal.id, { termUnit: event.target.value as FundedDeal["termUnit"] })}>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select className="field w-[120px]" value={deal.paymentFrequency} onChange={(event) => updateFundedDeal(deal.id, { paymentFrequency: event.target.value as FundedDeal["paymentFrequency"] })}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[120px]" type="number" value={deal.paymentAmount} onChange={(event) => updateFundedDeal(deal.id, { paymentAmount: Number(event.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[92px]" step="0.01" type="number" value={deal.syndicationPercent} onChange={(event) => updateFundedDeal(deal.id, { syndicationPercent: Number(event.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[92px]" step="0.01" type="number" value={deal.commissionPercent} onChange={(event) => updateFundedDeal(deal.id, { commissionPercent: Number(event.target.value) || 0, commissionAmount: deal.fundedAmount * (Number(event.target.value) || 0) })} />
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[110px]" type="number" value={deal.clawbackAmount} onChange={(event) => updateFundedDeal(deal.id, { clawbackAmount: Number(event.target.value) || 0, manualBalanceRemaining: Number(event.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-4 font-semibold">{formatCurrency(grossPaybackFromDeal(deal))}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{formatCurrency(progress.balanceRemaining)}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{progress.progressPercent}% complete</p>
                  </td>
                  <td className="px-4 py-4">
                    <input className="field w-[136px]" type="date" value={toDateInput(renewalDate)} onChange={(event) => updateFundedDeal(deal.id, { manualRenewalDate: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}

export function PipelineView() {
  const { data, addPipelineDeal, updatePipelineDeal } = useDealdash();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(
    () =>
      data.pipelineDeals.filter((deal) =>
        [deal.businessName, deal.contactName, deal.statusRaw, deal.notes].join(" ").toLowerCase().includes(deferredQuery.toLowerCase()),
      ),
    [data.pipelineDeals, deferredQuery],
  );

  return (
    <SectionFrame
      eyebrow="Deals Brought In"
      title="Pipeline board"
      copy="Use the status columns to keep every file moving. Each card keeps the business, request, raw lender notes, and next-touch date in sight."
      actions={
        <div className="flex flex-wrap gap-3">
          <input className="field min-w-[220px]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pipeline" />
          <button className="ghost-button flex items-center gap-2" onClick={() => addPipelineDeal()} type="button">
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {stages.map((stage) => {
          const stageDeals = filtered.filter((deal) => deal.stage === stage.key);
          return (
            <div key={stage.key} className="rounded-[1.6rem] bg-white/76 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">{stage.label}</h3>
                <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">{stageDeals.length}</span>
              </div>
              <div className="space-y-3">
                {stageDeals.map((deal) => (
                  <article key={deal.id} className="rounded-[1.25rem] border border-[var(--line)] bg-white p-4">
                    <input className="field" value={deal.businessName} onChange={(event) => updatePipelineDeal(deal.id, { businessName: event.target.value })} />
                    <input className="field mt-2" value={deal.contactName} onChange={(event) => updatePipelineDeal(deal.id, { contactName: event.target.value })} />
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input className="field" value={deal.requestLabel} onChange={(event) => updatePipelineDeal(deal.id, { requestLabel: event.target.value })} placeholder="Request" />
                      <select className="field" value={deal.stage} onChange={(event) => updatePipelineDeal(deal.id, { stage: event.target.value as PipelineStage })}>
                        {stages.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <textarea className="field mt-3 min-h-[94px]" value={deal.notes} onChange={(event) => updatePipelineDeal(deal.id, { notes: event.target.value })} placeholder="Deal notes" />
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input className="field" type="date" value={toDateInput(deal.nextFollowUpDate)} onChange={(event) => updatePipelineDeal(deal.id, { nextFollowUpDate: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })} />
                      <input className="field" value={deal.statusRaw} onChange={(event) => updatePipelineDeal(deal.id, { statusRaw: event.target.value })} placeholder="Raw status" />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionFrame>
  );
}

export function FollowUpsView() {
  const { data, addFollowUp, updateFollowUp } = useDealdash();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(
    () =>
      data.followUps.filter((item) =>
        [item.businessName, item.contactName, item.notes, item.requestLabel].join(" ").toLowerCase().includes(deferredQuery.toLowerCase()),
      ),
    [data.followUps, deferredQuery],
  );

  return (
    <SectionFrame
      eyebrow="Follow-Up Sheet"
      title="Daily contact queue"
      copy="Keep the callback list moving with due dates, quick notes, submitted-app flags, and completion state all in one place."
      actions={
        <div className="flex flex-wrap gap-3">
          <input className="field min-w-[220px]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search follow-ups" />
          <button className="ghost-button flex items-center gap-2" onClick={() => addFollowUp()} type="button">
            <Plus className="h-4 w-4" />
            Add Follow-Up
          </button>
        </div>
      }
    >
      <div className="table-wrap border border-white/80 bg-white/76">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-white/88 text-left text-[var(--muted)]">
            <tr>
              {["Business", "Contact", "Request", "Due", "Priority", "Submitted", "Done", "Notes"].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)] align-top">
                <td className="px-4 py-4">
                  <input className="field min-w-[200px]" value={item.businessName} onChange={(event) => updateFollowUp(item.id, { businessName: event.target.value })} />
                </td>
                <td className="px-4 py-4">
                  <input className="field min-w-[180px]" value={item.contactName} onChange={(event) => updateFollowUp(item.id, { contactName: event.target.value })} />
                </td>
                <td className="px-4 py-4">
                  <input className="field w-[120px]" value={item.requestLabel} onChange={(event) => updateFollowUp(item.id, { requestLabel: event.target.value })} />
                </td>
                <td className="px-4 py-4">
                  <input className="field w-[150px]" type="date" value={toDateInput(item.dueDate)} onChange={(event) => updateFollowUp(item.id, { dueDate: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })} />
                </td>
                <td className="px-4 py-4">
                  <select className="field w-[120px]" value={item.priority} onChange={(event) => updateFollowUp(item.id, { priority: event.target.value as FollowUpItem["priority"] })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </td>
                <td className="px-4 py-4">
                  <input checked={item.appSubmitted} onChange={(event) => updateFollowUp(item.id, { appSubmitted: event.target.checked })} type="checkbox" />
                </td>
                <td className="px-4 py-4">
                  <input checked={item.completed} onChange={(event) => updateFollowUp(item.id, { completed: event.target.checked })} type="checkbox" />
                </td>
                <td className="px-4 py-4">
                  <textarea className="field min-w-[260px]" value={item.notes} onChange={(event) => updateFollowUp(item.id, { notes: event.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}

export function RateCalculatorView() {
  const [scenario, setScenario] = useState({
    fundedAmount: 50000,
    factorRate: 1.38,
    termValue: 24,
    termUnit: "weeks" as FundedDeal["termUnit"],
    paymentFrequency: "weekly" as FundedDeal["paymentFrequency"],
    syndicationPercent: 0.1,
    pointsPercent: 0.02,
    commissionPercent: 0.05,
    clawbackPercent: 0,
  });

  const grossPayback = grossPaybackFromDeal({
    fundedAmount: scenario.fundedAmount,
    factorRate: scenario.factorRate,
  });
  const periodicPayment = periodicPaymentFromDeal({
    ...scenario,
    paymentAmount: 0,
  });
  const syndicationAmount = scenario.fundedAmount * scenario.syndicationPercent;
  const pointsIncome = scenario.fundedAmount * scenario.pointsPercent;
  const commissionIncome = scenario.fundedAmount * scenario.commissionPercent;
  const clawbackReserve = grossPayback * scenario.clawbackPercent;
  const netBrokerProceeds = commissionIncome + pointsIncome - clawbackReserve;

  return (
    <SectionFrame
      eyebrow="Rate Calculator"
      title="Mock deals before you pitch or price"
      copy="Use this to model factor rate, terms, frequency, syndication, points, commission, and clawback together. The whole scenario recalculates live."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { key: "fundedAmount", label: "Funded amount", step: "1000" },
            { key: "factorRate", label: "Factor rate", step: "0.01" },
            { key: "termValue", label: "Term value", step: "1" },
            { key: "syndicationPercent", label: "Syndication %", step: "0.01" },
            { key: "pointsPercent", label: "Points %", step: "0.01" },
            { key: "commissionPercent", label: "Commission %", step: "0.01" },
            { key: "clawbackPercent", label: "Clawback %", step: "0.01" },
          ].map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]">{field.label}</label>
              <input
                className="field"
                step={field.step}
                type="number"
                value={scenario[field.key as keyof typeof scenario] as number}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value) || 0,
                  }))
                }
              />
            </div>
          ))}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Term unit</label>
            <select className="field" value={scenario.termUnit} onChange={(event) => setScenario((current) => ({ ...current, termUnit: event.target.value as FundedDeal["termUnit"] }))}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Payment frequency</label>
            <select className="field" value={scenario.paymentFrequency} onChange={(event) => setScenario((current) => ({ ...current, paymentFrequency: event.target.value as FundedDeal["paymentFrequency"] }))}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="rounded-[1.7rem] bg-[linear-gradient(160deg,_rgba(21,94,239,0.14),_rgba(13,148,136,0.12))] p-5">
          <h3 className="text-xl font-semibold">Scenario output</h3>
          <div className="mt-5 grid gap-3">
            <MetricCard label="Gross payback" value={formatCurrency(grossPayback)} detail="Funded amount x factor rate" />
            <MetricCard label="Periodic payment" value={formatCurrency(periodicPayment)} detail={`${scenario.paymentFrequency} payment estimate`} />
            <MetricCard label="Syndication out" value={formatCurrency(syndicationAmount)} detail={formatPercent(scenario.syndicationPercent)} />
            <MetricCard label="Net broker proceeds" value={formatCurrency(netBrokerProceeds)} detail={`Commission ${formatCurrency(commissionIncome)} + points ${formatCurrency(pointsIncome)}`} />
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}

type ImportPreview = {
  filename: string;
  detectedType: "funded" | "pipeline" | "follow-up" | "unknown";
  headers: string[];
  rows: Record<string, string>[];
};

export function ImportsView() {
  const { importData } = useDealdash();
  const [previews, setPreviews] = useState<ImportPreview[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const nextPreviews = await Promise.all(
      Array.from(fileList).map(async (file) => {
        const content = await file.text();
        const parsed = parseCsvText(content);
        return {
          filename: file.name,
          detectedType: detectImportType(parsed.headers),
          headers: parsed.headers,
          rows: parsed.rows,
        } satisfies ImportPreview;
      }),
    );

    setPreviews(nextPreviews);
  }

  function importPreview(preview: ImportPreview) {
    if (preview.detectedType === "unknown") return;
    const normalized = normalizeImportedRows(preview.detectedType, preview.rows, preview.filename);
    const batch: ImportBatch = {
      id: `batch-${preview.filename}-${preview.rows.length}-${preview.headers.length}`,
      filename: preview.filename,
      importType: preview.detectedType,
      rowsImported: preview.rows.length,
      rowsSkipped: 0,
      detectedColumns: preview.headers,
      importedAt: preview.rows[0]?.Date || preview.rows[0]?.["Date App"] || "uploaded-in-browser",
    };
    importData({ ...normalized, batch });
  }

  return (
    <SectionFrame
      eyebrow="Imports"
      title="Bring in CSVs from your old workflow"
      copy="Upload one or more CSV exports, preview their detected shape, and merge them into the workspace. When the headers match your current sheet patterns, Dealdash normalizes them automatically."
      actions={
        <label className="primary-button inline-flex cursor-pointer items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload CSVs
          <input className="hidden" multiple accept=".csv,.tsv" onChange={(event) => void handleFiles(event.target.files)} type="file" />
        </label>
      }
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {previews.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-[var(--line)] bg-white/66 p-10 text-center text-[var(--muted)] xl:col-span-2">
            No files loaded yet. Upload the monthly deal sheets, funded-deal sheet, or follow-up export to preview them here.
          </div>
        ) : (
          previews.map((preview) => (
            <div key={preview.filename} className="rounded-[1.6rem] bg-white/76 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{preview.filename}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{preview.rows.length} rows detected</p>
                </div>
                <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">{preview.detectedType}</span>
              </div>
              <div className="mt-4 rounded-[1.2rem] border border-[var(--line)] bg-white/80 p-4">
                <p className="text-sm font-semibold">Detected columns</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {preview.headers.map((header) => (
                    <span key={header} className="pill bg-white text-[var(--foreground)]">{header}</span>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button className="ghost-button" disabled={preview.detectedType === "unknown"} onClick={() => importPreview(preview)} type="button">
                  Import into workspace
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </SectionFrame>
  );
}
