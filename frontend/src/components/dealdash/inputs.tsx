"use client";

import { useEffect, useId, useState } from "react";

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
  placeholder,
  className,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatValue(value));

  useEffect(() => {
    if (!focused) setDraft(formatValue(value));
  }, [value, focused]);

  function formatValue(v: number) {
    return v === 0 ? "" : String(Math.round(v * 100) / 100);
  }

  function commit(raw: string) {
    const parsed = Number.parseFloat(raw);
    let next = Number.isFinite(parsed) ? parsed : 0;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
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
