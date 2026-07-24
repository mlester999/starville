# Phase 13E-A hosted validation unblock

Date: 2026-07-24  
Status: repository correction and hosted harnesses implemented; hosted proof not yet run  
Hosted writes during this correction: **none**

## Why the first hosted validation stopped

The read-only validation found 84 matching local/remote migrations, no remote-only migration, and no
need for migration repair. It then stopped before migration application because the pending Realtime
migration revoked `EXECUTE` on `private.supabase_realtime_topic_authorized(uuid,text,text)` from
`authenticated`, although all four `realtime.messages` policies call that function. PostgreSQL
checks the caller's function privilege before the `SECURITY DEFINER` body can evaluate the policy.
The Phase 13E pgTAP suite was also absent from the hosted runner's reviewed allowlist, and
private-only Realtime settings, two-client behavior, and cleanup-function behavior were not yet
proven.

No hosted migration, Auth user, fixture, function invocation, project-setting change, Cron schedule,
or other hosted write occurred in that validation.

## Forward-only correction and exact privilege model

The migration manifest states that committed migrations are never edited in place. Therefore the
unapplied but committed Realtime migration remains immutable and its SHA-256 remains
`d6d8058834df5361cda218f19edd1969594e93f0e2cdf573422f09954b52b1af`. The immediately following
migration `20260724100500_phase13e_realtime_authorization_permission_fix.sql` has SHA-256
`4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723`.

The correction first revokes the exact function from `PUBLIC`, `anon`, `authenticated`, and
`service_role`, then grants only that exact signature to `authenticated`. It grants no table
privilege, no `ALL FUNCTIONS IN SCHEMA` privilege, and no new schema privilege. Existing private
schema `USAGE` permits name resolution but reveals no table or function without an object-level
grant.

The function remains `STABLE`, `SECURITY DEFINER`, owned by the trusted migration role, with
`search_path=''`, fully qualified references, no dynamic SQL, and fail-closed topic parsing.
Authorization still derives only from `auth.uid()`, `realtime.topic()`, the trusted message
extension, server-managed Auth/player binding and membership, active wallet access, world/channel,
moderation, environment, party membership, and home admission/invitation state. Payload fields are
not authorization inputs.

## Pending migration order and Phase 13B review

The first read-only run correctly found three pre-existing pending migrations. The forward repair
adds one migration, so the complete retry order is now:

1. `20260722130000_phase13b_closed_beta_security_hardening.sql`
2. `20260724100000_phase13e_supabase_realtime_authorization.sql`
3. `20260724100500_phase13e_realtime_authorization_permission_fix.sql`
4. `20260724101000_phase13e_social_cleanup_cron_foundation.sql`

The Phase 13B migration is a metadata-only hardening change:

- it forces RLS on 20 existing admin, wallet, player, moderation, and world tables;
- it revokes `SELECT`, `INSERT`, `UPDATE`, and `DELETE` from `service_role` on 19 player-experience
  tables;
- it revokes direct execution from all client/service roles on 19 private progression helpers;
- it creates, replaces, or drops no function or table, changes no policy, performs no backfill, and
  contains no row mutation or destructive DDL;
- each `ALTER TABLE ... FORCE ROW LEVEL SECURITY` requires a brief PostgreSQL `ACCESS EXCLUSIVE`
  metadata lock, so the retry should run during a quiet development window;
- it is transaction-compatible and contains no concurrent index, network, or external side effect;
- expected runtime is short, subject to waiting for conflicting table locks;
- rollback is a forward ACL/RLS correction, not destructive migration-history rewriting;
- it is compatible with Phase 13E because the latter uses trusted `SECURITY DEFINER` RPCs and adds
  no direct `service_role` table dependency.

No objective Phase 13B defect was found. It does not require a new approval distinct from the
already required reviewed `starville-dev` migration-write gate, but its lock/ACL impact and all four
pending filenames must be reported before the later `db push`. Hosted catalog, RLS, API, and
regression tests remain mandatory after application.

## Hosted test preparation

The fixed hosted database runner now includes `phase13e_supabase_first_foundation.test.sql` in its
explicit allowlist. It accepts only an exact allowlisted `--suite` value, rejects
unknown/renamed/traversing paths, verifies the linked project against the configured `starville-dev`
reference and URL, rejects production aliases/references, requires `RUN_HOSTED_SUPABASE_TESTS=true`,
and logs only a masked target summary.

The pgTAP and PostgreSQL execution fixtures cover exact helper ACLs, no direct membership/identity
table access, trusted owner/search path, four authenticated-only Presence/Broadcast policies,
unbound identity, correct/wrong world and environment, malformed and unsupported topics, suspension,
expiry, player scope, active party membership, home ownership, active invitation, and expired
invitation. Hosted execution remains pending.

`phase13e:realtime:hosted` defaults to `--dry-run`, which performs zero remote calls. Its gated
`--execute` path:

- requires the exact linked `starville-dev`, both hosted-test and remote-write gates, a matching
  database URL, and proven private-only settings;
- creates two unique wallet/profile fixtures and two non-anonymous Auth users through the
  wallet-bound preparation/binding flow;
- creates channels only with `config.private=true`;
- checks two-client subscribe, Presence sync/join/leave, untrack, reconnect de-duplication, and
  channel-switch cleanup;
- sends strict low-frequency movement by Broadcast, enforcing protocol/scope/size/sequence/time and
  the 100 ms throttle while rejecting stale, duplicate, malformed, oversized, wrong-version,
  wrong-world, cross-topic, and gameplay-authority fields;
- compares matching `realtime.messages` rows before/after to prove movement is not used as a
  PostgreSQL frame bus;
- removes channels and deletes only tracked Auth, binding, membership, audit, wallet, and player
  fixtures in `finally`.

Presence contains only the approved public presentation state and is not used for movement.
Broadcast cannot grant inventory, currency, progression, collision, trade, gift, reward, or
moderation authority.

`phase13e:cleanup:hosted` also defaults to zero-call `--dry-run`. Its gated execution aborts if any
pre-existing eligible social interaction exists, creates only uniquely tagged fixtures, tests
expired/non-expired/completed/unrelated/boundary and multi-row cases, the 1,000 input cap, run
evidence, replay idempotency, advisory-lock skip, forced-transaction rollback, absence of another
Worker run, and absence of a matching Cron schedule. Every fixture and run-evidence transaction is
rolled back in `finally`; the harness never enables Cron.

## Realtime settings proof

`pnpm realtime:settings:verify` performs an authenticated **GET** against the Management API after
exact `starville-dev` verification. It prints only:

- Realtime service: enabled, disabled, or unknown;
- public channel access: allowed, disabled, or unknown;
- private-only requirement: proven or not proven;
- Presence capability: available, not available, or unknown;
- source: Management API or Dashboard-required.

It never prints the token or raw response. It interprets only documented `suspend` and
`private_only` fields. A response field named `presence_enabled` is deliberately not treated as an
authoritative Presence switch; two-client behavior is the final capability proof.

If `private_only` is omitted, the owner must open **Dashboard → Realtime → Settings → Channel
Restrictions** and disable **Allow public access**, then repeat read-back or the private-channel
behavioral test. No setting was changed by this repository task.

## Safety and next validation boundary

The owner-selected workflow is hosted `starville-dev` validation without Docker or a local Supabase
runtime. Production remains:

```text
NEXT_PUBLIC_REALTIME_PROVIDER=custom
STARVILLE_BACKGROUND_JOBS_PROVIDER=custom
```

Cron remains disabled. `/health` remains process liveness; custom/custom `/ready` checks the custom
Realtime and Worker; either Supabase provider keeps `/ready` at
`503 SUPABASE_MIGRATION_PARITY_INCOMPLETE`. Custom services and their configuration remain rollback
references.

The next task must re-run read-only target, migration-list, settings, and migration dry-run checks;
report all four pending migrations; obtain the explicit hosted-write gate; apply only to
`starville-dev`; then run the Phase 13E pgTAP, Realtime, cleanup, target-protection, lint, and
regression suites. Until that separate run succeeds, private-channel behavior, Presence capability,
cleanup behavior, migration application, and Phase 13E parity are unverified. Phase 13E-B remains
blocked.

The read-only/pre-write sequence for that separate retry is:

```sh
set +x
pnpm db:verify-target
pnpm db:migrations:list > "${TMPDIR:-/tmp}/starville-phase13e-migrations.txt"
pnpm phase13e:migrations:review -- --input "${TMPDIR:-/tmp}/starville-phase13e-migrations.txt"
pnpm realtime:settings:verify
pnpm db:migrations:dry-run
pnpm phase13e:realtime:hosted -- --dry-run
pnpm phase13e:cleanup:hosted -- --dry-run
```

Only after that output is reviewed and both hosted gates are explicitly approved may the next task
run `pnpm db:migrations:push`, the exact allowlisted Phase 13E hosted pgTAP suite, and the two
`--execute` harness modes. The retry task title is **Phase 13E-A Hosted starville-dev Migration and
Behavioral Validation Retry**.
