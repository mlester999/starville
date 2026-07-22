# Phase 13C local validation report

Status: local evidence complete; hosted validation, Phase 13D commissioning, and owner acceptance
pending.

Validated on 2026-07-22 against the dirty, fully inventoried `master` working tree whose starting
HEAD was `f9b6a08 chore: checkpoint Phase 12E technical beta candidate`. No hosted or production
service was queried or mutated.

## Required quality gates

| Gate                        | Result                          | Evidence                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm env:check`            | pass                            | All application/service schemas passed; target URL/ref consistency verified; remote writes, hosted tests, and bootstrap false. Output was changed to omit project ref/hostname.                                                                        |
| `pnpm release:validate`     | pass                            | Local target; 85 ordered migration hashes and 5 allowlisted seed/reference sources valid; no production connection/write attempted.                                                                                                                    |
| `pnpm format`               | pass                            | Repository formatter completed.                                                                                                                                                                                                                        |
| `pnpm format:check`         | pass                            | All supported files match Prettier.                                                                                                                                                                                                                    |
| `pnpm lint`                 | pass                            | 39/39 workspace lint tasks plus root scripts.                                                                                                                                                                                                          |
| `pnpm typecheck`            | pass                            | 39/39 workspace typecheck tasks plus root scripts.                                                                                                                                                                                                     |
| `pnpm test`                 | pass                            | 69/69 Turbo tasks plus 127 root tests; 2,138 tests passed in the reported suites.                                                                                                                                                                      |
| `pnpm build`                | pass                            | Asset validation and 39/39 production build tasks; all six deployable applications built.                                                                                                                                                              |
| production source-map check | pass                            | Zero `.map` files in Game Client, API, Realtime, or Worker production outputs.                                                                                                                                                                         |
| `pnpm security:scan`        | pass                            | 1,627 source files and 690 browser files scanned; six local secret values checked without printing them.                                                                                                                                               |
| `pnpm db:test:local:world`  | pass with documented limitation | PostgreSQL 18.1 clean chain, all 85 migrations, execution/invariant/race suites, and Phase 13B applied-catalog security assertions passed. `plpgsql_check` was unavailable locally and therefore skipped.                                              |
| `pnpm realtime:load:test`   | pass                            | Seven scenarios through 40 players/two channels and reconnect stress; no rejected movement, unsafe cosmetic payload, remaining reservation, leaked temporary item/active activity, dropped home-visit update, or duplicate home-visit acknowledgement. |
| `git diff --check`          | pass                            | No whitespace errors.                                                                                                                                                                                                                                  |

## Focused Phase 13C evidence

- 15 release-validator tests cover local and synthetic production configurations,
  project/environment mixing, localhost, wildcard CORS, network, remote gates, source maps, secret
  redaction, environment-profile manifest coverage, migration drift, deterministic seeds, and
  truthful incomplete evidence.
- 11 live-operations package tests cover the closed status vocabulary,
  ownership/permission/audit/rollback/runbook evidence, and production-readiness blocking.
- The full Admin Portal suite (456 tests) includes authorization, read-only behavior,
  manifest/capability content, disabled owner gates, responsive narrow layout, safe area, and
  reduced motion for Release and Live Ops.
- The Landing suite (40 tests) includes exact API/Supabase/Reown CSP origins, no wildcard, no
  production `unsafe-eval`, and development-only evaluation.
- Asset-pipeline generation/validation tests preserve deterministic and idempotent reference output;
  the Phase 13C seed manifest hashes V1/V2/V3 sources and authorizes none of the unaccepted
  candidates.

## Database inventory evidence

The Phase 13B applied-catalog assertion reported 4 schemas, 318 tables, 785 functions (742 security
definer), 255 triggers, 6 policies, 14 sequences, 318 FORCE RLS tables, 6 authenticated table
grants, no service-role table grants, no PUBLIC function-execute findings, no Realtime publication
relations, and 2 storage buckets. Phase 13C adds no migration or database object.

## Unperformed gates

No `starville-prod` connection, production administrator, seed, migration push, deployment, world
publication, asset activation, or hosted player/inventory/DUST/world/asset write occurred. Hosted
`starville-dev` validation and every owner checkbox remain pending. Manual signed-in
responsive/gameplay/wallet/visual/audio review remains an owner gate; automated layout and build
evidence does not replace it.
