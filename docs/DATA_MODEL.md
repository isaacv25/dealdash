# DealDash Data Model

## Ownership model

DealDash is now multi-tenant at the company level.

- `Company`: the top-level workspace owner.
- `User`: belongs to one company and carries UI/security preferences.
- `Session`: a hashed session token tied to a user.
- `FundedDeal`: company-owned funded positions and payout tracking.
- `PaymentScheduleEntry`: one row per contractual payment for a `FundedDeal` (see "Payment schedule" below).
- `PaymentAdjustment`: a lowered-payment period or a pause applied to a `FundedDeal`.
- `AuditEntry`: append-only history of material `FundedDeal` changes (adjustments, overrides, recasts).
- `CronRunLog`: one row per automated payment-posting sweep, for idempotency/audit.
- `PipelineDeal`: company-owned lead and submission records.
- `FollowUpItem`: company-owned contact queue entries.
- `ImportBatch`: company-owned audit trail for CSV imports.

`FundedDeal`, `PipelineDeal`, and `FollowUpItem` are soft-deleted with `deletedAt`. Standard workspace reads filter `deletedAt = null`; the Trash page reads rows deleted within the last 30 calendar days and can either clear `deletedAt` to restore them or permanently delete them.

## Authentication and account fields

### User

- `firstName`
- `lastName`
- `username` (unique)
- `passwordHash`
- `role`
- `hideFinancialsByDefault`
- `companyId`

`role` defaults to `user`. The production database is backfilled so Ethan's existing account is the only `admin` account. Admin routes must enforce this on the server, not only by hiding navigation.

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
- `fundedTags`
- `manualBalanceRemaining` (legacy override field, see "Balance override" below)
- `manualRenewalDate`
- `deletedAt`
- `notes`
- `paymentWeekday` (0=Sunday..6=Saturday; only meaningful for `paymentFrequency = "weekly"`)
- `firstPaymentDate` (anchor for schedule generation; falls back to `fundedDate`)
- `scheduleCompletedAt` (set once the persisted schedule's balance reaches zero)
- `balanceOverrideCents`, `balanceOverrideEffectiveDate`, `balanceOverrideReason`, `balanceOverrideSetByUserId`, `balanceOverrideSetAt`

`fundedTags` stores manually selected operational tags. The UI can also infer display tags from status, commission state, progress math, notes, and renewal timing. Clawback styling takes priority over paid-in-full, and paid-in-full takes priority over active.

## Calculation formulas (`frontend/src/lib/dealdash/finance.ts`)

All financial math in this module operates on integer cents (and factor rates converted to integer
basis points) so results are exact and reproducible -- never on raw JS floats. Both the client's live
preview and the server's authoritative write path call these exact same functions.

```text
Total Payback        = Funded Amount x Factor Rate
Scheduled Payment     = Total Payback / Total Number of Scheduled Payments
```

- `factorRateToBasisPoints(rate)` converts e.g. `1.4` to `14000` before multiplying, avoiding float
  drift in `fundedAmountCents * factorRate`.
- `buildEvenScheduleAmountsCents(totalCents, periods)` floor-divides every installment except the
  last, which absorbs the remainder -- the schedule always sums to exactly `totalCents`, never more
  or less.
- Validation (`validateDealCalculationInput`) rejects: negative funded amounts, a factor rate below
  `MIN_FACTOR_RATE` (1.00 -- a payback less than the funded amount is not a valid MCA deal), a
  zero-or-negative term, and a syndication percent outside 0-100. These are the same checks the
  server re-runs before writing a schedule, so the client preview can never accept something the
  server would reject.

### Term unit / payment frequency relationship

Term unit always tracks payment frequency going forward -- `daily` implies a term in `days`, `weekly`
implies `weeks`, `monthly` implies `months` (`termUnitForFrequency`). The deal-card UI no longer
exposes an independent "Term Unit" control; changing "Frequency" recomputes it automatically, so a
mismatched pair (e.g. weekly payments over a term counted in months) can never be saved. `termValue`
is therefore always a direct payment count (e.g. "100 daily payments" = 100 business-day
installments). Legacy deals imported before this change may still carry a mismatched unit/frequency
pair; `periodsForTerm` in `calculations.ts` keeps the older cross-unit conversion logic for reading
those, but new edits always produce a matched pair.

## Payment schedule (`PaymentScheduleEntry`)

Every scheduled payment for a deal is a persisted row, not a client-side estimate:

- `sequence`, `dueDate`, `scheduledAmountCents`, `status` (`pending` | `posted` | `skipped` | `paused`)
- `postedAt`, `postedAmountCents`, `postingSource` once posted
- `adjustmentId` links an entry to the `PaymentAdjustment` that modified it (if any)
- `@@unique([fundedDealId, sequence])` guarantees the cron poster can never create or post the same
  payment twice
- `@@index([status, dueDate])` backs the cron sweep's "find everything due" query

### Weekly schedules

The user selects a payment weekday (Monday-Friday exposed in the UI; the schema allows any day).
`datesForWeekly` (in `schedule.ts`) finds the first occurrence of that weekday on or after the anchor
date, then steps forward 7 days per payment. Changing the weekday recasts only the still-pending
tail of the schedule (see "Recast vs. rebuild" below) -- posted history keeps its original dates.

### Daily schedules

"Daily" means business days (Monday-Friday). `datesForDaily` skips Saturday/Sunday; there is no
holiday calendar, so a bank holiday still generates a due date on that weekday (documented limitation
-- see the final report). If an anchor date itself falls on a weekend, the first payment rolls
forward to the next business day.

### Recast vs. rebuild

- **Rebuild** (`generateInitialSchedule`): only valid when no schedule rows exist yet for a deal.
  Generates the full schedule from scratch.
- **Recast** (`recastDealSchedule`): the default, safe path once any payment has posted. Every
  `posted`/`skipped`/`paused` row is preserved exactly as-is; only `pending` rows are deleted and
  regenerated from an effective date forward, using the deal's current funded amount, factor rate,
  remaining term, and (for weekly deals) payment weekday. The UI's "Recalculate schedule" button
  requires an explicit confirmation click before recasting a deal that already has posted payments,
  so history is never silently rewritten.

## Payment adjustments (`PaymentAdjustment`)

A single model with a `type` discriminator (`lowered` | `pause`) covers both lowered-payment periods
and pauses, since both are "modify some pending schedule entries, starting at an effective date, for
a documented reason" operations:

- **Lowered payment**: `newAmountCents` replaces `scheduledAmountCents` on pending entries within
  `[effectiveDate, endDate)`. If `endDate` is omitted, the lower amount applies to all remaining
  pending entries indefinitely; the final entry still absorbs whatever true balance remains (the same
  remainder rule as the main schedule), so debt is never silently forgiven.
- **Pause**: every pending entry within `[pauseStart, resumeDate)` is marked `paused` (it will never
  post) and an equal number of same-amount periods are appended after the current schedule tail. The
  default business rule is that a pause **extends the deal's maturity date** rather than compressing
  missed payments into the remaining schedule -- if a different rule is ever needed, change
  `applyPause` in `schedule.ts` and update this paragraph.

Both operations require a `reason` and write an `AuditEntry`.

## Balance override ("Override Calculated Balance")

The pre-existing `manualBalanceRemaining` field was an unlabeled raw number with no effective date,
reason, or audit trail. It has been superseded by five fields on `FundedDeal`
(`balanceOverrideCents`, `balanceOverrideEffectiveDate`, `balanceOverrideReason`,
`balanceOverrideSetByUserId`, `balanceOverrideSetAt`), exposed in the UI as "Override Calculated
Balance" inside a collapsed-by-default "Advanced adjustments" section. Setting or resetting an
override requires a reason and writes an `AuditEntry`; the UI always shows calculated balance,
overridden balance, and the difference side by side.

`manualBalanceRemaining` is kept, unmodified, as a read-only legacy fallback: `progressForFundedDeal`
prefers `balanceOverrideAmount` when present and falls back to `manualBalanceRemaining` otherwise, so
older deals that only have the legacy field keep working. `migrateLegacyBalanceOverrides` (in
`schedule-service.ts`) is an idempotent, on-demand backfill that copies a deal's legacy value into the
new fields (with a synthetic reason) without deleting the legacy column -- safe to run more than once.

## Audit history (`AuditEntry`)

Append-only. Every balance override, payment adjustment, and schedule recast writes one row with
`category`, `previousValue`/`newValue` (JSON), `effectiveDate`, `reason`, `userId`, and `createdAt`.
Rendered as an expandable list on each deal card, newest first.

## Automated payment posting (cron)

`POST/GET /api/cron/post-payments`, protected by a `CRON_SECRET` bearer token that Vercel Cron sends
automatically. See `docs/VERCEL_DEPLOYMENT.md` for the schedule and environment variable setup, and
`frontend/src/lib/dealdash/timezone.ts` for the America/New_York, DST-safe "is this due yet" check.
Every posting write is a compare-and-swap (`status: "pending"` in the `WHERE` clause), so a duplicate
or overlapping cron invocation can never post the same `PaymentScheduleEntry` twice. "Due" means "on
or before today in America/New_York", not "exactly today", so a missed run is caught up automatically
on the next successful one. `CronRunLog` records every sweep for audit purposes.

## Commission payout statuses

Deal status and commission status are intentionally separate:

- `statusStage` answers: how is the file itself performing?
- `commissionStatus` answers: did the broker actually get paid, is it pending, or did it claw back?

Current commission statuses:

- `pending`
- `paid-out`
- `clawback`

## Hidden financials preference

Sensitive financial visibility is stored on the user record as the account-level default. Dashboard KPI cards now also keep independent show/hide booleans in browser `localStorage`; those booleans do not contain financial values.

## Settings updates

The Settings page updates profile and company fields through server actions. Username updates check the global unique username constraint before saving. Password updates require the current password and hash the replacement with the same `scrypt` helper used during signup.

## Date tracking

Funded deals use `fundedDate` for month filtering. Pipeline deals use `submittedDate`, which comes from the `Date App` CSV column. Rows without a usable date stay available under an `Unknown date` bucket.

Manual funded and pipeline adds prompt for a date before creating the row. Month filter dropdowns include all months found in data plus the current month and the next 12 months, so future buckets appear as the business grows. Empty stage/tag filter sets mean "show all", not "show none".

## Import dedupe model

Imported rows keep a stable normalized row key. On save, the server prefixes that key with the company ID before writing it to Postgres. That means:

- re-importing the same row for the same company updates it
- a different company can import a similarly named file without colliding
- manual entries still use generated row IDs
