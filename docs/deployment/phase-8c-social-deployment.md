# Phase 8C social deployment guide

Phase 8C is local-only until an owner approves hosted database writes. Keep these gates false during
review:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_BOOTSTRAP_ENABLED=false
```

## Local verification

Run the root validation suite, then `pnpm db:test:local:world` and `pnpm realtime:load:test`. The
database command applies all migrations to an isolated temporary PostgreSQL instance, runs the
social execution fixture, and launches independent concurrent confirmation clients. It never resets
an unknown hosted project.

## Owner-approved hosted sequence

After reviewing the diff and confirming the linked Supabase project, the owner may explicitly set
the remote-write gate for one controlled shell and run the repository's documented migration push.
Then run hosted database lint, pgTAP, and RLS suites with their separate test gate. Do not use real
player inventories for acceptance; create isolated approved fixtures and clean them through the test
harness.

The additive migration is:

- `20260715120000_nearby_social_interactions.sql`

It follows the still-local Phase 8A and Phase 8B migrations. Deploy them in timestamp order. Do not
edit an applied migration; any hosted repair must be a new forward-only migration.

## Rollback posture

Application rollback may stop publishing social UI/messages while preserving database evidence. Do
not drop receipt/audit tables or rewrite completed interactions. If an invariant fails, enable
maintenance through the existing audited operations control, stop new social traffic, preserve
logs/request IDs, and prepare a reviewed corrective migration.
