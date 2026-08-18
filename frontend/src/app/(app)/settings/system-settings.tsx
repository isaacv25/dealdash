"use client";

import { useEffect, useState, useTransition } from "react";
import { updateRenewalTermFractionAction } from "@/app/(app)/actions";

const THEME_STORAGE_KEY = "dealdash.theme";

/**
 * System-level settings (theme + renewal sensitivity). Client component because both settings need
 * to reflect instantly:
 *   - Theme flips document.documentElement's data-theme attribute so every var(--foo) re-resolves;
 *     also persisted to localStorage so the root layout's blocking init script picks it up on the
 *     next page load with no flash.
 *   - Renewal sensitivity persists via a server action to the User row; the value the user sees on
 *     open comes from that server value (props), while the input reflects local edits until save.
 */
export function SystemSettingsSection({ initialRenewalPercent }: { initialRenewalPercent: number }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [percentInput, setPercentInput] = useState<string>(String(initialRenewalPercent));
  const [pending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState<null | "saved" | "error">(null);

  // Hydrate the theme from what the pre-hydration init script already stamped on <html>, so this
  // component and the DOM never disagree.
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    // The blocking root script owns the first paint; this effect only mirrors that external DOM
    // state into the segmented control after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (attr === "dark") setTheme("dark");
    else setTheme("light");
  }, []);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode etc.) -- theme still applies for this session.
    }
  }

  function saveRenewal() {
    const parsed = Number.parseFloat(percentInput);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 100) {
      setSavedFlash("error");
      return;
    }
    startTransition(async () => {
      try {
        await updateRenewalTermFractionAction(parsed / 100);
        setSavedFlash("saved");
      } catch {
        setSavedFlash("error");
      }
    });
  }

  useEffect(() => {
    if (!savedFlash) return;
    const timer = setTimeout(() => setSavedFlash(null), 2400);
    return () => clearTimeout(timer);
  }, [savedFlash]);

  return (
    <section className="rounded-[1.2rem] border border-[var(--line)] bg-white/78 p-4 xl:col-span-2">
      <h3 className="text-base font-semibold">System</h3>
      <p className="mt-0.5 text-xs text-[var(--muted)]">Appearance and business-rule preferences for your workspace.</p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {/* Theme */}
        <div className="space-y-2">
          <span className="text-sm font-semibold text-[var(--muted)]">Theme</span>
          <div className="inline-flex rounded-[0.9rem] border border-[var(--line)] bg-white/60 p-0.5">
            <button
              type="button"
              onClick={() => applyTheme("light")}
              aria-pressed={theme === "light"}
              className={`rounded-[0.75rem] px-3 py-1.5 text-sm font-semibold transition ${
                theme === "light" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)] hover:bg-white"
              }`}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => applyTheme("dark")}
              aria-pressed={theme === "dark"}
              className={`rounded-[0.75rem] px-3 py-1.5 text-sm font-semibold transition ${
                theme === "dark" ? "bg-[var(--accent-strong)] text-white" : "text-[var(--muted)] hover:bg-white"
              }`}
            >
              Dark
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">Applied instantly; remembered on this device.</p>
        </div>

        {/* Renewal sensitivity */}
        <div className="space-y-2">
          <label className="block space-y-1.5 text-sm font-semibold text-[var(--muted)]">
            Renewal sensitivity
            <div className="flex items-center gap-2">
              <input
                className="field"
                type="number"
                inputMode="numeric"
                min={5}
                max={100}
                step={1}
                value={percentInput}
                onChange={(e) => setPercentInput(e.target.value)}
                aria-label="Renewal sensitivity percent of term"
              />
              <span className="text-sm font-semibold">%</span>
              <button
                type="button"
                className="primary-button text-sm disabled:opacity-50"
                onClick={saveRenewal}
                disabled={pending || percentInput === String(initialRenewalPercent)}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </label>
          <p className="text-xs text-[var(--muted)]">
            Portion of each funded deal&apos;s term at which its Renewal Date is targeted (currently{" "}
            <span className="font-semibold">{initialRenewalPercent}%</span>). Lower = pitch renewals sooner.
          </p>
          {savedFlash === "saved" && <p className="text-xs font-semibold text-[var(--success)]">Saved.</p>}
          {savedFlash === "error" && <p className="text-xs font-semibold text-[var(--danger)]">Enter a whole number between 5 and 100.</p>}
        </div>
      </div>
    </section>
  );
}
