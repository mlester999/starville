# Phase 3 wallet operations

## Current deployment status

As of the Phase 3 repository implementation:

- the landing, API, game gate, minimal admin configuration surface, shared packages, migrations, and
  tests exist in the workspace;
- the linked target is the dedicated Starville Development Supabase project;
- Phase 3 migrations `20260710100000_token_access_schema.sql` and
  `20260710101000_token_access_functions_rls.sql` are hosted;
- hosted lint, pgTAP, RLS, authorization, revocation, and cleanup checks pass;
- the temporary Mainnet Token-2022 mint is validated and active for Phase 3 testing; and
- `SUPABASE_REMOTE_WRITES_APPROVED` and `RUN_HOSTED_SUPABASE_TESTS` must be restored to `false`
  immediately after approved maintenance.

Live eligible-wallet behavior still requires an owner-controlled wallet holding the configured
threshold. Repository tests must not be presented as that wallet-controlled result.

## Operator prerequisites

Before any remote write, obtain all of the following:

1. explicit approval for the exact Starville Development project and migration set;
2. an owner-confirmed mint on the selected network that is owned by SPL Token or Token-2022;
3. a Reown project configured for the exact landing origins;
4. server-only Supabase service-role/secret and project-matched database URL in ignored `.env.local`
   or an approved secret manager;
5. an independent high-entropy `TOKEN_ACCESS_COOKIE_SECRET`;
6. an active administrator with the intended token-gate permissions; and
7. test wallets representing sufficient, exact-threshold, insufficient, and no-token cases.

Never request, store, or share wallet seed phrases, recovery phrases, private keys, or passwords.
The test operator signs the human-readable challenge in their wallet.

## Environment ownership

Browser-safe values:

- `NEXT_PUBLIC_REOWN_PROJECT_ID`
- `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_GAME_URL`, `NEXT_PUBLIC_API_URL`
- existing public Supabase URL and anonymous/publishable key

Server-only token-access values:

- `TOKEN_GATE_ENABLED` (fail-closed API kill switch; `false` can only deny access)
- `SOLANA_RPC_URL`
- `TOKEN_ACCESS_COOKIE_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DATABASE_URL`
- RPC timeout/retry, TTL, recheck, and abuse-limit settings

Public identifiers used by the API are `SOLANA_NETWORK`, `GAME_TOKEN_MINT_ADDRESS`,
`GAME_TOKEN_SYMBOL`, and `GAME_TOKEN_GATE_AMOUNT`. Their values are not secrets, but environment
values do not activate the gate: the authoritative database row must be validated and saved by an
authorized administrator.

For a local `.env.local` that already contains a legacy `REOWN_PROJECT_ID`, prepare the Phase 3
aliases and an independent cookie secret without printing secret values:

```bash
pnpm env:phase3:prepare
pnpm env:check
```

Review only the reported variable names/status. Do not print or commit `.env.local`.

After approved hosted maintenance, run `pnpm env:phase3:close-maintenance` to restore all three
maintenance gates to `false` without printing secret values, then verify the result with
`pnpm env:check`.

## Safe local validation

These commands do not authorize a hosted write:

```bash
pnpm install --frozen-lockfile
pnpm env:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
git diff --check
```

Start all six services with:

```bash
pnpm dev
```

For Phase 3 browser smoke checks, keep `localhost` consistent across landing, game, admin, and API.
Confirm the landing can open Reown, but do not claim eligibility until the database is configured.
The expected current result is fail-closed configuration unavailable.

## Pre-write target verification

Keep both remote gates false while reviewing:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Review the safe target summary, linked reference, complete migration list, and dry-run. Verify that
the only new migration files are the reviewed Phase 3 schema and functions/RLS migrations. Stop on
any target mismatch, unexpected migration, production reference, or ambiguous approval.

The root scripts wrap the canonical Supabase CLI workdir and target checks. Do not replace them with
an unverified raw command and do not use `--debug` with credentials.

## Apply migrations after explicit approval

Only for the approved operation, set this ignored local gate:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=true
```

Then reverify and apply:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
```

Confirm both Phase 3 versions appear locally and remotely and hosted lint reports no warnings. As
soon as the reviewed write is complete, restore:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=false
```

Do not run `db reset`, migration down, schema drops, truncation, broad deletes, or migration
rollback on the hosted project. A failure is investigated and corrected with a reviewed forward
migration.

## Run hosted tests after separate approval

Hosted tests are a separate write because they create controlled fixtures. Ensure migrations are
already present, the service/database credentials match the verified project, and set only for the
approved run:

```dotenv
RUN_HOSTED_SUPABASE_TESTS=true
```

Run:

```bash
pnpm db:verify-target
pnpm db:test:hosted
pnpm rls:test:hosted
```

`db:test:hosted` executes the fixed reviewed pgTAP allowlist, including `token_access.test.sql`,
inside explicit transactions that end in rollback. `rls:test:hosted` uses unique controlled Auth
fixtures and verifies that anonymous and normal authenticated users cannot read or mutate
token-access authority. Exact fixture cleanup must succeed.

Immediately restore:

```dotenv
RUN_HOSTED_SUPABASE_TESTS=false
SUPABASE_REMOTE_WRITES_APPROVED=false
ADMIN_BOOTSTRAP_ENABLED=false
```

These deny-by-default controls must all be false after the approved operation, even if only one was
temporarily enabled.

Report each command's actual output and cleanup result. If a test or cleanup fails, do not call the
hosted foundation validated and do not broaden cleanup.

## Configure Reown

In the Reown project dashboard, register each exact development/deployment landing origin. The
runtime metadata URL must match `NEXT_PUBLIC_LANDING_URL`, because its host and origin are signed in
every Starville challenge.

Validate in at least one supported Solana wallet that:

- only the configured Solana network is offered by Starville;
- the message is readable and states that it authorizes no transaction, transfer, or spending;
- `signMessage` returns a 64-byte Ed25519 signature;
- rejecting the signature creates no access;
- changing account or network cancels the attempt; and
- disconnect revokes/clears the current access session.

Do not enable Reown email/social authentication, on-ramp, swaps, send, or receive as part of this
phase.

## Activate an approved mint

After migrations and hosted authorization tests pass:

1. Sign in to the admin portal with an active administrator who has `token_gate.read` and
   `token_gate.configure`.
2. Open `/token-access` and confirm the environment is development, the displayed network matches
   the server RPC, and the row is currently unconfigured or shows the expected version.
3. Enter the owner-confirmed mint and run **Validate proposed mint**.
4. Independently verify the returned program, decimals, and recent slot.
5. Enter symbol, exact display threshold, commitment, TTL, recheck interval, and a specific reason.
6. Acknowledge invalidation and save. Confirm version increment and `available` state.
7. Do not edit the database row directly and do not use a service key in the browser.

The current temporary Mainnet mint passed step 3 and is intended only for Phase 3 validation.
Replace it with the owner-approved official `$STAR` mint before production; do not hardcode either
address.

## Live end-to-end acceptance

Use fresh challenges for every scenario and capture only safe request IDs/results:

1. Connect a supported wallet and verify the exact challenge text/domain/network.
2. Reject a signature and confirm no session.
3. Modify/replay/expire a challenge and confirm denial.
4. Verify a sufficient wallet and an exact-threshold wallet receive the HttpOnly cookie and can
   reach the game foundation scene.
5. Verify insufficient, zero, and no-token-account wallets receive accurate denial balances and no
   game access.
6. Confirm account/network change and disconnect revoke access.
7. Confirm `/me`, scheduled recheck, focus reconciliation, and manual recheck work.
8. Reduce a wallet below threshold and confirm recheck clears the cookie and blocks Phaser.
9. Simulate RPC timeout/wrong network and confirm a temporary error, never zero/insufficient.
10. Update configuration and confirm prior sessions are invalidated.
11. Verify a normal player wallet cannot access the admin page or endpoints.

Live wallet validation is complete only when every applicable scenario passes against the approved
hosted development target. A missing test wallet or provider outage must be reported as pending.

## Production domain and cookie checklist

Before a production-like deployment:

- serve landing, game, admin, and API over HTTPS;
- place landing/game/API under the same registrable site so the API's host-only
  `SameSite=Lax; Secure` cookie works with credentialed fetches;
- keep the cookie host-only and path-scoped to `/api/v1/token-access`;
- list exact browser origins in `CORS_ALLOWED_ORIGINS` and never use a wildcard;
- leave `API_TRUSTED_PROXY_CIDRS` empty unless a reverse proxy is present; then list only its exact
  IPs/CIDRs and verify spoofed forwarding headers are ignored from every other peer;
- ensure `NEXT_PUBLIC_API_URL` names the HTTPS API cookie owner;
- register the exact landing origin with Reown;
- verify proxies preserve `Origin`, `Set-Cookie`, and request IDs without logging cookie values; and
- verify browser bundles with `pnpm security:scan` after the production build.

An unrelated API site is not compatible with the current SameSite design. Change the deployment
topology rather than weakening cookie protections.

## Monitoring, incidents, and retention

Monitor safe aggregate counts for challenge denials, rate limiting, RPC unavailability,
configuration changes, grants, revocations, and recheck failures. Use request IDs for correlation.
Do not export raw wallet signatures, messages, nonces, cookies, IPs, user agents, RPC URLs, or
secrets to analytics.

If RPC is unavailable, access fails closed and due sessions may be revoked. Do not convert the error
to insufficient balance or temporarily trust browser balances. If a configuration is wrong, use an
audited forward admin update; disabling the gate denies all access and is not a bypass.

No cleanup schedule is installed in Phase 3. The maintenance-only cleanup function can remove
expired, unreferenced challenge/session records older than an approved cutoff of at least 24 hours.
Before scheduling it, approve retention and archival requirements for wallet-access events and
personal data. See [token-access sessions](../wallet/token-access-sessions.md).

## Phase boundary

This runbook must not be used to begin character creation, movement, maps, farming, inventory,
rewards, economy, multiplayer, or other Phase 4 work. The granted game screen intentionally remains
a foundation boundary.
