# Phase 7 cozy-gameplay migration

Phase 7 is delivered only through new forward migrations. Existing Phase 2–6 migrations must not be
edited or replayed against hosted infrastructure. Existing players are preserved and upgraded lazily
after a valid, non-maintenance gameplay bootstrap.

Before any hosted operation:

```sh
pnpm env:check
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

The remote-write and hosted-test gates must remain false during local implementation. After owner
review, maintenance, database backup/restore readiness, and explicit approval, use the repository
commands rather than invoking an unscoped database client:

```sh
pnpm db:migrations:push
pnpm db:lint:hosted
pnpm db:test:hosted
pnpm rls:test:hosted
```

Local validation uses `pnpm db:test:local:world`, which starts an isolated PostgreSQL cluster,
applies the exact migration allowlist, and executes authority/concurrency fixtures. No test may use
a production Supabase project or production credentials.

Hosted world interaction changes require a separately reviewed derived draft and explicit owner
publication. The Phase 7 migration must not silently edit or publish an existing Phase 6 world
version. Development-art markers remain non-production until approved assets are supplied.
