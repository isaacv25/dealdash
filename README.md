# Dealdash

Dealdash is a production-shaped funding dashboard that replaces a spreadsheet-heavy workflow with one place to manage:

- funded deal progress
- pipeline / deals brought in
- follow-up activity
- a live rate calculator

## Repo structure

- [`frontend`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/frontend): Next.js App Router UI deployed to Vercel
- [`backend`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/backend): shared data model, CSV normalization, calculations, and Prisma schema
- [`data/imports`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/data/imports): local-only CSV drop zone
- [`docs`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/docs): project notes and deployment docs

## What works now

- Login-protected admin UI
- Dashboard metrics and charts
- Funded deal balance/progress tracking with live recalculation
- Pipeline board with editable statuses and follow-up dates
- Follow-up sheet with completion and submission tracking
- Rate calculator for factor rate, APR-style mockups, payment rhythm, syndication, points, commission, and clawback
- CSV upload and import preview for the current sheet formats
- Browser-local persistence so edits survive refreshes without needing a database on day one

## Local development

1. Copy `.env.example` to `.env.local` inside `frontend/` or set the same variables in your shell.
2. Install dependencies from the `frontend/` directory.
3. Run the Next.js dev server from `frontend/`.

Example:

```powershell
cd frontend
pnpm install
pnpm dev
```

## Local CSV seed loading

For local-only seed loading, place your CSV exports inside [`data/imports`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/data/imports). Those files are git-ignored on purpose so private merchant data does not get committed by accident.

If no CSVs are present, Dealdash falls back to bundled sample data.

## Production notes

- This repo includes a Prisma/Postgres schema in [`backend/prisma/schema.prisma`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/backend/prisma/schema.prisma).
- The current shipped UI stores edits in browser local storage.
- To make edits persistent across devices in production, connect a dedicated Postgres database and wire the Prisma models into a server-side repository.

## Docs

- [`docs/DATA_MODEL.md`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/docs/DATA_MODEL.md)
- [`docs/CSV_IMPORT_GUIDE.md`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/docs/CSV_IMPORT_GUIDE.md)
- [`docs/VERCEL_DEPLOYMENT.md`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/docs/VERCEL_DEPLOYMENT.md)
