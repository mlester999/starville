# Phase 8B chat deployment runbook

Phase 8B remains local-only until the owner approves hosted work. Keep
`SUPABASE_REMOTE_WRITES_APPROVED=false`, `RUN_HOSTED_SUPABASE_TESTS=false`, and
`ADMIN_BOOTSTRAP_ENABLED=false` during review.

## Local gate

```bash
pnpm env:check
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
pnpm db:test:local:world
pnpm realtime:load:test
git diff --check
```

Review the load output, message/rejection rates, latency, memory delta, and mute/report results. No
load scenario may point at hosted services.

## Owner-approved hosted sequence

After reviewing the uncommitted diff and migration:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
# Set only the migration approval gate for the reviewed operation.
pnpm db:migrations:push
pnpm db:lint:hosted
# Set only the hosted-test gate for the reviewed test operation.
pnpm db:test:hosted
pnpm rls:test:hosted
```

Deploy API, realtime server, worker, game client, and admin portal as one compatible release. Verify
the realtime and worker readiness endpoints, then complete the owner acceptance checklist. Rollback
is an application deployment rollback plus a forward-only database correction; never rewrite the
applied migration.
