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
- `dealType` (`mca` | `heloc` | `renewal` | `addon`, see "Deal types" below)
- `aprPercent`, `termYears` (HELOC only)
- `relatedDealId` (Renewal/Add-on only -- self-relation to the original `FundedDeal`)
- `psfAmount` (Processing/Service Fee, flat $, every deal type -- see "PSF and Total Payout" below)

The serialized `FundedDeal` the client receives also carries four read-only, loader-computed fields
that are not stored columns: `scheduledPaymentsCount`, `postedPaymentsCount`, `postedAmount`, and
`scheduleEndDate`. `loadWorkspace` derives these once per page load by grouping the company's
`PaymentScheduleEntry` rows (including a `_max(dueDate)` for the maturity date), so the funded board
can show *actual* cron-posted repayment progress and a real end date per deal without a per-card
query. They are undefined for deals with no generated schedule.

`expectedEndDateForFundedDeal` (`calculations.ts`) is the display helper for a deal's maturity date:
it returns `scheduleEndDate` when a schedule exists, and otherwise re-runs the schedule generator's
own `firstPaymentAnchor` + `scheduleEndDate` date math to project the same final-payment date the
schedule *would* produce -- so every funded deal can show an expected end date whether or not a
schedule has been generated yet.

## Deal types

`FundedDealType` (`frontend/prisma/schema.prisma`): `mca` | `heloc` | `renewal` | `addon`.

- **mca**: the original/default shape -- `fundedAmount`/`factorRate`/`termValue`/`termUnit`/
  `paymentFrequency`, unchanged.
- **heloc**: prices on `fundedAmount`/`aprPercent`/`termYears` (10, 15, 20, or 30 -- see
  `HELOC_TERM_YEARS` in `types.ts`) instead of a factor rate. Rather than thread a `dealType` branch
  through every consumer of `FundedDeal` (progress bar, dashboard totals, CSV export, the cron
  poster, the live preview in `funded-deal-panel.tsx`), a HELOC's `factorRate`/`termValue`/
  `termUnit`/`paymentFrequency`/`paymentAmount` are **derived, not directly edited** fields:
  `deriveHelocFields` (`finance.ts`) recomputes them from Amount/APR/Term every time `updateFundedDeal`
  (`workspace.ts`) sees one of those three change, and persists them like normal columns.
  `factorRate` becomes a synthetic value (`totalPayback / fundedAmount`) purely so
  `fundedAmount * factorRate` -- used everywhere else in the codebase -- still recovers the correct
  HELOC total payback. The HELOC payment itself is standard fixed-rate amortization
  (`helocMonthlyPaymentCents`), always monthly; this deliberately ignores a real HELOC's separate
  draw period, the same spirit as this codebase's other documented simplifications.
- **renewal** / **addon**: economically still MCA-shaped (same factorRate/termValue fields, edited
  directly); the only difference is an optional `relatedDealId` linking back to the original MCA
  deal, so a client's deal history -- a renewal, or an add-on stacked on top of an existing position
  -- is traceable from one record. `updateFundedDeal` rejects a link to a deal outside the caller's
  company or to the deal itself.
  - Setting `relatedDealId` on a **renewal** additionally patches the linked original deal with
    `scheduleCompletedAt: now, statusStage: "paid-out"` (client-side, in `FundedDealCard`'s
    "Renewal of" `onChange` handler), since a renewal pays off the original balance. This reuses the
    exact fields the cron poster already sets when a schedule finishes naturally
    (`schedule-service.ts`), so `progressForFundedDeal` treats it as ground truth (100%, zero balance)
    and the derived "Paid in full" tag/badge fall out of the normal math instead of needing a
    separate flag. `fundedUpdateData` (`workspace.ts`) had to gain a `scheduleCompletedAt` patch
    branch for this -- previously only the cron poster ever wrote that column, so no generic-patch
    path handled it. Only fires forward (on picking a link); clearing or switching a link never
    un-marks the original deal. Add-on links never do this (an add-on doesn't pay anything off).

## PSF and Total Payout

PSF (Processing/Service Fee) is a flat house-side dollar figure (`psfAmount`), paid out to the broker
at the same split % as commission -- across every deal type, not just MCA. `psfPayout(deal)`
(`calculations.ts`) = `psfAmount * commissionPercent`. `totalPayoutForFundedDeal(deal)` = the existing
`commissionAmount` (already the broker's share of house points) + `psfPayout(deal)`. Both are shown
in the Commission Model section of every funded deal card.

### Repayment progress priority

`progressForFundedDeal` (in `calculations.ts`) resolves a deal's progress bar / remaining balance in
this strict order, each step winning over the ones below it:

1. `scheduleCompletedAt` set -> 100% paid, $0 remaining (cron ground truth).
2. A manual balance override (`balanceOverrideAmount`, or legacy `manualBalanceRemaining`) -> that
   number is authoritative.
3. A persisted schedule exists (`scheduledPaymentsCount > 0`) -> progress is driven by the actual
   posted payments (`postedPaymentsCount` / `postedAmount`). This is what makes the board update as
   the deal is paid: each cron posting advances the bar for real, and the figures can never drift
   from the schedule the way the estimate can.
4. Otherwise -> the elapsed-time estimate (funded date + cadence + periodic payment), the
   conservative fallback for deals that have no generated schedule yet.

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

### Federal holiday calendar

`schedule.ts` computes the 11 US federal holidays algorithmically for any year (`federalHolidaysForYear`)
-- not a hardcoded table, so it never goes stale. Each fixed-date holiday (New Year's, Juneteenth,
Independence Day, Veterans Day, Christmas) is shifted to its bank-observed weekday when the literal
date falls on a weekend (Saturday -> observed Friday, Sunday -> observed Monday); floating holidays
(MLK Day, Presidents Day, Memorial Day, Labor Day, Columbus Day, Thanksgiving) are computed directly
as the Nth weekday of their month. `isNonBankDayUtc` = weekend OR observed holiday. `nextOrSameBusinessDay`
(used by daily schedules, and applied to every generated weekly/monthly date too) skips these days --
nothing debits on a day nothing actually debits.

### First payment anchor

Collection never starts on the funding day itself. `firstPaymentAnchor` (in `schedule.ts`) anchors a
brand-new schedule based on frequency, unless the deal carries an explicit `firstPaymentDate`, which
always wins over either default:

- **Daily/monthly**: the day *after* `fundedDate` (further rolled to the next business day by
  `datesForDaily`/`datesForMonthly` if needed). Funded Friday -> first daily payment the following
  Monday.
- **Weekly**: a full week out -- `fundedDate + 7 days`, then the chosen weekday on or after that.
  Funded Monday with weekday=Monday -> first payment is *next* Monday, exactly 7 days out, never a
  same-week occurrence 1-6 days after funding.

Only the initial schedule uses this anchor; a recast anchors from its effective date instead, since a
recast is always "from here forward" on an already-running deal.

### Recast vs. rebuild

The "Recalculate schedule" button picks one of three paths depending on the deal's current state, so
that rebuilding a schedule to match edited terms never silently loses real payment history *or*
silently pushes a never-started deal's whole timeline out to today:

- **Rebuild** (`generateInitialSchedule`): only valid when no schedule rows exist yet for a deal.
  Generates the full schedule from scratch, anchored to the deal's real funded date. As of the
  deal-types rework, this is also called automatically -- see "Automatic schedule generation" below --
  not only via the manual button.
- **Rebuild from scratch** (`regenerateScheduleFromScratch`): a schedule already exists, but zero
  entries are `posted` -- i.e. the deal hasn't actually started paying yet, even though it may have
  been funded weeks ago. There is no history to preserve, so every existing row is deleted and the
  schedule is rebuilt exactly like a brand-new one, anchored to the deal's real funded date (not
  today). This exists because naively recasting "from today" here would silently push a schedule that
  should already be partway through back to square one -- a deal funded three weeks ago with a daily
  schedule that's never posted anything should come out of a recalculate with ~15 payments already
  overdue, not with day one starting tomorrow. Throws if any entry is posted, as a safety check.
- **Recast** (`recastDealSchedule`): once any payment has posted. Every `posted`/`skipped`/`paused`
  row is preserved exactly as-is; only `pending` rows are deleted and regenerated from an effective
  date (today) forward, using the deal's current funded amount, factor rate, remaining term, and (for
  weekly deals) payment weekday. Anchoring the rebuilt remainder to *today* is correct here, unlike the
  never-started case above, because the deal is genuinely in progress and you don't want to fabricate
  payments that should already have posted. The UI requires an explicit confirmation click before
  recasting a deal with posted payments, so history is never silently rewritten.

### Automatic schedule generation

`maybeAutoGenerateSchedule` (`schedule-service.ts`) runs after every funded-deal save
(`updateFundedDealAction`) and generates the deal's initial schedule the moment it has valid terms
(funded date set, and a passing `validateDealCalculationInput`) and doesn't have one yet -- no need to
click "Recalculate schedule" on a brand-new deal. It's awaited, not fire-and-forget, since a
serverless function's execution can be frozen the instant it returns. `backfillMissingSchedules` runs
once per `loadWorkspaceForUser` call (idempotent -- a single cheap query once nothing qualifies) and
sweeps the whole company for any deal with valid terms but no schedule (imports, seed data, deals
funded before this feature existed), self-healing the funded board's progress numbers without a
manual step.

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

The standalone Rate Calculator (`/rate-calculator`) does **not** use this preference. It previously
routed its output through the same `showFinancials` toggle as the dashboard, but that toggle was
never wired to any visible control on that page, so the numbers were permanently hidden with no way
to reveal them. Rate Calculator output is deal-pricing math the broker needs to see, not sensitive
data pulled from persisted records, so it now always renders plainly.

## Rate Calculator scenario math (`frontend/src/lib/dealdash/rate-scenario.ts`)

A standalone, non-persisted "what-if" tool -- nothing here touches `FundedDeal` or the database. Like
`finance.ts`, all math runs in integer cents to stay exact.

Inputs: funded amount, factor rate, fees ($, flat), term value, term unit (label only), ISO points
(%, of funded amount), rep points (%, of the ISO points *dollar* amount -- not of funded amount),
syndication (%, of funded amount), bonus ($, flat).

```text
Net Funded Amount   = Funded Amount - Fees
Total Payback        = Funded Amount x Factor Rate
Payment Amount        = Total Payback / Term Value          (one payment per termUnit period; there
                                                               is no separate payment-frequency input)
ISO Points $          = Funded Amount x ISO Points %
Rep Points $          = ISO Points $ x Rep Points %
Syndication Profit $ = Funded Amount x Syndication %
Rep Profit            = Rep Points $ + Syndication Profit $ + Bonus
```

Rep Profit is intentionally a simplified, directionally-useful number: it does not model syndicator
management fees, which vary per syndicator relationship. All inputs are floored at 0 before use, so
a negative or blank field behaves like 0 rather than producing a negative output.

## Settings updates

The Settings page updates profile and company fields through server actions. Username updates check the global unique username constraint before saving. Password updates require the current password and hash the replacement with the same `scrypt` helper used during signup.

## Date tracking

Funded deals use `fundedDate` for month filtering. Pipeline deals use `submittedDate`, which comes from the `Date App` CSV column. Rows without a usable date stay available under an `Unknown date` bucket.

Manual funded and pipeline adds prompt for a date before creating the row. Month filter dropdowns include all months found in data plus the current month and the next 12 months, so future buckets appear as the business grows. Empty stage/tag filter sets mean "show all", not "show none".

## Lead sheets (`LeadSheet`)

A named, reusable, company-scoped lead source a broker builds up once via the Pipeline board's "+"
control ("Sheet A", "Facebook Leads", ...) and re-selects on every deal that came from it --
replacing the old free-text "raw status" field on `PipelineDeal` cards.

- `LeadSheet { id, companyId, name, createdAt }`, unique on `(companyId, name)`. `createLeadSheet`
  (`workspace.ts`) is an upsert on that key, so re-adding an existing name is a no-op that just
  returns the existing row -- the "+ New sheet" control never needs its own duplicate check.
- `PipelineDeal.sheetLabel` (unchanged, pre-existing column) stores the assigned sheet by **name**,
  not a foreign key -- kept denormalized so CSV-imported values and the reusable list can coexist
  without a migration step, and so a lead's sheet displays even if the `LeadSheet` row is later
  renamed or removed.
- `loadWorkspace` returns the merged list: every `LeadSheet` row for the company, plus any distinct
  `sheetLabel` value already present on a pipeline deal that isn't yet a formal `LeadSheet` row
  (assigned a synthetic `legacy:<name>` id). This means legacy/imported sheet names are immediately
  filterable and selectable without a one-time cleanup pass.
- The client adds sheets optimistically: `addLeadSheet` (state.tsx) inserts `{ id: "pending:<name>",
  name }` into `data.leadSheets` immediately (keyed on the trimmed name, not the id -- the real id
  only matters again on the next full reload) and fires `createLeadSheetAction` in the background.

## Dashboard reminder fields

Three nullable timestamp columns back the dashboard's dismissible quick-view rails. Each is written
through the normal update path for its record (a plain field patch), and the matching predicate lives
in `calculations.ts` so the eligibility rule is unit-tested and shared:

- `FollowUpItem.dashboardAckAt` -- set when a follow-up is acknowledged off the dashboard's "Upcoming
  follow-ups" rail. The item still lives on the Follow-Ups sheet. `followUpIsDueOnDashboard` shows a
  follow-up once it is open and ~30 days (`FOLLOW_UP_DASHBOARD_AGE_DAYS`) past its `createdAt` (now
  serialized to the client) and not acknowledged.
- `FundedDeal.renewalAckAt` -- set when a deal is dismissed from "Upcoming renewals".
  `fundedDealIsRenewalCandidate` shows a deal once it is `RENEWAL_CANDIDATE_MIN_PERCENT` (35%)+ paid
  and not dismissed.
- `PipelineDeal.statementsAckAt` -- set when "Need new statements" is acknowledged for a lead.
  `pipelineNeedsNewStatements` shows a lead once its `submittedDate` is an earlier UTC calendar month
  than now, it is not a terminal stage (`dead`/`declined`/`funded`), and it was not already
  acknowledged this month -- so the reminder recurs monthly. Marking a lead Bad Deal/Blacklisted
  (`dead`) removes it permanently.

## Import dedupe model

Imported rows keep a stable normalized row key. On save, the server prefixes that key with the company ID before writing it to Postgres. That means:

- re-importing the same row for the same company updates it
- a different company can import a similarly named file without colliding
- manual entries still use generated row IDs
