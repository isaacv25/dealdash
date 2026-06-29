# CSV Import Guide

Dealdash recognizes three main import families based on the sheet formats used in the current workflow:

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

## Normalization rules

- Money strings like `$60,000.00` are converted into numbers.
- Requests like `25-40k` are stored as a min/max range.
- Percent strings like `10%` are converted to decimal percentages for calculations.
- Missing fields are tolerated and surfaced in import summaries.
- Raw statuses are preserved while also being mapped to canonical pipeline stages.

## Local workflow

Drop source CSVs into [`data/imports`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/data/imports) for local seed loading. Those files are intentionally git-ignored to avoid committing private merchant data.
