# Phase 13E-A hosted validation unblock

Date: 2026-07-24  
Status: hosted migration compatibility correction implemented; hosted retry pending Hosted writes
during this correction: **none**

## Hosted sequence and exact ownership failure

The first read-only validation found 84 matching local/remote migrations, no remote-only migration,
and no need for migration repair. The repository then added the exact policy-helper permission
repair and the missing hosted harness coverage. During the subsequent hosted retry, Phase 13B
applied successfully. The next migration failed at:

```sql
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
```

The connected migration role was `postgres`, while Supabase owns `realtime.messages` as
`supabase_realtime_admin`. Supabase already enables RLS on this provider-managed table. PostgreSQL
therefore rejected the redundant ownership-sensitive operation. The failed Phase 13E transaction
fully rolled back: the Realtime migration is absent from remote migration history and no Phase 13E
tables, functions, policies, grants, or rows remain on `starville-dev`. Phase 13B remains applied.
The exact state is 85 applied migrations, three pending migrations, and zero remote-only migrations.
Migration repair is neither needed nor permitted.

No hosted write occurred during this repository compatibility correction. It did not contact
`starville-dev` or `starville-prod`, change a project setting, create an Auth user or fixture, run a
function, enable Cron, or alter migration history.

## Narrow amendment and migration policy exception

The normal policy is never to edit a migration that exists in remote history. This migration has
never successfully applied to a shared hosted project, its failed transaction fully rolled back, it
is absent from remote history, and no Phase 13E object remains remotely. A later repair cannot fix
an earlier migration that fails before reaching it, so this unapplied migration is eligible for a
narrow compatibility amendment and checksum review.

The amendment removes the redundant provider-owned operation:

```sql
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
```

The ownership review found and also removed the only other ownership-sensitive statement against
that provider-owned table:

```sql
GRANT SELECT, INSERT ON TABLE realtime.messages TO authenticated;
```

Supabase manages the table’s RLS state and base privileges. The migration now changes only
Starville-owned policies on `realtime.messages`, an operation supported by Supabase Realtime
Authorization. It adds no `ALTER OWNER`, `SET ROLE`, `SECURITY DEFINER` DDL wrapper, privilege
escalation, trigger change, column change, manual RLS change, or table-level grant/revoke against
`realtime.messages`. All four Starville Broadcast/Presence read/write policies remain.

The previous Realtime SHA-256 was
`d6d8058834df5361cda218f19edd1969594e93f0e2cdf573422f09954b52b1af`; the corrected SHA-256 is
`20532eb6c659da4d3d93a6f3183ed4a8719921e26efb0822049fae065bb51b84`. The previous complete
migration-manifest SHA-256 was `fcdee9ed405e96c483b88d55e758109dcb5cc42687c803b80964bb2a357daf59`;
the corrected manifest SHA-256 is
`54b2136ea9e06755a7452e308611d283bb9b32429142c77ffb8a2dd487322bce`. The permission-repair and
cleanup hashes remain unchanged at
`4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723` and
`147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97`.

## Exact privilege model

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

## Pending migration order and applied Phase 13B

Phase 13B applied successfully and must not be reverted or included in the pending list. The
complete remaining order is exactly:

1. `20260724100000_phase13e_supabase_realtime_authorization.sql`
2. `20260724100500_phase13e_realtime_authorization_permission_fix.sql`
3. `20260724101000_phase13e_social_cleanup_cron_foundation.sql`

The applied Phase 13B migration is a metadata-only hardening change:

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

No objective Phase 13B defect was found. Hosted catalog, RLS, API, and regression tests remain
mandatory after the three Phase 13E migrations are applied in a separately authorized retry.

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
  database URL, `ADMIN_BOOTSTRAP_ENABLED=false`, the reviewed branch/clean worktree/checksums,
  post-application 88/0 migration parity, and proven private-only settings;
- makes one bounded no-payload public-channel subscription attempt and treats success as critical
  failure, while every normal Starville channel remains `config.private=true`;
- creates two unique wallet/profile fixtures and two non-anonymous Auth users through the
  wallet-bound preparation/binding flow;
- proves unbound, wrong-player, suspended, anonymous, missing/malformed/corrupted token,
  deterministic expired wallet-access-session, one-use magic-link replay, and cross-environment
  denials;
- checks two-client subscribe, Presence sync/join/leave, untrack, reconnect de-duplication, and
  channel-switch cleanup;
- sends strict low-frequency movement by Broadcast, enforcing protocol/scope/size/sequence/time and
  the 100 ms throttle while rejecting stale, duplicate, malformed, oversized, wrong-version,
  wrong-world, cross-topic, and gameplay-authority fields;
- compares matching `realtime.messages` rows before/after to prove movement is not used as a
  PostgreSQL frame bus;
- removes channels, verifies exact Auth/database fixture ownership, deletes only exact tagged or
  tracked Auth, binding, membership, party/home, audit, wallet, avatar/cosmetic, moderation, and
  player fixtures in `finally`, and proves zero remain.

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

The owner has since configured Realtime enabled, disabled public access, and proven private-only
mode through Management API read-back. Presence still requires the two-client behavioral harness. No
setting was changed by the repository harness-completion task.

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
confirm 85 applied migrations, exactly the three pending migrations above, and zero remote-only
migrations; obtain the explicit hosted-write gate; apply only to `starville-dev`; then run the Phase
13E pgTAP, Realtime, cleanup, target-protection, lint, and regression suites. Until that separate
run succeeds, private-channel behavior, Presence capability, cleanup behavior, migration
application, and Phase 13E parity are unverified. Phase 13E-B remains blocked.

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
