# Phase 8D-B Deployment Guide

Phase 8D-B is represented by four forward-only migrations:

1. `20260715140000_cooperative_activities_schema.sql`
2. `20260715141000_cooperative_activities_functions.sql`
3. `20260715142000_cooperative_activity_operations.sql`
4. `20260715143000_cooperative_activity_platform_module.sql`

No hosted operation is part of local implementation. An owner should first run the full local suite
and review migration SQL, RLS/grants, pgTAP, PostgreSQL execution/concurrency output, load report,
module settings, and the acceptance checklist. Keep maintenance gates false unless a separately
reviewed deployment window requires them.

After explicit owner approval, use the repository's target-verification and dry-run commands before
any push:

```sh
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
pnpm db:migrations:push
pnpm db:lint:hosted
pnpm db:test:hosted
pnpm rls:test:hosted
```

Then deploy compatible API, realtime, worker, game client, and admin builds through the existing
owner-controlled process. Do not publish a map, asset, activity, or platform configuration
automatically. The schema keeps the existing published 15-module platform config valid; a future
owner-created draft is upgraded to the 17-module schema and still requires normal
validation/review/publication.

Post-deployment checks should confirm the Moonpetal active version, `public_queue_enabled = false`,
module settings, no active maintenance, service RPC execution only, worker bounded cleanup, and the
43 manual acceptance steps. Rollback is additive operational mitigation: disable new entry, allow
safe active completion or reviewed cancellation, and preserve history. Do not reverse or edit
applied migrations.
