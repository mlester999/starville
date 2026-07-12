# Phase 6 world migration runbook

## Local migration set

Apply in timestamp order after the Phase 4 and Phase 5 migrations:

1. `20260712100000_world_management_schema.sql` — permissions, six RLS tables, immutability/audit
   triggers, indexes, and multi-map player columns.
2. `20260712101000_world_management_functions.sql` — manifest validation, published loading,
   transition authority, reconciliation, and version-safe state persistence.
3. `20260712102000_world_management_seed.sql` — 15 truthful procedural assets and five reviewed
   immutable publications.
4. `20260712103000_world_management_admin.sql` — protected directory, draft, validation, preview,
   publication, derivation, asset, and audit RPCs.
5. `20260712104000_world_management_player_admin.sql` — forward-only alignment of player directory
   map filters and approved published-spawn reset.

No historical migration is rewritten. There is no reset, down migration, schema drop, truncation,
remote user deletion, or blockchain operation.

`20260712100000_world_management_schema.sql` is already recorded on the hosted development database.
It is immutable and guarded locally by its reviewed SHA-256 checksum. Only migrations
`20260712101000` through `20260712104000` remain eligible for repair before their first successful
hosted application.

## Local PostgreSQL execution gate

Run the complete migration chain and trusted world behavior against an isolated stock PostgreSQL
cluster before requesting another hosted continuation:

```bash
pnpm db:test:local:world
```

The harness requires `postgres`, `initdb`, `pg_ctl`, and `psql`. Set `STARVILLE_POSTGRES_BIN` to
their directory when they are not on `PATH`. It initializes a temporary trust-auth cluster on an
ephemeral local port, installs minimal Supabase-owned auth stubs, applies every migration inside its
own transaction, replays the safe Phase 6 seed to prove catalog idempotency, executes world
loading/travel/replay/admin lifecycle assertions, then stops and deletes the cluster. It never
connects to the linked hosted project.

## Maintenance gates

Keep these values in ignored owner configuration; do not edit `.env.local`:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_BOOTSTRAP_ENABLED=false
```

Before any hosted write:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Confirm the canonical linked Starville Development project and that only the expected Phase 6
migrations are pending. Only when the owner explicitly enables the write gate:

```bash
pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
```

Only when the hosted-test gate is also enabled:

If the configured API or admin portal URL is loopback, keep `pnpm dev` running in another terminal.
The RLS runner performs bounded API `/ready` and admin `/login` preflights before it creates any
hosted fixtures.

```bash
pnpm db:test:hosted
pnpm rls:test:hosted
```

The pgTAP allowlist includes `world_management.test.sql` and verifies the exact world-role mappings.
Hosted RLS integration additionally checks anon/general-auth/service-role table denial, forged audit
denial, Blockchain Operator denial, and the authorized Game Administrator five-map directory. Tests
use exact test-owned identities and cleanup; they never reset the project.

## Current status

The hosted schema migration (`20260712100000`) is applied. The repaired functions, seed, admin, and
player-admin migrations remain pending. Local parser, unit, and real PostgreSQL execution coverage
must pass before the owner enables a maintenance gate. Hosted push, lint, pgTAP, and RLS execution
remain pending owner authorization. `ADMIN_BOOTSTRAP_ENABLED` must remain false throughout.
