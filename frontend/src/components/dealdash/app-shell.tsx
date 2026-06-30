"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Calculator, DatabaseBackup, HandCoins, LogOut, PhoneCall, RefreshCcw } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useDealdash } from "./state";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/funded-progress", label: "Funded Progress", icon: HandCoins },
  { href: "/pipeline", label: "Pipeline", icon: RefreshCcw },
  { href: "/follow-ups", label: "Follow-Ups", icon: PhoneCall },
  { href: "/rate-calculator", label: "Rate Calculator", icon: Calculator },
  { href: "/imports", label: "Imports", icon: DatabaseBackup },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { data, resetToSeed } = useDealdash();

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-4 lg:px-6 lg:py-6">
      <div className="app-grid">
        <aside className="glass-card rounded-[2rem] p-5 lg:sticky lg:top-6">
          {/* Sidebar header / branding */}
          <div className="mb-8 rounded-[1.6rem] bg-[linear-gradient(135deg,_rgba(21,94,239,0.18),_rgba(13,148,136,0.14))] p-5">
            <div className="pill bg-white/78 text-[var(--accent-strong)]">Dealdash</div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">MCA Operating System</h1>
            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
              Live deal economics, pipeline tracking, and follow-up management.
            </p>
            {/* Shows whether data was seeded from CSVs or sample data */}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="pill bg-white text-[var(--foreground)]">
                {data.sourceMode === "csv" ? "CSV seeded" : "Sample data"}
              </span>
              <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                Browser-saved
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-[1.15rem] px-4 py-3 text-sm transition ${
                    active
                      ? "bg-[linear-gradient(135deg,_rgba(21,94,239,0.18),_rgba(13,148,136,0.12))] font-semibold text-[var(--accent-strong)]"
                      : "hover:bg-white/70"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 space-y-2">
            {/* Reset clears localStorage and restores the CSV-seeded snapshot */}
            <button className="ghost-button w-full text-sm" onClick={resetToSeed} type="button">
              Reset to CSV Snapshot
            </button>
            <form action={logoutAction}>
              <button className="ghost-button flex w-full items-center justify-center gap-2 text-sm" type="submit">
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </form>
          </div>
        </aside>

        <section className="space-y-4">{children}</section>
      </div>
    </main>
  );
}
