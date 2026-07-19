# Phase 12D local validation report

Run date: 2026-07-18 Asia/Manila. Scope: local repository only.

Status: **LOCAL AUTOMATED GATES PASSED; PRODUCTION CANDIDATE, NOT FINAL**.

This is local implementation and validation evidence. It must not be read as final-art approval,
owner acceptance, hosted validation, deployment, publication, or activation.

## Repository baseline

- Repository: `/Users/marklesteracak/Documents/Marky Files/Programming/starville`
- Branch: `master`
- Starting HEAD: `63a7262` (`feat: complete Phase 12B visual asset system`)
- The worktree already contained substantial uncommitted Phase 12C work. It remains preserved and is
  not reclassified as Phase 12D.
- The Phase 12D prompt is truncated mid-sentence at physical line 379. No missing-tail requirements
  are inferred.

Preflight confirmed the repository root, branch, starting HEAD, local migration head, existing dirty
state, and a clean initial `git diff --check`.

## Generated candidate evidence

`pnpm assets:generate:phase12d` completed locally. The V2 reports record:

| Evidence                   |                                Result |
| -------------------------- | ------------------------------------: |
| Manifest version           |                               `2.0.0` |
| Logical assets             |                                   106 |
| Quality classification     | 106 `production_candidate`; 0 `final` |
| Variants                   |                                    19 |
| Compatibility aliases      |                                     7 |
| SVG sources                |                                   118 |
| Runtime WebPs              |                                   118 |
| Thumbnail WebPs            |                                    99 |
| Generated media files      |                                   335 |
| Generated media bytes      |                             1,864,389 |
| Runtime bytes              |                               859,172 |
| Source bytes               |                               236,763 |
| Thumbnail bytes            |                               768,454 |
| Missing files reported     |                                     0 |
| Over-budget files reported |                                     0 |
| Total budget               |                      16,777,216 bytes |

The generator accounts for 338 outputs when the manifest and two reports are included. A second
generation pass reported 338 unchanged and 0 written, confirming local idempotence. These figures
are deterministic file evidence, not browser/GPU performance or complete visual acceptance.

The character concept reference is a 1536×1024 RGBA PNG and 1,205,423 bytes. It is intentionally
outside the runtime pack.

## Focused implementation validation

These focused results were observed during implementation and were followed by the exact
merged-worktree gate below.

| Area                                | Focused result                                                     |
| ----------------------------------- | ------------------------------------------------------------------ |
| Avatar package                      | Passed 13 tests plus typecheck/lint                                |
| Avatar API catalog                  | Passed 7 focused tests, including all 24 mappings                  |
| Character Game Client               | Passed 19 focused renderer/customization tests                     |
| Asset pipeline                      | Passed 1 file/10 tests after V2 generation                         |
| Asset management                    | Passed 4 files/28 tests after the material-class merge             |
| API material projection             | Focused tests, lint, and typecheck passed after the merge          |
| Database material contract          | Migration tests, lint, and typecheck passed                        |
| Local world PostgreSQL              | Migration/concurrency suite passed; `plpgsql_check` unavailable    |
| Terrain dependency core             | Passed 5 focused tests                                             |
| World API parity                    | Passed 26 focused tests                                            |
| Terrain/texture/world-object client | Passed 21 focused tests                                            |
| Character acceptance fixture        | Passed 3 files/9 tests plus focused lint and Game Client typecheck |
| Game Client typecheck               | Passed after V2 runtime generation                                 |

Focused coverage includes eight directional poses, idle/walk/jog frame selection, realtime state
conversion, Reduced Motion, remote/local rendering, API catalog mappings, exact terrain dependency
collection, rejection of arbitrary delivery extras, selected/bundled/missing/procedural terrain
fallback, and current world-object behavior.

## Final merged-worktree validation

| Command or review                              | Final result                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm assets:validate:phase12d`                | Passed: 106 assets, 335 media files, 1,864,389 bytes                    |
| `pnpm assets:check`                            | Passed for V1 and V2; V1 remains 106 assets/335 files/1,159,625 bytes   |
| second Phase 12D generation                    | Passed idempotence: 338 unchanged, 0 written                            |
| `pnpm env:check`                               | Passed                                                                  |
| `pnpm format:check`                            | Passed after formatting 13 touched Phase 12D files                      |
| `pnpm lint`                                    | Passed: 39 workspace tasks plus root                                    |
| `pnpm typecheck`                               | Passed: 39 workspace tasks plus root                                    |
| `pnpm test`                                    | Passed: 69 workspace tasks plus 11 root files/112 root tests            |
| Game Client tests                              | Passed: 62 files/296 tests                                              |
| `pnpm build`                                   | Passed asset validation plus 39 workspace build tasks                   |
| `pnpm security:scan`                           | Passed: 1,475 source files, 378 browser files, 6 local secret values    |
| `pnpm db:test:local:world`                     | Passed; optional `plpgsql_check` was unavailable                        |
| `pnpm avatar:renderer:load:test`               | Passed: 40 players/240 frames, 0 duplicate layers or rendering failures |
| final `git diff --check`                       | Passed                                                                  |
| combined format/assets/typecheck/lint/test run | Passed on the exact merged worktree                                     |

The load test recorded a 0.146 ms median, 1.076 ms p95, and 76.488 ms maximum across 240 frames,
with 280 graphics layers, zero position resets, and zero nonfinite values.

Two implementation failures were corrected before the final green gate: V2 crop-margin validation
initially found 20 issues across 10 stages because a curve endpoint was emitted as a relative
coordinate, and the renderer load harness still used an obsolete five-argument call. The generator
was rerun after the crop fix, and full typecheck was rerun after updating the harness.

## Completed local browser evidence

The development-only character fixture was inspected in the in-app browser:

- the animated matrix rendered 24 previews with 24 unique state/direction mappings;
- all eight directions and all three canonical states (`idle`, `walk`, and `jog`) were present;
- Reduced Motion paused all 24 mappings on their deterministic first frame;
- high contrast plus Reduced Motion preserved all 24 mappings;
- a full-page desktop screenshot showed the complete 3×8 matrix; and
- no console warning or error was observed.

The exact V2 General Store runtime URL
`/assets/starville/bundled/v2/shop/phase7-general-store-marker.webp?manifest=2.0.0` loaded as a
448×416 image and was visually inspected without a console warning or error.

This is development-fixture evidence, not owner acceptance or complete protected-product review.

## Browser and visual evidence still required

The following remain pending:

- local and remote characters in front of and behind trees/buildings;
- V1/V2/uploaded comparison on transparent, light, dark, and isometric backdrops;
- exact authorized revision versus explicit local V2 Game Test source;
- World Composer, Draft Preview, and production renderer parity;
- Store, home entrance, stations, plot/crop states, furniture rotations, icons, landmarks, and
  terrain adjacency;
- 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080;
- Reduced Motion, low quality, high contrast, UI scale, 200 percent zoom, keyboard, touch, and
  screen reader;
- first meaningful render, duplicate downloads, frame time, GPU/browser memory, mobile memory, and
  WAN/CDN timing.

Source assertions and Node tests are not pixel evidence. The concept PNG is not runtime evidence.

## Local-only safety statement

No hosted write, migration push, V2 activation, uploaded-version replacement, world publication,
deployment, hosted player/gameplay/economy/realtime mutation, commit, or Git push is part of this
report. No animal/livestock, NFT, marketplace, crypto reward, or other-project mechanic was added.

Final status remains: **PHASE 12D PRODUCTION CANDIDATE, NOT FINAL; OWNER ACCEPTANCE, PROTECTED
PRODUCT REVIEW, AND HOSTED VALIDATION PENDING**.

## 2026-07-19 runtime integration hotfix supplement

The hotfix’s deterministic actual-browser matrix is complete for 360×800, 390×844, 768×1024,
820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080, with zero measured HUD collisions and zero
out-of-bounds elements. A 720×450 200%-zoom-equivalent CSS viewport also passed. Reduced Motion plus
high contrast, the 24-state character fixture, exact V2 asset paths, and notice-modal
stacking/focus/Escape behavior passed browser inspection.

The exact post-hotfix worktree passed `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm security:scan`, `pnpm env:check`, `pnpm assets:check`, and
`pnpm avatar:renderer:load:test`. The Game Client result is now 67 files/314 tests. The security
scan covered 1,486 source files and 595 browser files. The renderer load test recorded 40
players/240 frames, 0.077 ms median, 0.263 ms p95, 7.888 ms maximum, and no duplicate entity,
fallback, reset, or nonfinite failures.

The normal signed-in local product route remained behind its initial availability check because the
local API/auth stack was unavailable, so protected-product and owner acceptance remain pending.
Exact evidence is in `docs/deployment/phase-12d-runtime-integration-hotfix-report.md`; the owner
matrix remains unchecked in `docs/deployment/phase-12d-runtime-hotfix-owner-review.md`.
