# Phase 12C world visual-overhaul architecture

Status: repository-local implementation complete; hosted validation, signed-in owner acceptance, and
actual-browser pixel review are pending.

Phase 12C improves composition and presentation using the current bundled asset system. Phase 12D
remains responsible for final production artwork and final character animation.

## Locked direction and source of truth

Starville uses original, warm, non-pixel 2:1 isometric fantasy presentation. The product direction,
originality rules, scale relationships, lighting, surfaces, hierarchy, labels, bubbles, and HUD
rhythm are documented in `docs/assets/starville-visual-art-bible.md`. The values consumed by code
live in `packages/game-core/src/visual-policy.ts`; the document and tokens are one policy, not two
optional suggestions. The bundled asset pipeline imports those tokens directly for projection,
anchor, structure-scale, maximum-dimension, and animation-budget validation. Runtime, Composer,
Draft Preview, readiness, and Game Test either consume the shared policy or mount the production
renderer.

The visual policy is presentation-only. Manifest coordinates, safe-save bounds, collision,
interactions, exits, stable asset keys, immutable pins, and server-authoritative player/economy
state remain unchanged.

## Shared scale, anchors, depth, and shadows

The shared policy defines reference character/door/building/tree/lamp/bush/bench/furniture sizes,
per-kind renderer scale, contact-shadow geometry, light/shadow direction, outline/palette ranges,
overlay depth bands, label distance, bubble duration/distance, ambience caps, camera zoom, and
quality defaults.

Runtime object size is calculated from immutable asset metadata, the shared category factor, and the
authored manifest scale. Composer uses the same factor; readiness checks authored values against the
shared policy ranges. The renderer does not resize collision, interaction, movement speed, or the
player's foot anchor. The procedural player uses one uniform world scale so body variants do not
stretch only one axis.

World geometry sorts from its canonical foot position. Normal object depth uses `x + y` plus a
bounded deterministic tie and the approved depth-anchor offset. Contact shadows are separate,
bounded geometry below the object. Phaser and Admin both consume `softnessPx` as three translucent
ellipse layers whose alpha totals the authored contact-shadow opacity. This supplies a deterministic
soft edge without a GPU blur or DOM filter; authored shadow media remains Phase 12D work. Labels,
bubbles, interaction markers, and debug information have explicit overlay bands so tall sprites
cannot unpredictably hide them.

## Camera and boundaries

The previous camera copied a rectangular manifest bound, used one fixed deadzone, and followed at
zoom 1. A wide viewport could see beyond the isometric diamond, while a small viewport received no
composition-aware recalculation.

`computeWorldCameraFrame` derives a finite bounded zoom, deadzone, and presentation apron from the
manifest projection and current viewport. The scene recomputes this frame after Phaser resize and
continues following the foot-anchored player. It does not change world coordinates or interaction
range. Reduced Motion uses immediate follow instead of catch-up easing.

A low-cost procedural terrain underlay extends behind the playable diamond and reads as darker,
non-walkable boundary land. It is not thousands of extra tile sprites and never expands safe-save or
collision bounds. Authored perimeter vegetation/fences/water may strengthen the boundary, but the
underlay ensures a supported viewport does not fall directly into the canvas background.

## Terrain, paths, grass, and water

Playable terrain remains one tile image per logical tile so immutable asset resolution and current
map rectangles remain compatible. Phase 12C changes the material presentation rather than
pathfinding:

- grass variants use a stable coordinate hash with low-frequency placement instead of a visible
  checkerboard;
- normal fallback diamonds do not stroke a permanent dark grid;
- path/plaza/bridge/water edges receive subtle connected boundary treatment derived from neighboring
  terrain, with grid-strength overlays reserved for explicit debug and Composer modes;
- restrained deterministic grass details and water highlights sit in a separate low depth band;
- water shimmer is bounded and becomes static when Reduced Motion, low quality, or Water Animation
  off applies; and
- missing terrain still follows the selected immutable source → bundled key → stable missing
  material → compact procedural fallback path.

Terrain changes never alter walkability. The existing water collision and bridge opening remain the
authority for where a player may stand.

## Lantern Square composition and hierarchy

The repository-local Lantern Square composition is the deterministic Phase 12C fixture. It uses
stable Starville asset keys, protected spawn/exit corridors, and clustered perimeter dressing to
strengthen the central lantern/social identity without publishing a world. The validated local draft
contains 47 objects and 36 collision shapes. The published source manifest remains unchanged.

Primary hierarchy is square center, General Store, personal-home route, and major exit. Cooking,
crafting, social gathering, photo, and guidance areas are secondary. Flowers, bushes, lamps, fences,
rocks, and signs are tertiary. The shared readiness analyzer currently returns zero errors and zero
warnings for this local draft; its one recommendation is `temporary-development-art`. The analyzer
also detects projection/terrain errors and advises on density, repetition, collision/scale, blocked
anchors, exit-route clarity, water/bridge structure, boundary coverage, landmark hierarchy, social
coverage, and decorative variety. Its route, boundary, and collision findings are bounded geometric
heuristics, not exhaustive connectivity or visual proof. Findings guide an administrator and never
move or save anything.

The current technical cottage/workstation art receives scale, layered soft contact shadows, base
grounding, route clarity, and the shared light/shadow direction. Final roofs, doors, windows,
signage, silhouettes, authored shadow media, and authored states remain Phase 12D work.

## Color, ambience, and time-of-day foundation

The shared palette uses warm greens, cream/gold accents, muted deep outlines, restrained blue-violet
magic, and warm lantern light. The renderer creates capped deterministic ambient motes and water
shimmer. Those effects are low-frequency, non-flashing, cosmetic, and torn down with the scene; they
do not imply rewards or authoritative events. Authored lantern flicker, vegetation sway, and
production effect art remain Phase 12D work.

The `dawn`, `day`, `dusk`, and `night` token presets provide future color-grade, sky/ambient tint,
and lantern-intensity values. Phase 12C does not create an authoritative clock, daily rule, crop
rule, reward condition, or server-wide time state.

## Player labels and chat bubbles

Remote labels use sanitized public display name and public level, a compact high-contrast stroked
nameplate, shared distance thresholds, privacy preference, and selected-player emphasis. No title or
badge slot is rendered because the existing public presence projection does not carry an
authoritative value. A future implementation must first add a narrow public contract. The DOM
Nearby/Friends surfaces remain the accessible participant alternative outside the canvas.

World chat bubbles are a bounded rendering of recent validated chat messages. The runtime accepts a
small projection of message ID, sender presence, text, and time; it keeps at most the shared
maximum, expires each bubble, applies distance/world visibility, and draws plain text only. It does
not parse HTML, activate links, send a message, bypass mute/block/moderation, or replace persistent
chat history. Low quality further caps the number shown; bubble placement is static rather than
tweened under Reduced Motion.

## HUD and realtime presentation

The old default combined three top cards, an activity launcher, guide/quest trackers, chat,
eight-slot quickbar, and a permanent two-column status dashboard. Phase 12C changes the status dock
to a compact summary by default and an explicit expandable secondary-actions panel. DUST,
connection, active objective, interaction, hotbar, and relevant player status remain immediately
available while inventory, history, progression, nearby, friends, channels, and activity details are
expandable.

Local settings version 3 adds Visual Quality, Ambient Effects, Shadows, Water Animation, World
Labels, Chat Bubbles, Reduced Motion, UI Scale, and HUD Density. Version 1/2 preferences migrate
safely. These are local presentation preferences and never become player authority.

DUST and Level surfaces distinguish loading, a real zero/value, and unavailable. Realtime states use
explicit accessible text instead of a permanent dash. Retry controls remain bounded to their
existing bootstrap/recheck paths and do not invent a value. The hidden location banner has a
persistent screen-reader location summary, so the world region never loses its accessible label.

Responsive safe zones reserve the center-bottom prompt, hotbar, chat launcher, collapsed dock, and
phone movement pad. Mobile uses one compact control row/drawer rather than a permanent right
dashboard. Four labeled touch buttons feed the same collision-safe movement input as WASD, are at
least 44 CSS pixels, respect safe-area insets, and retain keyboard focus treatment.

## Composer, Draft Preview, and Game Test

Game Test remains the production-renderer ground truth because, after the existing protected grant,
it mounts `GameCanvas`. The exact authorized manifest and immutable deliveries are the default
source. Only an authorized Lantern Square session may explicitly switch to the checked-in
47-object/36-collision `local_draft`, whose deliveries are bound in memory to bundled versions; the
local source is a repository-owned fixture rather than hosted unpublished-draft metadata and is
never substituted automatically. World Composer remains an SVG editing surface, not a second
renderer or pixel-evidence source. Its projection, object scale, anchors, supported rotation,
contact shadows, player reference, and advisory diagnostics derive from the shared policy. Debug
grid/collision display may remain intentionally more explicit than gameplay.

Draft Preview independently loads the authorized preview and draft records. It renders only when map
ID, version ID, non-null checksum, and exact immutable asset pins agree; it withholds the canvas
instead of silently substituting current or bundled artwork. Visual Readiness requires `maps.read`,
loads one exact server revision, shows trusted lifecycle/validation/checksum identity, shared-policy
findings, and camera frames, and keeps its manual review state browser-local.

The authorized read-only Worlds → Visual Readiness area presents camera, terrain, scale, depth,
shadow, boundary, route, landmark, repetition, mobile/HUD, and screenshot review. Local checkbox
state clears on reload and cannot validate, save, activate, publish, or record owner acceptance.
Composer diagnostics separate blocking visual-policy errors, strong warnings, and recommendations.

The protected Game Test adds deterministic in-memory controls for one or eleven players; player
placement in front of or behind a tree or building; bounded safe bubbles; labels; normal or low
quality; individual shadow, ambience, water, label, bubble, and Reduced Motion switches; and the
production compact/expanded status dock. Its existing asset-coverage view preserves missing-asset
inspection. The selected source—exact authorized revision by default, or explicit Lantern Square
local draft—supplies paths, water, terrain, workstations, homes, and world edges. The local source
uses the production renderer with bundled-only in-memory deliveries and an explicit unpublished
lifecycle label. Fixture code has no player-persistence, public-realtime, analytics, local-storage,
or session-storage dependency and does not modify inventory, DUST, progression, visits, hosted
assets, or world revisions.

Responsive layout rules and a manual viewport matrix cover mobile, tablet, and desktop sizes, but
the actual protected renderer still needs signed-in browser captures at those sizes. Structural
tests are not treated as mobile or pixel acceptance.

## Performance and QA contract

- Playable terrain image count is bounded by `width × height`; the camera apron is one cheap
  underlay rather than a second full tilemap.
- Asset texture keys remain deduplicated by immutable resolver identity.
- Ambient objects, visible labels, and chat bubbles use explicit caps.
- Resize work is event-driven; no continuous DOM measurement or full-map rerender is introduced.
- Readiness terrain coverage uses a clipped 2D difference grid and asset repetition uses a single
  frequency map, keeping both checks bounded-linear rather than area-by-area or object-squared.
- Low quality disables shadows, ambience, and animated water and further caps visible chat bubbles.
- Reduced Motion eliminates nonessential tweening without changing gameplay.

The deterministic structural/unit suite can verify policy bounds, object scale, shadow placement,
camera coverage, node budgets, settings migration, HUD state semantics, and advisory diagnostics. On
this local machine, 100 post-warmup readiness analyses of a synthetic 128×128 map with 512
overlapping terrain areas and 512 objects averaged 0.487 ms (p95 0.572 ms, maximum 0.684 ms). This
is a Node policy microbenchmark, not browser frame-time evidence. Browser screenshot comparison of
the actual renderer, first meaningful render, GPU frame time, eleven-client realtime, mobile/desktop
memory, WAN asset timing, 200 percent zoom, and signed-in Admin/renderer parity still require the
unchecked owner matrix. The deterministic eleven-player Game Test fixture exercises renderer
population but is not an eleven-network-client load test. Manual captures must record exact HEAD,
world revision, viewport, browser zoom, quality/motion mode, and any fallback events. No pixel QA is
claimed merely from a source/CSS assertion.

## Database, security, and known limitations

Phase 12C adds one forward-only local manifest-contract migration,
`20260718122000_phase12c_world_manifest_object_contract.sql`, so PostgreSQL accepts the canonical
`furniture` object kind and optional quarter-turn `rotation` already used by the shared TypeScript
manifest. It wraps all prior validation, remains private, revokes direct execution, and adds no RLS
or browser/service-role grant. The separate `20260718121000_fix_phase12_hosted_validation.sql`
migration remains the earlier Phase 12 hosted-validation repair. Neither migration was pushed or
applied to a hosted target. Phase 12C does not activate a hosted asset, publish a hosted world,
write player data, or deploy. Full boundaries are recorded in
`docs/security/phase-12c-visual-trust-boundaries.md`.

Current bundled media remains static `technical_baseline` art. Tile adjacency is renderer treatment,
not a complete authored terrain autotile set. Player titles/badges are not invented or displayed
because the public presence projection has no authoritative value for them. The current character
remains a procedural modular foundation. Final art, authored directional animation, authored
shoreline/path variants, production ambience, and release-candidate device profiling are planned
Phase 12D/12E work, not silently completed here.
