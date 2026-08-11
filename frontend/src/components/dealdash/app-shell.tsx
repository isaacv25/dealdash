"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Calculator, DatabaseBackup, HandCoins, LogOut, PhoneCall, RefreshCcw, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useDealdash } from "./state";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/funded-progress", label: "Funded Progress", icon: HandCoins },
  { href: "/pipeline", label: "Pipeline", icon: RefreshCcw },
  { href: "/follow-ups", label: "Follow-Ups", icon: PhoneCall },
  { href: "/rate-calculator", label: "Rate Calculator", icon: Calculator },
  { href: "/imports", label: "Imports", icon: DatabaseBackup },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { viewer } = useDealdash();
  const visibleNavItems = viewer.isAdmin
    ? [...navItems, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : navItems;

  // Identity badge (replaces the old "DB-backed" / "Live workspace" dev tags): initials avatar plus
  // the signed-in broker's name, company, and role -- something an actual user cares about.
  const initials =
    `${viewer.firstName?.[0] ?? ""}${viewer.lastName?.[0] ?? ""}`.toUpperCase() ||
    viewer.username?.[0]?.toUpperCase() ||
    "?";
  const roleLabel = viewer.isAdmin ? "Admin" : "Broker";

  return (
    <main className="mx-auto w-full max-w-[1760px] px-3 py-3 sm:px-4 lg:px-5 lg:py-5">
      <div className="app-grid">
        {/* Mobile: a compact top bar with a horizontally-scrolling nav. Desktop (lg+): the full
            sticky vertical sidebar. */}
        <aside className="glass-card rounded-[1.5rem] p-3 lg:sticky lg:top-5 lg:p-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[1.4rem] bg-[linear-gradient(140deg,_rgba(21,94,239,0.16),_rgba(13,148,136,0.12))] p-3 lg:mb-6 lg:block lg:p-4">
            <div className="min-w-0">
              {/* brand mark: small DealDash monogram + wordmark */}
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[0.5rem] bg-[linear-gradient(135deg,var(--accent-strong),var(--accent))] text-[11px] font-bold text-white shadow-sm">DD</span>
                <span className="text-sm font-semibold tracking-tight text-[var(--accent-strong)]">DealDash</span>
              </div>
              <h1 className="mt-3 hidden text-[1.05rem] font-semibold leading-snug tracking-tight lg:block">Book of Business Pipeline Dashboard</h1>
            </div>
            {/* Identity badge: avatar initials + name + company·role. Compact next to the brand on
                mobile; a full-width card under the heading on desktop. */}
            <div className="flex shrink-0 items-center gap-2.5 lg:mt-4 lg:w-full lg:rounded-[1rem] lg:bg-white/70 lg:p-2.5 lg:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--accent-strong),var(--accent))] text-xs font-bold uppercase text-white shadow-sm">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{viewer.firstName} {viewer.lastName}</p>
                <p className="truncate text-xs leading-tight text-[var(--muted)]">{viewer.companyName} · {roleLabel}</p>
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:space-y-1 lg:overflow-visible lg:pb-0">
            {visibleNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`interactive-link flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[0.95rem] px-3 py-2.5 text-sm transition lg:w-full lg:px-4 lg:py-3 ${active ? "bg-[linear-gradient(135deg,_rgba(21,94,239,0.18),_rgba(13,148,136,0.12))] font-semibold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_rgba(21,94,239,0.16)]" : "hover:bg-white/70"}`}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 lg:mt-6">
            <form action={logoutAction}>
              <button className="ghost-button flex w-full items-center justify-center gap-2 text-sm" type="submit"><LogOut className="h-4 w-4" />Log Out</button>
            </form>
          </div>
        </aside>
        {/* key on pathname so the page content remounts and replays dd-page-in on every
            navigation -- gives the app a consistent cross-fade/translate between tabs. */}
        <section key={pathname} className="dd-page-in space-y-4">{children}</section>
      </div>
    </main>
  );
}
