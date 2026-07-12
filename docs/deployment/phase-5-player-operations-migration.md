# Phase 5 player-operations migration runbook

## Ordering and current gates

`20260711110000_secure_player_operations.sql` depends on `20260711100000_player_vertical_slice.sql`.
The approved Starville development project now lists both migrations in remote history in that
order. A current dry run reports no pending migration. A new approved environment must preserve the
same ordering; do not edit, squash, reorder, reset, or remotely repair this history.

Keep these maintenance controls false during normal development:

```dotenv
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_BOOTSTRAP_ENABLED=false
```

## Safe owner-controlled sequence

1. Confirm the canonical development project and an exact backup/maintenance window.
2. Run `pnpm db:verify-target`, `pnpm db:migrations:list`, and `pnpm db:migrations:dry-run` with
   every gate false.
3. Review that no migration is pending on the current development project. For a new approved
   environment, review that Phase 4 is followed only by Phase 5.
4. Temporarily set `SUPABASE_REMOTE_WRITES_APPROVED=true` and run `pnpm db:migrations:push`;
   immediately restore it to false.
5. Run `pnpm db:migrations:list` and `pnpm db:lint:hosted`.
6. Temporarily set `RUN_HOSTED_SUPABASE_TESTS=true`, then run `pnpm db:test:hosted` and
   `pnpm rls:test:hosted`. Confirm exact fixture cleanup; immediately restore the gate to false.
7. Verify `ADMIN_BOOTSTRAP_ENABLED=false` throughout. No bootstrap is required by Phase 5.

Never use `supabase db reset`, destructive SQL, a production project, or unknown remote credentials.

## Reviewed validation

The hosted pgTAP allowlist includes `secure_player_operations.test.sql`, covering table/default-deny
boundaries, entry enforcement, protected rename, append-only audit, spawn constants, and role
mappings. Hosted RLS adds anonymous, normal-authenticated, and service-role direct-table denial;
real role/API checks; directory/detail/operations reads; suspend/restore/reset/rename/session
revocation; version and state conflicts; player-entry enforcement; paired audits; and portal
permission rendering. Its temporary profile, wallet-session rows, and audit rows are removed through
a PostgreSQL-only exact-profile cleanup function with no service-role grant. API and UI unit tests
remain offline and deterministic.

The hosted harness refuses to rewrite the shared token-gate configuration. It first verifies that
the selected development environment/network row is enabled and validated, then uses that existing
configuration for its exact temporary fixture. A missing or unready configuration is a failed test,
not permission to patch global configuration or bump its session-invalidating version.

Temporary manual-acceptance fixtures must use unique test-owned profiles and administrator users,
must not target the owner's permanent wallet, and must be removed by exact identifiers. Any cleanup
failure is a failed test.

## Environment additions

The API alone receives `REALTIME_HEALTH_URL`, `WORKER_HEALTH_URL`, `ADMIN_HEALTH_CHECK_TIMEOUT_MS`,
`ADMIN_PLAYER_ACTION_RATE_LIMIT`, and `ADMIN_OPERATIONS_READ_RATE_LIMIT`. Use internal HTTPS URLs in
production and never return them to a browser. None is a public-prefixed variable.

Do not claim a hosted command that was never run under its explicit approval gate. After a reviewed
hosted run succeeds, restore the gates to false; returning them to their deny-by-default values does
not invalidate the recorded result.

`ADMIN_BOOTSTRAP_ENABLED` must be false for every Phase 5 command, even when the migration and
hosted test gates are temporarily approved. A local environment that leaves bootstrap enabled is not
a valid Phase 5 maintenance window and must not be used for a hosted write.
