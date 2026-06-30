# DealDash — Project Overview

## What it is

DealDash is a single-admin MCA (Merchant Cash Advance) operating system built as a Next.js progressive web app. It replaces spreadsheet workflows with a live, browser-based dashboard for tracking funded deals, managing a deal pipeline, and running a follow-up queue.

## Architecture

```
dealdash/
├── frontend/          # Next.js 16 app (App Router, React 19, Tailwind v4)
│   ├── src/
│   │   ├── app/       # Page routes (App Router)
│   │   │   ├── (app)/ # Auth-gated routes: dashboard, funded-progress, pipeline, follow-ups, rate-calculator, imports, docs
│   │   │   ├── login/ # Login page + server actions
│   │   │   ├── globals.css
│   │   │   └── layout.tsx  # Root layout with PWA metadata
│   │   ├── components/dealdash/
│   │   │   ├── app-shell.tsx  # Sidebar nav + layout wrapper
│   │   │   ├── state.tsx      # React context: all data mutations + localStorage persistence
│   │   │   └── views.tsx      # All page views (Dashboard, FundedProgress, Pipeline, FollowUps, RateCalculator, Imports)
│   │   └── lib/
│   │       ├── auth.ts                     # Session-based auth
│   │       ├── seed.ts                     # Server-side seed loader entry point
│   │       └── dealdash/
│   │           ├── types.ts                # TypeScript types for all data models
│   │           ├── calculations.ts         # Pure math: payback, payment, progress, renewal date
│   │           ├── csv.ts                  # CSV text parser
│   │           ├── normalization.ts        # CSV row → typed object converters
│   │           ├── data.ts                 # loadSeedDataset() reads data/imports/ CSVs
│   │           └── index.ts                # Public re-exports
│   └── public/
│       └── manifest.json   # PWA manifest
└── data/
    └── imports/        # CSV files committed here are auto-loaded as seed data on startup
        ├── Ethan Funded Deals - Sheet1.csv
        ├── Ethan's Deals - 2025.csv
        ├── Ethan's Deals - Jan 26.csv
        ├── Ethan's Deals - Feb 26.csv
        ├── Ethan's Deals - Mar 26.csv
        ├── Ethan's Deals - Apr 26.csv
        ├── Ethan's Deals - May 26.csv
        ├── Ethan's Deals - Jun 26.csv
        └── Contacted Leads - Sheet1.csv
```

## Data flow

1. **Server-side seed** (`loadSeedDataset` in `data.ts`): On every cold page load, the Next.js server reads `data/imports/*.csv`, detects their type by headers, normalizes them through Zod schemas, and returns a `SeedDataset` object as the `initialData` prop.

2. **Client-side state** (`state.tsx`): `DealdashProvider` receives `initialData` and immediately checks `localStorage` for a saved snapshot. If one exists it wins (user's edits persist across sessions); otherwise the server seed is shown.

3. **Mutations**: Every add/update/delete writes back to `localStorage` synchronously via a `useEffect`. No network round-trips for data after the initial load.

## CSV schema detection

| Header required | Maps to |
|---|---|
| `Amount` + `Funder` | Funded deals |
| `Date App` + `Business` | Pipeline deals (monthly deal sheets) |
| `Full name` + `Date Last Contacted` | Follow-ups / contacts |

## Data models

- **FundedDeal** — funded amount, factor rate, term, payment frequency, syndication %, commission $, clawback, status stage, manual balance override, manual renewal date
- **PipelineDeal** — contact, business, city/state, request range, status stage, notes, next follow-up date
- **FollowUpItem** — contact, business, phone, request, notes, last contact label, due date, priority, app-submitted flag, completed flag
- **ImportBatch** — audit log entry created whenever a CSV is merged

## PWA support

`public/manifest.json` enables "Add to Home Screen" on iOS/Android. The `display: standalone` mode hides the browser chrome for a native-app feel.

For full PWA (offline support), add a service worker via `next-pwa` — not yet implemented.

## Deployment

- **Hosting**: Vercel
- **Auto-deploy**: Every push to `main` on github.com/isaacv25/dealdash triggers a Vercel build
- **Data directory**: `next.config.ts` sets `outputFileTracingRoot` to the repo root so Vercel's file tracer includes `data/imports/` in the serverless function bundle

## Adding future deals

- **Manual entry** — click "+ Add Deal", "+ Add Lead", or "+ Add Follow-Up" in any section and fill in the fields. Changes persist to localStorage immediately.
- **CSV import** — go to the Imports page, upload a new monthly sheet, and click "Import into workspace". Rows are merged by ID so re-importing won't create duplicates.
- **Persistent CSV seed** — add a new CSV file to `data/imports/` in the repo, commit, and push. It will be available as seed data on the next Vercel deployment.
