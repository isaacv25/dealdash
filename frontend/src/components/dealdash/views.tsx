"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
  calculateRateScenario,
  expectedEndDateForFundedDeal,
  followUpIsDueOnDashboard,
  fundedDealIsRenewalCandidate,
  grossPaybackFromDeal,
  HELOC_TERM_YEARS,
  isWithinDateRange,
  pipelineNeedsNewStatements,
  progressForFundedDeal,
  psfPayout,
  renewalDateForFundedDeal,
  serializeCsvRows,
  totalPayoutForFundedDeal,
} from "@/lib/dealdash";
import type { FollowUpItem, FundedDeal, FundedDealType, FundedTag, PipelineDeal, PipelineStage } from "@/lib/dealdash";
import { CalendarClock, Check, ChevronDown, Copy, Download, Eye, EyeOff, FileClock, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { useDealdash } from "./state";
import { formatCurrency, formatCalendarDate, formatDate, dateInputToIso, toDateInput } from "@/lib/dealdash/format";
import {
  calculateDeal,
  MAX_SYNDICATION_PERCENT,
  MIN_FACTOR_RATE,
  MIN_SYNDICATION_PERCENT,
  normalizeSyndicationPercent,
  termUnitForFrequency,
} from "@/lib/dealdash/finance";
import { DecimalField, PhoneField } from "./inputs";
import { FundedDealAdvancedPanel } from "./funded-deal-panel";

// ─── formatters ──────────────────────────────────────────────────────────────

const numberFormatter = new Intl.NumberFormat("en-US");
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
// Fuller "August 2026" form used for the pipeline board's month section headers.
const monthHeadingFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
function getMonthHeading(key: string) {
  if (key === "unknown") return "No date set";
  const [year, month] = key.split("-").map(Number);
  return monthHeadingFormatter.format(new Date(year, month - 1, 1));
}

// Pipeline stage keys are unchanged (stored as free strings on PipelineDeal.stage) but their labels
// match the broker's own wording. "renewal" is intentionally not offered as a pipeline stage anymore
// -- renewals are tracked on the Funded Progress / dashboard side -- but it stays defined below so a
// legacy record that still carries it renders without breaking.
const stages: Array<{ key: PipelineStage; label: string }> = [
  { key: "new-lead", label: "New Lead/Missing Statements" },
  { key: "submitted", label: "Submitted" },
  { key: "in-review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "contract-out", label: "Contracts Sent" },
  { key: "funded", label: "Funded" },
  { key: "declined", label: "Declined" },
  { key: "dead", label: "Bad Deal/Blacklisted" },
];

// Short label for compact spots (chips/cards) where the full stage name is too long.
const stageShortLabel: Record<PipelineStage, string> = {
  "new-lead": "New Lead",
  submitted: "Submitted",
  "in-review": "Pending Review",
  approved: "Approved",
  "contract-out": "Contracts Sent",
  funded: "Funded",
  declined: "Declined",
  dead: "Bad Deal",
  renewal: "Renewal",
};

// A theme-consistent accent color per pipeline stage (reuses the app's CSS variables where possible)
// so the redesigned board can dot/tint each lead by where it sits without introducing a new palette.
const pipelineStageColor: Record<PipelineStage, string> = {
  "new-lead": "var(--muted)",
  submitted: "var(--accent-strong)",
  "in-review": "var(--warn)",
  approved: "var(--accent)",
  "contract-out": "var(--accent-strong)",
  funded: "var(--success)",
  declined: "var(--danger)",
  dead: "#475569",
  renewal: "var(--accent)",
};

const fundedTagOptions: Array<{ key: FundedTag; label: string }> = [
  { key: "clawback", label: "Clawback" },
  { key: "paid-epa", label: "Paid + EPA" },
  { key: "paid-in-full", label: "Paid in full" },
  { key: "active", label: "Active" },
  { key: "commission", label: "Commission" },
  { key: "potential-renewal", label: "Potential renewal" },
];

const dealTypeOptions: Array<{ key: FundedDealType; label: string }> = [
  { key: "mca", label: "MCA" },
  { key: "heloc", label: "HELOC" },
  { key: "renewal", label: "Renewal" },
  { key: "addon", label: "Add-on" },
];

const defaultHiddenDashboardMetrics = { fundedVolume: true, grossPayback: true, commission: true, followUps: false };

function hiddenCurrency(showFinancials: boolean, value?: number) {
  return showFinancials ? formatCurrency(value) : "•••••";
}

function formatNumber(value?: number) {
  return numberFormatter.format(value || 0);
}

function getMonthKey(value?: string) {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  // Bucket by the stored UTC calendar date (dates are saved as `${YYYY-MM-DD}T00:00:00.000Z`), so a
  // lead dated the 1st of a month doesn't slip into the previous month in timezones behind UTC.
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions<T>(items: T[], getDate: (item: T) => string | undefined) {
  // Only months that actually contain records, newest first (undated last). A filter dropdown padded
  // with empty future months just looks broken -- every option here narrows to real results. New
  // future-dated records surface their own month automatically once they exist.
  const keys = new Set(items.map((item) => getMonthKey(getDate(item))));
  return Array.from(keys)
    .sort((left, right) => {
      if (left === "unknown") return 1;
      if (right === "unknown") return -1;
      return right.localeCompare(left);
    })
    .map((key) => ({ key, label: key === "unknown" ? "No date set" : getMonthHeading(key) }));
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const blob = new Blob([serializeCsvRows(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Reusable CSV export control shared by Funded Progress, Pipeline, and Follow-Ups. A button opens a
 * popover with an optional From/To calendar-date range (filtered on `dateOf`, the record's own date)
 * and a live count of matching rows; leaving both dates blank exports everything. The filename gets a
 * date-stamp (and the range, when set) so downloaded files are self-describing and don't overwrite.
 */
function ExportMenu<T>({
  filenameBase,
  rows,
  dateOf,
  dateLabel,
  headers,
  toRow,
}: {
  filenameBase: string;
  rows: T[];
  dateOf: (row: T) => string | undefined;
  dateLabel: string;
  headers: string[];
  toRow: (row: T) => string[];
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const matching = useMemo(() => rows.filter((row) => isWithinDateRange(dateOf(row), from, to)), [rows, dateOf, from, to]);

  function handleExport() {
    const stamp = todayDateInput();
    const rangePart = from || to ? `_${from || "start"}_to_${to || "end"}` : "_all";
    downloadCsv(`${filenameBase}${rangePart}_${stamp}.csv`, headers, matching.map(toRow));
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        className="ghost-button flex items-center gap-2 text-sm"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" />
        Export CSV
      </button>
      {open && (
        <>
          {/* click-away backdrop */}
          <button type="button" aria-label="Close export menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-[19rem] rounded-[1.1rem] border border-[var(--line)] bg-white p-4 shadow-[0_18px_50px_rgba(21,42,74,0.18)]">
            <p className="text-sm font-semibold">Export to CSV</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Pick a {dateLabel.toLowerCase()} range, or leave both blank to export everything.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                From
                <input className="field text-sm font-normal normal-case" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                To
                <input className="field text-sm font-normal normal-case" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {(from || to) && (
              <button type="button" className="mt-2 text-xs text-[var(--accent-strong)] hover:underline" onClick={() => { setFrom(""); setTo(""); }}>
                Clear range (export all)
              </button>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--muted)]">
                {matching.length} of {rows.length} {rows.length === 1 ? "row" : "rows"}
              </span>
              <button
                className="primary-button text-sm disabled:opacity-50"
                onClick={handleExport}
                disabled={matching.length === 0}
                type="button"
              >
                Download{matching.length ? ` (${matching.length})` : ""}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── shared UI primitives ─────────────────────────────────────────────────────

/**
 * Page-level section wrapper. Eyebrow + title are intentionally compact —
 * the heading used to be text-3xl which read as oversized at this density.
 * Exported so other view files (e.g. import-mapping.tsx) can reuse it for a consistent look.
 */
export function SectionFrame({
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
  hidden,
  onToggleVisibility,
}: Readonly<{
  label: string;
  value: string;
  detail: string;
  hidden?: boolean;
  onToggleVisibility?: () => void;
}>) {
  return (
    <div className="rounded-[1.15rem] border border-white/80 bg-[var(--card-strong)] p-5 shadow-[0_16px_38px_rgba(21,42,74,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        {onToggleVisibility && (
          <button
            aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
            className="icon-button"
            onClick={onToggleVisibility}
            title={hidden ? `Show ${label}` : `Hide ${label}`}
            type="button"
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <p className="mt-2 min-h-[2.25rem] text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

/**
 * Visual progress bar for a funded deal.
 * percent: 0–100
 */
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

function CommissionBadge({ status }: { status: FundedDeal["commissionStatus"] }) {
  const config = {
    pending: { tone: "bg-white text-[var(--foreground)]", label: "Commission Pending" },
    "paid-out": { tone: "bg-[var(--success)]/12 text-[var(--success)]", label: "Commission Paid Out" },
    clawback: { tone: "bg-[var(--danger)]/12 text-[var(--danger)]", label: "Commission Clawback" },
  }[status];

  return <span className={`pill ${config.tone}`}>{config.label}</span>;
}

/**
 * Deterministic funded-deal tags. Rules (in strict priority order):
 *   1. Clawback -- exclusive: shows ONLY "Clawback", card is RED.
 *   2. Paid + EPA -- exclusive: shows ONLY "Paid + EPA", card is GREEN.
 *   3. Paid in full (schedule ran out) -- "Paid in full" replaces "Active", card is GREEN. Commission
 *      tag can still show alongside if commission is paid out.
 *   4. Otherwise the deal is Active. "Active" tag is always on. If the renewal date has arrived,
 *      "Potential renewal" also on and the card turns YELLOW (else BLUE). Commission tag can show.
 *
 * The "Commission" tag is orthogonal to card color -- it shows whenever commission is paid out
 * (either via the CommissionStatus dropdown or by manually toggling the Commission tag), unless
 * one of the exclusive states above is active.
 *
 * Manual `fundedTags` (from the tag toggles at the bottom of the card) let a broker force any state,
 * so the derived rules and the manual overrides intentionally use OR everywhere.
 */
function tagsForFundedDeal(deal: FundedDeal): FundedTag[] {
  const manual = new Set<FundedTag>(deal.fundedTags || []);
  const raw = `${deal.statusRaw} ${deal.notes}`.toLowerCase();

  // Exclusive states, in priority order -- return early, tag list is JUST this one tag.
  if (deal.statusStage === "clawback" || deal.commissionStatus === "clawback" || manual.has("clawback") || raw.includes("clawback")) {
    return ["clawback"];
  }
  if (manual.has("paid-epa") || raw.includes("epa")) {
    return ["paid-epa"];
  }

  const progress = progressForFundedDeal(deal);
  const commissionPaid = deal.commissionStatus === "paid-out" || manual.has("commission");
  const paidInFull = manual.has("paid-in-full") || (progress.totalPeriods > 0 && progress.paymentsRemaining === 0);

  if (paidInFull) {
    return commissionPaid ? ["paid-in-full", "commission"] : ["paid-in-full"];
  }

  // Active state. Potential renewal switches on the moment the renewal date has arrived, not 60 days
  // out -- brokers pitch the renewal at that midpoint, so that's when the card should turn yellow.
  const renewalDate = renewalDateForFundedDeal(deal);
  const pastRenewal = manual.has("potential-renewal") || (renewalDate ? Date.now() >= new Date(renewalDate).getTime() : false);
  const result: FundedTag[] = ["active"];
  if (pastRenewal) result.push("potential-renewal");
  if (commissionPaid) result.push("commission");
  return result;
}

function fundedTintClass(tags: FundedTag[]) {
  // Card color follows the same exclusive-then-priority order as tagsForFundedDeal itself.
  if (tags.includes("clawback")) return "border-red-200 bg-red-50/88";
  if (tags.includes("paid-epa")) return "border-emerald-200 bg-emerald-50/88";
  if (tags.includes("paid-in-full")) return "border-emerald-200 bg-emerald-50/88";
  if (tags.includes("potential-renewal")) return "border-amber-200 bg-amber-50/88";
  if (tags.includes("active")) return "border-blue-200 bg-blue-50/88";
  return "border-white/80 bg-white/80";
}

function tagBadgeClass(tag: FundedTag) {
  if (tag === "clawback") return "bg-red-100 text-red-700";
  if (tag === "paid-in-full") return "bg-emerald-100 text-emerald-700";
  if (tag === "paid-epa") return "bg-emerald-100 text-emerald-700";
  if (tag === "active") return "bg-blue-100 text-blue-700";
  if (tag === "commission") return "bg-emerald-100 text-emerald-700";
  return "bg-amber-100 text-amber-700"; // potential-renewal
}

function toggleFundedTag(tags: FundedTag[], tag: FundedTag) {
  return tags.includes(tag) ? tags.filter((current) => current !== tag) : [...tags, tag];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardView() {
  const { data, showFinancials, updateFollowUp, updateFundedDeal, updatePipelineDeal } = useDealdash();
  const [today] = useState(() => Date.now());
  const [hiddenMetrics, setHiddenMetrics] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return showFinancials ? {} : defaultHiddenDashboardMetrics;
    }
    const saved = window.localStorage.getItem("dealdash.dashboard.hiddenMetrics");
    if (!saved) {
      return showFinancials ? {} : defaultHiddenDashboardMetrics;
    }
    try {
      return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  function toggleMetricVisibility(key: string) {
    setHiddenMetrics((current) => {
      const next = { ...current, [key]: !current[key] };
      // Only booleans are stored; actual financial values stay in app state/database.
      window.localStorage.setItem("dealdash.dashboard.hiddenMetrics", JSON.stringify(next));
      return next;
    });
  }

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
    return {
      fundedVolume,
      commission,
      grossPayback,
      remaining,
      fundedCount: data.fundedDeals.length,
      pipelineCount: data.pipelineDeals.length,
      followUpCount: data.followUps.filter((item) => !item.completed).length,
    };
  }, [data]);

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

  // ── Dashboard quick-view reminder lists (all shareable predicates live in calculations.ts) ──
  const now = useMemo(() => new Date(today), [today]);

  // Follow-ups that have sat ~a month since being added and haven't been acknowledged off the board.
  const dueFollowUps = useMemo(
    () =>
      data.followUps
        .filter((item) => followUpIsDueOnDashboard(item, now))
        .sort((l, r) => (l.createdAt || "").localeCompare(r.createdAt || "")),
    [data.followUps, now],
  );

  // Funded deals 35%+ paid down -- prime renewal pitches -- not yet dismissed.
  const upcomingRenewals = useMemo(
    () =>
      data.fundedDeals
        .filter((deal) => fundedDealIsRenewalCandidate(deal, now))
        .sort((l, r) => progressForFundedDeal(r, now).progressPercent - progressForFundedDeal(l, now).progressPercent),
    [data.fundedDeals, now],
  );

  // Pipeline leads that rolled into a new month and need fresh statements (bad deals excluded).
  const needNewStatements = useMemo(
    () =>
      data.pipelineDeals
        .filter((deal) => pipelineNeedsNewStatements(deal, now))
        .sort((l, r) => (l.submittedDate || "").localeCompare(r.submittedDate || "")),
    [data.pipelineDeals, now],
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
          value={hiddenCurrency(!hiddenMetrics.fundedVolume, metrics.fundedVolume)}
          detail={`${metrics.fundedCount} funded files on the board`}
          hidden={Boolean(hiddenMetrics.fundedVolume)}
          onToggleVisibility={() => toggleMetricVisibility("fundedVolume")}
        />
        <MetricCard
          label="Gross Payback"
          value={hiddenCurrency(!hiddenMetrics.grossPayback, metrics.grossPayback)}
          detail={!hiddenMetrics.grossPayback ? `Remaining balance ${formatCurrency(metrics.remaining)}` : "Remaining balance hidden"}
          hidden={Boolean(hiddenMetrics.grossPayback)}
          onToggleVisibility={() => toggleMetricVisibility("grossPayback")}
        />
        <MetricCard
          label="Commission Book"
          value={hiddenCurrency(!hiddenMetrics.commission, metrics.commission)}
          detail={`${upcomingRenewals.length} renewals ready`}
          hidden={Boolean(hiddenMetrics.commission)}
          onToggleVisibility={() => toggleMetricVisibility("commission")}
        />
        <MetricCard
          label="Open Follow-Ups"
          value={hiddenMetrics.followUps ? "•••••" : formatNumber(metrics.followUpCount)}
          detail={`${metrics.pipelineCount} active pipeline records`}
          hidden={Boolean(hiddenMetrics.followUps)}
          onToggleVisibility={() => toggleMetricVisibility("followUps")}
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

      {/* Three quick-view reminder rails. Each item is dismissible; empty rails show an all-clear. */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReminderRail
          icon={<CalendarClock className="h-4 w-4 text-[var(--accent-strong)]" />}
          title="Upcoming follow-ups"
          count={dueFollowUps.length}
          emptyLabel="No follow-ups are due right now."
        >
          {dueFollowUps.map((item) => (
            <ReminderItem
              key={item.id}
              title={item.businessName || item.contactName || "Follow-up"}
              subtitle={item.contactName}
              badge={item.createdAt ? `Added ${formatDate(item.createdAt)}` : undefined}
              detail={item.notes || item.requestLabel || undefined}
              actionLabel="Acknowledge"
              actionIcon={<Check className="h-3.5 w-3.5" />}
              onAction={() => updateFollowUp(item.id, { dashboardAckAt: new Date().toISOString() })}
            />
          ))}
        </ReminderRail>

        <ReminderRail
          icon={<RefreshCcw className="h-4 w-4 text-[var(--success)]" />}
          title="Upcoming renewals"
          count={upcomingRenewals.length}
          emptyLabel="No deals are far enough along to renew yet."
        >
          {upcomingRenewals.map((deal) => {
            const pct = progressForFundedDeal(deal, now).progressPercent;
            return (
              <ReminderItem
                key={deal.id}
                title={deal.businessName || "Funded deal"}
                subtitle={[deal.contactName, deal.funder].filter(Boolean).join(" · ") || undefined}
                badge={`${pct}% paid`}
                badgeClass="bg-[var(--success)]/12 text-[var(--success)]"
                detail={renewalDateForFundedDeal(deal) ? `Renewal target ${formatDate(renewalDateForFundedDeal(deal))}` : undefined}
                actionLabel="Dismiss"
                actionIcon={<X className="h-3.5 w-3.5" />}
                onAction={() => updateFundedDeal(deal.id, { renewalAckAt: new Date().toISOString() })}
              />
            );
          })}
        </ReminderRail>

        <ReminderRail
          icon={<FileClock className="h-4 w-4 text-[var(--warn)]" />}
          title="Need new statements"
          count={needNewStatements.length}
          emptyLabel="Every active lead has current statements."
        >
          {needNewStatements.map((deal) => (
            <ReminderItem
              key={deal.id}
              title={deal.businessName || deal.contactName || "Lead"}
              subtitle={deal.contactName}
              badge={deal.submittedDate ? `Since ${getMonthHeading(getMonthKey(deal.submittedDate))}` : undefined}
              badgeClass="bg-[var(--warn)]/12 text-[var(--warn)]"
              detail={stageShortLabel[deal.stage]}
              actionLabel="Got statements"
              actionIcon={<Check className="h-3.5 w-3.5" />}
              onAction={() => updatePipelineDeal(deal.id, { statementsAckAt: new Date().toISOString() })}
            />
          ))}
        </ReminderRail>
      </div>
    </SectionFrame>
  );
}

/** A titled, scrollable list rail for a dashboard reminder section, with a count and empty state. */
function ReminderRail({
  icon,
  title,
  count,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  // min-w-0: as a grid item this rail defaults to min-width:auto and would size to its widest
  // child, so the truncating rows below compute against max-content and overflow the viewport on
  // mobile. min-w-0 lets the rail shrink to its grid track so truncation takes effect.
  return (
    <div className="flex min-w-0 flex-col rounded-[1.6rem] bg-white/76 p-5">
      <div className="mb-3 flex items-center gap-2.5">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="pill ml-auto bg-[var(--accent-soft)] text-xs text-[var(--accent-strong)]">{count}</span>
      </div>
      {count === 0 ? (
        <p className="rounded-[1.15rem] border border-dashed border-[var(--line)] p-4 text-center text-xs text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">{children}</div>
      )}
    </div>
  );
}

/** One dismissible reminder row shared across all three dashboard rails. */
function ReminderItem({
  title,
  subtitle,
  badge,
  badgeClass = "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  detail,
  actionLabel,
  actionIcon,
  onAction,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeClass?: string;
  detail?: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
}) {
  return (
    <div className="dd-rise rounded-[1.15rem] border border-[var(--line)] bg-white/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {badge && <span className={`pill shrink-0 text-[11px] ${badgeClass}`}>{badge}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">{detail || ""}</p>
        <button
          type="button"
          onClick={onAction}
          title={actionLabel}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--accent-strong)]/30 hover:bg-white hover:text-[var(--accent-strong)]"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Funded Progress ──────────────────────────────────────────────────────────

/** Labeled input used inside the funded deal card grid. */
function DealField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

export function FundedProgressView() {
  // update/delete now live inside FundedDealCard; this view only adds deals and reads the list.
  const { data, addFundedDeal } = useDealdash();
  const [query, setQuery] = useState("");
  const [activeMonth, setActiveMonth] = useState("all");
  const [newFundedDate, setNewFundedDate] = useState(todayDateInput());
  const [activeTags, setActiveTags] = useState<Set<FundedTag>>(new Set());
  const deferredQuery = useDeferredValue(query);
  const monthOptions = useMemo(
    () => buildMonthOptions(data.fundedDeals, (deal) => deal.fundedDate),
    [data.fundedDeals],
  );

  const monthAndQueryFilteredDeals = useMemo(
    () =>
      data.fundedDeals.filter((deal) => {
        const matchesMonth = activeMonth === "all" || getMonthKey(deal.fundedDate) === activeMonth;
        const matchesQuery = [deal.businessName, deal.contactName, deal.funder, deal.statusRaw]
          .join(" ")
          .toLowerCase()
          .includes(deferredQuery.toLowerCase());
        return matchesMonth && matchesQuery;
      }),
    [data.fundedDeals, deferredQuery, activeMonth],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<FundedTag, number>();
    for (const deal of monthAndQueryFilteredDeals) {
      for (const tag of tagsForFundedDeal(deal)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [monthAndQueryFilteredDeals]);

  const filteredDeals = useMemo(
    () =>
      monthAndQueryFilteredDeals.filter((deal) => {
        const dealTags = tagsForFundedDeal(deal);
        return activeTags.size === 0 || Array.from(activeTags).every((tag) => dealTags.includes(tag));
      }),
    [monthAndQueryFilteredDeals, activeTags],
  );

  function toggleActiveTag(tag: FundedTag) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <SectionFrame
      eyebrow="Funded Deal Progress"
      title="Active files & payback tracker"
      copy="Every economic lever is editable inline. Deal servicing stays separate from commission payout status so the funded board mirrors your sheet correctly."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search funded deals..."
          />
          <select
            className="field max-h-64 min-w-[180px] text-sm"
            value={activeMonth}
            onChange={(e) => setActiveMonth(e.target.value)}
          >
            <option value="all">All months</option>
            {monthOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Funded date
            <input
              className="field min-w-[150px] text-sm"
              type="date"
              value={newFundedDate}
              onChange={(e) => setNewFundedDate(e.target.value)}
            />
          </label>
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() => addFundedDeal(dateInputToIso(newFundedDate))}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Deal
          </button>
          <ExportMenu
            filenameBase="dealdash-funded-progress"
            rows={data.fundedDeals}
            dateOf={(deal) => deal.fundedDate}
            dateLabel="Funded date"
            headers={["Deal Type", "Business", "Contact", "Phone", "Email", "Funder", "Funded Date", "Funded", "Rate", "Term", "Freq", "Payment", "House Pts%", "Broker Split%", "Commission$", "PSF$", "Total Payout", "Payback", "Balance", "Status", "Commission Status"]}
            toRow={(deal) => {
              const progress = progressForFundedDeal(deal);
              return [
                deal.dealType,
                deal.businessName, deal.contactName, deal.phone || "", deal.email || "", deal.funder || "",
                deal.fundedDate ? deal.fundedDate.slice(0, 10) : "",
                String(deal.fundedAmount), String(deal.factorRate),
                `${deal.termValue} ${deal.termUnit}`, deal.paymentFrequency,
                String(deal.paymentAmount),
                `${(deal.housePointsPercent * 100).toFixed(1)}%`,
                `${(deal.commissionPercent * 100).toFixed(1)}%`,
                String(deal.commissionAmount),
                String(deal.psfAmount),
                String(totalPayoutForFundedDeal(deal)),
                String(grossPaybackFromDeal(deal)),
                String(progress.balanceRemaining),
                deal.statusRaw,
                deal.commissionStatus,
              ];
            }}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter funded deals by tag"
        >
          {fundedTagOptions.map((tag) => {
            const selected = activeTags.has(tag.key);
            const count = tagCounts.get(tag.key) ?? 0;
            return (
              <button
                key={tag.key}
                className={`pill gap-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] ${
                  selected ? tagBadgeClass(tag.key) : "bg-white/72 text-[var(--muted)] hover:bg-white"
                }`}
                onClick={() => toggleActiveTag(tag.key)}
                type="button"
                aria-pressed={selected}
                aria-label={`${tag.label} (${count} deal${count === 1 ? "" : "s"})`}
              >
                {tag.label}
                {count > 0 && <span className="text-[10px] opacity-70">{count}</span>}
              </button>
            );
          })}
          {(activeTags.size > 0 || activeMonth !== "all" || query) && (
            <button
              className="ghost-button px-3 py-1.5 text-xs"
              onClick={() => {
                setActiveTags(new Set());
                setActiveMonth("all");
                setQuery("");
              }}
              type="button"
              aria-label="Clear all filters"
            >
              Clear filters
            </button>
          )}
        </div>
        {filteredDeals.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--muted)]">No funded deals match your search.</p>
        )}
        {filteredDeals.map((deal, index) => (
          <FundedDealCard key={deal.id} deal={deal} index={index} allDeals={data.fundedDeals} />
        ))}
      </div>
    </SectionFrame>
  );
}

/**
 * A single funded deal. Collapsed by default it shows an at-a-glance summary (badges, name, funder,
 * funded amount, remaining balance) plus the always-visible payback progress bar; clicking the
 * header expands the full inline editor and the advanced servicing panel with a smooth height
 * animation. All numeric fields use DecimalField (a free-typing text box) rather than a spinner
 * <input type="number">, so values like 7.45 or 10.4 can be typed directly without the control
 * reformatting mid-keystroke.
 */
function FundedDealCard({ deal, index, allDeals }: { deal: FundedDeal; index: number; allDeals: FundedDeal[] }) {
  const { updateFundedDeal, deleteFundedDeal } = useDealdash();
  const [open, setOpen] = useState(false);
  // Detail (inputs + advanced servicing panel) stays unmounted until first expanded so a board of
  // many deals doesn't mount every editor and schedule panel up front, and collapsed cards don't
  // leave hidden-but-tabbable form controls in the tab order.
  const [everOpened, setEverOpened] = useState(false);

  const tags = tagsForFundedDeal(deal);
  const progress = progressForFundedDeal(deal);
  const renewalDate = renewalDateForFundedDeal(deal);
  const endDate = expectedEndDateForFundedDeal(deal);
  const houseAmt = deal.fundedAmount * deal.housePointsPercent;
  const payback = grossPaybackFromDeal(deal);
  const balance = deal.balanceOverrideAmount ?? deal.manualBalanceRemaining ?? progress.balanceRemaining;

  /**
   * Central handler for the Deal Economics + Commission Model fields. Recalculates commission $
   * (from funded amount / house pts % / broker split %) exactly as before, and now also recalculates
   * the scheduled Payment $ (from funded amount / factor rate / term / frequency) using the same
   * calculateDeal math the Advanced panel's "Recalculate schedule" already applies -- so Payment $
   * auto-fills live in Deal Economics instead of requiring that separate manual step. HELOC payment
   * is derived server-side (deriveHelocFields) and left untouched here.
   */
  function updateDealEconomics(patch: Partial<FundedDeal>) {
    const nextDeal = { ...deal, ...patch };
    const derived: Partial<FundedDeal> = {};

    const commissionInputsChanged = "housePointsPercent" in patch || "commissionPercent" in patch || "fundedAmount" in patch;
    if (commissionInputsChanged && nextDeal.housePointsPercent > 0) {
      derived.commissionAmount = nextDeal.fundedAmount * nextDeal.housePointsPercent * nextDeal.commissionPercent;
    }

    const paymentInputsChanged =
      "fundedAmount" in patch || "factorRate" in patch || "termValue" in patch || "paymentFrequency" in patch;
    if (paymentInputsChanged && nextDeal.dealType !== "heloc" && nextDeal.factorRate >= MIN_FACTOR_RATE && nextDeal.termValue > 0) {
      const calc = calculateDeal({
        fundedAmount: nextDeal.fundedAmount,
        factorRate: nextDeal.factorRate,
        termValue: nextDeal.termValue,
        paymentFrequency: nextDeal.paymentFrequency,
        syndicationPercent: nextDeal.syndicationPercent * 100,
      });
      derived.paymentAmount = calc.scheduledPaymentDollars;
    }

    updateFundedDeal(deal.id, { ...patch, ...derived });
  }

  const progressFillClass =
    deal.statusStage === "paid-out" ? "bg-[var(--success)]"
    : deal.statusStage === "clawback" ? "bg-[var(--danger)]"
    : deal.statusStage === "slow-pay" ? "bg-[var(--warn)]"
    : "bg-[var(--accent-strong)]";

  return (
    <article
      className={`dd-rise dd-hover-lift overflow-hidden rounded-[1.75rem] border shadow-[0_8px_32px_rgba(21,42,74,0.07)] ${fundedTintClass(tags)}`}
      // Stagger the entrance a touch per row (capped) so the list cascades in instead of popping.
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      {/* ── Summary header (click to expand) ── */}
      <div className="flex items-start gap-3 px-5 pt-5">
        <button
          type="button"
          className="flex flex-1 min-w-0 items-start gap-3 text-left"
          aria-expanded={open}
          onClick={() => {
            setOpen((prev) => !prev);
            setEverOpened(true);
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge stage={deal.statusStage} />
              <CommissionBadge status={deal.commissionStatus} />
              {tags.map((tag) => (
                <span key={tag} className={`pill text-xs ${tagBadgeClass(tag)}`}>
                  {fundedTagOptions.find((option) => option.key === tag)?.label ?? tag}
                </span>
              ))}
            </div>
            <p className="mt-2 truncate text-base font-semibold">{deal.businessName || "Untitled deal"}</p>
            <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
              {[deal.contactName, deal.funder, deal.fundedDate ? formatDate(deal.fundedDate) : null]
                .filter(Boolean)
                .join(" · ") || "No contact details yet"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold">{formatCurrency(deal.fundedAmount)}</p>
            <p className="text-xs text-[var(--muted)]">{formatCurrency(balance)} left</p>
          </div>
          <ChevronDown className="dd-chevron mt-1 h-5 w-5 shrink-0 text-[var(--muted)]" data-open={open} />
        </button>
        <button
          className="delete-button mt-1 shrink-0"
          onClick={() => {
            if (confirm(`Move ${deal.businessName || "this funded deal"} to Trash? You can restore it for 30 days.`)) {
              deleteFundedDeal(deal.id);
            }
          }}
          title="Delete deal"
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Payback progress (always visible) ── */}
      <div className="px-5 pt-4 pb-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Payback Progress</span>
          <span className="text-xs text-[var(--muted)]">
            {`${formatCurrency(balance)} remaining of ${formatCurrency(payback > 0 ? payback : deal.fundedAmount)}`}
          </span>
        </div>
        <div className="progress-track" style={{ height: "10px" }}>
          <div className={`progress-fill h-full ${progressFillClass}`} style={{ width: `${Math.min(100, progress.progressPercent)}%` }} />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          <span>
            {progress.totalPeriods > 0
              ? `${progress.completedPeriods} of ${progress.totalPeriods} payments complete - ${progress.paymentsRemaining} remaining`
              : `${progress.progressPercent}% paid`}
          </span>
          {endDate && (
            <span className="inline-flex items-center gap-1 font-medium">
              <CalendarClock className="h-3.5 w-3.5" />
              {deal.scheduleEndDate ? "Ends" : "Est. end"} {formatCalendarDate(endDate)}
            </span>
          )}
        </div>
      </div>

      {/* ── Expandable detail (lazy-mounted on first open) ── */}
      <div className="dd-collapse" data-open={open}>
        <div className="dd-collapse-inner">
          {everOpened && (
          <>
          <div className="border-t border-[var(--line)] px-5 pt-4">
            {/* Identity (editable) */}
            <div className="grid gap-3 sm:grid-cols-4">
              <DealField label="Deal Type">
                <select
                  className="field w-full text-sm"
                  value={deal.dealType}
                  onChange={(e) => updateFundedDeal(deal.id, { dealType: e.target.value as FundedDealType })}
                >
                  {dealTypeOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </DealField>
              <DealField label="Business Name">
                <input
                  className="field w-full text-sm font-semibold"
                  value={deal.businessName}
                  onChange={(e) => updateFundedDeal(deal.id, { businessName: e.target.value })}
                  placeholder="Business name"
                />
              </DealField>
              <DealField label="Contact Name">
                <input
                  className="field w-full text-sm"
                  value={deal.contactName}
                  onChange={(e) => updateFundedDeal(deal.id, { contactName: e.target.value })}
                  placeholder="Contact name"
                />
              </DealField>
              <DealField label="Funder">
                <input
                  className="field w-full text-sm"
                  value={deal.funder || ""}
                  onChange={(e) => updateFundedDeal(deal.id, { funder: e.target.value })}
                  placeholder="Funder"
                />
              </DealField>
              <DealField label="Phone">
                <PhoneField
                  value={deal.phone || ""}
                  onChange={(next) => updateFundedDeal(deal.id, { phone: next })}
                  className="w-full"
                  ariaLabel={`Phone for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label="Email">
                <input
                  className="field w-full text-sm"
                  value={deal.email || ""}
                  onChange={(e) => updateFundedDeal(deal.id, { email: e.target.value })}
                  placeholder="Email"
                  type="email"
                />
              </DealField>
            </div>

            {/* Renewal/Add-on: link back to the original MCA deal so a client's history is traceable */}
            {(deal.dealType === "renewal" || deal.dealType === "addon") && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DealField label={deal.dealType === "renewal" ? "Renewal of" : "Stacked on top of"}>
                  <select
                    className="field w-full text-sm"
                    value={deal.relatedDealId || ""}
                    onChange={(e) => {
                      const relatedDealId = e.target.value || undefined;
                      // Auto-fill business/contact/phone/email from the linked original -- a renewal or
                      // add-on is by definition the *same client*, so re-typing that info is busywork.
                      // Only fills *empty* fields so existing edits are never clobbered; each field
                      // stays editable, so the broker can still adjust anything after the auto-fill.
                      const linked = relatedDealId ? allDeals.find((d) => d.id === relatedDealId) : null;
                      const autofill: Partial<FundedDeal> = {};
                      if (linked) {
                        if (!deal.businessName && linked.businessName) autofill.businessName = linked.businessName;
                        if (!deal.contactName && linked.contactName) autofill.contactName = linked.contactName;
                        if (!deal.phone && linked.phone) autofill.phone = linked.phone;
                        if (!deal.email && linked.email) autofill.email = linked.email;
                      }
                      updateFundedDeal(deal.id, { relatedDealId, ...autofill });
                      // A renewal pays off the original deal's balance, so linking one marks that
                      // original deal fully repaid -- the same scheduleCompletedAt/statusStage the
                      // cron poster sets when a normal schedule finishes naturally (schedule-service.ts).
                      // Add-ons stack on top rather than paying anything off, so this only applies to
                      // dealType "renewal". Only fires forward (on picking a link), never on clearing
                      // or switching one, so it can't silently undo a deal's real repayment state.
                      if (deal.dealType === "renewal" && relatedDealId) {
                        updateFundedDeal(relatedDealId, { scheduleCompletedAt: new Date().toISOString(), statusStage: "paid-out" });
                      }
                    }}
                  >
                    <option value="">— Not linked —</option>
                    {allDeals
                      .filter((candidate) => candidate.id !== deal.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.businessName || "Untitled deal"}
                          {candidate.fundedDate ? ` (${formatDate(candidate.fundedDate)})` : ""}
                        </option>
                      ))}
                  </select>
                </DealField>
              </div>
            )}
          </div>

          {/* Deal economics -- HELOC prices on Amount/APR/Term-years; every other deal type prices on
              the MCA factor-rate shape. See deriveHelocFields (finance.ts) for how a HELOC's
              factorRate/termValue/paymentFrequency/paymentAmount below get computed server-side. */}
          <div className="px-5 pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Deal Economics</p>
            {deal.dealType === "heloc" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <DealField label="Amount">
                  <DecimalField
                    value={deal.fundedAmount}
                    onCommit={(next) => updateDealEconomics({ fundedAmount: next })}
                    suffix="$"
                    min={0}
                    placeholder="0"
                    ariaLabel={`HELOC amount for ${deal.businessName || "deal"}`}
                  />
                </DealField>
                <DealField label="APR %">
                  <DecimalField
                    value={deal.aprPercent || 0}
                    onCommit={(next) => updateFundedDeal(deal.id, { aprPercent: next })}
                    suffix="%"
                    min={0}
                    decimals={3}
                    placeholder="e.g. 7.5"
                    ariaLabel={`APR for ${deal.businessName || "deal"}`}
                  />
                </DealField>
                <DealField label="Term (years)">
                  <select
                    className="field w-full text-sm"
                    value={deal.termYears || ""}
                    onChange={(e) => updateFundedDeal(deal.id, { termYears: Number(e.target.value) })}
                  >
                    <option value="" disabled>
                      Select...
                    </option>
                    {HELOC_TERM_YEARS.map((years) => (
                      <option key={years} value={years}>
                        {years} years
                      </option>
                    ))}
                  </select>
                </DealField>
                <DealField label="Monthly Payment (derived)">
                  <div className="field flex w-full items-center bg-white/60 text-sm font-semibold text-[var(--muted)]">
                    {deal.paymentAmount > 0 ? formatCurrency(deal.paymentAmount) : "Set amount, APR, and term"}
                  </div>
                </DealField>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <DealField label="Funded $">
                  <DecimalField
                    value={deal.fundedAmount}
                    onCommit={(next) => updateDealEconomics({ fundedAmount: next })}
                    suffix="$"
                    min={0}
                    placeholder="0"
                    ariaLabel={`Funded amount for ${deal.businessName || "deal"}`}
                  />
                </DealField>
                <DealField label="Factor Rate">
                  <DecimalField
                    value={deal.factorRate}
                    onCommit={(next) => updateDealEconomics({ factorRate: next })}
                    min={0}
                    decimals={4}
                    placeholder="1.35"
                    ariaLabel={`Factor rate for ${deal.businessName || "deal"}`}
                  />
                </DealField>
                <DealField label="Frequency">
                  <select
                    className="field w-full text-sm"
                    value={deal.paymentFrequency}
                    onChange={(e) => {
                      const frequency = e.target.value as FundedDeal["paymentFrequency"];
                      // Term unit always tracks payment frequency so a mismatched pair (e.g. "weekly"
                      // payments over a "months" term) can never be saved.
                      updateDealEconomics({ paymentFrequency: frequency, termUnit: termUnitForFrequency(frequency) });
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </DealField>
                <DealField label={`Term (${termUnitForFrequency(deal.paymentFrequency)})`}>
                  <input
                    className="field w-full text-sm"
                    type="number"
                    min={1}
                    step={1}
                    value={deal.termValue || ""}
                    onChange={(e) => updateDealEconomics({ termValue: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                    placeholder="0"
                  />
                </DealField>
                <DealField label="Payment $">
                  <DecimalField
                    value={deal.paymentAmount}
                    onCommit={(next) => updateFundedDeal(deal.id, { paymentAmount: next })}
                    suffix="$"
                    min={0}
                    placeholder="0"
                    ariaLabel={`Payment amount for ${deal.businessName || "deal"} (auto-calculated from funded amount, factor rate, and term -- edit to override)`}
                  />
                </DealField>
              </div>
            )}
          </div>

          {/* Commission model -- PSF (Processing/Service Fee) applies across every deal type, paid
              out at the same broker split % as commission. Total Payout = Commission $ + PSF payout. */}
          <div className="px-5 pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Commission Model</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <DealField label="House Pts %">
                <DecimalField
                  value={deal.housePointsPercent * 100}
                  onCommit={(next) => updateDealEconomics({ housePointsPercent: next / 100 })}
                  suffix="%"
                  min={0}
                  placeholder="e.g. 9"
                  ariaLabel={`House points percent for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label={`House Pts $ ${houseAmt > 0 ? `(${formatCurrency(houseAmt)})` : ""}`}>
                <div className="field flex w-full items-center border-[var(--accent-strong)]/20 bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-strong)]">
                  {houseAmt > 0 ? formatCurrency(houseAmt) : <span className="font-normal text-[var(--muted)]">Set house pts %</span>}
                </div>
              </DealField>
              <DealField label="Broker Split %">
                <DecimalField
                  value={deal.commissionPercent * 100}
                  onCommit={(next) => updateDealEconomics({ commissionPercent: next / 100 })}
                  suffix="%"
                  min={0}
                  placeholder="e.g. 30"
                  ariaLabel={`Broker split percent for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label="Commission $">
                <DecimalField
                  value={deal.commissionAmount}
                  onCommit={(next) => updateFundedDeal(deal.id, { commissionAmount: next })}
                  suffix="$"
                  min={0}
                  placeholder="0"
                  ariaLabel={`Commission amount for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label="PSF $">
                <DecimalField
                  value={deal.psfAmount}
                  onCommit={(next) => updateFundedDeal(deal.id, { psfAmount: next })}
                  suffix="$"
                  min={0}
                  placeholder="0"
                  ariaLabel={`PSF amount for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label="Total Payout">
                <div className="field flex w-full items-center border-[var(--success)]/25 bg-[var(--success)]/10 text-sm font-semibold text-[var(--success)]">
                  {formatCurrency(totalPayoutForFundedDeal(deal))}
                </div>
              </DealField>
            </div>
            {deal.psfAmount > 0 && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                PSF payout: {formatCurrency(psfPayout(deal))} ({formatCurrency(deal.psfAmount)} PSF x {(deal.commissionPercent * 100).toFixed(0)}% broker split)
              </p>
            )}
          </div>

          {/* Additional */}
          <div className="px-5 pt-4 pb-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Additional</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DealField label="Funded Date">
                <input
                  className="field w-full text-sm"
                  type="date"
                  value={toDateInput(deal.fundedDate)}
                  onChange={(e) => updateFundedDeal(deal.id, { fundedDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })}
                />
              </DealField>
              {/* First Payment Date: overrides the default "collection starts the day after funding
                  (a week out for weekly)" anchor for deals a funder actually pulled on a different
                  date. For weekly deals, setting a date also sets the payment weekday to that date's
                  day-of-week, so "first pull was Thursday Aug 6" means Thursdays going forward. Use
                  Recalculate schedule after changing it to rebuild the dates. */}
              <DealField label="First Payment Date">
                <input
                  className="field w-full text-sm"
                  type="date"
                  value={toDateInput(deal.firstPaymentDate)}
                  onChange={(e) => {
                    const iso = e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined;
                    updateFundedDeal(deal.id, {
                      firstPaymentDate: iso,
                      ...(iso && deal.paymentFrequency === "weekly" ? { paymentWeekday: new Date(iso).getUTCDay() } : {}),
                    });
                  }}
                />
              </DealField>
              <DealField label="Synd %">
                <DecimalField
                  value={deal.syndicationPercent * 100}
                  onCommit={(next) => updateFundedDeal(deal.id, { syndicationPercent: normalizeSyndicationPercent(next) })}
                  suffix="%"
                  min={MIN_SYNDICATION_PERCENT}
                  max={MAX_SYNDICATION_PERCENT}
                  placeholder="0"
                  ariaLabel={`Syndication percent for ${deal.businessName || "deal"}`}
                />
              </DealField>
              <DealField label="Renewal Date">
                <input
                  className="field w-full text-sm"
                  type="date"
                  value={toDateInput(renewalDate)}
                  onChange={(e) => updateFundedDeal(deal.id, { manualRenewalDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })}
                />
              </DealField>
              <DealField label={deal.scheduleEndDate ? "Expected End Date" : "Expected End Date (est.)"}>
                <div className="field flex w-full items-center bg-white/60 text-sm text-[var(--foreground)]">
                  {endDate ? formatCalendarDate(endDate) : <span className="text-[var(--muted)]">Set amount, rate & term</span>}
                </div>
              </DealField>
              <DealField label="Commission Status">
                <select
                  className="field w-full text-sm"
                  value={deal.commissionStatus}
                  onChange={(e) => updateFundedDeal(deal.id, { commissionStatus: e.target.value as FundedDeal["commissionStatus"] })}
                >
                  <option value="pending">Pending</option>
                  <option value="paid-out">Paid Out</option>
                  <option value="clawback">Clawback</option>
                </select>
              </DealField>
              <DealField label="Notes">
                <input
                  className="field w-full text-sm"
                  value={deal.notes}
                  onChange={(e) => updateFundedDeal(deal.id, { notes: e.target.value })}
                  placeholder="Notes..."
                />
              </DealField>
              <div className="col-span-2 flex flex-col gap-2 sm:col-span-4">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Tags</span>
                <div className="flex flex-wrap gap-2">
                  {fundedTagOptions.map((tag) => {
                    const persistedTags = deal.fundedTags || [];
                    const selected = persistedTags.includes(tag.key);
                    return (
                      <button
                        key={tag.key}
                        className={`pill transition ${selected ? tagBadgeClass(tag.key) : "bg-white/72 text-[var(--muted)] hover:bg-white"}`}
                        onClick={() => updateFundedDeal(deal.id, { fundedTags: toggleFundedTag(persistedTags, tag.key) })}
                        type="button"
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <FundedDealAdvancedPanel deal={deal} />
          </>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function PipelineView() {
  const { data, addPipelineDeal, addLeadSheet } = useDealdash();
  const [query, setQuery] = useState("");
  const [activeMonth, setActiveMonth] = useState("all");
  const [activeSheet, setActiveSheet] = useState("all");
  const [addingSheet, setAddingSheet] = useState(false);
  const [newPipelineDate, setNewPipelineDate] = useState(todayDateInput());
  const [activeStages, setActiveStages] = useState<Set<PipelineStage>>(new Set());
  const deferredQuery = useDeferredValue(query);
  const monthOptions = useMemo(
    () => buildMonthOptions(data.pipelineDeals, (deal) => deal.submittedDate),
    [data.pipelineDeals],
  );

  // Whole-board counts per stage (independent of the active filters) for the filter chips.
  const stageCounts = useMemo(() => {
    const counts = new Map<PipelineStage, number>();
    for (const deal of data.pipelineDeals) counts.set(deal.stage, (counts.get(deal.stage) ?? 0) + 1);
    return counts;
  }, [data.pipelineDeals]);

  // How many deals came in from each lead sheet -- shown inline in the filter dropdown so the sheet
  // list doubles as a source-of-leads breakdown, not just a filter.
  const sheetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deal of data.pipelineDeals) {
      if (!deal.sheetLabel) continue;
      counts.set(deal.sheetLabel, (counts.get(deal.sheetLabel) ?? 0) + 1);
    }
    return counts;
  }, [data.pipelineDeals]);

  const query_ = deferredQuery.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      data.pipelineDeals
        .filter(
          (deal) =>
            (activeMonth === "all" || getMonthKey(deal.submittedDate) === activeMonth) &&
            (activeStages.size === 0 || activeStages.has(deal.stage)) &&
            (activeSheet === "all" || deal.sheetLabel === activeSheet) &&
            // Search matches ANY text field on the lead -- name, business, contact, email, phone,
            // request, city/state, raw status, notes, sheet -- so "john" finds every John however
            // he appears.
            (query_ === "" ||
              [
                deal.businessName,
                deal.contactName,
                deal.email,
                deal.phone,
                deal.requestLabel,
                deal.city,
                deal.state,
                deal.statusRaw,
                deal.notes,
                deal.sheetLabel,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query_)),
        )
        // Most recent lead date first within each month -- a straight recency ranking rather than
        // clustering by stage, so the board reads as "what came in, in order" like a feed.
        .sort((a, b) => (b.submittedDate ?? "").localeCompare(a.submittedDate ?? "")),
    [data.pipelineDeals, query_, activeStages, activeMonth, activeSheet],
  );

  // Group the filtered leads into month sections (keyed by lead/submitted date) so the board can be
  // tracked and scanned by the month deals came in. Newest month first; undated leads sort last.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, PipelineDeal[]>();
    for (const deal of filtered) {
      const key = getMonthKey(deal.submittedDate);
      const list = groups.get(key);
      if (list) list.push(deal);
      else groups.set(key, [deal]);
    }
    return Array.from(groups.keys())
      .sort((a, b) => (a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)))
      .map((key) => ({ key, heading: getMonthHeading(key), deals: groups.get(key)! }));
  }, [filtered]);

  function toggleStage(key: PipelineStage) {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasFilters = activeStages.size > 0 || activeMonth !== "all" || activeSheet !== "all" || query.length > 0;

  return (
    <SectionFrame
      eyebrow="Deals Brought In"
      title="Pipeline board"
      copy="Search, filter by stage or lead sheet, and keep every file moving. Changes save to your workspace automatically."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[200px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pipeline"
          />
          <select
            className="field max-h-64 min-w-[180px] text-sm"
            value={activeMonth}
            onChange={(e) => setActiveMonth(e.target.value)}
          >
            <option value="all">All months</option>
            {monthOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <select
              className="field max-h-64 min-w-[170px] text-sm"
              value={activeSheet}
              onChange={(e) => setActiveSheet(e.target.value)}
              aria-label="Filter by lead sheet"
            >
              <option value="all">All lead sheets</option>
              {data.leadSheets.map((sheet) => (
                <option key={sheet.id} value={sheet.name}>
                  {sheet.name} ({sheetCounts.get(sheet.name) ?? 0})
                </option>
              ))}
            </select>
            {addingSheet ? (
              <InlineAddSheetForm
                onSave={(name) => {
                  addLeadSheet(name);
                  setAddingSheet(false);
                }}
                onCancel={() => setAddingSheet(false)}
              />
            ) : (
              <button
                type="button"
                className="ghost-button px-2.5 py-1.5 text-xs"
                title="Add a new lead sheet"
                onClick={() => setAddingSheet(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            New lead date
            <input
              className="field min-w-[140px] text-sm"
              type="date"
              value={newPipelineDate}
              onChange={(e) => setNewPipelineDate(e.target.value)}
            />
          </label>
          <button
            className="primary-button flex items-center gap-2 text-sm"
            onClick={() => addPipelineDeal(dateInputToIso(newPipelineDate))}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
          <ExportMenu
            filenameBase="dealdash-pipeline"
            rows={data.pipelineDeals}
            dateOf={(deal) => deal.submittedDate}
            dateLabel="Lead date"
            headers={["Business", "Contact", "Phone", "Email", "City", "State", "Request", "Stage", "Lead Sheet", "Notes", "Lead Date"]}
            toRow={(deal) => [
              deal.businessName, deal.contactName, deal.phone || "", deal.email || "",
              deal.city || "", deal.state || "", deal.requestLabel,
              stageShortLabel[deal.stage] ?? deal.stage,
              deal.sheetLabel || "", deal.notes,
              deal.submittedDate ? deal.submittedDate.slice(0, 10) : "",
            ]}
          />
        </div>
      }
    >
      {/* Filter bar -- a clean, dotted, colored stage rail with live counts (no clunky label). */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveStages(new Set())}
          aria-pressed={activeStages.size === 0}
          className={`pill cursor-pointer gap-1.5 transition ${
            activeStages.size === 0 ? "bg-[var(--accent-strong)] text-white" : "bg-white/70 text-[var(--muted)] hover:bg-white"
          }`}
        >
          All leads
          <span className="opacity-70">{data.pipelineDeals.length}</span>
        </button>
        {stages.map((s) => {
          const active = activeStages.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleStage(s.key)}
              aria-pressed={active}
              className={`pill cursor-pointer gap-1.5 transition ${active ? "text-white" : "bg-white/70 text-[var(--muted)] hover:bg-white"}`}
              style={active ? { background: pipelineStageColor[s.key] } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: active ? "rgba(255,255,255,0.9)" : pipelineStageColor[s.key] }} />
              {s.label}
              <span className="opacity-70">{stageCounts.get(s.key) ?? 0}</span>
            </button>
          );
        })}
        {hasFilters && (
          <button
            className="ghost-button px-3 py-1.5 text-xs"
            onClick={() => {
              setActiveStages(new Set());
              setActiveMonth("all");
              setActiveSheet("all");
              setQuery("");
            }}
            type="button"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-[var(--muted)]">
          Showing {filtered.length} of {data.pipelineDeals.length} leads
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/60 p-12 text-center text-sm text-[var(--muted)]">
          No leads match your filters.
        </div>
      ) : (
        // Grouped into collapsible month sections so leads can be tracked, scanned, and picked by the
        // month they came in.
        <div className="space-y-5">
          {monthGroups.map((group) => (
            <PipelineMonthSection
              key={group.key}
              heading={group.heading}
              deals={group.deals}
              isOnlyMonth={activeMonth === group.key}
              onToggleFilter={() => setActiveMonth(activeMonth === group.key ? "all" : group.key)}
            />
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

/**
 * A tiny inline text field + save/cancel used wherever a brand-new lead sheet name can be typed
 * (the toolbar's "+" and each card's "Add new sheet..." option). Auto-focused since it only ever
 * appears in response to a direct click.
 */
function InlineAddSheetForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");

  function save() {
    if (name.trim()) onSave(name.trim());
    else onCancel();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        className="field !py-1.5 text-xs"
        style={{ minWidth: 140 }}
        value={name}
        placeholder="New sheet name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={save}
      />
    </span>
  );
}

/**
 * Assigns a lead's Lead Sheet from the shared, reusable list (data.leadSheets) -- replaces the old
 * free-text "raw status" field. Selecting "+ Add new sheet..." swaps to InlineAddSheetForm, which
 * both creates the sheet (so it's selectable on every future deal) and assigns it to this deal in
 * one save.
 */
function LeadSheetPicker({ dealId, value, ariaLabel }: { dealId: string; value: string; ariaLabel: string }) {
  const { data, updatePipelineDeal, addLeadSheet } = useDealdash();
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <InlineAddSheetForm
        onSave={(name) => {
          addLeadSheet(name);
          updatePipelineDeal(dealId, { sheetLabel: name });
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  return (
    <select
      className="field text-sm"
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        updatePipelineDeal(dealId, { sheetLabel: e.target.value });
      }}
      aria-label={ariaLabel}
    >
      <option value="">No sheet</option>
      {/* A value not yet in the shared list (legacy/imported data) still shows so it's never silently
          dropped from the dropdown the moment this card renders. */}
      {value && !data.leadSheets.some((sheet) => sheet.name === value) && <option value={value}>{value}</option>}
      {data.leadSheets.map((sheet) => (
        <option key={sheet.id} value={sheet.name}>
          {sheet.name}
        </option>
      ))}
      <option value="__add__">+ Add new sheet...</option>
    </select>
  );
}

/**
 * One collapsible month band on the pipeline board. The heading toggles the month open/closed (so
 * the board can be scanned month-by-month); a secondary control narrows the whole board to just that
 * month. Uses the shared dd-collapse height animation and dd-chevron rotation.
 */
function PipelineMonthSection({
  heading,
  deals,
  isOnlyMonth,
  onToggleFilter,
}: {
  heading: string;
  deals: PipelineDeal[];
  isOnlyMonth: boolean;
  onToggleFilter: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <ChevronDown className="dd-chevron h-4 w-4 shrink-0 text-[var(--muted)]" data-open={!collapsed} />
          <span className="truncate text-sm font-semibold tracking-tight">{heading}</span>
          <span className="pill shrink-0 bg-[var(--accent-soft)] text-xs text-[var(--accent-strong)]">{deals.length}</span>
          <span className="h-px flex-1 bg-[var(--line)] transition group-hover:bg-[var(--accent-strong)]/40" />
        </button>
        <button
          type="button"
          onClick={onToggleFilter}
          title={isOnlyMonth ? "Show all months" : `Show only ${heading}`}
          className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
            isOnlyMonth ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)] hover:bg-white"
          }`}
        >
          {isOnlyMonth ? "Show all" : "Only this"}
        </button>
      </div>
      <div className="dd-collapse" data-open={!collapsed}>
        <div className="dd-collapse-inner">
          <div className="grid gap-4 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {deals.map((deal, index) => (
              <PipelineLeadCard key={deal.id} deal={deal} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A single pipeline lead as one uniform card in the fluid grid. A colored top border + stage dot
 * signal where the lead sits at a glance; every field stays inline-editable. Deletion uses an
 * inline two-step confirm (InlineDeleteButton) rather than a native confirm() dialog -- native
 * dialogs can be permanently suppressed by the browser after the user ticks "don't show again",
 * which silently swallowed the delete and left the card on screen.
 */
function PipelineLeadCard({ deal, index }: { deal: PipelineDeal; index: number }) {
  const { updatePipelineDeal, deletePipelineDeal } = useDealdash();
  return (
    <article
      className="dd-rise dd-hover-lift flex flex-col gap-2.5 rounded-2xl border border-[var(--line)] bg-white/90 p-4"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms`, borderTop: `3px solid ${pipelineStageColor[deal.stage]}` }}
    >
      {/* Stage + delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pipelineStageColor[deal.stage] }} />
          <select
            className="field min-w-0 !py-1.5 text-xs font-semibold"
            value={deal.stage}
            onChange={(e) => updatePipelineDeal(deal.id, { stage: e.target.value as PipelineStage })}
            aria-label={`Stage for ${deal.businessName || "lead"}`}
          >
            {stages.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <InlineDeleteButton label={`Delete ${deal.businessName || "lead"}`} onConfirm={() => deletePipelineDeal(deal.id)} />
      </div>

      {/* Identity */}
      <input
        className="field text-sm font-semibold"
        value={deal.businessName}
        onChange={(e) => updatePipelineDeal(deal.id, { businessName: e.target.value })}
        placeholder="Business name"
      />
      <input
        className="field text-sm"
        value={deal.contactName}
        onChange={(e) => updatePipelineDeal(deal.id, { contactName: e.target.value })}
        placeholder="Contact name"
      />

      {/* Contact */}
      <div className="grid grid-cols-2 gap-2">
        <PhoneField
          value={deal.phone || ""}
          onChange={(next) => updatePipelineDeal(deal.id, { phone: next })}
          ariaLabel={`Phone for ${deal.businessName || "lead"}`}
        />
        <input
          className="field text-sm"
          value={deal.email || ""}
          onChange={(e) => updatePipelineDeal(deal.id, { email: e.target.value })}
          placeholder="Email"
          type="email"
        />
      </div>

      {/* Request + lead sheet */}
      <div className="grid grid-cols-2 gap-2">
        <input
          className="field text-sm"
          value={deal.requestLabel}
          onChange={(e) => updatePipelineDeal(deal.id, { requestLabel: e.target.value })}
          placeholder="Request, e.g. 100k"
        />
        <LeadSheetPicker dealId={deal.id} value={deal.sheetLabel} ariaLabel={`Lead sheet for ${deal.businessName || "lead"}`} />
      </div>

      {/* Notes */}
      <textarea
        className="field min-h-[64px] text-sm"
        value={deal.notes}
        onChange={(e) => updatePipelineDeal(deal.id, { notes: e.target.value })}
        placeholder="Notes"
      />

      {/* Date */}
      <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Lead date
        <input
          className="field text-sm font-normal normal-case"
          type="date"
          value={toDateInput(deal.submittedDate)}
          onChange={(e) => updatePipelineDeal(deal.id, { submittedDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })}
        />
      </label>
    </article>
  );
}

/**
 * Two-step inline delete: the trash icon arms a "Delete / Cancel" pair rather than opening a native
 * confirm() dialog. Native dialogs are unreliable (browsers let users permanently suppress them,
 * after which confirm() returns false with no prompt), so this both fixes that class of bug and
 * reads as a more modern control. The armed state auto-cancels after a few seconds.
 */
function InlineDeleteButton({ onConfirm, label = "Delete" }: { onConfirm: () => void; label?: string }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-lg bg-[var(--danger)] px-2 py-1 text-xs font-semibold text-white transition hover:opacity-90"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-white"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button type="button" className="delete-button shrink-0" title={label} aria-label={label} onClick={() => setConfirming(true)}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Follow-Ups ───────────────────────────────────────────────────────────────

export function FollowUpsView() {
  const { data, addFollowUp, updateFollowUp, deleteFollowUp } = useDealdash();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      data.followUps.filter(
        (item) =>
          [item.businessName, item.contactName, item.notes, item.phone, item.email, item.requestLabel]
            .join(" ")
            .toLowerCase()
            .includes(deferredQuery.toLowerCase()),
      ),
    [data.followUps, deferredQuery],
  );

  return (
    <SectionFrame
      eyebrow="Follow-Up Sheet"
      title="Daily contact queue"
      copy="A cleaner callback board with visible phone numbers, calendar-based last-contact dates, app checks, and roomier notes."
      actions={
        <div className="flex flex-wrap gap-3">
          <input
            className="field min-w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search follow-ups"
          />
          <button
            className="ghost-button flex items-center gap-2 text-sm"
            onClick={() => addFollowUp()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Follow-Up
          </button>
          <ExportMenu
            filenameBase="dealdash-follow-ups"
            rows={data.followUps}
            dateOf={(item) => item.createdAt}
            dateLabel="Added date"
            headers={["Business", "Contact", "Phone", "Email", "Request", "Priority", "App Submitted", "Completed", "Last Contact", "Due Date", "Notes", "Added"]}
            toRow={(item) => [
              item.businessName, item.contactName, item.phone || "", item.email || "", item.requestLabel,
              item.priority, item.appSubmitted ? "Yes" : "No", item.completed ? "Yes" : "No",
              item.lastContactLabel || "", item.dueDate ? item.dueDate.slice(0, 10) : "",
              item.notes, item.createdAt ? item.createdAt.slice(0, 10) : "",
            ]}
          />
        </div>
      }
    >
      <div className="space-y-3">
        <div className="hidden grid-cols-[1.1fr_1fr_0.9fr_130px_100px_minmax(260px,1.4fr)_44px] gap-3 rounded-[1rem] bg-white/82 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] lg:grid">
          <span>Business / Contact</span>
          <span>Phone / Email</span>
          <span>Last Contact / Request</span>
          <span>Priority</span>
          <span>App Check</span>
          <span>Notes</span>
          <span />
        </div>
        {filtered.map((item, rowIndex) => (
          <article
            key={item.id}
            className="dd-rise grid gap-3 rounded-[1.1rem] border border-white/80 bg-white/78 p-3 shadow-[0_8px_26px_rgba(21,42,74,0.06)] lg:grid-cols-[1.1fr_1fr_0.9fr_130px_100px_minmax(260px,1.4fr)_44px] lg:items-start"
            style={{ animationDelay: `${Math.min(rowIndex, 12) * 30}ms` }}
          >
            <div className="grid gap-2">
              <input
                className="field text-sm"
                value={item.businessName}
                onChange={(e) => updateFollowUp(item.id, { businessName: e.target.value })}
                placeholder="Business"
              />
              <input
                className="field text-sm"
                value={item.contactName}
                onChange={(e) => updateFollowUp(item.id, { contactName: e.target.value })}
                placeholder="Contact"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex gap-2">
                <PhoneField
                  value={item.phone || ""}
                  onChange={(next) => updateFollowUp(item.id, { phone: next })}
                  className="flex-1"
                  ariaLabel={`Phone for ${item.businessName || "follow-up"}`}
                />
                <button
                  className="icon-button h-[44px] w-[44px] shrink-0"
                  onClick={() => {
                    if (item.phone) void navigator.clipboard.writeText(item.phone);
                  }}
                  title="Copy phone"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <input
                className="field text-sm"
                value={item.email || ""}
                onChange={(e) => updateFollowUp(item.id, { email: e.target.value })}
                placeholder="Email"
                type="email"
              />
            </div>

            <div className="grid gap-2">
              <input
                className="field text-sm"
                type="date"
                value={toDateInput(item.lastContactLabel)}
                onChange={(e) =>
                  updateFollowUp(item.id, {
                    lastContactLabel: e.target.value ? `${e.target.value}T00:00:00.000Z` : "",
                  })
                }
              />
              <input
                className="field text-sm"
                value={item.requestLabel}
                onChange={(e) => updateFollowUp(item.id, { requestLabel: e.target.value })}
                placeholder="Request, e.g. 100k LOC"
              />
            </div>

            <select
              className="field min-w-[118px] text-sm"
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

            <label className="inline-flex items-center gap-2 rounded-[0.9rem] border border-[var(--line)] bg-white/72 px-3 py-3 text-sm font-semibold text-[var(--muted)]">
              <input
                checked={item.appSubmitted}
                onChange={(e) => updateFollowUp(item.id, { appSubmitted: e.target.checked })}
                type="checkbox"
              />
              App
            </label>

            <textarea
              className="field min-h-[116px] text-sm leading-6"
              value={item.notes}
              onChange={(e) => updateFollowUp(item.id, { notes: e.target.value })}
              placeholder="Notes"
            />

            <button
              className="delete-button h-[40px] w-[40px]"
              onClick={() => {
                if (confirm(`Move ${item.contactName || "this follow-up"} to Trash? You can restore it for 30 days.`)) {
                  deleteFollowUp(item.id);
                }
              }}
              title="Delete"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>
    </SectionFrame>
  );
}

// ─── Rate Calculator ──────────────────────────────────────────────────────────
// This is a standalone "what-if" tool -- nothing here is persisted. Its output used to be routed
// through hiddenCurrency()/showFinancials, but that toggle is never wired to a visible control
// anywhere in the UI, so the numbers were permanently stuck behind "•••••" with no way to reveal
// them. These are deal-economics numbers the broker needs to see to price a deal, not sensitive
// data, so this view always renders them plainly via formatCurrency().

const rateScenarioFields: Array<{ key: keyof RateScenarioFormState; label: string; step: string; suffix?: string }> = [
  { key: "fundedAmount", label: "Funded amount", step: "1000" },
  { key: "factorRate", label: "Factor rate", step: "0.01" },
  { key: "fees", label: "Fees", step: "50" },
  { key: "termValue", label: "Term value", step: "1" },
  { key: "isoPointsPercent", label: "ISO points (% of funded amount)", step: "0.1", suffix: "%" },
  { key: "repPointsPercent", label: "Rep points (% of ISO points)", step: "0.1", suffix: "%" },
  { key: "syndicationPercent", label: "Syndication (% going into deal)", step: "0.1", suffix: "%" },
  { key: "bonus", label: "Bonus", step: "50" },
];

type RateScenarioFormState = {
  fundedAmount: number;
  factorRate: number;
  fees: number;
  termValue: number;
  termUnit: FundedDeal["termUnit"];
  isoPointsPercent: number;
  repPointsPercent: number;
  syndicationPercent: number;
  bonus: number;
};

export function RateCalculatorView() {
  const [scenario, setScenario] = useState<RateScenarioFormState>({
    fundedAmount: 50000,
    factorRate: 1.38,
    fees: 995,
    termValue: 24,
    termUnit: "weeks",
    isoPointsPercent: 2,
    repPointsPercent: 50,
    syndicationPercent: 10,
    bonus: 0,
  });

  const result = calculateRateScenario(scenario);

  return (
    <SectionFrame
      eyebrow="Rate Calculator"
      title="Price a deal before you pitch it"
      copy="Enter the deal terms and your split. Net funded amount, total payback, payment amount, and rep profit recalculate live and are always visible."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {rateScenarioFields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {f.label}
              </label>
              <div className="relative">
                <input
                  className={`field w-full ${f.suffix ? "pr-7" : ""}`}
                  step={f.step}
                  type="number"
                  value={scenario[f.key]}
                  onChange={(e) =>
                    setScenario((cur) => ({ ...cur, [f.key]: Number(e.target.value) || 0 }))
                  }
                />
                {f.suffix && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">
                    {f.suffix}
                  </span>
                )}
              </div>
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
        </div>

        <div className="rounded-[1.7rem] bg-[linear-gradient(160deg,_rgba(21,94,239,0.14),_rgba(13,148,136,0.12))] p-5">
          <h3 className="text-base font-semibold">Scenario output</h3>
          <div className="mt-4 grid gap-3">
            <MetricCard
              label="Net funded amount"
              value={formatCurrency(result.netFundedAmount)}
              detail="Funded amount − fees"
            />
            <MetricCard
              label="Total payback"
              value={formatCurrency(result.totalPayback)}
              detail="Funded amount × factor rate"
            />
            <MetricCard
              label="Payment amount"
              value={formatCurrency(result.paymentAmount)}
              detail={`Over ${scenario.termValue || 0} ${scenario.termUnit}`}
            />
            <MetricCard
              label="Rep profit"
              value={formatCurrency(result.repProfit)}
              detail={`Rep pts ${formatCurrency(result.repPointsAmount)} + syndication ${formatCurrency(result.syndicationProfitAmount)} + bonus ${formatCurrency(scenario.bonus)}`}
            />
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}
