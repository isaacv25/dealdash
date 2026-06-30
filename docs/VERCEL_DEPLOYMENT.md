# Vercel Deployment

## Target project

- Vercel team: `LetsBuildIV`
- Vercel project: `dealdash`
- Expected production URL: `https://dealdash-flax.vercel.app`

## Required environment variables

Add these in the Vercel project before using the database-backed build:

- `DATABASE_URL`: Postgres connection string for Prisma and all workspace persistence
- `SESSION_SECRET`: long random secret used to hash session tokens

## Build and database requirements

The frontend runs Prisma generate during install/build using the schema at `backend/prisma/schema.prisma`.

Before or immediately after the first production deploy, make sure the database schema exists:

```powershell
cd frontend
pnpm prisma:push
```

If you prefer migrations later, replace `prisma:push` with a normal Prisma migration workflow.

## Production behavior

- Auth, sessions, and all workspace mutations are server-side.
- The first account created in a fresh environment receives the bundled legacy seed dataset.
- Later accounts start with empty workspaces unless they import CSVs.

## What blocks production if setup is incomplete

If `DATABASE_URL` or `SESSION_SECRET` is missing, the deployment can still build but the app cannot be used correctly at runtime. Login, signup, and workspace loads will fail until those variables are added.
