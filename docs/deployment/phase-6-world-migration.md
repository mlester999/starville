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

```bash
pnpm db:test:hosted
pnpm rls:test:hosted
```

The pgTAP allowlist includes `world_management.test.sql`. Hosted RLS integration additionally checks
anon/general-auth/service-role table denial, forged audit denial, exact world permissions, and the
authorized five-map directory. Tests use exact test-owned identities and cleanup; they never reset
the project.

## Current status

Local implementation and parser/unit coverage are present. Hosted Phase 6 push, lint, pgTAP, and RLS
execution are pending owner authorization. `ADMIN_BOOTSTRAP_ENABLED` must remain false throughout.
