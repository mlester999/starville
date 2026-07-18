# Phase 9A economy deployment guide

Phase 9A is local-only until an owner approves hosted writes. No migration, platform configuration,
economy policy, or shop version was published by implementation work.

The forward migrations, in order, are:

1. `20260716090000_phase9a_economy_schema.sql`
2. `20260716091000_phase9a_economy_functions.sql`
3. `20260716092000_phase9a1_economy_admin_readiness.sql`

Before approval, run `pnpm env:check`, the complete local validation suite, and
`pnpm db:test:local:world`. Review `git diff --check` and confirm the target with
`pnpm db:verify-target`. Then the owner may run `pnpm db:migrations:dry-run`, approve the exact
three migrations, run `pnpm db:migrations:push`, `pnpm db:lint:hosted`, `pnpm db:test:hosted`, and
`pnpm rls:test:hosted`. These commands are intentionally not run automatically.

After hosted database validation, deploy API, worker, game client, and admin portal through the
existing environment process. Do not publish an active platform configuration automatically. Keep
maintenance gates in their reviewed state. Verify the existing token threshold/mint/network are
unchanged and that no wallet transaction request was introduced.

Rollback is configuration-based: activate a prior reviewed immutable policy/shop version or pause
new settlement with an explicitly reviewed version. Do not reverse migrations by deleting ledger,
receipt, correction, risk, or reconciliation evidence. A schema rollback requires a separate forward
repair migration and owner review.
