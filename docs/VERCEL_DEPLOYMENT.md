# Vercel Deployment

## Current deployment profile

The frontend in [`frontend`](/C:/Users/19178/OneDrive/Desktop/Ethan%20Fishman/Projects/dealdash/frontend) is ready to deploy to Vercel as a Next.js App Router project.

## Recommended setup

1. Create a Vercel project rooted at `frontend/`.
2. Add the environment variables from `.env.example`.
3. Set a real `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. For production persistence across devices, connect a dedicated Postgres database and wire the Prisma schema in `backend/prisma/schema.prisma`.

## Notes

- In the current MVP, edits and imports are stored in browser local storage.
- If no CSVs exist in `data/imports`, the app falls back to bundled sample data.
- `outputFileTracingRoot` is configured so the frontend can safely read the shared backend package and repo-level data files during local development and build.
