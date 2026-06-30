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
- Hidden financials toggle stored per user

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

## Required environment variables

- `DATABASE_URL`
- `SESSION_SECRET`

## Docs

- `docs/overview.md`
- `docs/DATA_MODEL.md`
- `docs/CSV_IMPORT_GUIDE.md`
- `docs/VERCEL_DEPLOYMENT.md`
