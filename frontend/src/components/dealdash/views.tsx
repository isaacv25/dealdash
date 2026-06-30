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
} from "@/lib/dealdash";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineStage } from "@/lib/dealdash";
import { CalendarClock, Download, Plus, Trash2, Upload } from "lucide-react";
import { useDealdash } from "./state";

// ─── formatters ──────────────────────────────────────────────────────────────

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
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
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

// ─── shared UI primitives ─────────────────────────────────────────────────────

/**
 * Page-level section wrapper. Eyebrow + title are intentionally compact —
 * the heading used to be text-3xl which read as oversized at this density.
 */
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
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">{eyebrow}</div>
          {/* Reduced from text-3xl → text-xl for a tighter, more professional look */}
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{copy}</p>
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
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

/**
 * Visual progress bar for a funded deal.
 * percent: 0–100
 */
function ProgressBar({ percent, stage }: { percent: number; stage: FundedDeal["statusStage"] }) {
  const color =
    stage === "paid-out"
      ? "bg-[var(--success)]"
      : stage === "clawback"
        ? "bg-[var(--danger)]"
        : stage === "slow-pay"
          ? "bg-[var(--warn)]"
          : "bg-[var(--accent-strong)]";

  return (
    <div className="mt-1">
      <div className="progress-track">
        <div
          className={`progress-fill ${color}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{percent}% paid</p>
    </div>
  );
}

/** Colored dot + text badge for a funded deal's status stage. */
function StatusBadge({ stage }: { stage: FundedDeal["statusStage"] }) {
  const config = {
    active: { dot: "bg-[var(--accent-strong)]", label: "Active" },
    "paid-out": { dot: "bg-[var(--success)]", label: "Paid Out" },
    clawback: { dot: "bg-[var(--danger)]", label: "Clawback" },
    "slow-pay": { dot: "bg-[var(--warn)]", label: "Slow Pay" },
    watch: { dot: "bg-[var(--warn)]", label: "Watch" },
  }[stage] ?? { dot: "bg-[var(--muted)]", label: stage };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} />
      <span className="text-xs font-medium">{config.label}</span>
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardView() {
  const { data } = useDealdash();
  const [today] = useState(() => Date.now());

  const metrics = useMemo(() => {
    const fundedVolume = data.fundedDeals.reduce((sum, deal) => sum + deal.fundedAmount, 0);
    const commission = data.fundedDeals.reduce((sum, deal) => sum + deal.commissionAmount, 0);
    const grossPayback = data.fundedDeals.reduce(
      (sum, deal) => sum + grossPaybackFromDeal(deal),
      0,
    );
    const remaining = data.fundedDeals.reduce(
      (sum, deal) => sum + progressForFundedDeal(deal).balanceRemaining,
      0,
    );
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
      const key = deal.fundedDate
        ? monthFormatter.format(new Date(deal.fundedDate))
        : "Undated";
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
      .sort((l, r) => r.amount - l.amount)
      .slice(0, 8);
  }, [data.fundedDeals]);

  const upcomingFollowUps = useMemo(
    () =>
      [...data.followUps]
        .filter((item) => !item.completed)
        .sort((l, r) => (l.dueDate || "").localeCompare(r.dueDate || ""))
        .slice(0, 6),
    [data.followUps],
  );

  return (
    <SectionFrame
      eyebrow="Overview"
      title="Daily operating picture"
      copy="Funded deal economics, pipeline depth, and follow-up urgency in one view."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Funded Volume"
          value={formatCurrency(metrics.fundedVolume)}
          detail={`${metrics.fundedCount} funded files on the board`}
        />
        <MetricCard
          label="Gross Payback"
          value={formatCurrency(metrics.grossPayback)}
          detail={`Remaining balance ${formatCurrency(metrics.remaining)}`}
        />
        <MetricCard
          label="Commission Book"
          value={formatCurrency(metrics.commission)}
          detail={`${metrics.upcomingRenewals} renewals approaching`}
        />
        <MetricCard
          label="Open Follow-Ups"
          value={formatNumber(metrics.followUpCount)}
          detail={`${metrics.pipelineCount} active pipeline records`}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <h3 className="text-base font-semibold">Funded volume over time</h3>
          <p className="mb-4 mt-0.5 text-xs text-[var(--muted)]">Monthly totals from your funded deal sheet.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fundedByMonth}>
                <defs>
                  <linearGradient id="fundedGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#155eef" stopOpacity={0.46} />
                    <stop offset="100%" stopColor="#155eef" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(19,34,56,0.08)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v) || 0)} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#155eef"
                  strokeWidth={3}
                  fill="url(#fundedGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <h3 className="text-base font-semibold">Top funders</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundedByLender} layout="vertical">
                <CartesianGrid horizontal={false} stroke="rgba(19,34,56,0.08)" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="lender"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v) || 0)} />
                <Bar dataKey="amount" fill="#0d9488" radius={[0, 12, 12, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-4 w-4 text-[var(--accent-strong)]" />
            <h3 className="text-base font-semibold">Upcoming follow-ups</h3>
          </div>
          <div className="mt-4 space-y-2">
            {upcomingFollowUps.map((item) => (
              <div key={item.id} className="rounded-[1.15rem] border border-[var(--line)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.businessName}</p>
                    <p className="text-xs text-[var(--muted)]">{item.contactName}</p>
                  </div>
                  <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    {item.dueDate ? formatDate(item.dueDate) : "No date"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.notes || "No notes."}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.6rem] bg-white/76 p-5">
          <h3 className="text-base font-semibold">Recent import batches</h3>
          <div className="mt-4 space-y-2">
            {data.importBatches.slice(0, 6).map((batch) => (
              <div key={batch.id} className="rounded-[1.15rem] border border-[var(--line)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{batch.filename}</p>
                  <span className="pill bg-white text-[var(--foreground)]">{batch.importType}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {batch.rowsImported} rows imported
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}

// ─── Funded Progress ──────────────────────────────────────────────────────────

export function FundedProgressView() {
  const { data, addFundedDeal, updateFundedDeal, deleteFundedDeal } = useDealdash();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredDeals = useMemo(
    () =>
      data.fundedDeals.filter((deal) =>
        [deal.businessName, deal.contactName, deal.funder, deal.statusRaw]
          .join(" ")
          .toLowerCase()
          .includes(deferredQuery.toLowerCase()),
      ),
    [data.fundedDeals, deferredQuery],
  );

  return (
    <SectionFrame
      eyebrow="Funded Deal Progress"
      title="Track balances, payback, clawback, and renewal timing"
      copy="All economic levers are editable inline. Rates, terms, payments, and commission update the payout math immediately."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search funded deals"
          />
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() => addFundedDeal()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Deal
          </button>
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() =>
              downloadCsv(
                "dealdash-funded-progress.csv",
                ["Business", "Contact", "Funded", "Rate", "Term", "Freq", "Payment", "Payback", "Balance", "Status"],
                filteredDeals.map((deal) => {
                  const progress = progressForFundedDeal(deal);
                  return [
                    deal.businessName,
                    deal.contactName,
                    String(deal.fundedAmount),
                    String(deal.factorRate),
                    `${deal.termValue} ${deal.termUnit}`,
                    deal.paymentFrequency,
                    String(periodicPaymentFromDeal(deal)),
                    String(grossPaybackFromDeal(deal)),
                    String(progress.balanceRemaining),
                    deal.statusRaw,
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
        <table className="min-w-[1300px] w-full text-sm">
          <thead className="bg-white/88 text-left text-[var(--muted)]">
            <tr>
              {[
                "Business / Contact",
                "Funder",
                "Funded",
                "Rate",
                "Term",
                "Freq",
                "Payment",
                "Synd %",
                "Comm $",
                "Payback / Progress",
                "Balance",
                "Renewal",
                "",
              ].map((h) => (
                <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((deal) => {
              const progress = progressForFundedDeal(deal);
              const renewalDate = renewalDateForFundedDeal(deal);
              return (
                <tr key={deal.id} className="border-t border-[var(--line)] align-top">
                  {/* Business name + contact + status badge */}
                  <td className="px-3 py-3">
                    <input
                      className="field min-w-[180px] text-sm"
                      value={deal.businessName}
                      onChange={(e) => updateFundedDeal(deal.id, { businessName: e.target.value })}
                    />
                    <input
                      className="field mt-1.5 min-w-[180px] text-sm"
                      value={deal.contactName}
                      onChange={(e) => updateFundedDeal(deal.id, { contactName: e.target.value })}
                    />
                    <div className="mt-1.5">
                      <StatusBadge stage={deal.statusStage} />
                    </div>
                  </td>

                  {/* Funder */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[130px] text-sm"
                      value={deal.funder || ""}
                      onChange={(e) => updateFundedDeal(deal.id, { funder: e.target.value })}
                      placeholder="Funder"
                    />
                  </td>

                  {/* Funded amount */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[110px] text-sm"
                      type="number"
                      value={deal.fundedAmount}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, { fundedAmount: Number(e.target.value) || 0 })
                      }
                    />
                  </td>

                  {/* Factor rate */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[80px] text-sm"
                      step="0.01"
                      type="number"
                      value={deal.factorRate}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, { factorRate: Number(e.target.value) || 0 })
                      }
                    />
                  </td>

                  {/* Term value + unit */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[70px] text-sm"
                      type="number"
                      value={deal.termValue}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, { termValue: Number(e.target.value) || 0 })
                      }
                    />
                    <select
                      className="field mt-1.5 w-[100px] text-sm"
                      value={deal.termUnit}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          termUnit: e.target.value as FundedDeal["termUnit"],
                        })
                      }
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </td>

                  {/* Payment frequency */}
                  <td className="px-3 py-3">
                    <select
                      className="field w-[100px] text-sm"
                      value={deal.paymentFrequency}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          paymentFrequency: e.target.value as FundedDeal["paymentFrequency"],
                        })
                      }
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </td>

                  {/* Payment amount */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[110px] text-sm"
                      type="number"
                      value={deal.paymentAmount}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, { paymentAmount: Number(e.target.value) || 0 })
                      }
                    />
                  </td>

                  {/* Syndication % */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[80px] text-sm"
                      step="0.01"
                      type="number"
                      value={deal.syndicationPercent}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          syndicationPercent: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>

                  {/* Commission $ (editable raw amount) */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[100px] text-sm"
                      type="number"
                      value={deal.commissionAmount}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          commissionAmount: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>

                  {/* Gross payback + visual progress bar */}
                  <td className="px-3 py-3">
                    <p className="font-semibold">{formatCurrency(grossPaybackFromDeal(deal))}</p>
                    <ProgressBar percent={progress.progressPercent} stage={deal.statusStage} />
                  </td>

                  {/* Balance remaining */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[110px] text-sm"
                      type="number"
                      value={
                        deal.manualBalanceRemaining !== undefined
                          ? deal.manualBalanceRemaining
                          : progress.balanceRemaining
                      }
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          manualBalanceRemaining: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>

                  {/* Renewal date */}
                  <td className="px-3 py-3">
                    <input
                      className="field w-[130px] text-sm"
                      type="date"
                      value={toDateInput(renewalDate)}
                      onChange={(e) =>
                        updateFundedDeal(deal.id, {
                          manualRenewalDate: e.target.value
                            ? `${e.target.value}T00:00:00.000Z`
                            : undefined,
                        })
                      }
                    />
                  </td>

                  {/* Delete button */}
                  <td className="px-3 py-3">
                    <button
                      className="delete-button"
                      onClick={() => {
                        if (confirm(`Delete ${deal.businessName}?`)) deleteFundedDeal(deal.id);
                      }}
                      title="Delete deal"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function PipelineView() {
  const { data, addPipelineDeal, updatePipelineDeal, deletePipelineDeal } = useDealdash();
  const [query, setQuery] = useState("");
  const [activeStages, setActiveStages] = useState<Set<PipelineStage>>(
    new Set(["new-lead", "submitted", "in-review", "approved", "contract-out"]),
  );
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      data.pipelineDeals.filter(
        (deal) =>
          activeStages.has(deal.stage) &&
          [deal.businessName, deal.contactName, deal.statusRaw, deal.notes]
            .join(" ")
            .toLowerCase()
            .includes(deferredQuery.toLowerCase()),
      ),
    [data.pipelineDeals, deferredQuery, activeStages],
  );

  function toggleStage(key: PipelineStage) {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <SectionFrame
      eyebrow="Deals Brought In"
      title="Pipeline board"
      copy="Filter by stage, update status, and keep every file moving. All changes persist to your browser."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pipeline"
          />
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() => addPipelineDeal()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      }
    >
      {/* Stage filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {stages.map((s) => (
          <button
            key={s.key}
            onClick={() => toggleStage(s.key)}
            type="button"
            className={`pill cursor-pointer transition ${
              activeStages.has(s.key)
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "bg-white/70 text-[var(--muted)]"
            }`}
          >
            {s.label} ({data.pipelineDeals.filter((d) => d.stage === s.key).length})
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {stages
          .filter((s) => activeStages.has(s.key))
          .map((stage) => {
            const stageDeals = filtered.filter((deal) => deal.stage === stage.key);
            return (
              <div key={stage.key} className="rounded-[1.6rem] bg-white/76 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                  <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    {stageDeals.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {stageDeals.map((deal) => (
                    <article
                      key={deal.id}
                      className="rounded-[1.25rem] border border-[var(--line)] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <input
                            className="field text-sm"
                            value={deal.businessName}
                            onChange={(e) =>
                              updatePipelineDeal(deal.id, { businessName: e.target.value })
                            }
                          />
                          <input
                            className="field mt-1.5 text-sm"
                            value={deal.contactName}
                            onChange={(e) =>
                              updatePipelineDeal(deal.id, { contactName: e.target.value })
                            }
                          />
                        </div>
                        <button
                          className="delete-button mt-1 shrink-0"
                          onClick={() => {
                            if (confirm(`Delete ${deal.businessName}?`))
                              deletePipelineDeal(deal.id);
                          }}
                          title="Delete"
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Phone + email */}
                      {(deal.phone || deal.email) && (
                        <p className="mt-1 text-xs text-[var(--muted)] truncate">
                          {deal.phone}{deal.phone && deal.email ? " · " : ""}{deal.email}
                        </p>
                      )}

                      <div className="mt-2 grid gap-2 grid-cols-2">
                        <input
                          className="field text-sm"
                          value={deal.requestLabel}
                          onChange={(e) =>
                            updatePipelineDeal(deal.id, { requestLabel: e.target.value })
                          }
                          placeholder="Request"
                        />
                        <select
                          className="field text-sm"
                          value={deal.stage}
                          onChange={(e) =>
                            updatePipelineDeal(deal.id, {
                              stage: e.target.value as PipelineStage,
                            })
                          }
                        >
                          {stages.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        className="field mt-2 min-h-[72px] text-sm"
                        value={deal.notes}
                        onChange={(e) =>
                          updatePipelineDeal(deal.id, { notes: e.target.value })
                        }
                        placeholder="Notes"
                      />
                      <div className="mt-2 grid gap-2 grid-cols-2">
                        <input
                          className="field text-sm"
                          type="date"
                          value={toDateInput(deal.nextFollowUpDate)}
                          onChange={(e) =>
                            updatePipelineDeal(deal.id, {
                              nextFollowUpDate: e.target.value
                                ? `${e.target.value}T00:00:00.000Z`
                                : undefined,
                            })
                          }
                        />
                        <input
                          className="field text-sm"
                          value={deal.statusRaw}
                          onChange={(e) =>
                            updatePipelineDeal(deal.id, { statusRaw: e.target.value })
                          }
                          placeholder="Raw status"
                        />
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

// ─── Follow-Ups ───────────────────────────────────────────────────────────────

export function FollowUpsView() {
  const { data, addFollowUp, updateFollowUp, deleteFollowUp } = useDealdash();
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      data.followUps.filter(
        (item) =>
          (showCompleted || !item.completed) &&
          [item.businessName, item.contactName, item.notes, item.requestLabel]
            .join(" ")
            .toLowerCase()
            .includes(deferredQuery.toLowerCase()),
      ),
    [data.followUps, deferredQuery, showCompleted],
  );

  return (
    <SectionFrame
      eyebrow="Follow-Up Sheet"
      title="Daily contact queue"
      copy="Callback list with due dates, notes, app-submitted flags, and completion tracking."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search follow-ups"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed
          </label>
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() => addFollowUp()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Follow-Up
          </button>
        </div>
      }
    >
      <div className="table-wrap border border-white/80 bg-white/76">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-white/88 text-left text-[var(--muted)]">
            <tr>
              {["Business / Contact", "Phone", "Request", "Last Contact", "Due", "Priority", "App", "Done", "Notes", ""].map(
                (h) => (
                  <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`border-t border-[var(--line)] align-top ${item.completed ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-3">
                  <input
                    className="field min-w-[180px] text-sm"
                    value={item.businessName}
                    onChange={(e) => updateFollowUp(item.id, { businessName: e.target.value })}
                  />
                  <input
                    className="field mt-1.5 min-w-[180px] text-sm"
                    value={item.contactName}
                    onChange={(e) => updateFollowUp(item.id, { contactName: e.target.value })}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="field w-[130px] text-sm"
                    value={item.phone || ""}
                    onChange={(e) => updateFollowUp(item.id, { phone: e.target.value })}
                    placeholder="Phone"
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="field w-[90px] text-sm"
                    value={item.requestLabel}
                    onChange={(e) => updateFollowUp(item.id, { requestLabel: e.target.value })}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="field w-[100px] text-sm"
                    value={item.lastContactLabel}
                    onChange={(e) => updateFollowUp(item.id, { lastContactLabel: e.target.value })}
                    placeholder="Last contact"
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="field w-[140px] text-sm"
                    type="date"
                    value={toDateInput(item.dueDate)}
                    onChange={(e) =>
                      updateFollowUp(item.id, {
                        dueDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-3">
                  <select
                    className="field w-[100px] text-sm"
                    value={item.priority}
                    onChange={(e) =>
                      updateFollowUp(item.id, {
                        priority: e.target.value as FollowUpItem["priority"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </td>
                <td className="px-3 py-3 text-center">
                  <input
                    checked={item.appSubmitted}
                    onChange={(e) => updateFollowUp(item.id, { appSubmitted: e.target.checked })}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <input
                    checked={item.completed}
                    onChange={(e) => updateFollowUp(item.id, { completed: e.target.checked })}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-3">
                  <textarea
                    className="field min-w-[220px] text-sm"
                    value={item.notes}
                    onChange={(e) => updateFollowUp(item.id, { notes: e.target.value })}
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    className="delete-button"
                    onClick={() => {
                      if (confirm(`Delete ${item.contactName}?`)) deleteFollowUp(item.id);
                    }}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionFrame>
  );
}

// ─── Rate Calculator ──────────────────────────────────────────────────────────

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
  const periodicPayment = periodicPaymentFromDeal({ ...scenario, paymentAmount: 0 });
  const syndicationAmount = scenario.fundedAmount * scenario.syndicationPercent;
  const pointsIncome = scenario.fundedAmount * scenario.pointsPercent;
  const commissionIncome = scenario.fundedAmount * scenario.commissionPercent;
  const clawbackReserve = grossPayback * scenario.clawbackPercent;
  const netBrokerProceeds = commissionIncome + pointsIncome - clawbackReserve;

  return (
    <SectionFrame
      eyebrow="Rate Calculator"
      title="Mock deals before you pitch or price"
      copy="Model factor rate, terms, frequency, syndication, points, commission, and clawback together. Everything recalculates live."
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
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {field.label}
              </label>
              <input
                className="field"
                step={field.step}
                type="number"
                value={scenario[field.key as keyof typeof scenario] as number}
                onChange={(e) =>
                  setScenario((cur) => ({ ...cur, [field.key]: Number(e.target.value) || 0 }))
                }
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Term unit
            </label>
            <select
              className="field"
              value={scenario.termUnit}
              onChange={(e) =>
                setScenario((cur) => ({
                  ...cur,
                  termUnit: e.target.value as FundedDeal["termUnit"],
                }))
              }
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Payment frequency
            </label>
            <select
              className="field"
              value={scenario.paymentFrequency}
              onChange={(e) =>
                setScenario((cur) => ({
                  ...cur,
                  paymentFrequency: e.target.value as FundedDeal["paymentFrequency"],
                }))
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="rounded-[1.7rem] bg-[linear-gradient(160deg,_rgba(21,94,239,0.14),_rgba(13,148,136,0.12))] p-5">
          <h3 className="text-base font-semibold">Scenario output</h3>
          <div className="mt-4 grid gap-3">
            <MetricCard
              label="Gross payback"
              value={formatCurrency(grossPayback)}
              detail="Funded amount × factor rate"
            />
            <MetricCard
              label="Periodic payment"
              value={formatCurrency(periodicPayment)}
              detail={`${scenario.paymentFrequency} payment estimate`}
            />
            <MetricCard
              label="Syndication out"
              value={formatCurrency(syndicationAmount)}
              detail={formatPercent(scenario.syndicationPercent)}
            />
            <MetricCard
              label="Net broker proceeds"
              value={formatCurrency(netBrokerProceeds)}
              detail={`Commission ${formatCurrency(commissionIncome)} + points ${formatCurrency(pointsIncome)}`}
            />
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}

// ─── Imports ──────────────────────────────────────────────────────────────────

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
      copy="Upload one or more CSV exports, preview their detected shape, and merge them into the workspace. Headers are auto-detected."
      actions={
        <label className="primary-button inline-flex cursor-pointer items-center gap-2 text-sm">
          <Upload className="h-4 w-4" />
          Upload CSVs
          <input
            className="hidden"
            multiple
            accept=".csv,.tsv"
            onChange={(e) => void handleFiles(e.target.files)}
            type="file"
          />
        </label>
      }
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {previews.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-[var(--line)] bg-white/66 p-10 text-center text-sm text-[var(--muted)] xl:col-span-2">
            No files loaded yet. Upload the monthly deal sheets, funded-deal sheet, or follow-up
            export to preview them here.
          </div>
        ) : (
          previews.map((preview) => (
            <div key={preview.filename} className="rounded-[1.6rem] bg-white/76 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">{preview.filename}</h3>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {preview.rows.length} rows detected
                  </p>
                </div>
                <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  {preview.detectedType}
                </span>
              </div>
              <div className="mt-4 rounded-[1.2rem] border border-[var(--line)] bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Detected columns
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preview.headers.map((h) => (
                    <span key={h} className="pill bg-white text-[var(--foreground)]">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  className="ghost-button text-sm"
                  disabled={preview.detectedType === "unknown"}
                  onClick={() => importPreview(preview)}
                  type="button"
                >
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
