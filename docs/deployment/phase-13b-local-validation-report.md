# Phase 13B local validation report

## Result

**PHASE 13B CLOSED-BETA HARDENING CANDIDATE LOCALLY READY, HOSTED VALIDATION AND OWNER ACCEPTANCE
PENDING**

Validation ran locally on 2026-07-22 from branch `master`, starting from HEAD
`f9b6a08 chore: checkpoint Phase 12E technical beta candidate`. The repository was already dirty;
all pre-existing work was preserved. No hosted command, migration push, deployment, production
connection, commit, stage, or Git push was performed.

## Validation matrix

| Check                                    | Result | Evidence                                                                                           |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Preflight and initial diff check         | Pass   | Correct repository/branch/HEAD; initial `git diff --check` clean                                   |
| Environment safety                       | Pass   | `pnpm env:check`; development environment and remote-write, hosted-test, and bootstrap gates false |
| Formatting                               | Pass   | `pnpm format` and `pnpm format:check`                                                              |
| Lint                                     | Pass   | `pnpm lint`; root plus all 39 workspace packages                                                   |
| Type checking                            | Pass   | `pnpm typecheck`; root plus all 39 workspace packages                                              |
| Automated tests                          | Pass   | `pnpm test`; 69/69 Turbo tasks and root 11 files/112 tests                                         |
| Production build                         | Pass   | `pnpm build`; 39/39 workspace build tasks                                                          |
| Security scan                            | Pass   | `pnpm security:scan`; 1,595 source files, 689 browser files, 6 local secret values checked         |
| Focused database tests                   | Pass   | `@starville/database`: 210 Vitest tests                                                            |
| Full migration chain and applied catalog | Pass   | `pnpm db:test:local:world` against isolated PostgreSQL 18.1                                        |
| Realtime load matrix                     | Pass   | `pnpm realtime:load:test`; seven 1/5/10/20/40-client scenarios                                     |
| Final whitespace/error check             | Pass   | `git diff --check`                                                                                 |

Selected suite totals from the full run include API 50 files/389 tests, Admin Portal 71/453, Game
Client 82/392, Realtime Server 2/36, Worker 9/25, Player Experience 2/28, and Database 210 tests.
There were no failed tasks or tests.

## Applied database result

The complete ordered migration chain plus seed fixtures and the Phase 13B applied-catalog fixture
ran successfully on a fresh isolated PostgreSQL 18.1 database. The resulting inventory was 318
tables, 785 functions, 742 SECURITY DEFINER functions, 255 non-internal triggers, 6 explicit public
policies, and 14 sequences. All 318 public tables had RLS enabled and forced. PUBLIC function
execution findings and direct service-role table grants were both zero. Authenticated direct table
access remained exactly six protected admin-catalog SELECT grants.

The full chain exercised RLS and function security together with final-slot, stock, balance,
inventory, reward, purchase, correction, review, publication, reconciliation, gift, trade, party,
home, social, and progression concurrency/replay cases. Local `plpgsql_check` was unavailable; this
is a disclosed limitation rather than a passed lint claim.

## Realtime load result

The bounded local loopback/protocol harness passed:

- 1, 5, 10, 20, and 40 public-client admission, movement, chat, and cleanup cases;
- a mixed mobile-like/desktop cohort and dormant-tab dwell;
- 1,560 movement broadcasts per phase and 3,283 chat broadcasts in the single-channel 40-client
  case, with observed maxima of 32 ms and 38 ms respectively;
- two-channel isolation, ten cooperative completions, and thirty reward receipts;
- five interrupted/reconnected sessions with all five restored; and
- owner-plus-ten admission, movement/event delivery, reconnect, close, and cleanup with no duplicate
  or missing movement acknowledgement.

This is synthetic in-process evidence. It is not hosted capacity, browser rendering,
physical-device, global-latency, or production evidence. Seating, guestbook, appreciation, helper
watering, and the visual owner-plus-ten home walkthrough remain manual owner checks backed by
existing subsystem tests.

## Closed gates and limitations

- Hosted starville-dev migration, catalog, database lint, pgTAP, RLS, service, Solana RPC, and load
  validation were not run.
- Owner gameplay, device, accessibility, moderation, support, recovery, and approximately 40-player
  acceptance remain unchecked.
- Landing's exact Reown CSP and Game Client hosting headers remain Phase 13C deployment-boundary
  work.
- Continuous hosted worker dependency/job-age monitoring and operational dashboards remain Phase
  13C.
- Server source maps are private build artifacts and must not be publicly served by hosting.
- Production commissioning, production backup/PITR configuration, deployment, and release remain
  Phase 13D.

The exact owner-controlled hosted commands and intentionally unchecked acceptance list are recorded
in `docs/deployment/phase-13b-operational-readiness.md` and the Phase 13B final report.
