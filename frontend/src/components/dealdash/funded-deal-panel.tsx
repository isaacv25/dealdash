"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, History, Pause, RotateCcw, Sparkles } from "lucide-react";
import type { FundedDeal } from "@/lib/dealdash";
import { calculateDeal, MIN_FACTOR_RATE } from "@/lib/dealdash/finance";
import { WEEKDAY_LABELS } from "@/lib/dealdash/schedule";
import {
  applyLoweredPaymentAction,
  applyPaymentPauseAction,
  generateDealScheduleAction,
  getDealAuditHistoryAction,
  getDealCalculatedBalanceAction,
  getDealScheduleAction,
  recastDealScheduleAction,
  resetBalanceOverrideAction,
  setBalanceOverrideAction,
} from "@/app/(app)/actions";
import { useDealdash } from "./state";
import { DecimalField } from "./inputs";
import { formatCurrency, formatDate, formatCalendarDate, toDateInput, dateInputToIso } from "@/lib/dealdash/format";

type ScheduleRow = Awaited<ReturnType<typeof getDealScheduleAction>>[number];
type AuditRow = Awaited<ReturnType<typeof getDealAuditHistoryAction>>[number];
type CalculatedBalance = Awaited<ReturnType<typeof getDealCalculatedBalanceAction>>;

function Collapsible({
  title,
  icon,
  defaultOpen = false,
  badge,
  onOpen,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Data-fetching sections stay unmounted until first expanded, so rendering a page of many deal
  // cards doesn't fire a schedule/audit/balance request per card up front -- only for what the user
  // actually opens.
  const [everOpened, setEverOpened] = useState(defaultOpen);

  return (
    <div className="surface-line rounded-2xl bg-white/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          if (!everOpened) {
            setEverOpened(true);
            onOpen?.();
          }
        }}
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
          {icon}
          {title}
          {badge}
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{everOpened ? children : null}</div>
        </div>
      </div>
    </div>
  );
}

/** Live, client-only recalculation preview -- never writes anything until the user applies it. */
function LiveCalculationPreview({ deal }: { deal: FundedDeal }) {
  const calc = useMemo(
    () =>
      calculateDeal({
        fundedAmount: deal.fundedAmount,
        factorRate: deal.factorRate,
        termValue: deal.termValue,
        paymentFrequency: deal.paymentFrequency,
        syndicationPercent: deal.syndicationPercent * 100,
      }),
    [deal.fundedAmount, deal.factorRate, deal.termValue, deal.paymentFrequency],
  );

  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(timer);
  }, [calc.scheduledPaymentCents, calc.totalPaybackCents]);

  const mismatch = Math.abs(deal.paymentAmount - calc.scheduledPaymentDollars) > 0.01;
  const invalidFactorRate = deal.factorRate < MIN_FACTOR_RATE;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-[var(--accent-soft)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Total payback</p>
        <p className={`text-base font-bold text-[var(--accent-strong)] transition-colors duration-300 ${flash ? "text-[var(--accent)]" : ""}`}>
          {formatCurrency(calc.totalPaybackDollars)}
        </p>
      </div>
      <div className="rounded-xl bg-[var(--accent-soft)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Calculated {deal.paymentFrequency} payment
        </p>
        <p className={`text-base font-bold text-[var(--accent-strong)] transition-colors duration-300 ${flash ? "text-[var(--accent)]" : ""}`}>
          {formatCurrency(calc.scheduledPaymentDollars)}
        </p>
      </div>
      <div className="rounded-xl bg-white/70 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Payments</p>
        <p className="text-base font-bold text-[var(--foreground)]">{calc.periods}</p>
      </div>
      {invalidFactorRate && (
        <p className="sm:col-span-3 text-xs font-semibold text-[var(--danger)]">
          Factor rate must be at least {MIN_FACTOR_RATE.toFixed(2)} to calculate a payback amount.
        </p>
      )}
      {!invalidFactorRate && mismatch && (
        <p className="sm:col-span-3 text-xs text-[var(--muted)]">
          Saved payment ({formatCurrency(deal.paymentAmount)}) differs from the calculated amount above. Use{" "}
          <span className="font-semibold text-[var(--accent-strong)]">Recalculate schedule</span> below to apply it.
        </p>
      )}
    </div>
  );
}

export function FundedDealAdvancedPanel({ deal }: { deal: FundedDeal }) {
  const { updateFundedDeal } = useDealdash();
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [balance, setBalance] = useState<CalculatedBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshBalance() {
    try {
      setBalance(await getDealCalculatedBalanceAction(deal.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load balance.");
    }
  }

  async function loadSchedule(force = false) {
    if (schedule !== null && !force) return;
    try {
      setSchedule(await getDealScheduleAction(deal.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule.");
    }
  }

  async function loadAudit(force = false) {
    if (audit !== null && !force) return;
    try {
      setAudit(await getDealAuditHistoryAction(deal.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit history.");
    }
  }

  async function handleRecalculateSchedule() {
    setError(null);
    setBusy(true);
    try {
      const existing = await getDealScheduleAction(deal.id);
      const hasPosted = existing.some((entry) => entry.status === "posted");
      const calc = calculateDeal({
        fundedAmount: deal.fundedAmount,
        factorRate: deal.factorRate,
        termValue: deal.termValue,
        paymentFrequency: deal.paymentFrequency,
        syndicationPercent: deal.syndicationPercent * 100,
      });

      if (existing.length === 0) {
        await generateDealScheduleAction(deal.id);
      } else {
        if (hasPosted) {
          const confirmed = window.confirm(
            "This deal already has posted payments. Recasting will keep all posted history and rebuild only the remaining, unpaid schedule starting today. Continue?",
          );
          if (!confirmed) {
            setBusy(false);
            return;
          }
        }
        await recastDealScheduleAction(deal.id, new Date().toISOString(), deal.paymentWeekday ?? null, "Deal terms recalculated");
      }

      updateFundedDeal(deal.id, { paymentAmount: calc.scheduledPaymentDollars });
      await loadSchedule(true);
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to recalculate schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-5 pb-5">
      <LiveCalculationPreview deal={deal} />

      <div className="flex flex-wrap items-center gap-3">
        {deal.paymentFrequency === "weekly" && (
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            Payment day
            <select
              className="field text-sm"
              value={deal.paymentWeekday ?? ""}
              onChange={(e) => updateFundedDeal(deal.id, { paymentWeekday: e.target.value === "" ? undefined : Number(e.target.value) })}
            >
              <option value="">Select...</option>
              {[1, 2, 3, 4, 5].map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_LABELS[day]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="ghost-button flex items-center gap-2 text-xs" onClick={handleRecalculateSchedule} disabled={busy}>
          <Sparkles className="h-3.5 w-3.5" />
          {busy ? "Recalculating..." : "Recalculate schedule"}
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-[var(--danger)]">{error}</p>}

      <Collapsible title="Payment schedule" icon={<History className="h-3.5 w-3.5" />}>
        <ScheduleTimeline dealId={deal.id} rows={schedule} onLoad={loadSchedule} />
      </Collapsible>

      <Collapsible title="Payment adjustments" icon={<Pause className="h-3.5 w-3.5" />}>
        <AdjustmentsForm
          deal={deal}
          onApplied={async () => {
            await loadSchedule(true);
            await refreshBalance();
          }}
        />
      </Collapsible>

      <Collapsible title="Advanced adjustments" defaultOpen={false} onOpen={refreshBalance}>
        <BalanceOverridePanel deal={deal} balance={balance} onChanged={refreshBalance} />
      </Collapsible>

      <Collapsible title="Audit history" icon={<RotateCcw className="h-3.5 w-3.5" />}>
        <AuditHistoryList rows={audit} onLoad={loadAudit} />
      </Collapsible>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "posted") return "Posted";
  if (status === "paused") return "Paused (skipped)";
  if (status === "skipped") return "Skipped";
  return "Upcoming";
}

function statusClass(status: string) {
  if (status === "posted") return "bg-[var(--success)]/10 text-[var(--success)]";
  if (status === "paused") return "bg-[var(--warn)]/10 text-[var(--warn)]";
  if (status === "skipped") return "bg-white/60 text-[var(--muted)]";
  return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
}

function ScheduleTimeline({ dealId, rows, onLoad }: { dealId: string; rows: ScheduleRow[] | null; onLoad: () => void }) {
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  if (rows === null) return <p className="text-xs text-[var(--muted)]">Loading schedule...</p>;
  if (rows.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No persisted schedule yet. Use Recalculate schedule above to generate one.</p>;
  }

  return (
    <div className="table-wrap max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white/90 text-left text-[var(--muted)]">
          <tr>
            <th className="px-2 py-1.5 font-semibold">#</th>
            <th className="px-2 py-1.5 font-semibold">Due date</th>
            <th className="px-2 py-1.5 font-semibold">Amount</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
            <th className="px-2 py-1.5 font-semibold">Posted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--line)]">
              <td className="px-2 py-1.5">{row.sequence}</td>
              <td className="px-2 py-1.5">{formatCalendarDate(row.dueDate.toString())}</td>
              <td className="px-2 py-1.5">{formatCurrency((row.postedAmountCents ?? row.scheduledAmountCents) / 100)}</td>
              <td className="px-2 py-1.5">
                <span className={`pill ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
              </td>
              <td className="px-2 py-1.5">{row.postedAt ? formatDate(row.postedAt.toString()) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdjustmentsForm({ deal, onApplied }: { deal: FundedDeal; onApplied: () => void }) {
  const [mode, setMode] = useState<"lowered" | "pause">("lowered");
  const [newAmount, setNewAmount] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(toDateInput(new Date().toISOString()));
  const [endDate, setEndDate] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "lowered") {
        await applyLoweredPaymentAction(deal.id, {
          newAmount,
          effectiveDateIso: dateInputToIso(effectiveDate) ?? new Date().toISOString(),
          endDateIso: endDate ? (dateInputToIso(endDate) ?? null) : null,
          reason,
        });
        setSuccess("Lowered payment applied to future scheduled payments.");
      } else {
        await applyPaymentPauseAction(deal.id, {
          pauseStartIso: dateInputToIso(effectiveDate) ?? new Date().toISOString(),
          resumeDateIso: resumeDate ? (dateInputToIso(resumeDate) ?? null) : null,
          reason,
        });
        setSuccess("Payments paused; the deal's maturity has been extended to make up the paused periods.");
      }
      setReason("");
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply adjustment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          className={`pill transition ${mode === "lowered" ? "bg-[var(--accent-strong)] text-white" : "bg-white/72 text-[var(--muted)]"}`}
          onClick={() => setMode("lowered")}
        >
          Lower payment
        </button>
        <button
          type="button"
          className={`pill transition ${mode === "pause" ? "bg-[var(--accent-strong)] text-white" : "bg-white/72 text-[var(--muted)]"}`}
          onClick={() => setMode("pause")}
        >
          Pause payments
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "lowered" && (
          <label className="text-xs font-semibold text-[var(--muted)]">
            New payment amount
            <DecimalField value={newAmount} onCommit={setNewAmount} suffix="$" min={0} ariaLabel="New payment amount" />
          </label>
        )}
        <label className="text-xs font-semibold text-[var(--muted)]">
          {mode === "lowered" ? "Effective date" : "Pause start date"}
          <input className="field text-sm" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </label>
        {mode === "lowered" ? (
          <label className="text-xs font-semibold text-[var(--muted)]">
            End date (optional -- returns to normal after)
            <input className="field text-sm" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        ) : (
          <label className="text-xs font-semibold text-[var(--muted)]">
            Resume date (optional if unknown)
            <input className="field text-sm" type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} />
          </label>
        )}
        <label className="text-xs font-semibold text-[var(--muted)] sm:col-span-2">
          Reason
          <input className="field text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" />
        </label>
      </div>

      {error && <p className="text-xs font-semibold text-[var(--danger)]">{error}</p>}
      {success && <p className="text-xs font-semibold text-[var(--success)]">{success}</p>}

      <button type="button" className="primary-button text-xs" onClick={submit} disabled={busy}>
        {busy ? "Applying..." : mode === "lowered" ? "Apply lowered payment" : "Apply pause"}
      </button>
    </div>
  );
}

function BalanceOverridePanel({
  deal,
  balance,
  onChanged,
}: {
  deal: FundedDeal;
  balance: CalculatedBalance | null;
  onChanged: () => void;
}) {
  const { updateFundedDeal } = useDealdash();
  const [overrideAmount, setOverrideAmount] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(toDateInput(new Date().toISOString()));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculated = balance ? balance.calculatedBalanceCents / 100 : undefined;
  const overridden = deal.balanceOverrideAmount;
  const difference = overridden !== undefined && calculated !== undefined ? overridden - calculated : undefined;

  // Patches local UI state only -- setBalanceOverrideAction/resetBalanceOverrideAction already
  // persisted the change server-side (with its own audit entry), so this never triggers a redundant
  // network write for these fields (the generic patch endpoint intentionally ignores them).
  function patchLocal(patch: Partial<FundedDeal>) {
    updateFundedDeal(deal.id, patch);
  }

  async function applyOverride() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required to override the calculated balance.");
      return;
    }
    setBusy(true);
    try {
      const effectiveIso = dateInputToIso(effectiveDate) ?? new Date().toISOString();
      await setBalanceOverrideAction(deal.id, { overrideAmount, effectiveDateIso: effectiveIso, reason });
      patchLocal({
        balanceOverrideAmount: overrideAmount,
        balanceOverrideEffectiveDate: effectiveIso,
        balanceOverrideReason: reason,
        balanceOverrideSetAt: new Date().toISOString(),
      });
      setReason("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set override.");
    } finally {
      setBusy(false);
    }
  }

  async function resetOverride() {
    setBusy(true);
    try {
      await resetBalanceOverrideAction(deal.id);
      patchLocal({
        balanceOverrideAmount: undefined,
        balanceOverrideEffectiveDate: undefined,
        balanceOverrideReason: undefined,
        balanceOverrideSetAt: undefined,
        manualBalanceRemaining: undefined,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Override Calculated Balance replaces the system-calculated outstanding balance -- use it only to reconcile against a lender
        statement, imported history, or a documented correction. It changes repayment progress and is recorded in the audit history below.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Calculated balance</p>
          <p className="text-sm font-bold">{calculated !== undefined ? formatCurrency(calculated) : "..."}</p>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Current overridden balance</p>
          <p className="text-sm font-bold">{overridden !== undefined ? formatCurrency(overridden) : "Not overridden"}</p>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Difference</p>
          <p className={`text-sm font-bold ${difference ? "text-[var(--warn)]" : ""}`}>
            {difference !== undefined ? formatCurrency(difference) : "-"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-[var(--muted)]">
          Replacement balance
          <DecimalField value={overrideAmount} onCommit={setOverrideAmount} suffix="$" min={0} ariaLabel="Replacement balance" />
        </label>
        <label className="text-xs font-semibold text-[var(--muted)]">
          Effective date
          <input className="field text-sm" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-[var(--muted)] sm:col-span-1">
          Reason
          <input className="field text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" />
        </label>
      </div>

      {error && <p className="text-xs font-semibold text-[var(--danger)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="primary-button text-xs" onClick={applyOverride} disabled={busy}>
          {busy ? "Saving..." : "Override calculated balance"}
        </button>
        {overridden !== undefined && (
          <button type="button" className="ghost-button text-xs" onClick={resetOverride} disabled={busy}>
            Reset to calculated balance
          </button>
        )}
      </div>
    </div>
  );
}

function AuditHistoryList({ rows, onLoad }: { rows: AuditRow[] | null; onLoad: () => void }) {
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) return <p className="text-xs text-[var(--muted)]">Loading audit history...</p>;
  if (rows.length === 0) return <p className="text-xs text-[var(--muted)]">No changes recorded yet.</p>;

  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
      {rows.map((entry) => (
        <li key={entry.id} className="rounded-xl bg-white/70 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold capitalize">{entry.category.replace(/-/g, " ")}</span>
            <span className="text-[var(--muted)]">{formatDate(entry.createdAt.toString())}</span>
          </div>
          {entry.reason && <p className="mt-1 text-[var(--muted)]">{entry.reason}</p>}
          <div className="mt-1 flex flex-wrap gap-x-4 text-[var(--muted)]">
            {entry.previousValue !== null && <span>From: {JSON.stringify(entry.previousValue)}</span>}
            {entry.newValue !== null && <span>To: {JSON.stringify(entry.newValue)}</span>}
            {entry.effectiveDate && <span>Effective {formatCalendarDate(entry.effectiveDate.toString())}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
