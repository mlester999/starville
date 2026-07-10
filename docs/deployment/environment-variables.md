# Environment-variable ownership

The root [`.env.example`](../../.env.example) is the committed Phase 2 template. Its values are
non-working placeholders. Real development values belong only in ignored `.env.local`; commands must
never print private values.

## Browser-safe and required

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_GAME_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Only these values may cross into browser configuration. The Supabase key may use a supported legacy
anonymous or modern publishable format. Public configuration is not authority: RLS and trusted
server checks still decide access.

## Application and service controls

These are server/process values required for normal development:

- `NODE_ENV`, `LOG_LEVEL`
- `LANDING_PORT`, `GAME_CLIENT_PORT`, `ADMIN_PORT`
- `API_HOST`, `API_PORT`
- `REALTIME_HOST`, `REALTIME_PORT`
- `WORKER_HOST`, `WORKER_HEALTH_PORT`
- `CORS_ALLOWED_ORIGINS`, `REALTIME_ALLOWED_ORIGINS`
- `REALTIME_MAX_CONNECTIONS`
- `WORKER_CONCURRENCY`, `WORKER_MAX_ATTEMPTS`, `WORKER_RETRY_BASE_DELAY_MS`

The browser applications use their `NEXT_PUBLIC_*_URL` values; port variables control only local
process binding.

## Administrator authorization controls

- `ADMIN_SESSION_TTL_MINUTES` is required and bounded to 1–60 minutes; the default and maximum
  are 60. Values above 60 are rejected during startup rather than silently clamped.
- `ADMIN_REQUIRE_MFA_BY_DEFAULT` must be exactly `true` or `false`. It supplies the protected
  bootstrap default. The persisted `admin_users.mfa_required` field is authoritative afterward.
- `ADMIN_BOOTSTRAP_ENABLED` must be exactly `true` or `false` and normally remains false.
- `ADMIN_RECOVERY_COOKIE_SECRET` is required by the admin portal and must contain at least 32
  characters of high-entropy server-only material. It signs the short-lived recovery marker and must
  never use a `NEXT_PUBLIC_` prefix.

None of these values are browser-safe.

## Hosted Supabase target and approvals

- `SUPABASE_ENVIRONMENT` must equal `development` for Phase 2 hosted tooling.
- `SUPABASE_PROJECT_REF` must match both the public Supabase hostname and canonical CLI link.
- `SUPABASE_REMOTE_WRITES_APPROVED` is a deny-by-default migration/bootstrap write gate.
- `RUN_HOSTED_SUPABASE_TESTS` is a separate deny-by-default fixture-write gate.

The two approval variables are independent. Enabling one does not authorize the other, and neither
is a permanent deployment approval. Keep both false except during the reviewed operation.

## Privileged and conditional

- `SUPABASE_SERVICE_ROLE_KEY` accepts a supported legacy service-role or modern secret key. It is
  server-only and used only by the API, bootstrap, and controlled hosted fixtures.
- `SUPABASE_DATABASE_URL` is server-only and required by controlled hosted database cleanup and
  direct database tooling. Hosted fixture code verifies its direct hostname or project-qualified
  pooler username against `SUPABASE_PROJECT_REF`. Never pass it on a command line or log it.

The public config and SSR packages do not export privileged client construction. Browser code must
not import `@starville/supabase/server`, `@starville/config/server`, or server-only admin modules.

## Reserved for Phase 3

`REOWN_PROJECT_ID`, `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `GAME_TOKEN_MINT_ADDRESS`,
`GAME_TOKEN_SYMBOL`, and `GAME_TOKEN_GATE_AMOUNT` are documentation placeholders only. Phase 2 does
not implement wallet connection, signatures, token checks, or gating.

## Loading precedence

Root commands load `.env.example`, optional `.env`, optional `.env.local`, exported shell variables,
then explicit command-runner overrides. Later sources win. `pnpm build` forces only
`NODE_ENV=production` for framework correctness. CI and deployments should supply values directly
instead of relying on local files.

## Development process profiles

Normal development uses named allowlist profiles in `scripts/environment-profiles.mjs`. Every
application package invokes the root loader from its own `dev` script, so both `pnpm dev` and
`pnpm --filter @starville/<application> dev` read the same root `.env.local`. No environment file is
copied into an application directory.

| Runtime          | Variables owned by the profile                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Landing          | Landing/API/Supabase public values and `LANDING_PORT`                                            |
| Game client      | Game/API/realtime/Supabase public values and `GAME_CLIENT_PORT`                                  |
| Admin portal     | Admin/API/game/Supabase public values, `ADMIN_PORT`, and the server-only recovery signing secret |
| API              | API bind/CORS/log values, Supabase URL and service-role key, and administrator session controls  |
| Real-time server | Realtime bind/origin/capacity/log values                                                         |
| Worker           | Worker bind/concurrency/retry/log values                                                         |

The admin portal is a hybrid Next.js process. Its profile supplies `ADMIN_RECOVERY_COOKIE_SECRET`
only for server route/action execution; Next.js exposes only `NEXT_PUBLIC_*` values to browser code.
The post-build `pnpm security:scan` checks the actual browser outputs for the recovery secret,
Supabase service-role key, database URL, and known local secret values.

Database credentials and hosted-operation approvals are not part of any normal runtime profile.
`SUPABASE_DATABASE_URL`, `SUPABASE_REMOTE_WRITES_APPROVED`, `RUN_HOSTED_SUPABASE_TESTS`, and
`ADMIN_BOOTSTRAP_ENABLED` remain available only to explicit root maintenance commands. Turbo stays
in strict environment mode; it has matching per-task allowlists so exported port/config overrides
are forwarded only to the owning application.
