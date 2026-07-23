# Vercel frontend deployment

Starville's three browser applications deploy as separate Vercel projects from the same pnpm and
Turborepo repository.

| Vercel project | Root Directory      | Framework |
| -------------- | ------------------- | --------- |
| Landing        | `apps/landing`      | Next.js   |
| Game client    | `apps/game-client`  | Vite      |
| Admin portal   | `apps/admin-portal` | Next.js   |

Keep **Include source files outside of the Root Directory in the Build Step** enabled for every
project. Each application imports workspace packages from `packages/`.

The checked-in `vercel.json` in each application selects the correct filtered Turborepo build.
Vercel detects pnpm 11 from the repository root's `packageManager` field and installs the frozen
workspace lockfile.

## Required environment configuration

Set production values in each Vercel project before its first production deployment. Do not commit
real credentials.

All three projects require:

- `NODE_ENV=production`
- `STARVILLE_DEPLOYMENT_TARGET=starville-prod`
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_GAME_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_REOWN_PROJECT_ID`

The landing and admin projects also execute server-side code and require the applicable server-only
values documented in `.env.example`. In particular, configure the dedicated production Supabase
identity and admin session secrets in Vercel rather than exposing them through `NEXT_PUBLIC_*`
variables.

Preview deployments must point only to an approved non-production backend unless a complete,
isolated preview environment has been provisioned. Starville production safety gates intentionally
reject incomplete or mixed environment identities.

## Deployment check

From the repository root, run:

```sh
node scripts/with-env.mjs --set NODE_ENV=production pnpm turbo run build \
  --filter=@starville/landing \
  --filter=@starville/game-client \
  --filter=@starville/admin-portal
```

After importing the repository in Vercel, create the three projects with the root directories shown
above, configure their environment values, and deploy. The landing and admin applications retain
their security headers; the game client publishes its static `dist` output and copies files from
`apps/game-client/public`, including the official Starville favicon.
