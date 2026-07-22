# Phase 12F-A local validation record

Validation date: 2026-07-19 (Asia/Manila). All commands ran from the Starville repository root. No
command in this record performed a hosted write, migration push, activation, publication,
deployment, commit, or Git push.

## Repository checks

| Command              | Result                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| `pnpm env:check`     | PASS — environment schema returned `status: ok` for all three applications and services |
| `pnpm format`        | PASS — Prettier completed the required repository write pass                            |
| `pnpm format:check`  | PASS — all matched files use Prettier style                                             |
| `pnpm lint`          | PASS — 39/39 Turbo tasks plus root scripts lint                                         |
| `pnpm typecheck`     | PASS — 39/39 Turbo tasks plus root scripts TypeScript check                             |
| `pnpm test`          | PASS on final rerun — 69/69 Turbo tasks; root scripts 11/11 files and 112/112 tests     |
| `pnpm build`         | PASS — asset validation plus 39/39 production build tasks                               |
| `pnpm security:scan` | PASS — 1,539 source files, 637 browser files, and 6 local secret values checked         |
| `git diff --check`   | PASS                                                                                    |

The first complete `pnpm test` pass exposed one stale admin-route assertion that still treated the
new `3.0.0` enum value as malformed. The test was corrected to exercise `3.0.0` as an allowlisted
version and `4.0.0` as malformed. The affected admin suite then passed 70/70 files and 449/449
tests, and the complete command passed on rerun.

## Focused tests

| Command                                      | Result                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm --filter @starville/avatar test`       | PASS — 3/3 files, 15/15 tests                                                                       |
| `pnpm --filter @starville/game-content test` | PASS — 6/6 files, 22/22 tests                                                                       |
| `pnpm --filter @starville/game-client test`  | PASS — 77/77 files, 352/352 tests                                                                   |
| `pnpm avatar:renderer:load:test`             | PASS — 40 players × 240 simulated frames for both published procedural and V3 raster renderer paths |

The raster load fixture used 40 sprites, 40 contact-shadow graphics layers, and one shared texture.
Measured local simulated update cost was 0.041 ms median, 0.080 ms p95, and 0.295 ms maximum;
construction was 0.384 ms. This is a deterministic CPU-side renderer fixture, not a claim about
production device GPU frame rate.

## Asset pipeline

| Command                  | Result                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm assets:generate`   | PASS — V1 338/338 unchanged; V2 338/338 unchanged; V3 43/43 unchanged                                |
| `pnpm assets:validate`   | PASS — V1 106 assets / 335 files / 1,159,625 bytes; V2 106 / 335 / 1,864,389; V3 20 / 60 / 4,568,160 |
| `pnpm assets:manifest`   | PASS — all three manifests unchanged; V3 manifest 39,908 bytes                                       |
| `pnpm assets:thumbnails` | PASS — V1 99, V2 99, and V3 20 thumbnails unchanged; V3 total 614,178 bytes                          |
| `pnpm assets:coverage`   | PASS — both reports for each version unchanged; V3 outputs total 83,022 bytes                        |
| `pnpm assets:check`      | PASS — deterministic drift and validation checks passed for V1, V2, and V3                           |

The V3 60-file validation total consists of 20 source PNGs, 20 runtime WebPs, and 20 thumbnails.
Four reference sheets, four cleaned working sheets, the avatar source/atlas, metadata manifests, and
browser evidence are separate from that world-asset count.

## Media and memory measurements

- V3 world runtime WebPs: 1,716,912 bytes.
- V3 world source PNGs: 2,237,070 bytes.
- V3 world thumbnails: 614,178 bytes.
- V3 avatar runtime atlas: 1,519,202 bytes, reduced from the initial lossless 3,488,876-byte export.
- Candidate critical runtime media if all 20 world textures are requested: 3,236,114 bytes including
  the avatar atlas.
- Decoded world texture estimate: 6.57 MiB RGBA.
- Decoded avatar atlas estimate: 18.00 MiB RGBA.
- Combined decoded texture estimate: 24.57 MiB RGBA.
- Local browser observation: the review reported `Connected` before the 1.2-second screenshot
  checkpoint; this is a bounded local-development observation, not a network benchmark.
- Comparison assets are mounted only while the comparison panel is open and use `loading="lazy"`.
  Normal gameplay remains V1 and does not request V3 media.
- V3 dev middleware uses `Cache-Control: no-cache` to prevent stale review output; versioned runtime
  URLs carry `manifest=3.0.0`.

## Browser QA

Actual in-app-browser captures cover 1440 × 900, 1920 × 1080, 820 × 1180, 390 × 844, the 24-state
character matrix, tree depth checkpoints, cottage entrance, notice modal, Reduced Motion, High
Contrast, the 200% layout equivalent, preserved V1, preserved V2, and equal-scale comparison. The
browser console diagnostic log was empty.

The notice modal was inspected as an active semantic dialog. Tab navigation remained inside its
close/continue controls, Escape closed it, and existing focus-restoration tests remained green. The
200% checkpoint uses a 720 × 450 CSS viewport as the layout-equivalent of a 1440 × 900 physical
viewport; the in-app browser does not expose a native zoom capability.
