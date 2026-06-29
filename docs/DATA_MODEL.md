# Dealdash Data Model

Dealdash is organized around four working surfaces:

- `FundedDeal`: funded positions, live balance tracking, syndication, clawback, commission, and renewal timing
- `PipelineDeal`: active leads and submitted deals moving through the pipeline
- `FollowUpItem`: lead touchpoints, due dates, and contact queue items
- `ImportBatch`: metadata about each CSV import preview or seed load

## Core entities

### Merchant

- `businessName`
- `contactName`
- `phone`
- `email`
- `city`
- `state`
- `notes`

### FundedDeal

- `fundedDate`
- `funder`
- `fundedAmount`
- `factorRate`
- `termValue`
- `termUnit`
- `paymentAmount`
- `paymentFrequency`
- `grossPayback`
- `syndicationPercent`
- `pointsPercent`
- `commissionPercent`
- `commissionAmount`
- `clawbackAmount`
- `statusRaw`
- `statusStage`
- `manualBalanceRemaining`
- `manualRenewalDate`

### PipelineDeal

- `submittedDate`
- `requestLabel`
- `requestedAmountMin`
- `requestedAmountMax`
- `statusRaw`
- `stage`
- `notes`
- `sheetLabel`
- `nextFollowUpDate`

### FollowUpItem

- `lastContactLabel`
- `dueDate`
- `priority`
- `appSubmitted`
- `completed`
- `sheetLabel`

## Persistence strategy

The UI is designed to work in two modes:

1. `browser` mode: imported and edited data is saved to local browser storage for a single-user MVP.
2. `database` mode: the repo includes a Prisma schema for a future Postgres-backed implementation.

The current shipped app uses `browser` mode by default so it can run immediately without provisioning a database.
