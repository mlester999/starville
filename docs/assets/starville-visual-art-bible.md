# Starville visual art bible

Status: Phase 12C repository-local rendering policy. This is a production-direction baseline, not a
claim that the current technical artwork is final or that browser pixel acceptance has passed.

The enforceable source for machine-applied numeric values in this document is
`packages/game-core/src/visual-policy.ts`. Runtime rendering and the Admin visual-policy adapter
import it directly. The bundled asset pipeline imports it for projection, anchor, structure-scale,
maximum-dimension, and animation-budget validation. Draft Preview resolves exact immutable asset
pins and uses the Admin adapter; Game Test mounts the production `GameCanvas`. The relative
production-art ranges below are owner-review targets for Phase 12D and do not override renderer
tokens or immutable asset metadata. A second set of hand-tuned renderer scale values is not
permitted.

Existing uploaded World Asset versions retain their immutable validated profile and exact pins; this
local policy does not silently reprocess, activate, or rewrite them. Pixel parity still needs the
protected, signed-in Game Test and owner screenshot matrix.

## Direction and originality

Starville is a warm, premium, non-pixel isometric fantasy village. Forms are soft and readable,
materials are restrained, and cream, gold, warm green, muted teal, and small celestial blue-violet
accents sit over deep green-brown outlines. The world should feel inhabited without becoming noisy.
It must not reproduce the map, characters, UI, mechanics, silhouettes, or signature asset language
of another commercial game. References may establish broad quality, warmth, and readability only.

No animal or livestock system is part of this direction. Fablesol, Pokentara, Sailana, AIvanza, and
any previous project are outside Starville's visual and gameplay vocabulary.

## Projection and geometry

- Use a true 2:1 isometric projection with 96 by 48 world tiles.
- World coordinates and the manifest projection origin are canonical. CSS transforms are not world
  placement.
- The foot/base anchor is the only object placement point. An asset's depth anchor may contribute a
  bounded tie offset, but asset height never replaces foot-position depth sorting.
- Normal gameplay has no permanent tile grid. Grids are reserved for Composer, placement, farming,
  collision debug, and explicit Game Test overlays.
- Walkable bounds remain authoritative. A decorative terrain apron may extend beyond them only to
  frame the camera and must never imply that the area is walkable.

## Canonical reference measurements

At the reference renderer scale, the shared tokens define these comparison measurements. They are
presentation targets rather than a license to alter collision, footprints, or immutable media.

| Reference             | Pixels |
| --------------------- | -----: |
| Character height      |    112 |
| Door height           |    132 |
| Tree height           |    184 |
| Lamp height           |    132 |
| Bush height           |     72 |
| Bench / seating width |    104 |
| Building height       |    422 |
| Storefront height     |    416 |
| Furniture height      |     88 |

Bundled world media is limited by policy to a 2,048-pixel maximum dimension, 16 animation frames,
and 512×512 decoded pixels per animation frame. The deterministic asset validator enforces these
ceilings alongside existing file-size and total-package budgets.

## Canonical relative scale

The character is the human-readable reference. Its visual target is 112 world pixels while its
collision foot radius and movement contract remain unchanged.

| Element                 | Visual target relative to character | Intent                                          |
| ----------------------- | ----------------------------------: | ----------------------------------------------- |
| Player / NPC foundation |                                1.00 | Readable face, silhouette, and facing direction |
| Door                    |                           1.18–1.35 | Clearly accommodates the character              |
| Home / shop             |                             2.7–3.8 | Landmark, never a screen-filling wall           |
| Workstation             |                           0.85–1.35 | Usable prop, subordinate to a building          |
| Tree                    |                           1.75–2.55 | Tall occluder with a readable trunk base        |
| Bush                    |                           0.45–0.78 | Ground vegetation, never structure-sized        |
| Flowers                 |                           0.20–0.48 | Tertiary detail                                 |
| Lamp                    |                           1.10–1.48 | Slightly above character height, below roofline |
| Sign                    |                           0.65–1.05 | Readable landmark cue, not a wall               |
| Bench / social seating  |                           0.55–0.90 | Character-scaled seating foundation             |
| Rock                    |                           0.35–1.05 | Grounded accent with bounded variation          |
| Farm plot               |                           1–4 tiles | Terrain-scale gameplay surface                  |
| Furniture               |                           0.35–1.35 | Character-relative interior prop                |
| Bridge / water feature  |                      Tile multiples | Follows the 2:1 tile plane                      |
| Fence                   |                      0.55–0.90 high | Boundary cue that preserves sight lines         |

Authored manifest scale remains data. The renderer may normalize it only through the shared visual
policy's bounded category rule; collision, interaction range, movement speed, world coordinates, and
authoritative state must never change as a side effect.

## Line, color, light, and surface

- Outlines use a deep muted green-brown, never pure black. Typical apparent thickness is 1.5–3
  pixels at the reference scale; tertiary interior marks may be thinner.
- Light arrives from the upper-left. Contact shadows fall gently down-right, remain soft and
  translucent, and are centered on the asset's base.
- Contact shadows are separate renderer geometry when possible, scale with the category footprint,
  remain below the object, and may be reduced by visual quality settings. The shared 10-pixel
  softness resolves into outer/middle/core ellipse layers at 18/30/52 percent of the authored alpha
  in both Phaser and Admin SVG. They never affect collision.
- Environment saturation stays moderate. Gold and magical blue-violet are accents, not full-screen
  grades. Dark scenes retain cream-text and player-silhouette contrast.
- Large surfaces use low-frequency value variation. Micro-detail is sparse enough that players,
  dropped items, interaction markers, and route edges remain legible.
- Grass reads as one field with deterministic, low-frequency variation. Paths and plazas use clear
  edge contrast without thick per-tile borders. Water uses restrained highlights and a static
  reduced-motion fallback.

## Composition and hierarchy

- Primary landmarks: Lantern Square center, General Store, personal-home entrance, and a major world
  exit.
- Secondary landmarks: Cooking Hearth, Crafting Workbench, social seating, photo/gathering point,
  and quest guidance.
- Tertiary dressing: flowers, bushes, lamps, signs, rocks, fences, and small props.
- Keep at least one visually clear route from every enabled spawn to the center and from the center
  to each enabled exit. Decoration must cluster with intent and leave navigation breathing room.
- Repeated assets require spacing, scale, rotation where supported, or contextual grouping. Random
  isolated clutter is not a substitute for population.

## Depth and grounding

World objects and players sort from canonical foot positions. Shadows occupy a lower depth band;
world geometry occupies the foot-depth band; labels, chat bubbles, interaction prompts, and debug
overlays use explicit overlay bands. Tall objects may occlude a player above their base, and a
player below the base must appear in front. Uploaded replacements retain the same anchor and logical
footprint contract.

Every freestanding object needs a readable base through a soft contact shadow, footprint-aware
terrain integration, trunk/post/door contact, or an intentionally embedded surface. Avoid universal
glows and hard black ellipses.

## Motion and ambience

Ambient motion is decorative and non-authoritative. Water shimmer, lantern variation, leaves, dust
motes, and vegetation sway must be low-frequency, bounded, non-flashing, and capped. Reduced Motion
uses static highlights. Low visual quality reduces effect count, shadow detail, label distance, and
decorative density without disabling gameplay, collision, realtime, or state updates.

Daylight, golden hour, evening, and night are color-grade and lantern-intensity presets only in
Phase 12C. They do not create an authoritative clock or gameplay rule.

## Labels, bubbles, highlights, and UI

- Player labels show sanitized display name and available public level in a compact, high-contrast
  plate. Do not invent or display titles or badges until an authoritative public projection exists.
- Labels are distance-bounded, privacy-controlled, and subordinate to selected/party/friend state.
  Wallet identifiers and private account data never appear.
- Chat bubbles display short sanitized text only, have bounded width and lifetime, do not render
  active links or HTML, and remain mirrored by persistent moderated chat history.
- One interaction prompt is shown at a time in the dedicated safe prompt region. It uses a concrete
  action verb, exposes its input hint in text, remains keyboard/touch accessible, and never invents
  success or availability.
- HUD spacing uses an 8-pixel rhythm, 44-pixel minimum touch targets, safe-area insets, compact
  always-visible status, and expandable secondary panels. World composition remains the primary
  visual surface.
- Phone movement controls use labeled 44-pixel directional buttons and must feed the same
  collision-safe movement input as WASD. They are input presentation, never a separate movement or
  save authority.

## Replacement and review rule

Phase 12C normalizes and composes the current bundled technical baseline. Phase 12D owns final
production artwork and authored directional character animation. A replacement is accepted only when
it preserves stable identity, approved source provenance, normalized anchors, supported rotation,
footprint, collision readability, depth behavior, performance budget, and this originality policy.
Acceptance must be exercised in the protected production renderer; an Admin SVG preview alone is not
pixel evidence.
