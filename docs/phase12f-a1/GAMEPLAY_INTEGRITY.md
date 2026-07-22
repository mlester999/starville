# Phase 12F-A.1 gameplay integrity

Status: **PHASE 12F-A.1 BLOCKED**. The repository contains a validated local V3 engineering
candidate, but authenticated gameplay integration, persistence, realtime location presence and
identity, stored current evidence, and owner acceptance are unresolved. V3 remains unpublished,
inactive, and not production-ready.

## Implementation boundary

The candidate is exposed only by the development-and-loopback-gated
`visual-candidate=production-slice-v3` review surface. `App.tsx` selects that surface before
`TokenAccessGate`, so it is deliberately an isolated fixture: Marlowe, level, DUST, objective, and
hotbar values shown there are fixture labels, not an authenticated profile or inventory.

The repository also contains the existing authenticated `GameWorld` and personal-home lifecycle,
including public/private realtime handling. The V3 cottage transition has **not** been connected to
that lifecycle. Statements about the fixture must not be used as proof of account-state
preservation, server-authoritative persistence, location-scoped presence, or reconnect behavior.

## Audited scale and world-size facts

The rejected Phase 12F-A report described a 16×16 Garden Corner. The current repository's canonical
Lantern Square manifest is 24×20. A.1 derives its reusable profiles from the canonical manifests,
then triples both axes:

| Canonical outdoor map | Canonical size | Local V3 size | Logical area |
| --------------------- | -------------: | ------------: | -----------: |
| Lantern Square        |          24×20 |         72×60 |  4,320 tiles |
| Moonpetal Meadow      |          20×18 |         60×54 |  3,240 tiles |
| Brooklight Crossing   |          20×18 |         60×54 |  3,240 tiles |
| Hearthfield Road      |          20×18 |         60×54 |  3,240 tiles |
| Whisperpine Gate      |          20×18 |         60×54 |  3,240 tiles |

Each profile owns its canonical baseline, logical dimensions, one-tile safe margin, playable,
camera, content, navigation, ambience, and remote-relevance bounds, centered-content offset,
remapped spawns, and four disabled boundary exit anchors. The local catalog contains a validated,
unpublished V3 manifest for all five canonical outdoor map IDs, with centered canonical landmarks,
approach paths, and deterministic scenic expansion clusters.

This catalog does **not** contain a personal farm exterior or personal-home exterior, and those
locations must not be counted as completed A.1 expansions. Only the specialized 72×60 Lantern Square
River Quarter is wired into the review UI. The other four catalog manifests are local content
definitions, not authenticated/selectable gameplay locations.

## Specialized Lantern Square candidate

The specialized review manifest centers an authored 48×48 River Quarter at offset `(12, 6)` inside
the 72×60 canonical expansion. Its current static manifest inventory is:

- 4,320 logical terrain cells rendered from 93 ordered terrain regions;
- 47 world objects;
- 70 blocking collision shapes, including the segmented river;
- 3 interactions;
- safe-save bounds `(1, 1)..(71, 59)`;
- projected camera bounds `0..6,912 × 0..3,600` at 96×48 isometric tiles;
- default spawn `(35.5, 30.5)`.

The candidate keeps map exits disabled. It is not published to the world catalog and does not write
player position.

## Camera, player, and environment scale

The V3 renderer follows the local avatar with bounded Phaser camera follow, a deadzone, and `0.13`
horizontal/vertical follow interpolation. Reduced Motion uses immediate follow. The manifest camera
bounds are used explicitly for the V3 renderer, and HUD elements remain outside the scrolling world
container.

The V3 avatar display scale is `0.336`, which is 60% of the Phase 12F-A `0.56` display scale. The
logical player-foot radius remains `0.24`; changing sprite scale does not change collision speed or
footprint. The specialized composition authors mature trees at `1.95..2.25`, the cottage at `1.22`,
and fences at `1.18`; tree collision remains trunk-only. Final visual proportion remains an owner
check.

## Terrain and water

V3 terrain identity is deterministic. Grass material selection uses stable four-tile macro hashes,
sparse clover/flower details, restrained light/dark/worn variants, a translucent seam wash, larger
low-alpha macro patches, 1.1 tile overscan, adjacency-drawn path/bank edges, and a perimeter blend.
The environmental apron adds 48 low-alpha tree/maple/bush images around the map boundary. These are
separate modular nodes, not a flattened world image.

The river shape is authored as deterministic one-column wave profiles rather than one rectangular
strip. All non-bridge water uses one continuous shallow-water asset; bridge-adjacent cells use the
disturbance asset. The specialized Lantern renderer connects projected river-column centers with a
static smooth center-depth band (`0x2f7d83` at `0.10` alpha). Directional edge strokes/notches,
capped ripple groups, and restrained highlight/reflection ellipses provide the shoreline, movement,
and surface-light treatment. Reduced Motion keeps the static depth/highlight graphics and does not
start the ripple-layer alpha tween.

Important limitation: opaque deep-water tiles were rejected during live visual QA because they
produced dark rectangles, and the fixed-orientation dedicated shore tile remains intentionally
unused because it cannot represent all isometric bank directions safely. The procedural depth band
and adjacency-drawn bank geometry are the active treatment. Their visual quality, bank art,
bridge-post disturbance, and Reduced Motion presentation still require current evidence and owner
acceptance. Documentation must not call the water requirement complete yet.

## Collision and movement response

Collision uses ground-space rectangles and circles, never transparent media bounds. The specialized
exterior includes blocking footprints for river/water boundaries, cottage wall/foundation, five core
tree trunks plus outer/scenic trees, notice board, lamp, bench, workbench, planter, rocks, and three
fence segments. Both authored bridge corridors are excluded from the water collision and remain
walkable.

The 18×14 interior contains 16 blocking shapes: five wall strips with a south-door opening and
footprints for bed, bedside table, dining table, two chairs, chest, wardrobe, fireplace, cooking
counter, lamp, and plant. The interior contains 29 modular objects, including 13 wall panels.

Movement uses a spatial collision index, capped deltas, bounded substeps, and edge sliding. Focused
tests exercise the required exterior categories and interior furniture from all eight approach
directions at walk- and jog-sized deltas, including diagonal slide-vs-tunnel assertions. Those tests
are engineering evidence; final manual collision, corner-jitter, joystick, and reconnect checks are
still required.

## Depth sorting and occlusion

World depth remains foot-authoritative. V3 tall objects can render a contact shadow, a lower/base
container, and a cropped foreground section. Tree and building policies use geometry-aware fade
regions rather than full transparent-image rectangles. Furniture and crafting objects have bounded
foreground splits, and interior furniture has per-asset split/depth policies. Enclosing interior
wall and door panels fade when they geometrically cover the local player.

Automated tests cover layer policy, fade activation/restoration, and culling state. They do not
prove that every crop is artistically correct. Broad category crop boundaries, all behind/in-front
combinations, and the absence of full-body disappearance require new browser evidence and owner
review.

The A.1 foreground split and geometry-aware fade behavior is capability-gated to the Phase 12F
visual profile, so V1/V2 keep their prior rendering policy. Wall assets requested at 90° or 270° use
the supported mirrored-wall fallback instead of silently selecting an invalid orientation.

## Direction, animation, and remote rendering

The canonical movement-to-animation flow is:

`keyboard/touch input → screen-to-world movement → collision response → actual world velocity → screen projection → eight-way facing → idle/walk/jog clock`.

The shared resolver supports `N, NE, E, SE, S, SW, W, NW`, preserves the last valid idle facing, and
applies a 7.5° hysteresis band around octant boundaries. Local facing is derived from actual
post-collision velocity, which prevents a collision slide from displaying the stale raw-input
direction. Remote presentation derives facing and gait from interpolated visual velocity and stops
animation updates when the remote is outside the padded world view.

The V3 atlas is 12 columns × 8 rows with 96 frames and 24 state/direction mappings. Each mapping has
four frames. The game-loop-owned clock caps a single delta at 100 ms and uses 360 ms idle, 130 ms
walk, and 85 ms jog frame durations; Reduced Motion holds frame zero without changing facing. The
asset validator decodes all four frames in every mapping, rejects duplicate pixel hashes, and allows
at most one pixel of vertical foot-row drift. Idle validation additionally requires all four frames
to preserve the same lower-body root pixels and horizontal foot anchor, preventing idle root drift.

This proves mapping reachability, clock advancement, decoded-frame uniqueness, and bounded anchor
drift. It does not by itself prove good perceived stride, no skating, or remote parity in a live
multiplayer session. The review fixture has no realtime remote players, so live remote/reconnect
acceptance remains unresolved.

## Cottage transition and interior

The fixture recognizes the cottage and interior door interactions and switches worlds through
`runtime.loadWorld`; it does not refresh or navigate to a standalone page. The transition state
machine blocks input, suppresses duplicate requests, supports cancellation and a 10-second load
timeout, restores game focus, and uses approximately 240 ms fade-out plus 260 ms fade-in (90 ms each
under Reduced Motion), excluding renderer load time.

The source world and transition state remain authoritative until the exact requested destination has
loaded and committed. Cancellation, failure, timeout, or destination mismatch restores the source
world atomically instead of leaving a partially switched location.

The interior is a separate 18×14 modular world with its own terrain, objects, collision,
interaction, camera, and culling state. The wrapper identities distinguish the exterior
shared-outdoor instance from the private-interior instance. A current contract limitation remains:
both underlying manifests use the `lantern-square` `MapId`; the distinct private identity exists
only in the V3 wrapper.

The fixture returns the player to the normalized cottage-door checkpoint. Its React-owned fixture
labels and settings survive the in-memory switch, but this is **not** proof that authenticated
identity, appearance, inventory, DUST, XP, quest state, wallet state, rewards, or realtime session
survive a production transition.

## Culling, assets, and performance boundary

Terrain image nodes are grouped into deterministic 8×8 chunks and culled against the camera view
with 192 px padding. A 72×60 map yields 72 terrain chunks. Environmental-frame images are associated
with those chunks and participate in the auxiliary-node visibility pass; the remaining global
auxiliary nodes are apron, macro-ground, perimeter, and depth groupings. World objects use a
separate padded camera-space visibility pass; remote avatars use their own screen-space culling
check. Culling is refreshed every 100 ms while the scene runs. Collision remains available
independently through the spatial index.

At the 1440×900 water checkpoint, live diagnostics reported 1,664/4,320 terrain cells, 27/72 terrain
chunks, 43/135 auxiliary nodes, and 25/47 objects visible. The final local 8,000-sample performance
script reported collision-query median/p95 of `0.00067/0.002 ms` and indexed movement median/p95 of
`0.00192/0.00429 ms`. The V3 raster fixture reported `0.107/0.873 ms` median/p95, while per-player
update median was `0.00268 ms`; 10/20/40-player fixture medians were `0.014/0.032/0.063 ms`. These
workstation measurements are synthetic and do not measure production network traffic, full GPU frame
time, transition latency, or a physical mobile device.

The current checked-in V3 size report describes 46 assets / 138 source-runtime-thumbnail files:
3,245,366 runtime bytes, 4,399,935 source bytes, 1,436,112 thumbnail bytes, and 9,081,413 total
bytes. It reports no missing or over-budget files. These are encoded artifact sizes, not
texture-memory or production frame-rate claims.

## Unresolved acceptance and safety items

- Authenticated V3 entry is not implemented; the fixture bypasses `TokenAccessGate`.
- Server-authoritative profile, inventory, DUST, progression, wallet, reward, and persistence
  preservation are not tested by the fixture.
- Location-scoped realtime presence, same-interior visibility, reconnect, and duplicate-avatar
  behavior are not integrated or browser-tested for V3.
- The interior wrapper has a distinct instance identity, but the runtime manifest still uses the
  exterior `MapId`.
- Current live browser and animation behavior was observed during final local QA, but the 27
  checked- in JPEGs remain stale; the current observations are transient and still need a stored
  evidence set.
- Water treatment, broad world composition, occlusion, and physical-mobile performance still require
  owner judgment.
- Shared movement, collision, and rendering modules changed. V1/V2 manifests and bundled paths were
  not overwritten; the final regression suite passed, and the A.1 fade/split policy is
  profile-gated.
- No migration is required by the local content/renderer approach, and no migration file was added.
- Owner acceptance remains completely unchecked. Phase 12F-B has not started.

The truthful final status is **PHASE 12F-A.1 BLOCKED**.
