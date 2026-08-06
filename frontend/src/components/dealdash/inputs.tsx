"use client";

import { useEffect, useId, useState } from "react";
import { formatPhoneNumber } from "@/lib/dealdash/format";

/**
 * A plain controlled <input type="number"> that re-derives its `value` from external state on
 * every render fights the user mid-keystroke: reformatting (e.g. toFixed(1)) strips a trailing
 * decimal point the instant it's typed, so "12.5" can never be entered -- only "12" then "125"
 * land. This component keeps an internal string draft that free-types normally, and only
 * re-syncs from the external `value` prop when the field is not focused (i.e. after a save
 * round-trip, or when a different deal's data arrives). Suffix rendering (e.g. "%") is layered on
 * top of the input via CSS rather than embedded in the value, so it never interferes with typing.
 */
export function DecimalField({
  value,
  onCommit,
  suffix,
  min,
  max,
  decimals = 2,
  placeholder,
  className,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  /** Max decimal places kept on commit / when re-syncing the display. Factor rates want 3-4;
   *  money and percentages want 2. Free-typing is never rounded mid-entry -- only on commit. */
  decimals?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatValue(value));

  useEffect(() => {
    if (!focused) setDraft(formatValue(value));
    // formatValue depends on `decimals`; re-sync if that ever changes too.
  }, [value, focused, decimals]);

  function formatValue(v: number) {
    if (v === 0) return "";
    const factor = 10 ** decimals;
    return String(Math.round(v * factor) / factor);
  }

  function commit(raw: string) {
    const parsed = Number.parseFloat(raw);
    let next = Number.isFinite(parsed) ? parsed : 0;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    const factor = 10 ** decimals;
    next = Math.round(next * factor) / factor;
    onCommit(next);
    setDraft(formatValue(next));
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={`field w-full text-sm ${suffix ? "pr-7" : ""} ${className ?? ""}`}
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const next = e.target.value;
          // Allow free typing of digits, one leading minus, and one decimal point.
          if (/^-?\d*\.?\d*$/.test(next)) setDraft(next);
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * A plain controlled phone input that reformats to (###) ###-#### on every keystroke. Because the
 * displayed value is always `formatPhoneNumber(value)`, typing digits anywhere and deleting
 * characters both just re-derive the format from whatever digits remain -- no separate draft state
 * needed the way DecimalField needs one for free-typing decimals.
 */
export function PhoneField({
  value,
  onChange,
  placeholder = "(555) 123-4567",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      className={`field text-sm ${className ?? ""}`}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={(e) => onChange(formatPhoneNumber(e.target.value))}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}
