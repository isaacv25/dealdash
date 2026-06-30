// Static docs page — no client state needed
export default function DocsPage() {
  return (
    <section className="glass-card rounded-[2rem] p-6 lg:p-8 space-y-10">
      {/* Header */}
      <div>
        <div className="pill bg-[rgba(21,94,239,0.12)] text-[#155eef]">Docs</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">How DealDash works</h2>
        <p className="mt-1 text-sm leading-6 text-[#5f7089]">
          Everything you need to know to get the most out of the app, manage your data, and add
          deals manually.
        </p>
      </div>

      {/* Section: Data storage */}
      <DocSection title="Where your data lives">
        <p>
          DealDash stores all of your edits in your browser&apos;s <strong>localStorage</strong>.
          Nothing is sent to a server or shared between devices. If you open the app on a different
          browser or clear your browser data, the app will reload the original CSV seed data.
        </p>
        <p className="mt-3">
          The initial seed data comes from your CSV files (Ethan&apos;s Deals 2025–2026, Contacted
          Leads, and the Funded Deals sheet) which are bundled into the deployment. The app detects
          these files automatically on first load and populates each section.
        </p>
        <p className="mt-3">
          Use <strong>Reset to CSV Snapshot</strong> in the sidebar to wipe your local edits and
          return to the original seeded state.
        </p>
      </DocSection>

      {/* Section: Dashboard */}
      <DocSection title="Dashboard">
        <p>
          A read-only snapshot of your book. Shows funded volume, gross payback, commission earned,
          open follow-ups, a monthly volume chart, top-funder bar chart, and the six most urgent
          follow-ups.
        </p>
        <p className="mt-3">
          All numbers on the Dashboard are derived live from the Funded Progress and Follow-Ups
          sections — there is nothing to edit here.
        </p>
      </DocSection>

      {/* Section: Funded Progress */}
      <DocSection title="Funded Progress">
        <p>
          Every funded deal lives here. Each row is fully editable inline — change the rate, term,
          payment amount, syndication, or commission and the payback math updates immediately.
        </p>
        <ul className="mt-3 space-y-2 text-sm list-disc list-inside text-[#5f7089]">
          <li>
            <strong className="text-[#132238]">Progress bar</strong> — shows percentage of gross
            payback collected, color-coded by status (blue = active, green = paid out, amber = slow
            pay / watch, red = clawback).
          </li>
          <li>
            <strong className="text-[#132238]">Balance</strong> — edit this field directly if you
            know the exact remaining balance. Overrides the calculated estimate.
          </li>
          <li>
            <strong className="text-[#132238]">Renewal date</strong> — auto-calculated at 70% of
            the term. Override it manually if needed.
          </li>
          <li>
            <strong className="text-[#132238]">Delete</strong> — the red trash icon permanently
            removes the row from your browser storage (a confirmation is required).
          </li>
        </ul>
        <p className="mt-3">
          Click <strong>+ Add Deal</strong> to create a blank funded deal row. Fill in the fields
          manually. Click <strong>Export</strong> to download the current filtered view as a CSV.
        </p>
      </DocSection>

      {/* Section: Pipeline */}
      <DocSection title="Pipeline">
        <p>
          Your monthly deal submissions organized by stage. Use the stage filter chips at the top to
          show/hide columns. Each card displays business name, contact, phone/email, request amount,
          current status, notes, and next follow-up date.
        </p>
        <p className="mt-3">
          The stage dropdown on each card moves the deal between columns instantly. Use{" "}
          <strong>+ Add Lead</strong> to manually add a new prospect.
        </p>
        <Callout>
          The status values from your CSV (e.g., &quot;Offer from BFG&quot;, &quot;Pending
          Review&quot;, &quot;FUNDED LIMITLESS&quot;) are automatically mapped to the correct stage
          column on import.
        </Callout>
      </DocSection>

      {/* Section: Follow-Ups */}
      <DocSection title="Follow-Ups">
        <p>
          Your contacted-leads callback queue. Each row has business name, contact, phone, request
          amount, last contact date, due date, priority (Low / Medium / High), app-submitted
          checkbox, completed checkbox, and free-form notes.
        </p>
        <p className="mt-3">
          Check <strong>Show completed</strong> to see leads you&apos;ve already closed out.
          Completed rows are dimmed in the table.
        </p>
      </DocSection>

      {/* Section: Rate Calculator */}
      <DocSection title="Rate Calculator">
        <p>
          A standalone live calculator for modeling MCA deals before you pitch. Set funded amount,
          factor rate, term, payment frequency, syndication %, points %, commission %, and clawback
          %. The output panel updates instantly with gross payback, periodic payment, syndication
          out, and net broker proceeds.
        </p>
        <p className="mt-3">
          Nothing entered here is saved — it&apos;s purely a scratchpad calculator.
        </p>
      </DocSection>

      {/* Section: Imports */}
      <DocSection title="Imports">
        <p>
          Upload one or more CSVs to add data on top of what&apos;s already in the workspace. The
          app auto-detects the CSV type based on column headers:
        </p>
        <ul className="mt-3 space-y-1 text-sm list-disc list-inside text-[#5f7089]">
          <li>
            <strong className="text-[#132238]">Funded deals</strong> — requires{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Amount</code> and{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Funder</code> columns.
          </li>
          <li>
            <strong className="text-[#132238]">Pipeline deals</strong> — requires{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Date App</code> and{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Business</code> columns.
          </li>
          <li>
            <strong className="text-[#132238]">Follow-ups / contacts</strong> — requires{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Full name</code> and{" "}
            <code className="text-xs bg-white/80 px-1 py-0.5 rounded">Date Last Contacted</code>{" "}
            columns.
          </li>
        </ul>
        <p className="mt-3">
          Imported rows are merged by ID — re-importing the same file won&apos;t create duplicates.
        </p>
      </DocSection>

      {/* Section: Tech stack */}
      <DocSection title="Tech stack">
        <ul className="space-y-1 text-sm list-disc list-inside text-[#5f7089]">
          <li>Next.js 16 (App Router, React 19)</li>
          <li>Tailwind CSS v4</li>
          <li>Recharts for data visualization</li>
          <li>Zod for CSV schema validation</li>
          <li>localStorage for client-side persistence</li>
          <li>Deployed on Vercel, source at github.com/isaacv25/dealdash</li>
        </ul>
      </DocSection>
    </section>
  );
}

// ─── local primitives ─────────────────────────────────────────────────────────

function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[rgba(19,34,56,0.1)] pt-8">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="mt-3 text-sm leading-7 text-[#5f7089]">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-[1rem] border border-[rgba(21,94,239,0.18)] bg-[rgba(21,94,239,0.06)] px-4 py-3 text-sm leading-6 text-[#132238]">
      {children}
    </div>
  );
}
