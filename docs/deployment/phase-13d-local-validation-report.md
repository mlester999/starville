# Phase 13D local validation report

Status: **local commissioning safeguards and release-candidate automation pass; Stage A remains
blocked and Phase 14 remains NO-GO.**

Validated on 2026-07-22 against the fully inventoried dirty `master` working tree whose starting
HEAD was `f9b6a08 chore: checkpoint Phase 12E technical beta candidate`. No hosted Supabase test,
production connection, production write, deployment, public-access change, or Git mutation was
performed.

## Required local quality gates

| Gate                             | Result                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:check`                 | pass                            | All application/service schemas passed; hosted target consistency passed for the configured development environment; remote writes, hosted tests, and bootstrap were false.                                                                                                                                                                                                                       |
| `pnpm format`                    | pass                            | Repository formatter completed after the Phase 13D implementation.                                                                                                                                                                                                                                                                                                                                |
| `pnpm format:check`              | pass                            | All supported files match Prettier.                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm lint`                      | pass                            | 39/39 workspace lint tasks plus root scripts.                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm typecheck`                 | pass                            | 39/39 workspace typecheck tasks plus root scripts.                                                                                                                                                                                                                                                                                                                                                |
| `pnpm test`                      | pass                            | 69/69 Turbo tasks, then 13/13 root test files with 144/144 root tests. The Admin Portal passed 459 tests, Game Client 392, API 389, Realtime Server 36, and all package suites passed.                                                                                                                                                                                                            |
| `pnpm build`                     | pass                            | Asset validation and 39/39 production build tasks passed; Landing, Game Client, Admin Portal, API, Realtime Server, and Worker built successfully.                                                                                                                                                                                                                                                |
| `pnpm security:scan`             | pass                            | 1,653 source files and 691 browser files scanned; six ignored local secret values were checked without printing them.                                                                                                                                                                                                                                                                             |
| `pnpm db:test:local:world` run 1 | pass with documented limitation | PostgreSQL 18.1 clean database; all 85 ordered migrations and the complete execution/invariant/race/security suite passed.                                                                                                                                                                                                                                                                        |
| `pnpm db:test:local:world` run 2 | pass with documented limitation | A second independent clean database produced the same pass result. Local `plpgsql_check` is unavailable, so the function-lint subcheck was explicitly skipped in both runs.                                                                                                                                                                                                                       |
| `pnpm realtime:load:test`        | pass                            | Seven scenarios through 40 players, two channels, reconnect stress, hidden-tab dwell, activities, and home visits. Maximum visible movement latency was 30 ms and maximum chat broadcast latency 52 ms. No rejected movement, unsafe cosmetic payload, remaining reservation, leaked temporary item/active activity, dropped home-visit update, or duplicate home-visit acknowledgement occurred. |
| `git diff --check`               | pass                            | No whitespace errors after the final local documentation and manifest updates.                                                                                                                                                                                                                                                                                                                    |

## Focused Phase 13D evidence

- `pnpm production:audit` validates the frozen SHA-256 values for the production environment,
  migration, reference seed/catalog, bundled V1 asset, and audio manifests. It exits successfully
  while truthfully returning `STAGE A BLOCKED`, `productionMutationAuthorized=false`, and Phase 14
  `NO-GO`.
- 17 production-readiness tests cover production/development separation, exact approved URL,
  Supabase, Reown, mainnet mint/program/decimals, database name, closed gates, error redaction,
  manifest hashes, six application templates, the 85-migration state parser, all 21 owner command
  blocks, and the contiguous 119-section report.
- The shared configuration suite passes 28/28 tests, including fail-closed production startup when
  any remote-write, hosted-test, or administrator-bootstrap gate is enabled.
- The combined focused Phase 13D suite passes 23/23 tests across readiness, live-operations evidence
  modeling, and the protected Admin Production Release Candidate dashboard.
- `pnpm audio:validate` passes 10 procedural Web Audio cues: 2 music, 2 ambient, and 6 SFX, with
  zero embedded audio bytes and explicit Starville-owned provenance. Listening acceptance remains an
  owner gate.
- The local database inventory still reports 4 schemas, 318 tables, 785 functions (742 security
  definer), 255 triggers, 6 policies, 14 sequences, 318 FORCE RLS tables, 6 authenticated table
  grants, no service-role table grants, no PUBLIC function-execute findings, no Realtime publication
  relations, and 2 storage buckets. Phase 13D creates no migration or database object.

## Deliberately unperformed gates

The following are absent, not passed: an approved source commit; masked `starville-prod` target
evidence; hosted `starville-dev` completion; an empty production migration ledger; production
migration/lint/pgTAP/RLS/catalog evidence; provider Auth/Storage/Realtime configuration; backup,
PITR, isolated restore, and rollback rehearsal; Super Admin bootstrap/AAL2/shutdown; private
deployment; health/readiness; an approved world revision; signed production asset/audio selection;
production journeys; QA cleanup; release freeze; public opening; and every deferred owner checkbox.

The local validation result cannot authorize any production action and cannot substitute for owner,
provider, hosted, browser/device, accessibility, visual, audio, backup, restore, or production
journey evidence.
