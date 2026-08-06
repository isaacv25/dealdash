# DealDash

DealDash is a production-shaped MCA operating system that now combines:

- funded deal progress tracking
- deals brought in / pipeline management
- follow-up queue management
- a live rate calculator
- database-backed persistence across devices
- company-scoped username/password access

## Repo structure

- `frontend`: Next.js App Router UI deployed to Vercel
- `backend`: Prisma schema and backend-oriented shared assets
- `data/imports`: local CSV seed source directory
- `docs`: continuation notes, data model docs, import guide, and deployment requirements

## What works now

- Username/password signup and login
- Company-owned Postgres persistence for funded deals, pipeline, follow-ups, and import history
- Dashboard metrics, charts, and three dismissible reminder rails: Upcoming follow-ups (a month after adding), Upcoming renewals (funded deals 35%+ paid), and Need new statements (pipeline leads that rolled into a new month, excluding bad deals)
- Funded progress tracking on expandable deal cards, with progress bars driven by actual cron-posted schedule payments (auto-updating as a deal is paid), decimal-friendly numeric inputs, manual balance overrides, and commission payout status; the card also captures name, email, and phone up front, and Payment $ auto-fills as funded amount/factor rate/term/frequency are edited
- Four deal types (MCA, HELOC, Renewal, Add-on) -- HELOC prices on Amount/APR/Term-years; Renewal/Add-on link back to an original MCA deal to trace a client's history -- plus a per-deal PSF $ fee tallied into a Total Payout alongside commission. Linking a Renewal to its original deal marks that original deal Paid in Full, since a renewal pays off the old balance
- Payment schedules generate automatically once a deal has valid terms (no manual "Recalculate schedule" click needed), skip the 11 US federal holidays as well as weekends, start the day after funding (a full week out for weekly deals), and renewal is marketed at 50% of term
- Every funded deal shows its expected end date (real last-payment date once scheduled, an estimate otherwise)
- Pipeline board as collapsible month sections of a fluid, uniform card grid (sorted most-recent-lead-first), with broker-worded stage filters (New Lead/Missing Statements … Bad Deal/Blacklisted), all-field search, a colored stage rail (live counts), reusable Lead Sheets (a filterable, countable, company-wide list you build up with a "+" control instead of a free-text raw status field), inline-editable leads, and a two-step inline delete
- Phone number fields format live as `(###) ###-####` while typing, everywhere a phone number appears (Pipeline, Follow-Ups, Funded deals)
- Mobile-friendly layout throughout (compact top-bar nav on small screens, responsive grids)
- Follow-up sheet with completion and submission tracking
- Rate calculator for funded amount, factor rate, fees, term, ISO points, rep points, syndication, and bonus -- output (net funded amount, total payback, payment amount, rep profit) is always visible
- CSV upload with a destination picker (Funded Progress / Pipeline / Follow-Ups) and a column-mapping step, so any CSV shape can be imported, plus server-persisted import merges
- Dashboard KPI values with individual show/hide controls
- Admin-only user count/list view for Ethan's admin account
- Settings page for name, username, company name, and password updates
- Month filters on funded progress and pipeline views
- Date-on-add controls for funded deals and pipeline leads so future months populate naturally
- Funded progress tag filters/chips for clawback, paid + EPA, paid in full, active, commission, and potential renewal
- Trash recovery for deleted funded deals, pipeline leads, and follow-ups for 30 calendar days
- Currency-safe (integer-cents) automatic recalculation of total payback and scheduled payment as deal terms change, with a live preview before saving
- Server-persisted payment schedules (weekly with a selectable payment day, daily on business days) with automated midnight-America/New_York posting via a protected, idempotent Vercel Cron endpoint
- Lowered-payment and payment-pause adjustments with required reason/effective date and full audit history
- "Override Calculated Balance" advanced adjustment (replaces the old unlabeled Balance Override field) showing calculated vs. overridden balance and the difference
- Direct-typing syndication percentage input (supports decimals like `12.5`)

## Local development

1. Copy `.env.example` values into `frontend/.env.local` or export them in your shell.
2. Install dependencies from `frontend/`.
3. Push the Prisma schema to your Postgres database.
4. Start the Next.js dev server.

Example:

```powershell
cd frontend
pnpm install
pnpm prisma:push
pnpm dev
```

The active Prisma schema is `frontend/prisma/schema.prisma`. Run `pnpm prisma:push` from `frontend/` after schema changes and never commit database URLs or generated `.env` files.

## Required environment variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET` -- authorizes the automated payment-posting cron endpoint; see `docs/VERCEL_DEPLOYMENT.md`

Do not commit `.env` files or copied database URLs. `.gitignore` excludes local env files; keep live Neon credentials in Vercel env vars or shell-local exports only.

## Testing

```powershell
cd frontend
pnpm test
```

Runs the calculation/scheduling/timezone unit test suite (Node's built-in test runner). `pnpm build` runs this automatically before compiling.

## Docs

- `docs/overview.md`
- `docs/DATA_MODEL.md`
- `docs/CSV_IMPORT_GUIDE.md`
- `docs/VERCEL_DEPLOYMENT.md`
