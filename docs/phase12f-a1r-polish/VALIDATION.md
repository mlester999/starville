# STARVILLE Phase 12F-A.1R correction — validation

Status: **PASS — local unpublished correction; owner review pending**

## Automated gates

| Gate                      | Result | Evidence                                                                                |
| ------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Correction-focused tests  | PASS   | 2 files, 19 tests                                                                       |
| Format check              | PASS   | All matched files use Prettier style                                                    |
| Lint                      | PASS   | 39/39 Turbo tasks plus root ESLint                                                      |
| Typecheck                 | PASS   | 39/39 Turbo tasks plus root TypeScript config                                           |
| Full tests                | PASS   | 69/69 Turbo tasks; game-content 7 files / 35 tests; game-client 79 / 379; root 11 / 112 |
| Production build          | PASS   | 39/39 Turbo build tasks                                                                 |
| Security scan             | PASS   | 1,561 source files, 689 browser files, 6 local secret values checked                    |
| Asset validation          | PASS   | V1 106 / 335 / 1,159,625 bytes; V2 106 / 335 / 1,864,389; V3 46 / 138 / 9,081,413       |
| Phase 12F-A.1 performance | PASS   | 1,920 tiles, 53 objects, 43 collisions; query p95 0.00221 ms; movement p95 0.00512 ms   |
| Diff whitespace           | PASS   | `git diff --check`                                                                      |
| Database validation       | N/A    | No database, migration, RLS, storage, or hosted-data change                             |

## New regression coverage

- Every exterior object foot anchor must resolve to non-water terrain.
- Every tree must retain a non-water clearance sample on all four sides of its foot anchor.
- The interior is limited to the five-panel cutaway composition.
- The reading zone and entrance rug must remain authored.
- The entrance corridor remains walkable from the exit interaction into the room.
- All required interior furniture footprints remain blocking from eight approach directions.

## Manual local browser review

| Review state           | Result                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Normal exterior camera | PASS — frontage, square hierarchy, props, and water remain readable                                     |
| Whole-town overview    | PASS — corrected southwest tree is on the south grass bank; no exterior object anchor resolves to water |
| Corrected interior     | PASS — open five-panel cutaway exposes all living zones in one frame without the prior wall maze        |
| Entry route            | PASS — doorway, entry rug, and central corridor remain clear                                            |
| Cottage transition     | PASS — `Enter home` loads the corrected room; `Exit home` returns to the exterior threshold             |

## Isolation verification

- The changes are limited to the loopback-only V3 fixture and its tests/review notes.
- V1/V2 version configurations and the published/default route selection remain unchanged.
- The UI still identifies the candidate as `LOCAL · UNPUBLISHED`.
