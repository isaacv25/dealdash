# CSV Import Guide

Imports persist into Postgres, not just browser memory. As of the column-mapping rework, DealDash
no longer requires your CSV to use any specific header names -- you tell it where the file goes and
which of your columns correspond to which app field, and it handles the rest.

## Import flow

1. Upload one or more `.csv` files from `/imports`.
2. For each file, pick a destination: **Funded Progress**, **Pipeline**, or **Follow-Ups**.
   DealDash makes a best guess (matching the original broker sheet headers, if present) but you can
   always change it.
3. A mapping table appears listing every app field for that destination, each with a dropdown of
   your file's detected columns. DealDash pre-fills likely matches by comparing your column names
   against known aliases (e.g. a column named "Biz Name" or "Company" both auto-map to "Business
   name"); a small sample value next to each row lets you sanity-check the guess.
4. Adjust any mapping manually, then click **Import into workspace**. Fields marked with `*` are
   required -- the button stays disabled until every required field is mapped.

This means the exact same mechanism handles both a brand-new spreadsheet shape and the original
broker export headers -- there's no separate "legacy" code path.

## App fields per destination

### Funded Progress

Business name*, Contact name*, Phone, Email, Funded date, Funder, Funded amount*, Factor rate,
Term value, Term unit, Payment amount, Syndication %, Commission ($), Status, Notes.

### Pipeline

Contact name*, Business name*, Phone, Email, City/State (combined, e.g. `"Orlando, FL"`), Date
submitted, Requested amount, Status, Notes, Sheet/source label.

### Follow-Ups

Full name*, Business name, Phone, Email, Requested amount, Notes, Monthly revenue, Positions, Last
contacted, App submitted?, Sheet/source label.

See `frontend/src/lib/dealdash/import-fields.ts` (`IMPORT_FIELD_DEFS`) for the authoritative field
list, aliases used for auto-mapping, and required-field flags.

## Normalization behavior

- Currency strings are converted into numeric values.
- Request ranges such as `25-40k` are stored as min/max numbers.
- Percent strings become decimal percentages.
- Raw status text is preserved while canonical stages are mapped for UI filters.
- Funded rows also infer an initial `commissionStatus` from the imported status text.
- `frontend/src/lib/dealdash/normalization.ts`'s `normalizeFundedRow` / `normalizePipelineRow` /
  `normalizeFollowUpRow` read canonical field keys (the mapping table's field names, e.g.
  `businessName`) rather than any literal CSV header -- the mapping step in
  `frontend/src/lib/dealdash/import-fields.ts` (`applyColumnMapping`) is what re-keys a raw parsed
  row to those canonical keys before normalization runs.

## Dedupe behavior

- Preview parsing and column mapping happen in the browser.
- Import persistence happens on the server.
- The server company-scopes each normalized row key before saving it.
- Re-importing the same file for the same company updates rows instead of duplicating them.

## Manual entry alongside CSV imports

Manual entries and imported entries share the same tables. Imported rows usually keep `sourceLabel`
tied to the file name; manual rows use `manual` so future sessions can distinguish between
seeded/imported data and hand-entered edits.

## The hardcoded seed dataset

`frontend/src/lib/dealdash/data.ts`'s Vercel-safe fallback dataset (`createRealDataset`) and the
local `data/imports/` CSV loader both still contain/read data shaped like the *original* broker
export headers (e.g. `"Business Name"`, `"Date App"`). Rather than hand-edit ~150 hardcoded rows to
canonical keys, `data.ts` re-guesses a column mapping from those legacy headers using the same
`guessColumnMapping`/`applyColumnMapping` functions the live UI uses (see `toCanonicalRows` in that
file), then normalizes. If you add new hardcoded seed rows, keep using the original header-style
keys shown in the existing rows -- the adapter handles the rest.
