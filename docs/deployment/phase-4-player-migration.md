# Phase 4 player migration runbook

## Migration

`20260711100000_player_vertical_slice.sql` adds the minimal `player_profiles` and
`player_api_rate_limits` tables plus four service-role-only player functions. It is additive: it
does not alter administrator identities, token-gate configuration, wallet challenges, access
sessions, audit records, or Phase 3 grants.

Repository tests parse the migration and verify RLS, direct-access revocation, safe search paths,
constraints, grants, and absence of destructive statements. The committed pgTAP file is
`player_vertical_slice.test.sql` and is included in the fixed hosted-test allowlist.

## Safe preview

Keep the ignored owner environment gates at their normal false values until intentionally running
the exact operation:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_BOOTSTRAP_ENABLED=false
```

Then run the read/preview sequence:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

The verified target must be the linked Starville Development project and must independently match
the configured project reference and public Supabase hostname. Never use `--debug`, a production
target, a sibling project, `db reset`, or a destructive rollback.

## Owner-approved deployment and tests

Only for the reviewed operation, set `SUPABASE_REMOTE_WRITES_APPROVED=true`, repeat target
verification/dry-run, then run:

```bash
pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
```

Restore `SUPABASE_REMOTE_WRITES_APPROVED=false` immediately. After the Phase 4 migration appears in
remote history, set `RUN_HOSTED_SUPABASE_TESTS=true` only for the controlled test window and run:

```bash
pnpm db:test:hosted
pnpm rls:test:hosted
```

Restore `RUN_HOSTED_SUPABASE_TESTS=false` after both commands. Leave
`ADMIN_BOOTSTRAP_ENABLED=false`; Phase 4 requires no administrator bootstrap.

Hosted completion may be reported only from actual successful command output. Until the migration is
applied, the API can build and its mocked integration tests pass, but real eligible profile
creation/loading will return the safe player-service-unavailable state because the trusted RPCs do
not yet exist remotely.
