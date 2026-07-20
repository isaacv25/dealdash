import type { PaymentFrequency } from "./types";
import { buildEvenScheduleAmountsCents, scheduledPaymentCents } from "./finance";

/**
 * Pure, framework-agnostic payment-schedule math. Dates are always UTC-midnight instants that
 * represent a *calendar date*, matching how the rest of this codebase already stores dates
 * (`${value}T00:00:00.000Z`). We deliberately never do timezone-aware arithmetic on these dates —
 * getUTCDay()/setUTCDate() are correct here because the value itself is timezone-agnostic. The only
 * place a real IANA timezone (America/New_York) matters is in cron.ts, which converts "now" to an
 * ET calendar date once per run before comparing it against these dueDate values.
 */

export type ScheduleStatus = "pending" | "posted" | "skipped" | "paused";

export interface ScheduleEntry {
  sequence: number;
  dueDate: Date;
  scheduledAmountCents: number;
  status: ScheduleStatus;
  postedAmountCents?: number;
  adjustmentId?: string | null;
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Returns the first date on or after `from` whose UTC weekday matches `weekday` (0=Sun..6=Sat). */
export function nextOrSameWeekday(from: Date, weekday: number): Date {
  const currentDay = from.getUTCDay();
  const delta = (weekday - currentDay + 7) % 7;
  return addUtcDays(from, delta);
}

/** First business day (Mon-Fri) on or after `from`. */
export function nextOrSameBusinessDay(from: Date): Date {
  let cursor = from;
  while (isWeekendUtc(cursor)) {
    cursor = addUtcDays(cursor, 1);
  }
  return cursor;
}

export function datesForWeekly(anchor: Date, weekday: number, count: number): Date[] {
  if (count <= 0) return [];
  const first = nextOrSameWeekday(anchor, weekday);
  return Array.from({ length: count }, (_, i) => addUtcDays(first, i * 7));
}

/** Unless a holiday calendar is introduced, "daily" means business days (Mon-Fri) only. */
export function datesForDaily(anchor: Date, count: number): Date[] {
  if (count <= 0) return [];
  const dates: Date[] = [];
  let cursor = nextOrSameBusinessDay(anchor);
  while (dates.length < count) {
    dates.push(cursor);
    cursor = nextOrSameBusinessDay(addUtcDays(cursor, 1));
  }
  return dates;
}

export function datesForMonthly(anchor: Date, count: number): Date[] {
  if (count <= 0) return [];
  const dayOfMonth = anchor.getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1));
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dayOfMonth, daysInMonth));
    return d;
  });
}

export interface BuildScheduleParams {
  anchorDate: Date;
  frequency: PaymentFrequency;
  weekday: number | null;
  periods: number;
  totalCents: number;
}

/** Builds a brand-new schedule from scratch (used on deal creation or a full rebuild). */
export function buildSchedule({ anchorDate, frequency, weekday, periods, totalCents }: BuildScheduleParams): ScheduleEntry[] {
  const dates =
    frequency === "weekly"
      ? datesForWeekly(anchorDate, weekday ?? anchorDate.getUTCDay(), periods)
      : frequency === "monthly"
        ? datesForMonthly(anchorDate, periods)
        : datesForDaily(anchorDate, periods);

  const amounts = buildEvenScheduleAmountsCents(totalCents, periods);
  return dates.map((dueDate, i) => ({
    sequence: i + 1,
    dueDate,
    scheduledAmountCents: amounts[i] ?? 0,
    status: "pending" as const,
  }));
}

export interface RecastParams {
  existingEntries: ScheduleEntry[];
  frequency: PaymentFrequency;
  weekday: number | null;
  effectiveDate: Date;
  remainingTotalCents: number;
  remainingPeriods: number;
}

/**
 * Preserves every entry that has already posted, skipped, or paused (real history never gets
 * rewritten), then regenerates only the still-pending tail from `effectiveDate` forward using the
 * (possibly updated) frequency/weekday/amount. This is what "recast the remaining schedule" means
 * throughout this codebase, as opposed to a full rebuild which discards even posted history.
 */
export function recastSchedule({
  existingEntries,
  frequency,
  weekday,
  effectiveDate,
  remainingTotalCents,
  remainingPeriods,
}: RecastParams): ScheduleEntry[] {
  const kept = existingEntries.filter((entry) => entry.status !== "pending");
  const lastSequence = kept.reduce((max, entry) => Math.max(max, entry.sequence), 0);

  const anchor =
    frequency === "weekly"
      ? nextOrSameWeekday(effectiveDate, weekday ?? effectiveDate.getUTCDay())
      : frequency === "monthly"
        ? effectiveDate
        : nextOrSameBusinessDay(effectiveDate);

  const regenerated = buildSchedule({
    anchorDate: anchor,
    frequency,
    weekday,
    periods: remainingPeriods,
    totalCents: remainingTotalCents,
  }).map((entry, i) => ({ ...entry, sequence: lastSequence + i + 1 }));

  return [...kept, ...regenerated];
}

export interface PauseParams {
  entries: ScheduleEntry[];
  pauseStart: Date;
  resumeDate: Date | null;
  frequency: PaymentFrequency;
  weekday: number | null;
}

/**
 * Default business rule (see docs/DATA_MODEL.md): paused payments are skipped, not compressed into
 * the remaining schedule. Every pending entry inside the pause window is marked "paused" (it will
 * never post) and an equal number of same-amount periods are appended after the current schedule
 * tail, following the existing cadence, so the deal's maturity date extends by exactly the paused
 * period count rather than the payoff amount silently shrinking.
 */
export function applyPause({ entries, pauseStart, resumeDate, frequency, weekday }: PauseParams): ScheduleEntry[] {
  const paused: ScheduleEntry[] = [];
  const untouched: ScheduleEntry[] = [];

  for (const entry of entries) {
    const inWindow =
      entry.status === "pending" &&
      entry.dueDate.getTime() >= pauseStart.getTime() &&
      (resumeDate === null || entry.dueDate.getTime() < resumeDate.getTime());
    if (inWindow) {
      paused.push({ ...entry, status: "paused" });
    } else {
      untouched.push(entry);
    }
  }

  if (paused.length === 0) return entries;

  const lastEntry = [...entries].sort((a, b) => a.sequence - b.sequence).at(-1);
  const lastSequence = entries.reduce((max, e) => Math.max(max, e.sequence), 0);
  const lastDate = lastEntry?.dueDate ?? pauseStart;
  const tailAnchor = frequency === "weekly" ? addUtcDays(lastDate, 7) : frequency === "monthly" ? addUtcDays(lastDate, 28) : nextOrSameBusinessDay(addUtcDays(lastDate, 1));

  const extensionAmounts = paused.map((e) => e.scheduledAmountCents);
  const extensionDates =
    frequency === "weekly"
      ? datesForWeekly(tailAnchor, weekday ?? tailAnchor.getUTCDay(), paused.length)
      : frequency === "monthly"
        ? datesForMonthly(tailAnchor, paused.length)
        : datesForDaily(tailAnchor, paused.length);

  const extension: ScheduleEntry[] = extensionDates.map((dueDate, i) => ({
    sequence: lastSequence + i + 1,
    dueDate,
    scheduledAmountCents: extensionAmounts[i] ?? 0,
    status: "pending" as const,
  }));

  return [...untouched, ...paused, ...extension];
}

export interface LoweredPaymentParams {
  entries: ScheduleEntry[];
  newAmountCents: number;
  effectiveDate: Date;
  endDate: Date | null;
  adjustmentId: string;
}

/**
 * Applies a lowered payment amount to pending entries within [effectiveDate, endDate). If endDate is
 * omitted the lower amount applies to all remaining pending entries indefinitely; the final entry
 * still absorbs whatever true balance remains (see buildEvenScheduleAmountsCents), so debt is never
 * silently forgiven -- it shows up as a larger-than-"lowered" final payment unless a human later
 * schedules a proper recast.
 */
export function applyLoweredPayment({ entries, newAmountCents, effectiveDate, endDate, adjustmentId }: LoweredPaymentParams): ScheduleEntry[] {
  return entries.map((entry) => {
    if (entry.status !== "pending") return entry;
    const inWindow =
      entry.dueDate.getTime() >= effectiveDate.getTime() && (endDate === null || entry.dueDate.getTime() < endDate.getTime());
    if (!inWindow) return entry;
    return { ...entry, scheduledAmountCents: newAmountCents, adjustmentId };
  });
}

export function scheduleBalanceRemainingCents(entries: ScheduleEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.status === "posted") return sum + (entry.postedAmountCents ?? entry.scheduledAmountCents);
    return sum;
  }, 0);
}

export function scheduleTotalCents(entries: ScheduleEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.status === "paused") return sum;
    return sum + entry.scheduledAmountCents;
  }, 0);
}

export { scheduledPaymentCents };
