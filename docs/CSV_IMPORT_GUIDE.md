# CSV Import Guide

DealDash still recognizes the three spreadsheet families used in the current workflow, but imports now persist into Postgres instead of only merging into browser memory.

## Supported CSV types

### Funded deals

Expected headers include:

- `Date`
- `Business Name`
- `Name`
- `Number`
- `Email`
- `Amount`
- `Rate`
- `Term`
- `Term Unit`
- `Payment`
- `Funder`
- `Syndication`
- `Commission`
- `Status`

### Pipeline deals

Expected headers include:

- `Date App`
- `Name`
- `Business`
- `City, State`
- `Number`
- `Email`
- `Request`
- `Status`
- `Notes`
- `Sheet`

### Follow-up sheet

Expected headers include:

- `Full name`
- `Number`
- `Email`
- `Business Name`
- `Request`
- `Notes`
- `Monthly`
- `Positions`
- `App`
- `Date Last Contacted`
- `Sheet`

## Normalization behavior

- Currency strings are converted into numeric values.
- Request ranges such as `25-40k` are stored as min/max numbers.
- Percent strings become decimal percentages.
- Raw status text is preserved while canonical stages are mapped for UI filters.
- Funded rows now also infer an initial `commissionStatus` from the imported status text.

## Dedupe behavior

- Preview parsing happens in the browser.
- Import persistence happens on the server.
- The server company-scopes each normalized row key before saving it.
- Re-importing the same file for the same company updates rows instead of duplicating them.

## Manual entry alongside CSV imports

Manual entries and imported entries share the same tables. Imported rows usually keep `sourceLabel` tied to the file name; manual rows use `manual` so future sessions can distinguish between seeded/imported data and hand-entered edits.
