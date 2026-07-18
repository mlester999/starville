# Phase 12B local validation report

Run date: 2026-07-18 Asia/Manila. Scope: local repository only.

Status: **PHASE 12B LOCALLY COMPLETE, OWNER ACCEPTANCE PENDING**. Hosted validation and owner
acceptance are not complete.

## Scoped implementation evidence

- The typed Starville manifest parses 106 unique stable entries at bundled version `1.0.0`; all 106
  declare `technical_baseline` quality.
- Coverage records 19 authored variants and 7 compatibility aliases.
- Deterministic generation currently accounts for 118 SVG sources, 118 WebP runtime textures, and 99
  WebP thumbnails.
- The size report records 335 files and 1,159,625 total bytes against a 16,777,216-byte total
  budget, with zero missing and zero over-budget files.
- Runtime material is 556,608 bytes; editable sources are 135,969 bytes; thumbnails are 467,048
  bytes. The largest file is the 20,480-byte `lamp-star` runtime WebP.
- The published Lantern Square base queue resolves 16 stable/terrain keys to 17 unique textures,
  101,718 compressed bytes, and an estimated 3,219,456 decoded RGBA bytes.
- The complete runtime pack's decoded RGBA upper bound is 17,176,576 bytes. This is an asset-only
  estimate, not measured browser or GPU memory.
- Focused asset-management validation passed lint, typecheck, build, and 24 bundled/resolver tests
  across 4 files.
- `pnpm assets:validate` passed with 106 assets, 335 files, and 1,159,625 bytes. The asset-pipeline
  package lint, typecheck, and build passed, and its test suite passed 1 file with 8 tests.
- The additive migration
  `infrastructure/supabase/migrations/20260718120000_phase12b_world_asset_bundled_lifecycle.sql` and
  bounded recommendations-only worker passed the isolated PostgreSQL 18.1 execution, RLS, replay,
  collision-upgrade, pin-preservation, and concurrency suite. Local `plpgsql_check` lint was skipped
  because that optional extension was unavailable; no hosted lint is claimed.

The resolver tests cover unique technical-baseline manifest entries, authored furniture rotations,
farm/crop state mapping, exact uploaded pins, eligible active override, bundled default, uploaded
media failure, stable missing placeholder, and cache identity. The complete Game Client, Composer,
Admin, API, database, worker, pipeline, and root suites passed in the final run.

## Performance interpretation

Phaser queues the current immutable world keys plus implicit terrain and de-duplicates cache
identities. UI, crop/furniture panels, Admin comparison media, and coverage galleries use on-demand
or native lazy loading. The implementation avoids timestamps in URLs and includes immutable upload
version/checksum or bundled manifest/key/variant identity in cache keys.

No first-meaningful-render time, transition duration, network waterfall, duplicate-download count,
or device memory trace has been measured. Structural viewport and reduced-motion coverage passed,
but browser pixel inspection across desktop, tablet, and mobile, 200 percent zoom, and device
behavior remain manual acceptance work. No local figure should be interpreted as production CDN
performance.

## Focused asset command results

These focused command results were rerun after the generated-art and validation-hardening lanes
settled. The completed full-repository gate is recorded separately below.

| Command                                               | Result                                         |
| ----------------------------------------------------- | ---------------------------------------------- |
| `pnpm assets:generate`                                | Passed: 338 unchanged                          |
| `pnpm assets:validate`                                | Passed: 106 assets, 335 files, 1,159,625 bytes |
| `pnpm assets:manifest`                                | Passed: 1 unchanged                            |
| `pnpm assets:thumbnails`                              | Passed: 99 unchanged                           |
| `pnpm assets:coverage`                                | Passed: 2 unchanged                            |
| `pnpm assets:check`                                   | Passed: drift-free, read-only                  |
| `pnpm --filter @starville/asset-management typecheck` | Passed                                         |
| `pnpm --filter @starville/asset-management test`      | Passed: 4 files, 24 tests                      |
| `pnpm --filter @starville/asset-pipeline typecheck`   | Passed                                         |
| `pnpm --filter @starville/asset-pipeline test`        | Passed: 1 file, 8 tests                        |

## Full-repository validation

| Required command           | Result                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm env:check`           | Passed: all application/service profiles valid                                                    |
| `pnpm format`              | Passed                                                                                            |
| `pnpm format:check`        | Passed                                                                                            |
| `pnpm lint`                | Passed: 39/39 workspace tasks plus root scripts                                                   |
| `pnpm typecheck`           | Passed: 39/39 workspace tasks plus root scripts                                                   |
| `pnpm test`                | Passed: 1,741 workspace tests plus 112 root tests, 1,853 total                                    |
| `pnpm build`               | Passed: asset preflight and 39/39 builds; Game Client emitted exactly 217 allowlisted WebPs       |
| `pnpm security:scan`       | Passed: 1,420 source files, 374 browser files, 6 local secret-value checks                        |
| `pnpm db:test:local:world` | Passed on PostgreSQL 18.1, including the Phase 12B legacy-key collision and pin-preservation case |
| `git diff --check`         | Passed                                                                                            |

The first parallel `pnpm test` attempt exposed only a five-second timeout in the image-heavy pixel
distinctness test. Its assertions did not fail; the test was given an explicit 30-second bound,
passed alone, and then passed in the complete suite in 9.9 seconds under parallel load.

Direct inspection of representative transparent Store, station, farming, furniture-rotation,
missing-material, and UI outputs found the technical baseline readable and distinct. Structural
automation covers the required eight viewports, reduced motion, bounded overflow, focus trap,
Escape, and focus restoration. Browser pixel/overflow, network, memory, 200 percent zoom, touch, and
screen-reader evidence remains owner-pending because this desktop session exposed no browser
backend. Signed-in Admin and hosted parity checks are also pending.

## Local-only safety statement

The documented Phase 12B work is repository-local. No hosted asset was activated, no hosted world
was published, no hosted player/economy/gameplay record was changed, no migration was pushed, and no
deployment was performed. No commit or Git push is part of this phase. These statements describe the
local workflow; hosted environment parity remains unknown until separately authorized.

No animal/livestock system or Fablesol, Pokentara, Sailana, or AIvanza mechanic was added. The
bundled art is original deterministic technical material; no external commercial game asset was
downloaded or copied.
