# Phase 12F-A.1R rescue final report

Status: **IMPLEMENTED — LOCAL OWNER-REVIEW CANDIDATE**.

This rescue replaces the rejected local V3 staging with a curated 48×40 village slice while leaving
published/default V1 untouched. The candidate remains loopback-only, additive, unpublished, and
inactive. It is suitable for owner visual review; it is not a publication or production-readiness
claim.

## Owner-visible outcome

- The old 72×60 sparse canvas was replaced by a focused map that is still twice the canonical width
  and height (four times the area), with 29 deliberately staged objects instead of random perimeter
  scatter.
- Lantern Square now has a readable cottage terrace, plaza, connected path network, stream, two
  bridges, mature trees, fences, seating, notice board, lamp, workbench, flowers, shrubs, and rocks.
- Water uses shallow/deep bands, bridge disturbance tiles, shading, highlights, and subtle runtime
  movement. It reads as a stream rather than a flat blue rectangle.
- The cottage interior is a bounded 14×10 room with intentional desktop and portrait framing. Bed,
  kitchen counter, dining furniture, storage, wardrobe, fireplace, lamp, plant, wall art, and warm
  floor/wall treatments fill the playable composition.
- Desktop and mobile entry/exit use the existing in-memory transition system and return to the
  cottage doorstep without a page refresh.
- Collision footprints now cover the cottage, river, bridges, fences, bench, board, workbench,
  trees, lamp, rocks, planters, and interior furniture. The cottage façade test stopped the player
  at `y=12.750` with three nearby collision shapes instead of allowing wall clipping.
- Large trees, the cottage, walls, and furniture use asset-specific depth/occlusion behavior. The
  behind-tree checkpoint fades the canopy while the front checkpoint keeps it opaque.
- The eight-way production sprite mapping was corrected. Live east/west checkpoints visibly face the
  requested direction, and unit coverage locks every cardinal and diagonal mapping.
- Walk and jog now advance using actual traveled distance rather than a looping pose detached from
  movement. The diagnostic contract exposes distance traveled, and tests cover walk/jog cadence,
  teleports, and frame progression.
- The desktop camera presents the hero composition at game scale. The portrait interior camera
  follows the player at a controlled zoom rather than shrinking the room into a large void.
- Mobile HUD spacing was tightened so Settings/Diagnostics/Help and touch movement, jog, action,
  profile, chat, and hotbar controls remain usable without covering the key scene.
- Phase 12F-A still uses one polished base character. Phase 12F-B character customization was not
  started.

## Owner-visible QA judgment

The result is a major improvement and is coherent enough for owner review. The outdoor square is
purposeful rather than sparse, the interior occupies the view, water is immediately recognizable,
trees and cottage establish believable scale, the avatar reads correctly against the environment,
and the tested collision/occlusion cases no longer show the rejected clipping failures.

The remaining decision is subjective owner acceptance of the illustrated art direction and final
composition. No known functional blocker remains inside the requested local rescue scope. Physical
mobile-device performance was not measured; the mobile result was validated at an exact 390×844
browser viewport.

## Key implementation areas

- `packages/game-content/src/production-slice-v3.ts`: rescued exterior/interior manifests,
  interactions, staging, collision, and safe bounds.
- `packages/asset-pipeline/src/phase12f-source-art.ts`: corrected eight-way atlas mapping and V3
  production-art generation contracts.
- `packages/avatar/src/production-slice-rig.ts`: distance-aware walk/jog cadence and diagnostics.
- `apps/game-client/src/game/rendering/terrain.ts`: rescue terrain, water, banks, bridge treatment,
  and removal of random exterior framing.
- `apps/game-client/src/game/rendering/world-objects.ts`: object-specific split, depth, and
  occlusion policies.
- `apps/game-client/src/game/rendering/production-slice-player.ts`: real traveled-distance animation
  synchronization.
- `apps/game-client/src/game/scenes/WorldScene.ts`: rescue camera, interior framing, transitions,
  and runtime diagnostics.
- `apps/game-client/src/app/production-slice-review.ts` and
  `apps/game-client/src/components/ProductionSliceReview.tsx`: loopback review gate, deterministic
  QA checkpoints, and local-only status/HUD.
- `apps/game-client/src/styles.css`: desktop and mobile review presentation.
- `scripts/phase12f-a1-performance.ts`: performance gate aligned to the curated 2×/4× rescue size,
  preventing a regression to the rejected empty 9×-area canvas.

## Safety confirmation

- V1 stayed protected and remains the published/default behavior.
- V3 remains local-only, unpublished, inactive, and additive.
- No hosted database, storage, authentication, activation, or publication write occurred.
- No database migration was added or pushed.
- No deployment occurred.
- No commit or Git push occurred.
- Phase 12F-B was not started.

See `VALIDATION.md` for exact gate results and `OWNER_ACCEPTANCE_CHECKLIST.md` for the owner review
sequence.
