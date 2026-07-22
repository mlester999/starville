# Backup, restore, and rollback runbook

Backup and restore are `blocked` in Phase 13C because they require the owner-selected production
Supabase plan and access. Documentation and local clean-chain tests are preparation, not recovery
evidence.

## Production backup policy gate

Before commissioning, the database owner records plan capabilities, automated backup
frequency/retention, point-in-time recovery window, region, encryption, access roles, alerting,
export policy if any, recovery point objective, recovery time objective, and provider limitations. A
second owner verifies that a fresh recovery point exists and that authorized responders can initiate
recovery.

Never place a database dump in the repository, developer laptop backup folder, general cloud drive,
or release evidence bundle. Production backups contain private player and administrative data and
must remain encrypted in owner-approved storage with retention and access logs.

## Restore rehearsal

1. Create an isolated, access-controlled non-production restore target. Never restore over the
   active project as a test.
2. Record the source recovery point, target, expected data time, authorized operators, and
   incident/change ID.
3. Restore using provider controls. Keep application and workers disconnected until validation
   completes.
4. Verify schema/migration ledger, extensions, functions, RLS/FORCE RLS, policies, grants, auth
   linkage boundaries, reference catalogs, ledger/inventory invariants, world/assets, audit
   continuity, and representative read-only queries.
5. Run application health/readiness and synthetic flows only with isolated test identities. Confirm
   no production email, webhook, wallet, worker, or public domain points to the restored target.
6. Record duration, achieved recovery point, deviations, cleanup owner, and sign-off. Destroy the
   rehearsal target under the provider retention policy after evidence is accepted.

## Application rollback

Keep a previous immutable artifact per service. With maintenance active, stop affected workers,
redeploy the previous artifact using the same verified environment contract, run health/readiness
and representative smoke checks, then resume in dependency order. Rollback must not point an
artifact at development or an unverified database.

## Database change recovery

Migrations are forward-only operationally. For a compatible defect, ship a reviewed forward-fix
migration. For destructive corruption or an unrecoverable incompatibility, keep admission closed and
use the approved provider restore point with incident-owner authorization. Never run `DROP`,
truncate, delete audit/ledger history, edit an applied migration, or reverse timestamps to make a
ledger look clean.

## Domain rollback

- Maintenance/announcement: update with current revision.
- World: publish a reviewed previous immutable version.
- Asset: restore bundled V1 or another accepted immutable version.
- DUST/inventory: separately reviewed inverse correction; do not delete the original entry.
- Player moderation: separately authorized restore; revoked sessions remain revoked.
- Worker/reconciliation: stop claims, inspect leases/effects, then retry safely.

After every rollback, preserve before/after evidence, confirm alerts/health, monitor the defined
window, and schedule a root-cause correction. A rollback that appears successful does not close a
security or data-integrity incident automatically.
