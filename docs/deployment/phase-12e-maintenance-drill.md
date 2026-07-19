# Phase 12E maintenance-mode drill

Run date: 2026-07-19 Asia/Manila. Scope: focused local code-path tests and source review only.

Status: **LOCAL CODE-PATH DRILL PASSED; INTEGRATED STACK, OWNER, AND HOSTED DRILL PENDING**.

This drill did not enable maintenance in a local or hosted database. It injected in-memory service
and component fixtures, opened only loopback test servers, and performed no hosted request, database
write, player mutation, deployment, migration, world publication, or V2 activation.

## Repository policy observed

| Area                      | Current policy and evidence                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Maintenance state         | `private.live_operations_maintenance_state` derives disabled, completed, scheduled, active, or expired from database timestamps. Expired maintenance without auto-disable remains active/fail-closed.                                                                                                                    |
| Public notice             | `GET /api/v1/live-operations` returns a server-authoritative, `no-store` snapshot. `LiveOperationsBoundary` blocks initial gameplay until the first trusted snapshot and replaces gameplay with the configured maintenance title/message while active.                                                                   |
| New playable sessions     | Player profile bootstrap, realtime-ticket creation, and realtime persistence admission reject active maintenance. Realtime maps the trusted `maintenance` denial to `GAME_MAINTENANCE`.                                                                                                                                  |
| Existing browser session  | The Game Client reconciles every 30 seconds and on focus/visibility. On a false-to-true transition it runs `beforeMaintenance` with a three-second bound, then removes gameplay and presents the maintenance screen.                                                                                                     |
| Player gameplay mutations | Cozy gameplay authorization checks trusted maintenance before invoking farm, inventory, DUST, workstation, shop, or housing services. The focused sell test returns 503 and never calls settlement.                                                                                                                      |
| Existing realtime session | The server periodically revalidates world, private-home, and home-visit sessions. A maintenance denial closes affected access; however, this drill found no focused existing-session maintenance test for those three websocket paths.                                                                                   |
| Workers                   | There is no global live-operations-maintenance input in `createWorkerRuntime`. The current implemented policy is therefore to continue registered bounded cleanup/reconciliation jobs. Economy maintenance forbids automatic balance corrections; home-visit maintenance performs bounded expiry/closure reconciliation. |

## Focused commands and exact results

### Maintenance contract and administrator preparation

```sh
pnpm --filter @starville/live-operations exec vitest run test/contracts.test.ts
```

Result: exit 0; 1 test file passed; 7 tests passed. This covers the fixed nonblank fail-closed
message, immediate typed confirmation, schedule validation, safe CTA validation, state schema, and
plain-text safety.

```sh
pnpm --filter @starville/admin-portal exec vitest run src/lib/live-operations/maintenance-form.test.ts -t '(accepts immediate activation|rejects immediate activation|requires future scheduled start|allows disable)'
```

Result: exit 0; 1 test file passed; 4 tests passed and 20 were intentionally filtered/skipped. This
proves the local form model accepts a reviewed immediate configuration, rejects missing typed
confirmation, validates future scheduling, and permits a reasoned disable request. It did not call
the admin API or persist a maintenance change.

An earlier exploratory filter used
`-t '(immediate maintenance|scheduled maintenance|disabling maintenance)'`; it matched no test name,
so Vitest reported 1 skipped file and 24 skipped tests. It is not counted as drill evidence.

### New-session blocking

```sh
pnpm --filter @starville/realtime-server exec vitest run src/app.test.ts -t 'maps maintenance admission denial'
```

Result: exit 0; 1 test file passed; 1 test passed and 27 were intentionally filtered/skipped. The
in-memory realtime admission gateway returned `maintenance`; the server emitted the safe
`GAME_MAINTENANCE` code before presence admission.

This is local protocol evidence. It did not execute the PostgreSQL admission function or open a
hosted websocket.

### Public notice and mutation blocking

```sh
pnpm --filter @starville/api exec vitest run src/app.test.ts src/cozy-gameplay/routes.test.ts -t maintenance
```

Result: exit 0; 2 test files passed; 3 tests passed and 24 were intentionally filtered/skipped. The
tests prove:

- the public maintenance snapshot is server-authoritative and `no-store`;
- active maintenance returns HTTP 503 with `GAME_MAINTENANCE` before a DUST read service call; and
- active maintenance returns HTTP 503 for both a farm read and a General Store sell mutation, with
  neither the farm gateway nor shop settlement service called.

The sell assertion proves no settlement attempt began in this mocked API path. It is not a database
transaction or ledger-integrity test.

### Existing-session notice and bounded recheck

```sh
pnpm --filter @starville/game-client exec vitest run src/components/LiveOperationsBoundary.test.tsx -t '(replaces gameplay with the maintenance screen|prevents duplicate Check Again clicks|flushes the latest player state before removing an active world)'
```

Result: exit 0; 1 test file passed; 3 tests passed and 6 were intentionally filtered/skipped. The
component evidence proves:

- a trusted active snapshot removes the playable world and displays `SERVER PAUSED`, `Check Again`,
  and the safe return-to-Starville action;
- a playable false snapshot followed by an active true snapshot calls `beforeMaintenance` exactly
  once before removing the world; and
- repeated `Check Again` clicks while one request is pending produce one bounded in-flight recheck,
  a disabled busy button, and no duplicate request storm.

No actual player save occurred: the flush hook was an in-memory spy. A true-to-false resume in the
same mounted component is not covered by the current test file.

### Worker behavior

```sh
pnpm --filter @starville/worker exec vitest run src/runtime.test.ts src/jobs/home-visit-maintenance-job.test.ts src/jobs/economy-maintenance-job.test.ts -t '(starts the health server and executes the registered startup job|runs one bounded shared pass|runs bounded reconciliation)'
```

Result: exit 0; 3 test files passed; 3 tests passed and 8 were intentionally filtered/skipped. The
tests prove the current worker runtime continues its registered startup job and reaches ready state,
the home-visit maintenance job invokes one bounded shared pass that can report expired invitations
and closed sessions, and economy maintenance reports zero automatic player actions and zero
automatic balance corrections.

The worker tests use mock gateways. They do not prove a hosted worker observed maintenance, stopped,
resumed, or preserved a real inventory/DUST ledger.

## Requirement assessment

| Drill requirement                            | Local result                          | Truthful interpretation                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New sessions blocked                         | Passed                                | Realtime denial is mapped to `GAME_MAINTENANCE` before admission. PostgreSQL and hosted admission were not exercised.                                                                               |
| Existing sessions receive clear notice       | Passed at component level             | False-to-true reconciliation flushes once, removes gameplay, and displays the maintenance screen. No signed-in browser stack was used.                                                              |
| Mutations safely paused                      | Passed for focused cozy paths         | Farm read and shop sell are rejected before gateway/service invocation. Other mutation families were source-audited, not all dynamically exercised.                                                 |
| Owner visits close safely                    | Partial                               | Periodic home-visit revalidation maps maintenance to a retryable error and close in source; the bounded cleanup job can report closed sessions. No focused websocket maintenance-close test exists. |
| Workers stop or continue according to policy | Passed for current implemented policy | Workers continue bounded registered jobs because no global maintenance dependency exists. This is an observed implementation policy, not an owner-approved per-job policy matrix.                   |
| Game resumes after maintenance               | Partial                               | A reasoned disable payload is accepted by the form model and manual recheck supports an inactive response in source. No true-to-false component or integrated-stack resume test was found/run.      |
| No duplicate settlement                      | Partial                               | The blocked sell never enters the mocked settlement service. No database idempotency/settlement fixture ran.                                                                                        |
| No lost inventory or DUST                    | Not validated by this drill           | In-memory route and worker tests do not inspect real ledger or inventory state.                                                                                                                     |
| No stuck reconnect loop                      | Partial                               | Manual recheck is single-flight. Full realtime disconnect, maintenance close, disable, and reconnect recovery was not exercised end to end.                                                         |

## Remaining owner/integrated drill

Before owner acceptance, run an isolated signed-in local stack drill against an expendable local
database and record exact revision/state checks:

1. Capture player inventory, DUST, progression, housing, visit, and settlement revisions.
2. Enable immediate maintenance through the protected Admin Portal path with the required reason,
   assurance, confirmation, and expected revision.
3. Confirm new world/realtime admissions fail with the maintenance response.
4. Confirm an existing client flushes once, receives the full notice, and stops mutations.
5. Confirm world, private-home, and home-visit sockets close once with the intended safe code.
6. Record which worker jobs continue and which, if any, must be paused by an explicit owner policy.
7. Attempt one idempotent shop/workstation action during maintenance and prove no settlement row,
   inventory delta, or DUST delta is created.
8. Disable maintenance through the protected path, confirm one clean reconnect, and verify the exact
   pre-drill inventory, DUST, progression, housing, and social invariants.

Do not infer hosted safety from that future local drill. Hosted activation, hosted player mutation,
deployment, migration push, V2 activation, and world publication remain separately owner-controlled.

## Safety confirmation

- No hosted maintenance state was enabled or disabled.
- No hosted request or write occurred.
- No local database state was changed.
- No migration was created, edited, applied, or pushed.
- No player, inventory, DUST, progression, housing, or social record was changed.
- No V2 activation or world publication occurred.
- No application, API, realtime service, or worker was deployed.
- No commit or Git push occurred.
