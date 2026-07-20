/**
 * All schedule dueDates are stored as UTC-midnight instants representing a calendar date (see
 * schedule.ts). The one place a real IANA timezone matters is deciding what "today" is in
 * America/New_York when the cron sweep runs. We lean entirely on Intl.DateTimeFormat for that
 * conversion instead of manual UTC-offset math, so standard-time/daylight-time transitions are
 * handled correctly without any special-casing here.
 */

const EASTERN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the America/New_York calendar date for `instant` as "YYYY-MM-DD". */
export function easternDateKey(instant: Date): string {
  return EASTERN_DATE_FORMATTER.format(instant);
}

/** Extracts the "YYYY-MM-DD" calendar date encoded in a UTC-midnight schedule dueDate. */
export function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A schedule entry is due once its calendar date has arrived (or passed) in America/New_York.
 * ISO "YYYY-MM-DD" strings compare correctly with plain `<=`, so no Date arithmetic is needed here.
 */
export function isDueInEastern(dueDate: Date, now: Date): boolean {
  return utcDateKey(dueDate) <= easternDateKey(now);
}
