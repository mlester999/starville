# Phase 7.5B deployment runbook

No hosted operation is automatic.

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
SUPABASE_REMOTE_WRITES_APPROVED=true pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
```

The migration seeds the compiled Starville presentation as the initial active version, avoiding an
appearance change. Verify its ETag before creating drafts. Supabase, database, wallet, RPC, storage,
environment, and deployment credentials remain deferred to Phase 7.5C.
