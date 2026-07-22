# Phase 13B final report

## 1. Final status

**PHASE 13B CLOSED-BETA HARDENING CANDIDATE LOCALLY READY, HOSTED VALIDATION AND OWNER ACCEPTANCE
PENDING**

## 2. Repository and branch

Repository: `/Users/marklesteracak/Documents/Marky Files/Programming/starville`. Branch: `master`.

## 3. Starting HEAD

`f9b6a08 chore: checkpoint Phase 12E technical beta candidate`.

## 4. Pre-existing working-tree state

The tree was dirty before Phase 13B: 72 tracked paths, 5,264 insertions, 774 deletions, plus
untracked Phase 12E/12F/13A work, generated assets, and unrelated owner material. The initial diff
check passed.

## 5. Dirty-file inventory

The exact snapshot and classification are in `docs/deployment/phase-13b-working-tree-inventory.md`:
Phase 12E visual/audio/readiness work, Phase 12F production-slice and asset work, Phase 13A
gameplay-integration work, generated V3 output, unrelated `.claude/`, and mixed/uncertain shared
files.

## 6. Files preserved

All pre-existing and uncertain files were preserved. Nothing was reset, cleaned, stashed, discarded,
renamed, deleted, staged, committed, or pushed.

## 7. Phase 12E input status

**PHASE 12E CLOSED-BETA VISUAL CANDIDATE LOCALLY READY, OWNER ACCEPTANCE PENDING.** Its uncommitted
work and pending visual/audio/device owner gates remain intact.

## 8. Phase 13A input status

**PHASE 13A GAMEPLAY INTEGRATION CANDIDATE LOCALLY READY, HOSTED VALIDATION AND OWNER ACCEPTANCE
PENDING.** The actual Phase 13A report was inspected before implementation.

## 9. Remaining Phase 13A blockers

No unresolved local critical gameplay-authority blocker was reported or exposed by the Phase 13B
test matrix. Phase 13A hosted parity, full manual journeys, device checks, and owner acceptance
remain deferred gates.

## 10. Deferred owner gates

All starville-dev hosted checks, manual gameplay/device/accessibility journeys, moderation/support
review, recovery review, real-browser load, and owner acceptance remain intentionally unchecked.

## 11. Environment boundary

Implementation and validation were local. `starville-dev` is the only permitted future hosted target
after owner approval; production commissioning remains Phase 13D. Local remote-write, hosted-test,
and admin-bootstrap gates are false.

## 12. Confirmation that starville-prod was not used

Confirmed. No application, CLI, database, or migration action connected to or configured
`starville-prod`.

## 13. Trust-boundary map

`docs/security/phase-13b-closed-beta-trust-boundaries.md` maps Browser, Wallet, Reown, Landing, Game
Client, Admin Portal, API, Realtime, Worker, Auth, PostgREST, PostgreSQL functions, Storage, Solana
RPC, and operator roles. Browser inputs are intent; server/database paths remain authoritative.

## 14. Database object inventory

The applied fresh-chain PostgreSQL 18.1 inventory contains 4 audited schemas, 318 tables, 0 views, 0
materialized views, 785 functions, 0 procedures, 742 SECURITY DEFINER functions, 255 triggers, 6
explicit public policies, 14 sequences, 0 realtime publication relations, and 2 storage buckets.

## 15. RLS coverage

All 318 public tables have RLS enabled. The six explicit policies are narrow; authoritative tables
without browser policies remain RPC-only.

## 16. FORCE RLS coverage

All 318 public tables have FORCE RLS. Phase 13B repaired 20 early tables that previously enabled but
did not force RLS.

## 17. Cross-player isolation

API, RLS, and database suites cover anonymous/authenticated denial, Player A/Player B isolation,
ownership and visibility rules, private social scopes, participant-only gift/trade access, and
admin-only evidence. No permissive fallback policy was added.

## 18. Grant audit

PUBLIC, anon, and service_role have no direct public-table grants. Authenticated access is exactly
six SELECT grants on protected admin catalog tables under RLS/admin context; all other authenticated
table grants fail the applied-catalog fixture.

## 19. Function-security audit

All 742 audited public/private SECURITY DEFINER functions use the repository's established empty
`search_path`, have trusted `postgres`/`supabase_admin` ownership, and expose no inherited PUBLIC
execution. Representative settlement RPCs are directly denied to authenticated users.

## 20. Unsafe objects found

Three catalog defect classes were found: 20 public tables lacked FORCE RLS, 19 Phase 12A Player
Experience tables had broad direct service-role CRUD, and 19 private progression helpers inherited
function execution.

## 21. Unsafe objects repaired

One additive forward-only migration forced RLS on the 20 tables, revoked direct CRUD from the 19
tables, and revoked exact-signature helper execution from PUBLIC, anon, authenticated, and
service_role. Narrow service RPC execution was retained.

## 22. Admin role review

The applied catalog contains 12 system roles and 186 permissions. Fixed operator roles retain
bounded duties; specialist crossover, self-grant, read-only mutation, and direct-call bypass are
covered by catalog/API tests.

## 23. AAL2 review

Current server-verified AAL2 remains required for high-impact publication, activation, economy,
token, maintenance, session, role, and identity operations. UI visibility never substitutes for
backend AAL and permission checks.

## 24. Wallet-authentication review

Challenges remain server-created, entropy-backed, hashed at rest, one-time, expiring, and bound to
wallet, network, domain, and origin. Signature, replay, expiry, concurrent verification, cleanup,
wrong-wallet, and rate-limit cases are tested.

## 25. Session review

Cookies remain HttpOnly, bounded, path-scoped, SameSite, and Secure in production. Logout,
revocation, expiry, suspension, role changes, token loss, and realtime revalidation fail closed.

## 26. Token-access review

Solana token state is fetched and validated server-side for network, mint, program, decimals,
amount, owner, slot, configuration version, and expiry. Browser-provided balances are not trusted;
dependency failure returns a closed response.

## 27. API authorization review

Player/admin identity comes from validated credentials, not request IDs or payload player IDs.
Mutation origins, permissions, AAL, ownership, visibility, revision, and operation-specific rules
remain backend-enforced through narrow RPCs.

## 28. Input-validation review

Strict schemas reject unknown/malformed IDs, enums, quantities, coordinates, revisions, operation
keys, reasons, pagination, uploads, and text before authority work. Errors expose stable safe codes
and request IDs rather than credentials or internals.

## 29. Rate-limit coverage

Database-backed identity/route limits cover wallet, player, world, social, home, cooperative,
economy, upload, and sensitive admin authority paths. API/realtime process-local limits remain
defense in depth; hosted distributed tuning remains an owner drill.

## 30. Chat moderation

Chat retains bounded text, server-derived scope, mute/block/suspension enforcement, duplicate-spam
and rate controls, safe rendering, reporting, moderation audit, retention, and cleanup behavior.

## 31. Friend-abuse controls

Friend requests enforce identity, block/suspension state, relationship transitions, replay safety,
and bounded request rates. A client cannot act for another player.

## 32. Party-abuse controls

Membership, leadership, invitations, channel/activity scope, capacity, revision, replay, disconnect,
and cleanup remain authoritative and covered by social/realtime/database tests.

## 33. Home-visit security

Visibility, invitation, block, visitor capacity, owner/helper permissions, helper bounds, guestbook,
appreciation, seating, reconnect, and cleanup remain server-authoritative. The physical
owner-plus-ten visual walkthrough is still an owner gate.

## 34. Gifting abuse controls

Eligibility, ownership, capacity, recipient, revision, operation key, payload fingerprint, risk
evidence, atomic transfer, receipt, and replay behavior remain authoritative. Risk flags do not
automatically punish or confiscate.

## 35. Trading abuse controls

Participant identity, offers, ownership, capacity, confirmation reset after change, deterministic
locking, atomic settlement, receipts, idempotency, and changed-payload rejection are tested.

## 36. DUST hardening

DUST remains a server-owned ledger/balance system with transactional purchases, rewards,
corrections, reconciliation, immutable evidence, policy/review separation, nonnegative checks, and
concurrency coverage. No currency design or production balance changed.

## 37. Inventory concurrency

Final-slot, capacity, stack, purchase, reward, gift, trade, craft/cook, correction, and concurrent
inventory updates pass the full isolated database chain without duplicate settlement.

## 38. Objective concurrency

Objective progress and claim paths preserve revision/idempotency rules under retry and concurrent
completion. Duplicate authoritative rewards are rejected or replay the stored result.

## 39. Progression concurrency

Progression, achievement, title, and reward paths use transactional state, deterministic checks, and
private helpers no longer executable by broad roles. Concurrency/replay suites pass.

## 40. Housing concurrency

Layout/version conflicts, placement ownership, capacity, publication/visibility, home admission,
helper activity, and cleanup retain stale-revision and transaction protections.

## 41. Realtime authorization

Admission binds one-time ticket, session, player, world version, and channel. Origins, connection
capacity, private scope, revalidation, revocation, checkpointing, and cleanup fail closed.

## 42. Realtime message validation

The server validates protocol/type, 16 KiB maximum, connection-derived identity, sequence,
coordinates/movement, social/chat/activity scope, revisions, and per-message limits. Malformed or
impersonating messages cannot reach settlement.

## 43. 40-player load result

The single-channel local case admitted 40 clients, observed 1,560 movement broadcasts per phase at
up to 32 ms and 3,283 chat broadcasts at up to 38 ms, and completed 40 cleanup checkpoints. This is
synthetic loopback evidence, not a hosted capacity claim.

## 44. Owner plus ten visitor result

The harness covered owner-plus-ten admission, movement, snapshot/event delivery, emotes, owner and
visitor reconnect, close checkpoints, and cleanup with no missing/duplicate movement
acknowledgement. Seating, guestbook, appreciation, watering, and rendered-home review remain manual.

## 45. Network-interruption results

Five sessions were interrupted and restored in the 40-client/two-channel case; all five recovered
their activity sessions and all 45 connection lifecycles cleaned up with no leaked active or
temporary state. Hosted network and real-browser behavior remain pending.

## 46. Database-concurrency results

The isolated full chain passed final-slot, trade, party, social, stock, balance, inventory, reward,
purchase, correction, review, publication, reconciliation, and replay/conflict races.

## 47. Idempotency registry

Existing subsystem-specific operation/receipt registries remain canonical; Phase 13B did not add a
second incompatible global registry. Same-key/same-payload replay returns stored evidence, while
changed-payload reuse is rejected.

## 48. Worker-concurrency results

Bounded claim, retry, startup reconciliation, idempotent processing, cleanup, and failure behavior
remain tested. A failed startup job prevents readiness; continuous hosted job-age/dependency alerts
are Phase 13C work.

## 49. Moderation operations

Reports and approved warn/mute/suspend/restore paths remain permission-, AAL-, reason-, revision-,
and audit-controlled. Reversible actions and bounded evidence are retained; workflow/appeal owner
review remains pending.

## 50. Support operations

Customer Support keeps bounded inspection/recovery authority and cannot directly edit ledger or
inventory tables. Economy correction remains a reviewed proposal/approval/execution workflow with
audit evidence.

## 51. Observability

API request completion records now include duration and safe error code with request ID. The logging
contract keeps service, environment, operation, status/result, bounded references/counts, and
recursive redaction; hosted dashboards and alerts are Phase 13C.

## 52. Health and readiness

`/health` reports process liveness. API `/ready` loads authoritative token configuration, Realtime
`/ready` exercises a non-mutating database revalidation path, and Worker becomes ready only after
bounded startup jobs succeed; dependency failure returns 503 without sensitive detail.

## 53. Security-header review

API/realtime/worker add no-store, nosniff, no-referrer, deny-framing, restrictive
Permissions-Policy, request ID, API CSP, and production HSTS. Admin adds Permissions-Policy/HSTS.
Landing adds non-breaking baseline headers; exact Reown CSP and Game Client hosting headers are
truthfully deferred to Phase 13C.

## 54. Asset-security review

World Asset intake remains protected by admin permission/origin checks, declared and decoded byte
limits, PNG/WebP allowlists, canonical keys, image processing/dimensions, immutable versions,
private previews, and separate activation/restore authority. No SVG upload or asset activation was
added.

## 55. Secret and environment review

`pnpm env:check` and `pnpm security:scan` passed. The ignored local remote-write Boolean discovered
during preflight was returned to `false`; no credential value was printed or changed, and no secret
was added to browser code or logs.

## 56. Backup and recovery readiness

A starville-dev provider-approved backup/PITR, isolated restore, catalog comparison, ledger/
inventory/reward/world/asset reconciliation, session response, and reopen sequence is documented.
Actual plan retention and restore rehearsal require owner approval; production commissioning is
Phase 13D.

## 57. Failure-drill results

Local automated drills cover API/realtime/database/token failure, dependency-not-ready, socket drop
and reconnect, session expiry/revocation, stale revision, timeout/replay, changed payload, worker
retry/startup failure, capacity denial, and malicious/rate bursts. Hosted outage/recovery drills are
not claimed.

## 58. Admin closed-beta-readiness changes

The existing read-only `/operations/beta-readiness` view was upgraded to Closed-Beta Readiness with
application, database, RLS, role, abuse, realtime, exact-once, worker, asset/world/gameplay,
economy/audio/accessibility/performance, hosted, owner, deployment, and rollback evidence gates. No
duplicate dashboard or write action was added.

## 59. Database migrations

Added
`infrastructure/supabase/migrations/20260722130000_phase13b_closed_beta_security_hardening.sql`. It
is additive and forward-only and passed migration grammar plus the complete local chain.

## 60. Functions created or replaced

None. The migration changes function privileges only.

## 61. Policies created or replaced

None. Existing policies and triggers remain present and are checked by the applied-catalog fixture.

## 62. Grants changed

Direct CRUD was revoked from service_role on 19 Player Experience tables. Exact private-helper
execution was revoked from PUBLIC, anon, authenticated, and service_role for 19 helper signatures;
narrow API/worker RPC grants remain.

## 63. Indexes or constraints changed

None.

## 64. Security impact

The change closes owner-bypass RLS gaps, broad table authority, inherited private-helper execution,
and weak readiness/header evidence without widening browser or service authority.

## 65. Economy impact

No price, reward, currency, ledger rule, token threshold, inventory grant, or production value was
changed. Existing exact-once and reconciliation rules were tested, not redesigned.

## 66. Player-data impact

No hosted or production player data was read or mutated. Local isolated fixtures only were used; the
migration changes authorization posture rather than player records.

## 67. Tests added

Added deterministic applied-catalog SQL assertions and migration scope tests; expanded API,
Realtime, Worker, Admin readiness, response-header, dependency-failure/redaction, and seven-scenario
realtime load coverage.

## 68. Format result

Passed: `pnpm format` and `pnpm format:check`.

## 69. Lint result

Passed: `pnpm lint`, root plus all 39 workspace packages.

## 70. Typecheck result

Passed: `pnpm typecheck`, root plus all 39 workspace packages.

## 71. Test result

Passed: `pnpm test`, 69/69 Turbo tasks plus root 11 files/112 tests. Selected totals: Database 210,
API 389, Admin 453, Game Client 392, Realtime 36, Worker 25, and Player Experience 28.

## 72. Build result

Passed: `pnpm build`, 39/39 workspace tasks including production Admin Portal and Landing builds and
all required asset validations.

## 73. Security-scan result

Passed: `pnpm security:scan`, checking 1,595 source files, 689 browser files, and 6 local secret
values without exposing them.

## 74. Local database result

Passed: `pnpm db:test:local:world` on isolated PostgreSQL 18.1, including all migrations, seed
fixtures, pgTAP/security/concurrency suites, and deterministic Phase 13B catalog assertions.
`plpgsql_check` was unavailable and is not claimed.

## 75. Realtime-load result

Passed: `pnpm realtime:load:test` across seven 1/5/10/20/40-client single/two-channel, mixed-UA,
dormant-tab, burst, activity, owner-plus-ten, reconnect, and cleanup scenarios.

## 76. Migration-chain result

Passed from an empty isolated database through the complete ordered migration chain and the Phase
13B migration. No historical migration was edited and no hosted migration was pushed.

## 77. git diff --check result

Passed on the finished local tree.

## 78. Files changed

Phase 13B changed narrow hunks in API health/app/tests, Realtime app/load/tests, Worker
runtime/tests, Admin and Landing header configuration, the existing Admin Beta Readiness
page/model/tests, database migration tests and local runner, and the ignored local write-gate
Boolean. It added one migration, one applied-catalog fixture, and Phase 13B
architecture/security/deployment/roadmap documents. The full pre-existing dirty tree remains
separately inventoried and is not claimed as Phase 13B work.

## 79. Remaining security blockers

No confirmed local automated security blocker. Reopen this classification if hosted catalog,
service, abuse, or owner evidence differs.

## 80. Remaining RLS blockers

No confirmed local blocker: all 318 applied public tables enable and force RLS. Hosted starville-dev
parity and RLS tests remain pending.

## 81. Remaining concurrency blockers

No confirmed local blocker in the exercised matrix. Hosted lock/contention behavior and longer
distributed soak remain unproven.

## 82. Remaining multiplayer blockers

No confirmed blocker at the bounded local protocol target. Real browsers/devices, visual frame
behavior, global latency, hosted channel capacity, and the manual home visit remain pending.

## 83. Remaining abuse blockers

No confirmed local bypass. Hosted cross-instance tuning, false-positive review, operator workflow,
appeal handling, and owner abuse drills remain pending.

## 84. Remaining hosted gates

Owner must review/push the starville-dev migration, then run hosted migration list/dry-run, database
lint, pgTAP, RLS, catalog, service readiness, Solana RPC, interruption, and bounded load checks. No
hosted gate was advanced locally.

## 85. Remaining owner gates

All boxes in `docs/deployment/phase-13b-owner-acceptance.md` remain unchecked, including gameplay,
device/accessibility, security/abuse, moderation/support, backup/rollback, 40-player,
owner-plus-ten, and final accept/reject/revise review.

## 86. Phase 13C handoff

Phase 13C owns hosting headers/Game Client boundary, exact Landing/Reown CSP, monitoring/alerting,
maintenance/announcement/support/moderation/economy/incident runbooks, deployment/environment
manifests, governance, reference-data policy, production-admin bootstrap plan, and production
preparation without commissioning. Details are in `docs/deployment/phase-13b-phase-13c-handoff.md`.

## 87. Exact owner hosted-validation commands

Keep every gate false during ordinary work. Verify starville-dev, never starville-prod:

```bash
cd "/Users/marklesteracak/Documents/Marky Files/Programming/starville"

pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Only after target/migration review and explicit owner approval:

```bash
SUPABASE_REMOTE_WRITES_APPROVED=true pnpm db:migrations:push
```

Immediately return `SUPABASE_REMOTE_WRITES_APPROVED=false`, then run:

```bash
pnpm db:migrations:list
pnpm db:migrations:dry-run

RUN_HOSTED_SUPABASE_TESTS=true pnpm db:lint:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted
```

With reviewed API and Realtime services running against starville-dev:

```bash
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
```

Do not run these against starville-prod and do not leave either gate true.

## 88. Exact owner acceptance checklist

- [ ] Record reviewer, date/time, exact commit, environment, and migration head.
- [ ] Confirm starville-dev identity and that every safety gate returned to false.
- [ ] Review hosted migration list/dry run, lint, pgTAP, RLS, and post-migration catalog inventory.
- [ ] Verify API, Realtime, and Worker health/readiness plus dependency-failure behavior.
- [ ] Review wallet challenge replay/expiry/wrong-wallet/origin/network and token-loss flows.
- [ ] Review admin role matrix, direct-call denials, current AAL2, disabled-admin, and
      revoked-session behavior.
- [ ] Exercise normal/abusive chat, friend, party, gift, trade, home-visit/helper, upload, and
      admin-action limits.
- [ ] Complete new/returning-player, farming, cooking, crafting, shop, DUST, progression, housing,
      home-visit, social, reconnect, and recovery journeys.
- [ ] Run one approximately 40-player hosted closed-beta drill and owner-plus-ten home visit;
      capture service/browser measurements without extrapolating to production.
- [ ] Review moderation/support evidence, privacy, reversible actions, correction separation, and
      correlation IDs.
- [ ] Review desktop/mobile, hidden-tab, reconnect, accessibility, and browser security behavior.
- [ ] Confirm V1 remains active, V2 remains inactive, no world was published, and no asset
      activated.
- [ ] Review backup/PITR availability, isolated restore verification, rollback owners, alerts, and
      escalation.
- [ ] Record accept, reject, or revise. Automated evidence must not check these boxes.

## 89. Confirmation that no animals or livestock were added

Confirmed. Phase 13B added no animals or livestock.

## 90. Confirmation that Animal Care remains disabled

Confirmed. Animal Care remains disabled and unreleased.

## 91. Confirmation that no Fablesol mechanic was added

Confirmed. No Fablesol mechanic or project content was added.

## 92. Confirmation that no Pokentara mechanic was added

Confirmed. No Pokentara mechanic or project content was added.

## 93. Confirmation that no Sailana mechanic was added

Confirmed. No Sailana mechanic or project content was added.

## 94. Confirmation that no AIvanza mechanic was added

Confirmed. No AIvanza mechanic or project content was added.

## 95. Confirmation that no hosted player changed

Confirmed. No hosted player record was created, edited, or deleted.

## 96. Confirmation that no hosted inventory changed

Confirmed. No hosted inventory record or quantity changed.

## 97. Confirmation that no hosted DUST changed

Confirmed. No hosted DUST balance, ledger entry, policy, or correction changed.

## 98. Confirmation that no hosted world was published

Confirmed. No hosted world draft or publication pointer changed.

## 99. Confirmation that no hosted asset was activated

Confirmed. No hosted asset version was uploaded, activated, restored, or deleted. V1 remains the
published default and V2 remains inactive according to the carried-forward repository state.

## 100. Confirmation that no hosted write occurred

Confirmed. No hosted mutation or write test was executed.

## 101. Confirmation that no production Supabase connection occurred

Confirmed. No production Supabase connection occurred.

## 102. Confirmation that no migration was pushed

Confirmed. The forward-only migration exists only in the local working tree.

## 103. Confirmation that no deployment occurred

Confirmed. No application, worker, realtime service, world, asset, or database deployment occurred.

## 104. Confirmation that no commit or Git push occurred

Confirmed. Nothing was staged or committed, and no Git push occurred.
