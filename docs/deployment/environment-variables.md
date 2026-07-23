# Environment-variable ownership

The root [`.env.example`](../../.env.example) is the committed Phase 6 template. Its values are
non-working placeholders. Real development values belong only in ignored `.env.local`; commands must
never print private values.

## Browser-safe and required

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_GAME_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_REOWN_PROJECT_ID`
- `NEXT_PUBLIC_STARVILLE_X_URL` (optional; HTTPS only)
- `NEXT_PUBLIC_STARVILLE_DISCORD_URL` (optional; HTTPS only)
- `NEXT_PUBLIC_GAME_COLLISION_DEBUG` (optional; `false` by default; explicit map-development builds
  only)
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
- `API_TRUSTED_PROXY_CIDRS` is empty by default. Deployments may list at most 16 exact proxy IPs or
  bounded CIDRs; unrestricted `/0`, hostnames, and implicit trust of forwarded headers are rejected.
- `REALTIME_HOST`, `REALTIME_PORT`
- `WORKER_HOST`, `WORKER_HEALTH_PORT`
- `CORS_ALLOWED_ORIGINS`, `REALTIME_ALLOWED_ORIGINS`
- `REALTIME_MAX_CONNECTIONS`
- `WORKER_CONCURRENCY`, `WORKER_MAX_ATTEMPTS`, `WORKER_RETRY_BASE_DELAY_MS`
- `REALTIME_HEALTH_URL`, `WORKER_HEALTH_URL` are server-only API readiness targets; production
  values require HTTPS and are never returned to browsers.
- `ADMIN_HEALTH_CHECK_TIMEOUT_MS` bounds each Phase 5 readiness request to 250–5,000 ms.
- `ADMIN_PLAYER_ACTION_RATE_LIMIT` bounds each sensitive administrator action to 1–60 attempts per
  minute; PostgreSQL persists the actual fixed-window counters.
- `ADMIN_OPERATIONS_READ_RATE_LIMIT` bounds each administrator and route scope per API instance to
  10–600 reads per minute; bounded database pagination remains the primary query limit.
- `WORLD_MANIFEST_MAX_BYTES` bounds structured map content to at most 256 KiB in both API and
  database validation.
- `WORLD_TRANSITION_TIMEOUT_MS` bounds the client-visible transition request to 3–30 seconds; the
  default is 15 seconds and adds no artificial loading delay.
- `WORLD_PLAYER_READ_RATE_LIMIT` and `WORLD_PLAYER_TRANSITION_RATE_LIMIT` bound published reads and
  transition attempts. PostgreSQL also enforces a one-second successful-transition cooldown.
- `WORLD_ADMIN_READ_RATE_LIMIT`, `WORLD_ADMIN_DRAFT_WRITE_RATE_LIMIT`,
  `WORLD_ADMIN_VALIDATION_RATE_LIMIT`, `WORLD_ADMIN_PUBLISH_RATE_LIMIT`, and
  `WORLD_ADMIN_DERIVE_RATE_LIMIT` are durable database operation bounds. Publication is the
  strictest operation.

The browser applications use their `NEXT_PUBLIC_*_URL` values; port variables control only local
process binding. Production public URLs and origin allowlists must use HTTPS/WSS. Cleartext HTTP/WS
is accepted only for loopback hosts outside production.

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

- `SUPABASE_ENVIRONMENT` is `development` for normal hosted tooling. Phase 13D owner commands may
  use `production` only with `STARVILLE_DEPLOYMENT_TARGET=starville-prod`, an exact separately
  approved production ref, a distinct development ref, production runtime identity, and the
  production target verifier.
- `SUPABASE_PROJECT_REF` must match both the public Supabase hostname and canonical CLI link.
- `SUPABASE_REMOTE_WRITES_APPROVED` is a deny-by-default migration, bootstrap, and hosted
  world-asset upload gate. Only the admin portal and API application profiles receive it for runtime
  upload enforcement; it remains server-only.
- `RUN_HOSTED_SUPABASE_TESTS` is a separate deny-by-default fixture-write gate.
- Phase 13D comparison-only values bind each production public URL, the Reown project, token mint,
  token program, token decimals, and environment-manifest version to independently approved values.
  They do not authorize a network connection or mutation.

The migration, hosted-test, and administrator-bootstrap approvals are independent. Enabling one does
not authorize another, and none is a permanent deployment approval. Keep all three false except in
the one owner-reviewed command that needs them.

## Privileged and conditional

- `SUPABASE_SERVICE_ROLE_KEY` accepts a supported legacy service-role or modern secret key. It is
  server-only and used only by the API, bootstrap, and controlled hosted fixtures.
- `SUPABASE_DATABASE_URL` is server-only and required by controlled hosted database cleanup and
  direct database tooling. Hosted fixture code verifies its direct hostname or project-qualified
  pooler username against `SUPABASE_PROJECT_REF`. Never pass it on a command line or log it.

The public config and SSR packages do not export privileged client construction. Browser code must
not import `@starville/supabase/server`, `@starville/config/server`, or server-only admin modules.

## Wallet and token-access controls

Browser-safe:

- `NEXT_PUBLIC_REOWN_PROJECT_ID` identifies the Reown application. It is intentionally visible and
  is owned only by the landing profile.
- `NEXT_PUBLIC_STARVILLE_X_URL` and `NEXT_PUBLIC_STARVILLE_DISCORD_URL` are optional, owner-approved
  HTTPS destinations. When absent, the landing page renders honest disabled social marks instead of
  placeholder links.
- The public token requirement is returned by the trusted API; the browser does not receive the RPC
  URL or cookie secret.

API-owned and server-only:

- `TOKEN_GATE_ENABLED` is a fail-closed operational kill switch. `false` reports token access as
  disabled even when a valid database configuration exists; it never grants or bypasses access.
- `SOLANA_RPC_URL` may contain provider credentials in its path or query. It is available only to
  the API profile and must never be logged or bundled.
- `TOKEN_ACCESS_COOKIE_SECRET` is an independent high-entropy value of at least 32 characters. It
  HMACs session tokens and hashed client context. Never reuse a service-role key, admin recovery
  secret, database password, RPC credential, or Reown ID.
- `SOLANA_COMMITMENT`, `SOLANA_RPC_TIMEOUT_MS`, and `SOLANA_RPC_MAX_ATTEMPTS` bound private RPC
  work.
- Challenge/session TTL, recheck interval, and abuse-limit variables are bounded at startup.

Public identifiers used by the API are `SOLANA_NETWORK` (`devnet` or `mainnet-beta`),
`GAME_TOKEN_MINT_ADDRESS`, `GAME_TOKEN_SYMBOL`, and `GAME_TOKEN_GATE_AMOUNT`. They are not
authorization: the validated, versioned `token_gate_configs` row is authoritative. A missing,
nonexistent, or wrong-network mint remains fail-closed.

Production uses one canonical CA and one human-readable gate:

```text
GAME_TOKEN_MINT_ADDRESS=<OWNER_APPROVED_PUMP_FUN_CA>
GAME_TOKEN_GATE_AMOUNT=10000
```

Do not configure token program or decimals. The API detects the supported owner program and decodes
decimals from the mint account, then requires the production database row to match.

For an existing ignored `.env.local`, `pnpm env:phase3:prepare` creates the independent cookie
secret when missing and migrates a legacy browser-safe `REOWN_PROJECT_ID` name without printing
either value.

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

| Runtime          | Variables owned by the profile                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Landing          | Landing/game/API/Supabase public values, public Reown ID, and `LANDING_PORT`                                                              |
| Game client      | Landing/game/API/realtime/Supabase public values and `GAME_CLIENT_PORT`                                                                   |
| Admin portal     | Admin/API/game/Supabase public values, `ADMIN_PORT`, and the server-only recovery signing secret                                          |
| API              | API/CORS/log values, service-role key, admin controls, private RPC, token-cookie/gate limits, operations health, and Phase 6 world limits |
| Real-time server | Realtime bind/origin/capacity/log values                                                                                                  |
| Worker           | Worker bind/concurrency/retry/log values                                                                                                  |

The admin portal is a hybrid Next.js process. Its profile supplies `ADMIN_RECOVERY_COOKIE_SECRET`
only for server route/action execution; Next.js exposes only `NEXT_PUBLIC_*` values to browser code.
The post-build `pnpm security:scan` checks the actual browser outputs for the recovery secret,
Supabase service-role key, database URL, Solana RPC identifier/value when private, token-access
cookie secret, and known local secret values.

Database credentials and hosted-operation approvals are not part of any normal runtime profile.
`SUPABASE_DATABASE_URL`, `SUPABASE_REMOTE_WRITES_APPROVED`, `RUN_HOSTED_SUPABASE_TESTS`, and
`ADMIN_BOOTSTRAP_ENABLED` remain available only to explicit root maintenance commands. Turbo stays
in strict environment mode; it has matching per-task allowlists so exported port/config overrides
are forwarded only to the owning application.
