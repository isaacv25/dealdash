const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const utcDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatCurrency(value?: number) {
  return currencyFormatter.format(value || 0);
}

export function formatDate(value?: string) {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

/**
 * Payment schedule due dates are stored as UTC-midnight instants representing a calendar date (see
 * schedule.ts), not a real point in time -- formatting them with the viewer's local timezone can
 * shift the displayed day by one in any timezone behind UTC. Always render them in UTC instead.
 */
export function formatCalendarDate(value?: string) {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return utcDateFormatter.format(parsed);
}

export function dateInputToIso(value: string) {
  return value ? `${value}T00:00:00.000Z` : undefined;
}

export function toDateInput(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const [, month, day, year] = dateMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/**
 * Formats a phone number as (###) ###-#### purely from its digits, regardless of how those digits
 * are currently separated -- so it works both live (reformatting on every keystroke in PhoneField)
 * and once, on values imported from CSV in other shapes ("212-555-1234", "1 212 555 1234", plain
 * digits, ...). A leading "1" on an 11-digit number is treated as a US country code and dropped.
 */
export function formatPhoneNumber(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
