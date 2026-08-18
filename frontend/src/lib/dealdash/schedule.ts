import type { PaymentFrequency } from "./types";
import { buildEvenScheduleAmountsCents, scheduledPaymentCents } from "./finance.ts";

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

// ── Federal holiday calendar ────────────────────────────────────────────────
// Computed algorithmically (not a hardcoded table) so it never goes stale. Covers the 11 holidays
// banks/the Federal Reserve observe. Each fixed-date holiday is shifted to its "observed" weekday
// when the actual date falls on a weekend (Saturday -> observed Friday, Sunday -> observed Monday),
// matching federal practice; floating holidays (already Mon/Thu) need no such shift.

function nthWeekdayOfMonthUtc(year: number, monthIndex0: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = new Date(Date.UTC(year, monthIndex0, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, monthIndex0, 1 + offset + (n - 1) * 7));
  }
  // n < 0: count back from the last day of the month (e.g. -1 = last occurrence).
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const offset = (lastDayOfMonth.getUTCDay() - weekday + 7) % 7;
  return addUtcDays(lastDayOfMonth, -offset);
}

function observedDate(fixedDate: Date): Date {
  const day = fixedDate.getUTCDay();
  if (day === 6) return addUtcDays(fixedDate, -1);
  if (day === 0) return addUtcDays(fixedDate, 1);
  return fixedDate;
}

/** The 11 US federal holidays (observed dates) for a given calendar year, in date order. */
export function federalHolidaysForYear(year: number): Date[] {
  return [
    observedDate(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    nthWeekdayOfMonthUtc(year, 0, 1, 3), // Martin Luther King Jr. Day -- 3rd Monday of January
    nthWeekdayOfMonthUtc(year, 1, 1, 3), // Washington's Birthday (Presidents Day) -- 3rd Monday of February
    nthWeekdayOfMonthUtc(year, 4, 1, -1), // Memorial Day -- last Monday of May
    observedDate(new Date(Date.UTC(year, 5, 19))), // Juneteenth
    observedDate(new Date(Date.UTC(year, 6, 4))), // Independence Day
    nthWeekdayOfMonthUtc(year, 8, 1, 1), // Labor Day -- 1st Monday of September
    nthWeekdayOfMonthUtc(year, 9, 1, 2), // Columbus Day -- 2nd Monday of October
    observedDate(new Date(Date.UTC(year, 10, 11))), // Veterans Day
    nthWeekdayOfMonthUtc(year, 10, 4, 4), // Thanksgiving -- 4th Thursday of November
    observedDate(new Date(Date.UTC(year, 11, 25))), // Christmas Day
  ];
}

const holidaySetCache = new Map<number, Set<string>>();
function holidaySetForYear(year: number): Set<string> {
  let set = holidaySetCache.get(year);
  if (!set) {
    set = new Set(federalHolidaysForYear(year).map((d) => d.toISOString().slice(0, 10)));
    holidaySetCache.set(year, set);
  }
  return set;
}

export function isFederalHolidayUtc(date: Date): boolean {
  return holidaySetForYear(date.getUTCFullYear()).has(date.toISOString().slice(0, 10));
}

/** True for a weekend day OR an observed federal holiday -- i.e. a day nothing debits on. */
export function isNonBankDayUtc(date: Date): boolean {
  return isWeekendUtc(date) || isFederalHolidayUtc(date);
}

/** Returns the first date on or after `from` whose UTC weekday matches `weekday` (0=Sun..6=Sat). */
export function nextOrSameWeekday(from: Date, weekday: number): Date {
  const currentDay = from.getUTCDay();
  const delta = (weekday - currentDay + 7) % 7;
  return addUtcDays(from, delta);
}

/** First business day (Mon-Fri, and not a federal holiday) on or after `from`. Daily schedules only. */
export function nextOrSameBusinessDay(from: Date): Date {
  let cursor = from;
  while (isNonBankDayUtc(cursor)) {
    cursor = addUtcDays(cursor, 1);
  }
  return cursor;
}

/**
 * First date on or after `from` that isn't a federal holiday -- unlike nextOrSameBusinessDay, this
 * does NOT skip weekends. Weekly schedules intentionally support any chosen weekday including
 * Saturday/Sunday (that's the whole point of "pick a payment day"); only an *actual holiday* should
 * ever move a weekly/monthly due date off the day the user chose.
 */
export function nextNonHolidayUtc(from: Date): Date {
  let cursor = from;
  while (isFederalHolidayUtc(cursor)) {
    cursor = addUtcDays(cursor, 1);
  }
  return cursor;
}

/**
 * The anchor a brand-new schedule is built from. Collection never starts on the funding day itself.
 * Daily/monthly deals start the day after funding (datesForDaily/datesForMonthly further roll a
 * non-bank day forward). Weekly deals start a full week out -- the first payment lands on the
 * selected weekday during the week *following* funding (e.g. funded Monday, weekday Monday -> first
 * payment is next Monday, exactly 7 days out; funded Monday, weekday Wednesday -> first payment is
 * the Wednesday 9-13 days out, never the same-week Wednesday 2 days after funding). An explicit
 * firstPaymentDate, when the user has set one, always wins over either default.
 */
export function firstPaymentAnchor(fundedDate: Date, frequency: PaymentFrequency, firstPaymentDate?: Date | null): Date {
  if (firstPaymentDate) return firstPaymentDate;
  if (frequency === "weekly") return addUtcDays(fundedDate, 7);
  return addUtcDays(fundedDate, 1);
}

/**
 * `nextNonHolidayUtc` on each generated date, not just the anchor -- so a weekly payment that would
 * otherwise land exactly on a federal holiday shifts one day for that occurrence, rather than
 * silently scheduling a debit on a day nothing actually debits. Weekends are never shifted here: the
 * chosen weekday (including Saturday/Sunday, if ever selected) is honored every other week.
 */
export function datesForWeekly(anchor: Date, weekday: number, count: number): Date[] {
  if (count <= 0) return [];
  const first = nextOrSameWeekday(anchor, weekday);
  return Array.from({ length: count }, (_, i) => nextNonHolidayUtc(addUtcDays(first, i * 7)));
}

/** "Daily" means business days (Mon-Fri, excluding federal holidays) only. */
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
    return nextOrSameBusinessDay(d);
  });
}

function datesForFrequency(anchorDate: Date, frequency: PaymentFrequency, weekday: number | null, periods: number): Date[] {
  return frequency === "weekly"
    ? datesForWeekly(anchorDate, weekday ?? anchorDate.getUTCDay(), periods)
    : frequency === "monthly"
      ? datesForMonthly(anchorDate, periods)
      : datesForDaily(anchorDate, periods);
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
  const dates = datesForFrequency(anchorDate, frequency, weekday, periods);
  const amounts = buildEvenScheduleAmountsCents(totalCents, periods);
  return dates.map((dueDate, i) => ({
    sequence: i + 1,
    dueDate,
    scheduledAmountCents: amounts[i] ?? 0,
    status: "pending" as const,
  }));
}

/**
 * The deal's maturity/end date for a brand-new schedule with these terms -- the due date of the
 * last scheduled payment. Used both to persist a real end date once a schedule exists and to show an
 * estimated one before a schedule has been generated.
 */
export function scheduleEndDate(anchorDate: Date, frequency: PaymentFrequency, weekday: number | null, periods: number): Date | undefined {
  if (periods <= 0) return undefined;
  return datesForFrequency(anchorDate, frequency, weekday, periods).at(-1);
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
  /**
   * When true, already-*posted* payments inside the window are reversed to "paused" too, not just
   * still-pending ones. This is the "retroactive correction" path: the broker is recording that
   * payments the cron optimistically posted in past weeks were in fact on hold and never collected,
   * so they stop counting toward paid (raising the balance) and are made up at the tail like any
   * other pause. Their collected amount is cleared here; the service layer clears the posted metadata
   * on the row and reopens a deal that was marked complete.
   */
  retroactive?: boolean;
}

/**
 * Default business rule (see docs/DATA_MODEL.md): paused payments are skipped, not compressed into
 * the remaining schedule. Every entry inside the pause window is marked "paused" (it will never
 * post) and an equal number of same-amount periods are appended after the current schedule tail,
 * following the existing cadence, so the deal's maturity date extends by exactly the paused period
 * count rather than the payoff amount silently shrinking. By default only still-pending entries are
 * eligible; pass `retroactive` to also reverse already-posted entries in a backdated window.
 */
export function applyPause({ entries, pauseStart, resumeDate, frequency, weekday, retroactive = false }: PauseParams): ScheduleEntry[] {
  const paused: ScheduleEntry[] = [];
  const untouched: ScheduleEntry[] = [];

  for (const entry of entries) {
    const eligible = entry.status === "pending" || (retroactive && entry.status === "posted");
    const inWindow =
      eligible &&
      entry.dueDate.getTime() >= pauseStart.getTime() &&
      (resumeDate === null || entry.dueDate.getTime() < resumeDate.getTime());
    if (inWindow) {
      // Clear any collected amount: a paused entry never really posted, so it must stop counting as paid.
      paused.push({ ...entry, status: "paused", postedAmountCents: undefined });
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
  /**
   * When true, already-*posted* payments in the window are corrected down to the lower amount too
   * (the broker is recording that past debits actually collected less than the schedule assumed).
   * Both the scheduled and posted amount on those rows drop to the new figure so every downstream
   * total -- calendar-"due" and actually-"posted" alike -- reflects the correction and the balance
   * rises. A posted payment is only ever lowered, never raised, so a too-high `newAmount` is clamped.
   */
  retroactive?: boolean;
}

/**
 * Applies a lowered payment amount to entries within [effectiveDate, endDate). If endDate is omitted
 * the lower amount applies to all remaining entries in the window indefinitely; the final pending
 * entry still absorbs whatever true balance remains (see buildEvenScheduleAmountsCents), so debt is
 * never silently forgiven -- it shows up as a larger-than-"lowered" final payment unless a human
 * later schedules a proper recast. By default only pending entries change; pass `retroactive` to also
 * correct already-posted entries in a backdated window.
 */
export function applyLoweredPayment({ entries, newAmountCents, effectiveDate, endDate, adjustmentId, retroactive = false }: LoweredPaymentParams): ScheduleEntry[] {
  return entries.map((entry) => {
    const inWindow =
      entry.dueDate.getTime() >= effectiveDate.getTime() && (endDate === null || entry.dueDate.getTime() < endDate.getTime());
    if (!inWindow) return entry;
    if (entry.status === "pending") {
      return { ...entry, scheduledAmountCents: newAmountCents, adjustmentId };
    }
    if (retroactive && entry.status === "posted") {
      // Correct both the scheduled and collected figure down (never up) so due- and posted-based
      // progress agree; the un-collected difference reappears as outstanding balance.
      const corrected = Math.min(newAmountCents, entry.scheduledAmountCents);
      return { ...entry, scheduledAmountCents: corrected, postedAmountCents: corrected, adjustmentId };
    }
    return entry;
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
