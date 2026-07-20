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
- If a balance override is present (`balanceOverrideAmount`, or the legacy `manualBalanceRemaining` for deals that predate it), that value wins for the progress bar and "remaining" figure.
- Otherwise DealDash estimates progress from funded date, payment cadence, and periodic payment amount -- this is a deliberate, documented estimate, not the schedule-backed authoritative balance.
- Deals with a persisted payment schedule (see below) have a second, more precise balance available in the "Advanced adjustments" panel: calculated from actual posted `PaymentScheduleEntry` rows rather than elapsed-time estimation.
- Renewal timing still defaults to 70% of the term unless manually overridden.
- Commission payout status is tracked separately from the funded file status.
- Funded tags are persisted on `fundedTags` and augmented at render time from obvious status/math signals.
- Tag tint priority is deliberate: clawback red wins, then paid-in-full green, then active blue.

## Payment schedule, adjustments, and cron automation

See `docs/DATA_MODEL.md` for the full model reference and calculation formulas. Summary:

- Every funded deal can have a persisted `PaymentScheduleEntry` per contractual payment, generated or
  recast via the "Recalculate schedule" button on the deal card (`frontend/src/lib/dealdash/schedule.ts`
  for the pure date/amount math, `schedule-service.ts` for the Prisma-backed read/write layer).
- Weekly deals pick a payment weekday; daily deals post on business days only (no holiday calendar).
- `/api/cron/post-payments`, called hourly by Vercel Cron and protected by `CRON_SECRET`, posts every
  due-or-overdue pending entry, timezone-aware via `frontend/src/lib/dealdash/timezone.ts`
  (America/New_York, DST-safe), and is idempotent by design (compare-and-swap updates keyed on
  `status: "pending"`).
- Users can apply a lowered-payment period or a pause (`PaymentAdjustment`) from the deal card; both
  require a reason and are recorded in an append-only `AuditEntry` history.
- The old unlabeled "Balance Override $" field is now "Override Calculated Balance" inside a
  collapsed-by-default "Advanced adjustments" section, requires an effective date and reason, and
  shows calculated vs. overridden vs. difference explicitly.

## Hidden financials behavior

- `hideFinancialsByDefault` is stored on the `User` row.
- Dashboard KPI cards now have independent eye/eye-off visibility controls.
- Only dashboard visibility booleans are stored in `localStorage`; financial values are not stored there.
- Other finance-heavy screens can still use the user preference as a default masking signal.

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
- `frontend/src/lib/dealdash/schedule-service.ts` (Prisma-backed read/write layer, cron poster)
- `frontend/src/lib/dealdash/workspace.ts`
- `frontend/src/lib/auth.ts`
- `frontend/prisma/schema.prisma`
- `frontend/src/components/dealdash/state.tsx`
- `frontend/src/components/dealdash/views.tsx`
- `frontend/src/components/dealdash/funded-deal-panel.tsx` (schedule/adjustments/override UI)
- `docs/DATA_MODEL.md`
- `docs/VERCEL_DEPLOYMENT.md`
