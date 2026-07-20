# Vercel Deployment

## Target project

- Vercel team: `LetsBuildIV`
- Vercel project: `dealdash`
- Expected production URL: `https://dealdash-flax.vercel.app`

## Required environment variables

Add these in the Vercel project (Production **and** Preview) before using the database-backed build:

- `DATABASE_URL`: Postgres connection string for Prisma and all workspace persistence
- `SESSION_SECRET`: long random secret used to hash session tokens
- `CRON_SECRET`: long random secret used to authorize `/api/cron/post-payments`. Vercel Cron sends
  this automatically as `Authorization: Bearer <CRON_SECRET>`; without it the endpoint returns 401/500
  for every request, including Vercel's own cron invocations.

## Build and database requirements

The frontend runs Prisma generate during install/build using the schema at
`frontend/prisma/schema.prisma` -- that is the only schema Vercel and local dev use; the copy under
`backend/prisma/schema.prisma` is a legacy, unused artifact and is not read by any build step.

Before or immediately after the first production deploy, make sure the database schema exists:

```powershell
cd frontend
pnpm prisma:push
```

This project uses `prisma db push` rather than versioned `prisma migrate` migrations (no
`prisma/migrations` directory is tracked). All schema changes to date -- including the payment
schedule / adjustment / audit / balance-override tables -- are additive (new nullable columns, new
tables) so `db push` applies them without any destructive-change prompt and without touching existing
rows. If a future change needs to alter or drop an existing column, switch to a proper
`prisma migrate` workflow first so that change can be reviewed before it touches production data.

## Cron configuration

This project (`LetsBuildIV`) is on Vercel's **Hobby plan**, which rejects any cron schedule that would
run more than once per day -- `vercel.json` validation fails the *entire deployment* if it doesn't
comply (this bit us once already: an hourly schedule silently blocked every deployment attempt with no
visible error outside the interactive "Create Deployment" dialog). `frontend/vercel.json` therefore
declares a single daily cron job:

```json
{
  "crons": [{ "path": "/api/cron/post-payments", "schedule": "10 5 * * *" }]
}
```

`05:10 UTC` is `00:10 America/New_York` during EST and `01:10` during EDT -- shortly after midnight
Eastern either way. The posting logic itself doesn't depend on exact timing: "due" is evaluated as "on
or before today in America/New_York" (see `timezone.ts`), so a single daily run still posts every due
payment correctly; it just has coarser granularity than an hourly run would. If this project is ever
upgraded to Pro, an hourly schedule (`"0 * * * *"`) can be restored for tighter granularity and faster
missed-run recovery.

If a future deployment silently produces no new deployment record at all (build never starts, no error
surfaces through the normal push/webhook flow), check `vercel.json` against the current plan's limits
first -- use the dashboard's **Deployments -> "..." -> Create Deployment** dialog, which is the one
place Vercel actually surfaces this validation error inline.

To verify the cron endpoint manually (e.g. after deploying):

```powershell
curl -X POST https://dealdash-flax.vercel.app/api/cron/post-payments `
  -H "Authorization: Bearer $env:CRON_SECRET"
```

A second identical call should report `entriesPosted: 0` for anything the first call already posted
-- that is the idempotency guarantee, not a bug.

## Production behavior

- Auth, sessions, and all workspace mutations are server-side.
- The first account created in a fresh environment receives the bundled legacy seed dataset.
- Later accounts start with empty workspaces unless they import CSVs.
- Deals with a persisted payment schedule get their due payments posted automatically by the cron
  job above; deals without one (not yet run through "Recalculate schedule") keep using the original
  date/cadence estimate for the progress bar until a schedule is generated.

## What blocks production if setup is incomplete

If `DATABASE_URL` or `SESSION_SECRET` is missing, the deployment can still build but the app cannot be used correctly at runtime. Login, signup, and workspace loads will fail until those variables are added. If `CRON_SECRET` is missing, the app itself still works, but automated payment posting will not run.
