# DealDash Project Overview

## What it is

DealDash is a Next.js-based MCA operating system for funded-deal tracking, pipeline management, follow-ups, CSV imports, and rate modeling. The current build is database-backed and account-aware so the same workspace can be used across devices instead of living inside one browser.

## Architecture

```text
dealdash/
|-- frontend/                  # Next.js 16 app deployed to Vercel
|   |-- src/app/               # Routes, layouts, login flow, server actions
|   |-- src/components/        # UI shell and views
|   |-- src/lib/auth.ts        # Session creation, password hashing, tenant auth checks
|   |-- src/lib/db/prisma.ts   # Prisma singleton for server actions and route loads
|   `-- src/lib/dealdash/      # Types, calculations, seed loading, normalization, workspace persistence
|-- backend/prisma/schema.prisma
|-- data/imports/              # Local CSV seed directory + Vercel-safe fallback source material
`-- docs/                      # Project continuation and deployment notes
```

## Runtime model

1. Login/signup happens through server actions in `frontend/src/app/login/actions.ts`.
2. Successful auth creates a database-backed session cookie.
3. The `(app)` layout resolves the current user, loads the company-owned workspace from Postgres, and hydrates the client provider.
4. The provider performs optimistic updates in the browser while server actions persist each mutation to the database.
5. CSV imports are parsed in the browser for preview, then upserted on the server with company-scoped dedupe keys.

## Persistence architecture

- Postgres is the source of truth.
- Prisma schema lives at `backend/prisma/schema.prisma`.
- Each record belongs to a `Company`.
- Each `User` belongs to exactly one company today.
- `Session` rows back the auth cookie.
- `FundedDeal`, `PipelineDeal`, `FollowUpItem`, and `ImportBatch` all carry `companyId` ownership.

## Auth and account model

- First-time setup happens through the signup tab on `/login`.
- The first account created in the whole system seeds the bundled legacy CSV dataset into its company workspace.
- Later accounts create clean company workspaces by default.
- Passwords are stored with `scrypt` as `salt:hash`.
- Sessions are stored in Postgres using a hashed session token.

## Funded progress calculations

- Gross payback = `fundedAmount * factorRate`.
- If a manual balance override is present, that value wins.
- Otherwise DealDash estimates progress from funded date, payment cadence, and periodic payment amount.
- Renewal timing still defaults to 70% of the term unless manually overridden.
- Commission payout status is tracked separately from the funded file status.

## Hidden financials behavior

- `hideFinancialsByDefault` is stored on the `User` row.
- The sidebar toggle flips that preference and updates the UI immediately.
- Future sessions should extend the masking rules if more finance-heavy screens are added.

## CSV import and manual entry workflow

- Browser parsing keeps previews fast and avoids uploading raw files before the user confirms.
- The server scopes imported IDs to the company so the same sheet can be safely re-imported.
- Manual add/edit/delete calls are persisted through server actions, not local storage.

## Continuing the project

Future Codex or developer sessions should start with these files first:

- `frontend/src/lib/dealdash/workspace.ts`
- `frontend/src/lib/auth.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/components/dealdash/state.tsx`
- `frontend/src/components/dealdash/views.tsx`
- `docs/DATA_MODEL.md`
- `docs/VERCEL_DEPLOYMENT.md`
