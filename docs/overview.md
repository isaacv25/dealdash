# DealDash Project Overview

## What it is

DealDash is a Next.js-based MCA operating system for funded-deal tracking, pipeline management, follow-ups, CSV imports, and rate modeling. The current build is database-backed and account-aware so the same workspace can be used across devices instead of living inside one browser.

## Architecture

```text
dealdash/
|-- frontend/                  # Next.js 16 app deployed to Vercel
|   |-- src/app/               # Routes, layouts, login flow, server actions
|   |-- src/components/        # UI shell and views
|   |-- prisma/schema.prisma   # Active Prisma schema used by local/Vercel builds
|   |-- src/lib/auth.ts        # Session creation, password hashing, tenant auth checks
|   |-- src/lib/db/prisma.ts   # Prisma singleton for server actions and route loads
|   `-- src/lib/dealdash/      # Types, calculations, seed loading, normalization, workspace persistence
|-- data/imports/              # Local CSV seed directory + Vercel-safe fallback source material
`-- docs/                      # Project continuation and deployment notes
```

## Runtime model

1. Login/signup happens through server actions in `frontend/src/app/login/actions.ts`.
2. Successful auth creates a database-backed session cookie.
3. The `(app)` layout resolves the current user, loads the company-owned workspace from Postgres, and hydrates the client provider.
4. The provider performs optimistic updates in the browser while server actions persist each mutation to the database.
5. CSV imports are parsed in the browser for preview, then upserted on the server with company-scoped dedupe keys.
6. Inline edits are debounced before persistence so typing stays stable and late server responses do not overwrite the focused field.

## Persistence architecture

- Postgres is the source of truth.
- Prisma schema lives at `frontend/prisma/schema.prisma`.
- Each record belongs to a `Company`.
- Each `User` belongs to exactly one company today.
- `Session` rows back the auth cookie.
- `FundedDeal`, `PipelineDeal`, `FollowUpItem`, and `ImportBatch` all carry `companyId` ownership.
- `FundedDeal`, `PipelineDeal`, and `FollowUpItem` use `deletedAt` soft deletes; normal workspace loads exclude trashed rows.
- `/trash` lists recoverable records for 30 calendar days and lets users restore them or permanently delete them.

## Auth and account model

- First-time setup happens through the signup tab on `/login`.
- The first account created in the whole system seeds the bundled legacy CSV dataset into its company workspace.
- Later accounts create clean company workspaces by default.
- Passwords are stored with `scrypt` as `salt:hash`.
- Sessions are stored in Postgres using a hashed session token.
- New signups default to `role = "user"`.
- The `/admin` page uses a server-side role check and is only visible in navigation to admin users.
- The live database is backfilled so the existing Ethan account is the sole admin.

## Settings model

- Logged-in users can update first name, last name, username, company name, and password from `/settings`.
- Usernames remain globally unique through the Prisma unique constraint and a server-side availability check.
- Company names are not unique; multiple workspaces can share the same display name.
- Password changes require the current password and reuse the existing `scrypt` hashing helper in `frontend/src/lib/auth.ts`.

## Funded progress calculations

- Gross payback = `fundedAmount * factorRate`, computed in integer cents (`frontend/src/lib/dealdash/finance.ts`) so results never drift from JS float rounding.
- Progress resolves in a strict priority order (see `docs/DATA_MODEL.md` "Repayment progress priority"): completed-schedule flag, then manual balance override, then the **schedule** (payments **due by now** per the calendar, or actually-posted payments where those run ahead), then an elapsed-time estimate as the fallback for deals without a generated schedule.
- When a schedule exists, the bar reflects how many payments the calendar says should be in by now -- so a deal funded three weeks ago on a daily schedule immediately shows ~15 payments in, **without** waiting for the cron poster to sweep. The cron still posts each due payment as ground truth (advancing `postedAmount`, and eventually flipping the completed-schedule flag), and posted figures override the calendar whenever a merchant pays ahead. A merchant who has silently *stopped* paying still reads as on-schedule until a manual balance override corrects it -- the board shows the expectation absent contrary info, which is how a broker reads it.
- The Funded Progress cards are collapsed to a summary (badges, name, funder, funded amount, remaining balance, progress bar) and expand on click to the full inline editor + advanced servicing panel. Numeric fields are free-typing decimal text boxes (`DecimalField`), not spinner inputs, so values like `1.499` or `10.4` type cleanly. The identity grid also has Phone (`PhoneField`) and Email inputs, so a funded deal's contact info is captured right alongside name/business/funder.
- **Payment $ auto-fills** as Deal Economics fields are edited. `FundedDealCard`'s `updateDealEconomics` recalculates it from `calculateDeal` (funded amount / factor rate / term / frequency) whenever any of those change, for every non-HELOC deal type -- the same math the Advanced panel's "Recalculate schedule" already applied, now live instead of requiring that separate manual step. It's still a free `DecimalField`, so a broker can type over it to match a funder's actual invoice; the override just stays until a trigger field changes again. HELOC's payment stays server-derived (`deriveHelocFields`), untouched by this.
- Deals with a persisted payment schedule (see below) have a second, more precise balance available in the "Advanced adjustments" panel: calculated from actual posted `PaymentScheduleEntry` rows rather than elapsed-time estimation.
- Renewal timing defaults to **50%** of the term unless manually overridden (marketed once a deal is roughly half paid down, not near maturity).
- Every funded deal shows an **expected end date** (its maturity date) -- `expectedEndDateForFundedDeal` (`calculations.ts`) prefers the persisted schedule's real last-payment date (`scheduleEndDate`) and falls back to an estimate computed with the exact same schedule date math when no schedule exists yet, so the date is always available. Rendered with `formatCalendarDate` (UTC) since it's a calendar date.
- Commission payout status is tracked separately from the funded file status.
- Funded tags are persisted on `fundedTags` and augmented at render time from obvious status/math signals.
- Tag tint priority is deliberate: clawback red wins, then paid-in-full green, then active blue.

## Deal types

Every funded deal has a `dealType`: **MCA** (default), **HELOC**, **Renewal**, or **Add-on**. MCA,
Renewal, and Add-on all use the same factor-rate economics; Renewal/Add-on additionally support
linking to an original MCA deal (`relatedDealId`) so a client's history is traceable. HELOC prices on
Amount/APR/Term-years instead, with its factor-rate-shaped fields derived automatically (see
`docs/DATA_MODEL.md` "Deal types"). Every deal type also has a PSF $ field, paid out at the broker
split % alongside commission, tallied as Total Payout. See `docs/DATA_MODEL.md` for the full model.

**A Renewal pays off the deal it renews.** The moment a Renewal-type deal is linked to an original
deal via "Renewal of", the original deal is marked fully repaid: `scheduleCompletedAt` is set to now
and `statusStage` to `"paid-out"` -- the exact fields the cron poster sets when a schedule finishes
naturally (`schedule-service.ts`), so the "Paid in full" tag/badge and 100% progress bar just fall
out of the normal progress math (`progressForFundedDeal` treats `scheduleCompletedAt` as
authoritative) rather than needing a separate flag. This only fires forward, when a link is first
picked -- clearing or changing the link never un-marks the original deal, so it can't silently undo a
deal's real repayment state. Add-on deals stack on top rather than paying anything off, so linking one
never marks anything paid.

## Payment schedule, adjustments, and cron automation

See `docs/DATA_MODEL.md` for the full model reference and calculation formulas. Summary:

- Every funded deal can have a persisted `PaymentScheduleEntry` per contractual payment, generated or
  recast via the "Recalculate schedule" button on the deal card (`frontend/src/lib/dealdash/schedule.ts`
  for the pure date/amount math, `schedule-service.ts` for the Prisma-backed read/write layer). A
  deal's initial schedule is now also generated **automatically** the moment it has valid terms (see
  "Automatic schedule generation" in `docs/DATA_MODEL.md`) -- no manual click required, and a
  one-time backfill self-heals any deal that predates this (imports, seed data, older funded deals).
- Weekly deals pick a payment weekday; daily deals post on business days only, and now also skip the
  11 US federal holidays (computed algorithmically, not a hardcoded table -- see "Federal holiday
  calendar" in `docs/DATA_MODEL.md`), not just weekends.
- `/api/cron/post-payments`, called hourly by Vercel Cron and protected by `CRON_SECRET`, posts every
  due-or-overdue pending entry, timezone-aware via `frontend/src/lib/dealdash/timezone.ts`
  (America/New_York, DST-safe), and is idempotent by design (compare-and-swap updates keyed on
  `status: "pending"`).
- Users can apply a lowered-payment period or a pause (`PaymentAdjustment`) from the deal card; both
  require a reason and are recorded in an append-only `AuditEntry` history.
- The old unlabeled "Balance Override $" field is now "Override Calculated Balance" inside a
  collapsed-by-default "Advanced adjustments" section, requires an effective date and reason, and
  shows calculated vs. overridden vs. difference explicitly.

## Dashboard quick-view reminders

The dashboard shows three dismissible reminder rails (`ReminderRail`/`ReminderItem` in `views.tsx`),
each backed by a pure predicate in `calculations.ts` so the rules are testable and shared:

- **Upcoming follow-ups** -- a follow-up surfaces once ~a month (`FOLLOW_UP_DASHBOARD_AGE_DAYS` = 30)
  has passed since it was added (`createdAt`) and it is still open. Each has an **Acknowledge** action
  that sets `FollowUpItem.dashboardAckAt` to silence it on the dashboard (it stays on the Follow-Ups
  sheet).
- **Upcoming renewals** -- a funded deal appears once it is `RENEWAL_CANDIDATE_MIN_PERCENT` (35%) or
  more paid down. **Dismiss** sets `FundedDeal.renewalAckAt` and removes it for good.
- **Need new statements** -- a pipeline lead appears once it has rolled into a later calendar month
  than it was submitted in (bank statements are monthly, so last month's are stale), unless it is a
  terminal stage: Bad Deal/Blacklisted (`dead`), `declined`, or `funded`. **Got statements** sets
  `PipelineDeal.statementsAckAt`, snoozing it until the next month begins; mark a lead
  Bad Deal/Blacklisted to remove it for good.

Import history (Recent import batches) lives on the Imports page now, not the dashboard, which stays
focused on operating reminders.

## Hidden financials behavior

- `hideFinancialsByDefault` is stored on the `User` row.
- Dashboard KPI cards now have independent eye/eye-off visibility controls.
- Only dashboard visibility booleans are stored in `localStorage`; financial values are not stored there.
- The Rate Calculator (`/rate-calculator`) is the one exception: its output is always visible and
  does not consult this preference at all (see `docs/DATA_MODEL.md`'s "Hidden financials preference"
  section for why).

## CSV export

- Funded Progress, Pipeline, and Follow-Ups each have an **Export CSV** control (`ExportMenu` in
  `views.tsx`). It opens a popover with an optional From/To calendar-date range and a live "N of M
  rows" count; leaving both blank exports the whole dataset. The download filename is stamped with the
  range and today's date (e.g. `dealdash-pipeline_2026-07-01_to_2026-07-31_2026-08-11.csv`).
- Each view ranges on its own record date -- Funded on `fundedDate`, Pipeline on `submittedDate`,
  Follow-Ups on `createdAt` (labeled "Added") -- and exports the full workspace dataset for that view,
  independent of the on-screen search/stage/tag filters, so an export is always the complete slice for
  the chosen dates rather than whatever happens to be filtered on screen.
- The range test and CSV serialization are pure helpers in `lib/dealdash/csv.ts`
  (`isWithinDateRange`, `serializeCsvRows`), unit-tested in `__tests__/csv.test.ts`; every cell is
  quoted and embedded quotes doubled, so commas/quotes/newlines inside a value never break the file.

## Rate Calculator

- Standalone, non-persisted scenario tool at `/rate-calculator`; math lives in
  `frontend/src/lib/dealdash/rate-scenario.ts` (`calculateRateScenario`), covered by
  `frontend/src/lib/dealdash/__tests__/rate-scenario.test.ts`.
- Inputs: funded amount, factor rate, fees, term value/unit, ISO points %, rep points %,
  syndication %, bonus. Outputs: net funded amount, total payback, payment amount, rep profit.
- See `docs/DATA_MODEL.md` for the exact formulas and the intentional simplifications (no
  syndicator management fees modeled, payments assumed once per term-unit period).

## Pipeline board

- **Stage filters** (labels the broker uses; keys unchanged): New Lead/Missing Statements, Submitted,
  Pending Review, Approved, Contracts Sent, Funded, Declined, Bad Deal/Blacklisted. "renewal" is no
  longer an offered pipeline stage (renewals are tracked on the funded/dashboard side) but stays
  defined so any legacy record still renders.
- **Search matches any field** on a lead -- business, contact, email, phone, request, city/state, raw
  status, notes, lead sheet -- so e.g. "john" finds every John however he appears.
- **Lead sheets** (`LeadSheet` model) are a named, reusable, company-scoped list a broker builds up
  once ("Sheet A", "Facebook Leads", ...) via the toolbar's "+" control, then re-selects on every deal
  that came from it -- replacing the old free-text "raw status" field on each card. The toolbar's
  "Lead sheet" dropdown filters the board by sheet and shows each sheet's deal count inline
  (`sheetCounts`), so it doubles as a source-of-leads breakdown. Legacy/imported deals whose
  `sheetLabel` was never formally added as a `LeadSheet` row still show up in the list automatically
  (`loadWorkspace` merges in any distinct `sheetLabel` values not already present).
- Leads sort **most recent lead date first** -- a straight recency ranking, not clustered by stage --
  so the board reads like a feed of what came in, in order.
- Grouped into **collapsible month sections** keyed by lead/submitted date (newest month first;
  undated leads last), so leads can be tracked, scanned, and picked by the month they came in. Each
  month heading collapses/expands that month's grid; a secondary "Only this / Show all" control
  narrows the whole board to that one month. The month dropdown filter works alongside it.
- Month buckets use `getMonthKey`, which reads the stored **UTC** calendar date so a lead dated the
  1st of a month doesn't slip into the previous month in timezones behind UTC. The month dropdown
  (`buildMonthOptions`, shared with Funded Progress) lists **only months that actually contain
  records** -- newest first, labeled in full "Month Year" form (`getMonthHeading`, e.g. "August
  2026") -- so every option filters to real results instead of padding the list with empty future
  months.
- Within each month section, leads render as one fluid, uniform responsive card grid
  (`PipelineLeadCard`). Each card carries a colored top-border + stage dot (`pipelineStageColor`) so
  the stage reads at a glance while every field stays inline-editable. Phone is a live-formatting
  `PhoneField` (see "Phone formatting" below). "Next follow-up date" was dropped from the card -- it
  was never used and the schema field (`nextFollowUpDate`) stays only as a harmless legacy column.
- The filter bar is a colored, dotted stage rail with live per-stage counts plus an "All leads"
  reset and a "Showing X of Y" summary -- no separate "Stage filters" label.
- Deletion uses an inline two-step confirm (`InlineDeleteButton`: trash icon → Delete/Cancel),
  **not** a native `confirm()` dialog. Native dialogs can be permanently suppressed by the browser
  after a user ticks "don't show again", after which `confirm()` silently returns false and the
  delete never fires -- which is why deleting a lead previously appeared to do nothing. The armed
  state auto-cancels after a few seconds.

## Phone formatting

- Every phone field in the app (Pipeline lead cards, Follow-Ups rows, Funded deal cards) uses the
  shared `PhoneField` component (`components/dealdash/inputs.tsx`), which live-formats to
  `(###) ###-####` as digits are typed. The formatting itself is the pure `formatPhoneNumber`
  helper (`lib/dealdash/format.ts`, tested in `__tests__/format.test.ts`) -- it re-derives the format
  from whatever digits remain on every keystroke (so typing and backspacing both just work) and also
  normalizes values imported from CSV in other shapes ("212-555-1234", an 11-digit number with a
  leading US country code, etc.).

## Month and date filtering

- Funded Progress filters by `fundedDate`.
- Pipeline filters by `submittedDate` from the original `Date App` CSV column.
- Missing or unparsable dates are grouped under `Unknown date` instead of being silently dropped.
- Month dropdowns include existing record months plus the current month and the next 12 future months, so newly added future-dated deals have an obvious bucket.
- When no month/stage/tag filters are selected, views intentionally show all matching records.
- Imported CSV date strings are normalized through the shared parsing helpers before persistence.
- Manual funded and pipeline adds include a date input; that selected date is persisted immediately and powers month tracking.

## CSV import and manual entry workflow

- Browser parsing keeps previews fast and avoids uploading raw files before the user confirms.
- Import destination (Funded Progress / Pipeline / Follow-Ups) is an explicit user choice per file,
  not an auto-detect gate -- `detectImportType` only supplies a starting guess.
- A column-mapping step (`frontend/src/lib/dealdash/import-fields.ts`) lets the user map arbitrary
  CSV headers to the app's canonical fields, with alias-based auto-guessing and manual override per
  field. See `docs/CSV_IMPORT_GUIDE.md` for the full field list per destination.
- The server scopes imported IDs to the company so the same sheet can be safely re-imported.
- Manual add/edit/delete calls are persisted through server actions, not local storage.
- Delete buttons soft-delete records into Trash rather than immediately removing them from Postgres.

## Testing

`frontend/src/lib/dealdash/__tests__/*.test.ts` covers the pure calculation, schedule-generation, and
timezone logic using Node's built-in test runner (no new test framework dependency). Run from
`frontend/`:

```powershell
pnpm test
```

`pnpm build` runs `pnpm test` first and fails the build if any test fails -- this is the quality gate
for the calculation/scheduling engine, since it has no UI to eyeball for correctness. Tests deliberately
do not touch Postgres (they exercise `finance.ts`, `schedule.ts`, and `timezone.ts` only, which are
pure functions); `schedule-service.ts` (the Prisma-backed layer) is exercised through manual/preview
verification instead, per `docs/VERCEL_DEPLOYMENT.md`.

## Continuing the project

Future Codex or developer sessions should start with these files first:

- `frontend/src/lib/dealdash/finance.ts` and `schedule.ts` (pure calculation/scheduling engine)
- `frontend/src/lib/dealdash/rate-scenario.ts` (standalone Rate Calculator math)
- `frontend/src/lib/dealdash/import-fields.ts` and `normalization.ts` (CSV column mapping + row normalization)
- `frontend/src/lib/dealdash/schedule-service.ts` (Prisma-backed read/write layer, cron poster)
- `frontend/src/lib/dealdash/workspace.ts`
- `frontend/src/lib/auth.ts`
- `frontend/prisma/schema.prisma`
- `frontend/src/components/dealdash/state.tsx`
- `frontend/src/components/dealdash/views.tsx`
- `frontend/src/components/dealdash/funded-deal-panel.tsx` (schedule/adjustments/override UI)
- `docs/DATA_MODEL.md`
- `docs/VERCEL_DEPLOYMENT.md`
