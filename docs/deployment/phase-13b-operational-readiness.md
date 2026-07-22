# PHASE 13B OPERATIONAL READINESS

## Evidence boundary

This is local preparation for a controlled starville-dev closed beta. It is not hosted validation,
owner acceptance, production commissioning, backup execution, deployment approval, or a claim of
production capacity. All manual commands below must target the verified `starville-dev` project.

## Service health and readiness

| Service  | `/health`           | `/ready`                                                                    | Fail-safe behavior                                                        |
| -------- | ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| API      | Process alive       | Loads authoritative token-access catalog through Supabase-backed service    | 503, `not-ready`, closed body on dependency failure                       |
| Realtime | Process alive       | Executes authoritative session-revalidation dependency and reports capacity | 503, `not-ready`; active sockets later fail closed on revalidation errors |
| Worker   | Health server alive | Ready only after bounded startup jobs succeed                               | Startup/job failure closes server and never reports ready                 |

API and realtime dependency probes intentionally perform no player mutation. Realtime probes a
nonexistent all-zero session, which returns `closed` after a successful database/function call; the
returned domain status is not treated as an admitted player.

Worker startup readiness is not continuous database monitoring. Phase 13C must pair it with job-age,
last-success, mismatch, retry, and service-dependency alerts.

## Safe observability contract

Required fields: service, environment, timestamp, event/operation, request or correlation ID, safe
actor/record reference where necessary, result/status, route/message scope, duration, and bounded
counts. Relevant event families include authentication/token failure, authorization denial,
validation/rate rejection, settlement/replay/conflict, realtime admission/disconnect/reconnect/
capacity, worker retry/failure, reconciliation mismatch, moderation, and admin action.

Never log cookies, authorization headers, access/session tokens or hashes, full wallet signatures or
challenge messages/nonces, MFA material, database/RPC URLs, service-role keys, private keys, raw
private messages, or full sensitive payloads. The shared logger recursively redacts these
categories.

## Local bounded load result

The 2026-07-22 local protocol harness passed seven scenarios:

| Scenario                       | Evidence                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 client                       | 5 movement messages; authoritative motion/idle checks; one cleanup checkpoint                                                                                          |
| 5 mixed clients                | 3 mobile-like UAs; 2 dormant-tab clients for 750 ms; all 5 remained admitted; max movement/chat latency 6/7 ms; 5 cleanup checkpoints                                  |
| 10 clients                     | 90 movement broadcasts per motion phase; owner+1 visitor; 10 cleanup checkpoints                                                                                       |
| 20 clients                     | 380 movement broadcasts per phase; owner+5; 20 cleanup checkpoints                                                                                                     |
| 40, one channel                | 1,560 movement broadcasts per phase, max 32 ms; 3,283 chat broadcasts, max 38 ms; owner+10 with no dropped/duplicate movement acknowledgements; 40 cleanup checkpoints |
| 40, two channels               | Channel/activity isolation, 10 completed cooperative instances, 30 reward receipts, no leaked active/temp state                                                        |
| 40, two channels, 5 reconnects | 10 dormant-tab clients; all 40 stayed admitted; all 5 activity sessions restored; 45 cleanup checkpoints; no leaked active/temp state                                  |

These are synthetic in-process persistence and loopback WebSocket measurements. They do not prove
hosted scale, real mobile/Safari/Firefox behavior, browser frame rate, global latency, or production
reliability. Owner-plus-ten coverage includes authenticated admission, movement, snapshot/event
delivery, emote events, owner/visitor reconnect, close checkpoints, and cleanup. Seating, guestbook,
appreciation, helper watering, and physical rendering remain owner walkthrough items backed by their
existing subsystem tests rather than claims from this harness.

## Failure drills

| Drill                                     | Detection / player impact                      | Automatic behavior                                              | Operator evidence / manual recovery                           | Integrity result                                |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| API unavailable/restart                   | Fetch failure/503; action unavailable          | Bounded client recovery and safe error                          | Request ID, service health; restore prior artifact or service | No client-side settlement                       |
| Realtime unavailable/restart/drop         | Socket close/reconnect state                   | Backoff, ticket/session revalidation, snapshot recovery         | Connection/session audit and readiness                        | No duplicate presence/settlement in local tests |
| Worker unavailable/job failure            | Not-ready/startup failure; delayed cleanup     | Bounded retry; startup fails closed                             | Job/attempt logs; repair dependency then restart              | Idempotent reconciliation preserves state       |
| Database unavailable                      | API/realtime 503/not-ready                     | Closed responses; sockets close on auth revalidation failure    | Correlated dependency warning; restore database connectivity  | No fallback writes                              |
| Token RPC timeout                         | Token-access unavailable                       | Bounded timeout/cache; deny/retry safely                        | Token failure code/request ID; restore provider               | Browser balance never trusted                   |
| Stale migration/catalog                   | Catalog fixture/readiness/hosted list mismatch | Deployment gate remains closed                                  | Compare ordered migration and deterministic inventory         | No migration auto-push                          |
| Settlement timeout/duplicate/out-of-order | Conflict/replay/result state                   | Transaction rollback or stored replay; changed payload rejected | Receipt/audit/idempotency key                                 | Exact-once local concurrency tests pass         |
| Reconciliation mismatch                   | Worker result/risk or ledger mismatch          | Bounded batch/retry; no silent correction                       | Reconciliation evidence; approved correction workflow         | Ledger/inventory history retained               |
| Channel/home overload                     | Capacity denial                                | Refuse admission; existing sessions preserved                   | Capacity status and connection logs                           | No over-cap admission in fixtures               |
| Rate/malicious burst                      | 429/realtime rejection                         | Identity/route window and safe backoff                          | Rejection code, scope, correlation ID                         | No authority work after rejection               |

The full local test suite also covers session expiry/revocation, wallet/token change, high latency
contracts, stale revisions, reused idempotency keys with changed payloads, concurrency races, worker
retry, and UI closed error states. Hosted network behavior remains pending.

## Recovery preparation for starville-dev

Do not perform backup or restore work without owner approval.

1. Verify target identity and freeze write approvals.
2. Record the Git revision, ordered migration list, schema inventory, environment manifest, active
   world/asset versions, and incident time.
3. Use the provider-approved starville-dev backup/PITR workflow. Do not invent an unreviewed raw
   restore into the linked project.
4. Export schema/reference metadata through reviewed Supabase CLI/provider procedures; exclude
   service-role and private credentials from artifacts.
5. Restore into an isolated recovery project or provider-approved recovery point first.
6. Run migration compatibility, deterministic catalog inventory, database/pgTAP/RLS, API/realtime/
   worker readiness, and signed-in read-only verification.
7. Reconcile DUST ledger-to-balance, inventory history-to-current stacks, pending receipts,
   progression rewards, world publication pointer, immutable asset versions, admin sessions, and
   audit continuity.
8. Revoke affected player/admin sessions, rotate only credentials proven exposed, and communicate
   impact/status without private-player detail.
9. Reopen traffic only with named owner approval and rollback/monitoring active.

Recovery-point and retention guarantees depend on the actual starville-dev Supabase plan and must be
captured by the owner. Production backup/PITR commissioning is Phase 13D.

## Non-destructive rollback

- Application: redeploy the prior reviewed artifact; do not roll back data destructively.
- Database: use a reviewed forward-fix migration. Never erase migration/audit history.
- World: select the prior immutable published revision through the protected versioned path.
- Assets: restore the prior immutable active version through the protected/AAL path; V1 remains the
  published default and V2 remains inactive.
- Realtime: drain/restart, revalidate sessions, recover from authoritative snapshots, verify
  cleanup.
- Economy/gameplay: pause the narrow operation if needed, reconcile receipts/ledgers/inventory, and
  use the approved correction workflow.

Every rollback must preserve player identity, inventory, DUST, progression, housing/social state,
immutable versions, and audit history.

## Exact owner-controlled starville-dev sequence

Keep gates false during ordinary work. First verify that the local environment points to
starville-dev, never starville-prod.

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

Immediately restore `SUPABASE_REMOTE_WRITES_APPROVED=false`, then:

```bash
pnpm db:migrations:list
pnpm db:migrations:dry-run

RUN_HOSTED_SUPABASE_TESTS=true pnpm db:lint:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted
```

With the reviewed API and realtime services running against starville-dev:

```bash
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
```

Do not run these against starville-prod. Do not leave either gate true.

## Owner acceptance checklist (intentionally unchecked)

- [ ] Record reviewer, date/time, exact commit, environment, and migration head.
- [ ] Confirm starville-dev identity and all safety gates returned false.
- [ ] Review hosted migration list/dry run, lint, pgTAP, RLS, and post-migration catalog inventory.
- [ ] Verify API/realtime/worker health and readiness plus dependency-failure behavior.
- [ ] Review wallet challenge replay/expiry/wrong-wallet/origin/network and token-loss flows.
- [ ] Review admin role matrix, direct-call denials, current AAL2, disabled-admin and
      revoked-session behavior.
- [ ] Exercise normal/abusive chat, friend, party, gift, trade, home-visit/helper, upload, and
      admin-action limits.
- [ ] Complete new/returning player, farming, cooking, crafting, shop, DUST, progression, housing,
      home-visit, social, reconnect, and recovery journeys.
- [ ] Run one approximately 40-player hosted closed-beta drill and owner-plus-ten home visit;
      capture service and browser measurements without extrapolating to production.
- [ ] Review moderation/support evidence, privacy, reversible actions, correction separation, and
      correlation IDs.
- [ ] Review desktop/mobile, hidden-tab, reconnect, accessibility, and browser security behavior.
- [ ] Confirm V1 remains active, V2 remains inactive, no world was published, and no asset
      activated.
- [ ] Review backup/PITR availability, isolated restore verification, rollback owners, alerts, and
      escalation.
- [ ] Record accept, reject, or revise. Automated evidence must not check these boxes.
