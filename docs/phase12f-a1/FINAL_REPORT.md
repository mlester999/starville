# Phase 12F-A.1 final report

Status: **PHASE 12F-A.1 BLOCKED**. The local engineering candidate and final repository gates pass,
but authenticated integration, persistence, realtime location identity/presence, durable current
evidence, and owner acceptance are unresolved. This report does not claim production readiness.

1. **Pre-existing repository state.** Work began on `master` at `f9b6a08` in an already dirty
   worktree containing Phase 12F changes. Those changes and unrelated edits were preserved; no
   reset, worktree switch, or destructive cleanup was performed.
2. **Owner-reported failures.** The owner rejected the small floating-diorama world, relative player
   and tree scale, tiled grass, flat rectangular water, missing solid collisions,
   cloaking/occlusion, reversed direction, frozen/sliding animation, and nonplayable house
   interaction.
3. **Root cause of small-world presentation.** The earlier review used a compact 16×16 fixture whose
   complete bounds could fit near one viewport, without canonical per-location expansion profiles;
   sparse edge composition reinforced the floating-diorama appearance.
4. **Previous and new map dimensions.** Canonical Lantern Square is 24×20 and is now 72×60. The
   other four canonical outdoor maps are 20×18 and now have 60×54 local V3 candidates. The
   specialized 48×48 River Quarter is centered at offset `(12, 6)` within Lantern's 72×60 map.
5. **Previous and new playable area.** Lantern expands from 480 to 4,320 logical cells and each
   20×18 map from 360 to 3,240: three times each axis and nine times the canonical area. The
   rejected 16×16 fixture had only 256 cells; the 48×48 authored core occupies 2,304 of the final
   4,320.
6. **Location-size architecture.** Reusable profiles derive from canonical manifests and own
   logical, safe, playable, camera, content, navigation, ambience, remote-relevance, offset, spawn,
   and disabled boundary-exit data. All five canonical outdoor IDs have validated unpublished
   profiles.
7. **Camera changes.** Phaser now follows the player within explicit projected bounds, using a
   deadzone and `0.13` interpolation on both axes; Reduced Motion follows immediately. HUD stays
   outside the scrolling world.
8. **Player-scale changes.** V3 display scale changed from `0.56` to `0.336` (60% of the prior
   value) while the logical foot radius remains `0.24`.
9. **Tree-scale changes.** Specialized mature trees moved from the prior approximately `0.9..1.08`
   presentation to authored `1.95..2.25` scales, while collision remains trunk-only.
10. **Other environment-scale changes.** The cottage uses `1.22`, fences `1.18`, wider approaches
    and paths, and smaller supporting vegetation so the scale hierarchy reads clearly; final
    proportion is still an owner decision.
11. **Grass repetition root cause.** Regular per-cell placement exposed square source boundaries and
    repeated material selection at tile frequency, without enough macro variation or edge blending.
12. **Grass improvements.** Stable four-cell macro hashes, sparse clover/flower detail, restrained
    light/dark/worn variants, seam wash, low-alpha macro patches, 1.1-tile overscan, and perimeter
    blending break the grid while retaining deterministic modular tiles.
13. **Terrain-transition improvements.** Path and bank transitions are adjacency-drawn, building and
    perimeter areas receive blends, and environmental framing remains separate modular nodes rather
    than a flattened background.
14. **Water weaknesses.** The earlier repeated rectangular treatment read as a flat strip. Opaque
    deep tiles later produced dark rectangles, and one fixed-orientation shore tile could not safely
    cover all isometric bank directions.
15. **Water improvements.** The river now follows deterministic column wave profiles. Continuous
    shallow water, bridge disturbances, a static center-depth band, capped ripples, and restrained
    highlights/reflections replace the rectangular strip; owner visual acceptance remains pending.
16. **Shoreline implementation.** Directional adjacency strokes and notches form the banks. The
    rejected opaque deep and fixed-orientation shore assets remain intentionally unused.
17. **Collision audit.** Collision is ground-space geometry, independent of transparent media
    bounds. The specialized exterior has 70 indexed blocking shapes; the 18×14 interior has 16.
18. **Collision categories.** Coverage includes water/river bounds, cottage foundation/walls, tree
    trunks, bench, workbench, fences, notice board, lamp, planter, rocks, and required interior
    furniture. Tests use eight approach directions at walk and jog deltas.
19. **Cottage collision.** Explicit wall/foundation footprints block the cottage while preserving
    the door interaction approach.
20. **Tree collision.** Small trunk circles/rectangles block the base rather than the transparent
    canopy, avoiding oversized invisible walls.
21. **Sofa or bench collision.** The exterior bench has a bounded ground footprint and split depth
    policy; there is no sofa in the current candidate.
22. **Workbench collision.** The workbench has an explicit bounded solid footprint exercised by
    eight-direction and anti-tunneling tests.
23. **Fence collision.** Three authored fence segments use ground footprints, including diagonal
    slide-versus-tunnel coverage.
24. **Notice-board collision.** The notice board has a dedicated base footprint rather than a
    full-image rectangle.
25. **Bridge and water collision.** Segmented river collision blocks water while excluding both
    authored bridge corridors, which remain traversable.
26. **Root cause of character cloaking.** Monolithic images and broad transparent bounds previously
    controlled depth/fade together, so a character could be covered or faded against nonphysical
    pixels instead of object geometry.
27. **Depth-sort changes.** Foot position is authoritative. Objects use geometry-aware base depth,
    bounded fade regions, and deterministic restoration; tests cover the policy and culling state.
28. **Foreground-layer changes.** Tall objects can split into shadow, lower/base, and cropped
    foreground nodes. Furniture/crafting assets use bounded splits, and interior walls/doors fade
    only when their geometry covers the local player.
29. **Root cause of east/west reversal.** Competing screen/world direction semantics and sprite
    mirroring allowed visual facing to disagree with actual post-collision travel.
30. **Direction-resolver changes.** One angle-based resolver selects eight octants with a 7.5°
    hysteresis band and preserves last idle facing. Local facing uses actual post-collision
    velocity; remote gait/facing uses interpolated visual velocity.
31. **Eight-direction results.** Deterministic tests pass for N, NE, E, SE, S, SW, W, and NW. Live
    west walk and east jog held their correct facing; diagonal live owner review remains required.
32. **Root cause of frozen animations.** Frame selection was not reliably owned by a persistent
    game-loop clock and could reset with state/profile recreation, leaving movement on one pose.
33. **Animation-loop changes.** A game-loop-owned elapsed-time clock caps delta at 100 ms,
    transitions state cleanly, advances independently of React/key repeat, and freezes at frame zero
    only under Reduced Motion.
34. **Walk-cycle changes.** Walk uses four unique frames per direction at 130 ms per frame. Timed
    live north and west samples advanced across multiple indices.
35. **Jog-cycle changes.** Jog uses four unique frames per direction at 85 ms per frame. Timed live
    north and east samples advanced across multiple indices.
36. **Idle changes.** Idle uses four decoded-unique frames at 360 ms while preserving facing; all
    frames retain one lower-body root and horizontal foot anchor.
37. **Frame-range validation.** The 12×8 atlas contains 96 frames and 24 state/direction mappings,
    each with four decoded-pixel-unique frames.
38. **Foot-anchor validation.** Every mapping permits at most one pixel of vertical foot-row drift;
    idle requires an identical horizontal foot anchor and lower-body root.
39. **Remote-player parity.** Shared resolver, gait derivation, animation, and offscreen culling
    have code/test coverage, but the V3 fixture has no realtime peers. Live parity is **BLOCKED**.
40. **House-entry implementation.** Cottage proximity exposes Enter Home; keyboard and mobile
    actions switch through `runtime.loadWorld` without page navigation. Desktop and exact 390×844
    entry passed live in the isolated fixture.
41. **Transition implementation.** Input lock, duplicate suppression, cancellation, 10 s timeout,
    focus restoration, reduced-motion timing, exact-destination commit, and atomic rollback protect
    the transition.
42. **Interior-map implementation.** A separate modular 18×14 world owns terrain, objects,
    collision, interaction, camera, and culling. Its wrapper identity is private, but its raw
    manifest still uses the exterior `lantern-square` `MapId`.
43. **Interior asset inventory.** Generated modular types are floor, wall, door, bed, bedside table,
    dining table, chair, chest, wardrobe, rug, window, fireplace, cooking counter, wall art, lamp,
    and plant. The assembled room has 29 objects, including 13 wall panels.
44. **Interior collision.** Sixteen shapes cover five wall strips with a door opening plus bed,
    bedside table, dining table, two chairs, chest, wardrobe, fireplace, counter, lamp, and plant.
45. **Interior depth sorting.** Furniture has per-asset split/depth policies and enclosing wall/door
    panels fade geometrically. Automated policy tests pass; broad owner visual review remains.
46. **House-exit implementation.** The interior door returns through the same transition system to a
    normalized exterior cottage-door checkpoint. Desktop and mobile exit passed without refresh.
47. **State preservation.** React-owned fixture labels/settings survive the in-memory switch, but
    authenticated identity, appearance, inventory, DUST, XP, quests, wallet, rewards, and persisted
    position were not integrated or proven. This requirement is **BLOCKED**.
48. **Realtime location behavior.** The general 10/20/40-player load harness passes, but V3 is not
    wired to public/private location presence, same-instance identity, reconnect, or
    duplicate-avatar handling. This requirement is **BLOCKED**.
49. **World culling.** Terrain uses 8×8 chunks (72 total) with 192 px padding; environmental-frame
    images are chunk-associated auxiliary nodes, while apron/macro/perimeter/depth groups are
    global. Objects and remotes have separate visibility checks.
50. **Performance results.** Collision median/p95 was `0.00067/0.002 ms`, movement
    `0.00192/0.00429 ms`, V3 raster `0.107/0.873 ms`, per-player update `0.00268 ms`, and 10/20/40
    medians `0.014/0.032/0.063 ms`. These are local synthetic results.
51. **Mobile results.** Exact 390×844 fixture entry, interior, exit, and return succeeded with touch
    actions and no refresh; physical-device performance and owner acceptance remain pending.
52. **Accessibility results.** Reduced Motion and High Contrast controls, checkboxes, and resulting
    document classes were verified live; keyboard focus restoration and reduced transition timing
    have tests. Owner review at 200% zoom remains.
53. **Game Test scenarios.** Thirty deterministic fixture scenarios are documented. Current live
    coverage includes desktop/mobile transitions, accessibility toggles, and timed animation, but
    reload scenarios are fixture resets—not realtime reconnect tests.
54. **Browser evidence.** CSS-constrained 1440×900 and 1920×1080 views passed live. The 1440 water
    checkpoint showed 1,664/4,320 terrain cells, 27/72 chunks, 43/135 auxiliary nodes, and 25/47
    objects. The 27 repository JPEGs remain stale; final captures were transient.
55. **Animation evidence.** Over 633 ms, 16/24 matrix cells changed. North samples were idle
    `3,3,0,0,1`, walk `5,7,4,6,7`, jog `9,11,9,11,9`; west walk was `1,3,1,3,4,2,1` and east jog
    `1,3,1,3,2,4,1`. This is transient local evidence, not stored owner proof.
56. **Tests added or updated.** Coverage spans location profiles/manifests,
    movement/collision/visual policy, avatar rig/clock, terrain/water, world objects, remote
    rendering, review gating, transitions, asset generation/validation, and performance/load
    scripts. The final full suite passed with bounded concurrency.
57. **Exact validation results.** Environment, format/check, build 39/39, lint 39/39, typecheck
    39/39 plus root, security 1,553 source/689 browser/6 local values, realtime 10/20/40, local DB,
    and all asset gates passed. After two unrelated oversubscribed 5 s token-suite timeouts, its
    isolated 52/52 passed and `TURBO_CONCURRENCY=4 pnpm test` passed 69/69 tasks plus root scripts
    (112 tests).
58. **Files changed.** Phase-owned source work spans `apps/game-client/src/{app,components,game}`,
    `packages/{asset-management,asset-pipeline,avatar,game-content,game-core}`, the Phase 12F
    generation/performance scripts, additive V3 manifests/reports/source/runtime/reference assets,
    and `docs/phase12f-a1`. Pre-existing unrelated dirty files were not attributed to or altered for
    this closeout.
59. **Documentation added.** `ASSET_PROVENANCE.md`, `EVIDENCE.md`, `GAMEPLAY_INTEGRITY.md`,
    `GAME_TEST_SCENARIOS.md`, `OWNER_ACCEPTANCE_CHECKLIST.md`, `VALIDATION.md`, and this
    `FINAL_REPORT.md` document the candidate and its limits.
60. **Remaining limitations.** No authenticated V3 route, authoritative transition persistence, V3
    realtime instance/presence, durable final evidence, physical-device benchmark, or owner sign-
    off exists. Water, broad composition, and complete occlusion still need owner judgment.
61. **Exact owner acceptance steps.** Use `OWNER_ACCEPTANCE_CHECKLIST.md` on the authenticated
    integration path and personally confirm: larger world; correct player/tree scale; improved grass
    and water; solid collision; correct occlusion and eight-way direction; genuinely animated walk/
    jog; working interior/exit with preserved state; mobile/accessibility; and correct realtime
    presence/reconnect. Then approve each still-unchecked item explicitly.
62. **Confirmation that V1 was not overwritten.** Confirmed: V1 paths/manifests remain distinct and
    asset regeneration was unchanged at 338 outputs; regression gates passed.
63. **Confirmation that V2 was not overwritten.** Confirmed: V2 paths/manifests remain distinct and
    asset regeneration was unchanged at 338 outputs; A.1 fade/split behavior is profile-gated.
64. **Confirmation that V3 was not activated.** Confirmed: V3 remains behind a loopback development
    query gate and inactive in hosted gameplay.
65. **Confirmation that no world was published.** Confirmed: all V3 manifests remain unpublished
    local candidates.
66. **Confirmation that no hosted write occurred.** Confirmed: no hosted database, storage, auth,
    activation, or publication write was performed.
67. **Confirmation that no migration was pushed.** Confirmed: no migration was added or pushed; only
    repository-supported local ephemeral database validation ran.
68. **Confirmation that no deployment occurred.** Confirmed: no deployment or hosted activation was
    performed.
69. **Confirmation that no commit or Git push occurred.** Confirmed: this work created neither a Git
    commit nor a push.
70. **Confirmation that Phase 12F-B was not started.** Confirmed: character customization Phase
    12F-B was not started.

Final status: **PHASE 12F-A.1 BLOCKED**.
