# DealDash Data Model

## Ownership model

DealDash is now multi-tenant at the company level.

- `Company`: the top-level workspace owner.
- `User`: belongs to one company and carries UI/security preferences.
- `Session`: a hashed session token tied to a user.
- `FundedDeal`: company-owned funded positions and payout tracking.
- `PipelineDeal`: company-owned lead and submission records.
- `FollowUpItem`: company-owned contact queue entries.
- `ImportBatch`: company-owned audit trail for CSV imports.

## Authentication and account fields

### User

- `firstName`
- `lastName`
- `username` (unique)
- `passwordHash`
- `role`
- `hideFinancialsByDefault`
- `companyId`

### Session

- `tokenHash`
- `expiresAt`
- `userId`

## Funded deal fields

- `businessName`
- `contactName`
- `fundedDate`
- `funder`
- `fundedAmount`
- `factorRate`
- `termValue`
- `termUnit`
- `paymentAmount`
- `paymentFrequency`
- `syndicationPercent`
- `pointsPercent`
- `housePointsPercent`
- `commissionPercent`
- `commissionAmount`
- `commissionStatus`
- `clawbackAmount`
- `statusRaw`
- `statusStage`
- `manualBalanceRemaining`
- `manualRenewalDate`
- `notes`

## Commission payout statuses

Deal status and commission status are intentionally separate:

- `statusStage` answers: how is the file itself performing?
- `commissionStatus` answers: did the broker actually get paid, is it pending, or did it claw back?

Current commission statuses:

- `pending`
- `paid-out`
- `clawback`

## Hidden financials preference

Sensitive financial visibility is stored on the user record so one teammate can keep numbers hidden by default while another can reveal them after signing in.

## Import dedupe model

Imported rows keep a stable normalized row key. On save, the server prefixes that key with the company ID before writing it to Postgres. That means:

- re-importing the same row for the same company updates it
- a different company can import a similarly named file without colliding
- manual entries still use generated row IDs
