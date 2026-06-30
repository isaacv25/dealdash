export default function DocsPage() {
  return (
    <section className="glass-card rounded-[2rem] p-6 lg:p-8 space-y-10">
      <div>
        <div className="pill bg-[rgba(21,94,239,0.12)] text-[#155eef]">Docs</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">How DealDash works now</h2>
        <p className="mt-1 text-sm leading-6 text-[#5f7089]">This build now uses shared database persistence, account-based access, company-owned data, and financial visibility controls instead of browser-only storage.</p>
      </div>
      <DocSection title="Authentication and accounts">
        <p>DealDash now uses username and password authentication. The first account created in the system boots the legacy CSV-backed book into its company workspace and becomes that company&apos;s admin user.</p>
        <p className="mt-3">Each user belongs to exactly one company today. Future sessions can extend this into a richer membership or invite model without changing the ownership boundaries of the deal records.</p>
      </DocSection>
      <DocSection title="Data ownership and persistence">
        <p>Funded deals, pipeline records, follow-ups, and import batches are stored in Postgres via Prisma. Every row is scoped to a company ID, and every mutation runs through a server-side auth check before it can read or write that company&apos;s records.</p>
        <p className="mt-3">Browser state is now just an optimistic UI layer. The database is the system of record, so edits follow the user across devices and sessions.</p>
      </DocSection>
      <DocSection title="Funded progress and commissions">
        <p>The funded-progress math prefers manual balance overrides whenever you know the exact live payoff. Otherwise it estimates the remaining balance from funded date, payment cadence, and gross payback so the dashboard still shows a realistic working balance.</p>
        <p className="mt-3">Commission payout status is now tracked separately from deal performance status. That lets a file stay active while the commission itself is still pending, already paid out, or in clawback.</p>
      </DocSection>
      <DocSection title="Hidden financials">
        <p>Financial values start hidden for every newly created user. Use the sidebar toggle to reveal or hide money fields. That preference is stored on the user record so it follows the person rather than the browser.</p>
      </DocSection>
      <DocSection title="CSV imports and manual entry">
        <p>CSVs are still parsed in the browser for preview speed, but importing now hands the normalized rows to a server action. The server scopes each imported row to the company and upserts by a stable row key so re-importing the same source file updates instead of duplicating.</p>
        <p className="mt-3">Manual add/edit/delete actions also persist immediately to the database through server actions. No more device-specific local snapshots.</p>
      </DocSection>
      <DocSection title="Rate calculator assumptions">
        <p>The calculator models gross payback from funded amount times factor rate. If the payment amount is blank it derives one from term length and cadence. Monthly and daily approximations still use rounded business-friendly conversions, so treat APR-style output as a mockup rather than regulated disclosure math.</p>
      </DocSection>
      <DocSection title="Deployment requirements">
        <p>Production now requires a Postgres DATABASE_URL plus a SESSION_SECRET. Before the app can be used on a fresh environment, run Prisma against that database so the account and deal tables exist.</p>
      </DocSection>
    </section>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[rgba(19,34,56,0.1)] pt-8">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="mt-3 text-sm leading-7 text-[#5f7089]">{children}</div>
    </div>
  );
}
