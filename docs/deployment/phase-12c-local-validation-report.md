# Phase 12C local validation report

Run date: 2026-07-18 Asia/Manila. Scope: local repository and local browser fixture only.

Status: **PHASE 12C LOCALLY COMPLETE, HOSTED VALIDATION PENDING**.

This report records repository-local evidence for the Phase 12C visual overhaul. It does not claim
that a hosted Supabase target, a signed-in production-like Game Test, a published world, an active
uploaded asset, or a deployed build was exercised. The owner acceptance checklist remains entirely
unchecked.

## Repository baseline and safety boundary

- Repository: `/Users/marklesteracak/Documents/Marky Files/Programming/starville`
- Branch: `master`
- Starting HEAD: `63a7262` (`feat: complete Phase 12B visual asset system`)
- The worktree already contained substantial uncommitted Phase 12C work and a local
  hosted-validation repair before this completion pass. Those changes were preserved as user-owned
  work.
- The environment check reported `remoteWritesApproved: true` and `hostedTestsApproved: false`;
  Phase 12C still ran no hosted command and performed no hosted write.
- No hosted write, uploaded-asset activation, world publication, migration push, deployment, commit,
  or Git push occurred.

Phase 12C adds the forward-only local migration
`infrastructure/supabase/migrations/20260718122000_phase12c_world_manifest_object_contract.sql` so
the private PostgreSQL validator accepts the shared manifest's canonical `furniture` kind and
optional quarter-turn `rotation`. It preserves prior validation, adds no RLS or direct execution
grant, and passed local PostgreSQL coverage. The untracked additive
`20260718121000_fix_phase12_hosted_validation.sql` remains a separate local repair for the earlier
Phase 12 hosted-validation attempt. Neither migration was applied to a hosted target; both remain
hosted-validation pending.

## Full-repository command results

| Command                    | Local result                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:check`           | Passed; application/service profiles valid; the development environment reported `remoteWritesApproved: true` and `hostedTestsApproved: false`; no hosted command was run |
| `pnpm format`              | Passed                                                                                                                                                                    |
| `pnpm format:check`        | Passed                                                                                                                                                                    |
| `pnpm lint`                | Passed cleanly: 39/39 workspace tasks, 0 cached, 0 errors, 0 warnings in 19.536s; root-script ESLint also passed                                                          |
| `pnpm typecheck`           | Passed cleanly: 39/39 workspace tasks, 0 cached, in 27.348s; root-script TypeScript also passed                                                                           |
| `pnpm test`                | Passed: 69/69 tasks in 1m21.72s plus root 11 files/112 tests in 1.05s                                                                                                     |
| `pnpm build`               | Passed: 39/39 tasks in 1m20.1s                                                                                                                                            |
| `pnpm security:scan`       | Passed: 1,457 source files, 378 browser files, and 6 local secret-value checks                                                                                            |
| `pnpm db:test:local:world` | Passed, including the additive hosted-validation repair and Phase 12C manifest-contract migrations; optional local `plpgsql_check` was unavailable                        |
| `pnpm realtime:load:test`  | Passed all 10-, 20-, and 40-player single-channel cases and both 40-player/two-channel scenarios                                                                          |
| `git diff --check`         | Passed                                                                                                                                                                    |

Notable workspace results from the complete test run were:

- Game Client: 61 files and 288 tests passed;
- Admin Portal: 68 files and 441 tests passed;
- database package: 1 file and 200 tests passed;
- game-core: 6 files and 39 tests passed; and
- game-content: 4 files and 15 tests passed.

The tests exercise shared visual policy and camera bounds, local Lantern Square composition, terrain
presentation, object/player shadows, depth behavior, labels and chat bubbles, settings migration,
compact/expanded HUD state, deterministic one- and eleven-player Game Test fixtures, Draft Preview
pins, Composer parity, revision-backed visual readiness, responsive structure, accessibility state
text, asset policy, and database repair boundaries.

## Asset command results

The existing deterministic Phase 12B asset pack remained byte-stable while Phase 12C changed its
composition and presentation:

| Command                  | Local result                                            |
| ------------------------ | ------------------------------------------------------- |
| `pnpm assets:generate`   | Passed: 338 managed outputs, 0 changed, 1,749,225 bytes |
| `pnpm assets:validate`   | Passed: 106 assets, 335 media files, 1,159,625 bytes    |
| `pnpm assets:manifest`   | Passed: 1 generated manifest unchanged, 212,691 bytes   |
| `pnpm assets:thumbnails` | Passed: 99 thumbnails unchanged, 467,048 bytes          |
| `pnpm assets:coverage`   | Passed: 2 coverage reports unchanged, 376,909 bytes     |

Validation also binds the generated manifest to the shared 96×48 projection, upper-left light,
lower-right shadow, bottom-center base anchor, dimension, animation, and performance limits. No
asset was uploaded or activated by these commands.

## Realtime-load results

The local load suite passed at 10, 20, and 40 players. The 40-player single-channel scenario
recorded a maximum visible-state latency of 35ms and maximum chat latency of 47ms. Two separate
40-player, two-channel scenarios also passed with maximum visible-state latency of 11ms and maximum
chat latency of 12ms. They left no active-instance or temporary-item leak and restored all 5
reconnecting participants.

These figures are local deterministic load evidence. They are not WAN, production-region, browser
GPU, or hosted Supabase measurements.

The shared readiness analyzer's clipped difference grid and frequency map were also measured in a
100-sample post-warmup Node stress run using a synthetic 128×128 manifest with 512 overlapping
terrain areas and 512 objects: 0.487 ms average, 0.572 ms p95, and 0.684 ms maximum. This is a local
policy microbenchmark, not first-render, browser frame-time, GPU, or memory evidence.

## Browser HUD fixture evidence

The local visual-acceptance HUD fixture passed the requested viewport matrix at 360×800, 390×844,
768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080. Each measured fixture filled the
available world width without horizontal overflow. The 360×800 and 390×844 checks reported zero
visible interactive targets smaller than 44 CSS pixels.

Two local captures were retained:

- `.codex/visualizations/2026/07/18/019f7548-4527-7060-8618-9f105b49cdce/phase12c-qa/visual-acceptance-390x844.png`
- `.codex/visualizations/2026/07/18/019f7548-4527-7060-8618-9f105b49cdce/phase12c-qa/visual-acceptance-1280x800.png`

This is **HUD fixture evidence, not actual renderer pixel QA**. It does not prove the Phaser camera,
terrain seams, water edge, object scale, contact shadows, occlusion, exact asset pins, labels, chat
bubbles, or signed-in Admin/Game Test parity at those viewports.

## Pending hosted and owner evidence

The following remain deliberately pending:

- applying and validating the two additive local migrations on an explicitly authorized hosted
  target;
- hosted database lint, pgTAP, RLS, API, storage, and exact asset/world-revision parity;
- actual secure, signed-in Game Test screenshots for both its default exact revision and explicit
  Lantern Square local composition, plus exact-pin Draft Preview screenshots;
- Phaser renderer pixel QA for camera edges, terrain, paths, water, scale, shadows, depth, labels,
  bubbles, missing assets, Reduced Motion, and low-quality behavior;
- browser inspection at 200 percent zoom, screen-reader behavior, keyboard focus restoration, and
  touch/device safe areas in the actual game;
- first meaningful render, frame-time, GPU, desktop/mobile memory, duplicate-download waterfall, and
  WAN asset timing measurements;
- authoritative public title/badge data, which does not yet exist in the current presence
  projection;
- owner visual acceptance of the current technical-baseline art; and
- Phase 12D final artwork and final character animation.

Run the entirely unchecked `docs/deployment/phase-12c-owner-acceptance.md` against the exact local
revision before any owner acceptance claim. Hosted validation must use a separately authorized
owner-controlled sequence; no hosted action is implied by this report.
