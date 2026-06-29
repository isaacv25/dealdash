"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Calculator, DatabaseBackup, HandCoins, LogOut, PhoneCall, RefreshCcw } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useDealdash } from "./state";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/funded-progress", label: "Funded Progress", icon: HandCoins },
  { href: "/pipeline", label: "Pipeline", icon: RefreshCcw },
  { href: "/follow-ups", label: "Follow-Ups", icon: PhoneCall },
  { href: "/rate-calculator", label: "Rate Calculator", icon: Calculator },
  { href: "/imports", label: "Imports", icon: DatabaseBackup },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { data, resetToSeed } = useDealdash();

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-4 lg:px-6 lg:py-6">
      <div className="app-grid">
        <aside className="glass-card rounded-[2rem] p-5 lg:sticky lg:top-6">
          <div className="mb-8 rounded-[1.6rem] bg-[linear-gradient(135deg,_rgba(21,94,239,0.18),_rgba(13,148,136,0.14))] p-5">
            <div className="pill bg-white/78 text-[var(--accent-strong)]">Dealdash</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">LetsBuild.Godspeed</h1>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              Funding operating system for one admin, live calculations, and sheet replacement momentum.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="pill bg-white text-[var(--foreground)]">
                {data.sourceMode === "csv" ? "Local CSV seed" : "Sample seed"}
              </span>
              <span className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                Browser-saved edits
              </span>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-[1.15rem] px-4 py-3 transition ${
                    active
                      ? "bg-[linear-gradient(135deg,_rgba(21,94,239,0.18),_rgba(13,148,136,0.12))] text-[var(--accent-strong)]"
                      : "hover:bg-white/70"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 space-y-3">
            <button className="ghost-button w-full" onClick={resetToSeed} type="button">
              Reset to Seed Snapshot
            </button>
            <form action={logoutAction}>
              <button className="ghost-button flex w-full items-center justify-center gap-2" type="submit">
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
