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
- Dashboard metrics and charts
- Funded progress tracking with manual balance overrides and commission payout status
- Pipeline board with editable statuses and dates
- Follow-up sheet with completion and submission tracking
- Rate calculator for factor rate, payment rhythm, syndication, points, commission, and clawback modeling
- CSV upload preview plus server-persisted import merges
- Dashboard KPI values with individual show/hide controls
- Admin-only user count/list view for Ethan's admin account
- Settings page for name, username, company name, and password updates
- Month filters on funded progress and pipeline views
- Date-on-add controls for funded deals and pipeline leads so future months populate naturally
- Funded progress tag filters/chips for clawback, paid + EPA, paid in full, active, commission, and potential renewal
- Trash recovery for deleted funded deals, pipeline leads, and follow-ups for 30 calendar days

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

Do not commit `.env` files or copied database URLs. `.gitignore` excludes local env files; keep live Neon credentials in Vercel env vars or shell-local exports only.

## Docs

- `docs/overview.md`
- `docs/DATA_MODEL.md`
- `docs/CSV_IMPORT_GUIDE.md`
- `docs/VERCEL_DEPLOYMENT.md`
