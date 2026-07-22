# Phase 12F-A.1 validation record

Status: **PHASE 12F-A.1 BLOCKED**. The final local engineering gates pass, but authenticated
gameplay integration, server-authoritative persistence, realtime location presence/identity, durable
current evidence, and owner acceptance are unresolved. This is not production readiness.

Recorded 2026-07-20 (Asia/Manila).

## Final repository gates

| Check                | Result                        | Exact qualification                                                                                                                                                                                                                    |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:check`     | PASS                          | Required local environment contract passed.                                                                                                                                                                                            |
| `pnpm format`        | PASS                          | Repository formatting completed.                                                                                                                                                                                                       |
| `pnpm format:check`  | PASS                          | No formatting drift remained.                                                                                                                                                                                                          |
| `pnpm lint`          | PASS                          | 39/39 Turborepo tasks passed.                                                                                                                                                                                                          |
| `pnpm typecheck`     | PASS                          | 39/39 Turborepo tasks plus the root typecheck passed.                                                                                                                                                                                  |
| `pnpm test`          | PASS with bounded concurrency | Two default-concurrency attempts hit an unrelated token-claim suite's 5 s timeout under oversubscription. The isolated token suite passed 52/52, then `TURBO_CONCURRENCY=4 pnpm test` passed 69/69 tasks plus root scripts, 112 tests. |
| `pnpm build`         | PASS                          | 39/39 Turborepo tasks passed.                                                                                                                                                                                                          |
| `pnpm security:scan` | PASS                          | Scanned 1,553 source files, 689 browser files, and 6 local values.                                                                                                                                                                     |
| `git diff --check`   | PASS                          | Final documentation diff contains no whitespace errors.                                                                                                                                                                                |

The bounded test result is the final reproducible gate. The two oversubscribed timeouts are recorded
rather than hidden; the isolated pass and bounded full pass show no product-test failure.

## Asset gates

| Check                    | Result                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm assets:generate`   | PASS, unchanged: V1 338 outputs, V2 338 outputs, Phase 12F 95 outputs.                                |
| `pnpm assets:validate`   | PASS: V1 106 assets / 335 files / 1,159,625 bytes; V2 106 / 335 / 1,864,389; V3 46 / 138 / 9,081,413. |
| `pnpm assets:manifest`   | PASS; manifests unchanged.                                                                            |
| `pnpm assets:thumbnails` | PASS; thumbnails unchanged.                                                                           |
| `pnpm assets:coverage`   | PASS; coverage reports unchanged.                                                                     |
| `pnpm assets:check`      | PASS; integrity, validation, and drift checks passed.                                                 |

The V3 size report contains 46 source PNGs, 46 runtime WebPs, and 46 thumbnails, with 3,245,366
encoded runtime bytes and no missing or over-budget files. These are artifact sizes, not decoded GPU
memory or production frame-rate claims.

## Realtime and database gates

- `pnpm realtime:load:test`: PASS at 10, 20, and 40 players, including two-channel,
  reconnect/activity, and home-visit cases.
- Repository-supported local world database validation: PASS. `plpgsql_check` was unavailable, so no
  claim is made for that optional extension check.

The realtime load harness does not integrate the isolated V3 review route with authenticated
location presence. It therefore cannot close the V3 presence/identity blocker.

## Performance evidence

The final local 72×60 Lantern fixture contained 4,320 terrain cells, 72 terrain chunks, 47 objects,
and 70 collision shapes:

- collision-query median/p95: `0.00067/0.002 ms`;
- indexed-movement median/p95: `0.00192/0.00429 ms`;
- encoded runtime textures: 3,245,366 bytes across 46 files, zero missing;
- V3 raster median/p95: `0.107/0.873 ms`;
- per-player update median: `0.00268 ms`;
- 10/20/40-player fixture medians: `0.014/0.032/0.063 ms`.

These are local synthetic/workstation measurements, not production network, complete GPU-frame,
transition-latency, or physical-mobile results.

## Browser evidence boundary

Final live QA observed CSS-constrained 1440×900 and 1920×1080 views; at the 1440 water checkpoint,
1,664/4,320 terrain cells, 27/72 chunks, 43/135 auxiliary nodes, and 25/47 objects were visible.
Desktop and exact 390×844 mobile Enter/Exit succeeded without refresh, and Reduced Motion and High
Contrast state were verified. Timed animation observations are recorded in `EVIDENCE.md`.

Those captures were transient. The 27 checked-in JPEGs remain stale, physical-device evidence is
absent, and water/world composition still needs owner judgment.

## Safety and completion boundary

Validation remained local. No V3 activation, publication, hosted database/storage write, migration
push, deployment, commit, Git push, or Phase 12F-B work occurred. V1/V2 assets were not overwritten.

Passing local engineering gates does not resolve the product blockers: authenticated entry,
server-authoritative state preservation, realtime location/instance behavior, durable current
evidence, and explicit owner acceptance. The truthful final status remains **PHASE 12F-A.1
BLOCKED**.
