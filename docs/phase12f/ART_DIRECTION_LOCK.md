# Phase 12F-A production-art direction lock

Status: vertical-slice candidate prepared locally; owner visual acceptance is pending. This document
is a proposed lock, not owner approval and not authorization to expand the asset pack.

## Audit result

V1 is technically stable but reads as programmer art: geometric SVG silhouettes, uniform dark
strokes, flat materials, repeated tile grids, simple ellipse shadows, an under-detailed character,
and a dashboard-weight HUD. Rejected V2 preserves the same 106 stable keys and most of the same
recipes. Its small roof, foliage, line, and vector-rig adjustments do not establish a new visual
identity; some composite details also separate visibly at runtime.

The production slice therefore keeps the projection and runtime contracts while replacing the
visible slice with a separate 20-asset raster candidate and a raster avatar atlas. V1 remains the
normal-game default and V2 remains available only for comparison.

## Selected direction

Starville uses an original, non-pixel, hand-painted storybook-gouache direction: warm village
architecture, mossy organic silhouettes, layered foliage, illustrated materials, compact game-first
UI, and restrained magical warmth. Forms should be readable at gameplay scale before texture detail
is added.

| System               | Locked specification for the slice                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Projection           | 2:1 isometric; logical tiles are 96 × 48 px                                                                          |
| Character frame      | 192 × 256 px; stable bottom-center foot anchor at 0.5 / 0.9727                                                       |
| Character proportion | Large readable head, compact torso, separated limbs, layered tunic/vest/scarf/trousers/boots                         |
| Building proportion  | One cottage occupies a roughly 3 × 2 tile collision footprint while its roof and chimney extend upward as a landmark |
| Outline              | Controlled deep moss/brown painted edge; never a uniform black vector stroke                                         |
| Key light            | Soft warm light from upper-left                                                                                      |
| Shadow direction     | Lower-right, soft-edged and low-opacity                                                                              |
| Ambient fill         | Restrained cool sage/teal fill                                                                                       |
| Local warmth         | Amber windows, lantern, brass accents, and cream highlights                                                          |
| Grass                | Mottled lime/sage fibers with sparse clover variation and a painterly diamond underlay                               |
| Stone/plaza          | Warm cream and ochre pavers with restrained wear                                                                     |
| Wood                 | Golden brown, visible grain, deep moss-brown joints                                                                  |
| Water                | Muted teal surface, controlled highlights, static fallback under Reduced Motion                                      |
| Foliage              | Layered organic clusters with yellow-green upper-left accents and deep cool undersides                               |
| Glass/windows        | Cream-to-amber emissive panes bounded by dark timber                                                                 |
| Magical accents      | Star motifs and localized amber light only; no screen-wide bloom                                                     |
| Interaction          | Small warm ring and compact prompt above the hotbar                                                                  |
| UI surface           | Translucent deep moss, thin cream line, modest blur, warm gold focus/active state                                    |
| Icons                | Small single-color symbolic marks; no unrelated icon pack                                                            |
| Typography           | Display serif for place/landmark hierarchy; compact sans serif for controls and status                               |

## Palette

| Token        | Value                   | Use                                       |
| ------------ | ----------------------- | ----------------------------------------- |
| Ink          | `#16291f`               | Deep readable foreground and shadow color |
| Moss         | `#244936`               | Primary UI and environmental dark         |
| Moss soft    | `rgb(36 73 54 / 88%)`   | Layered translucent surface               |
| Cream        | `#fff5d9`               | Primary UI text and warm highlight        |
| Gold         | `#e6bd62`               | Focus, star, lantern, and active accents  |
| Sage field   | approximately `#6f9130` | Grass base                                |
| Clover field | approximately `#799933` | Sparse terrain variation                  |
| Path ochre   | approximately `#cd994a` | Readable route                            |
| Plaza sand   | approximately `#d5b166` | Social-space pavers                       |
| Water teal   | approximately `#1e7775` | Water material                            |
| Bridge wood  | approximately `#a16b2f` | Boardwalk material                        |

High contrast raises panel lines to near-white and removes translucent blur. Reduced Motion disables
CSS transitions/animation and tells the renderer to use static character and ambience states.

## Character and animation

Marlowe is a small village adventurer with copper hair, a moss scarf/cape, layered ochre tunic,
cream sleeves, green trousers, boots, belt pouches, and a round brass/star accent. Front, side,
back, and diagonal silhouettes turn the head, torso, hips, legs, and costume mass together.

The 2304 × 2048 atlas is 12 columns × 8 rows. Every direction row contains four idle frames, four
walk frames, and four jog frames: 96 frames total and 24 runtime mappings. Durations are 360 ms
idle, 130 ms walk, and 85 ms jog. Reduced Motion selects the first stable frame. The atlas uses a
bottom-center foot anchor and is displayed at approximately 134 px tall in the world.

The slice uses seven authored walk direction bands and five authored jog direction bands, with
deterministic horizontal reflection for the complementary right-facing bands. All eight runtime
directions retain directional body silhouettes; fully unique per-direction/per-phase redraws remain
an artist polish item before any full production rollout.

## Environment and composition

The unpublished 16 × 16 Garden Corner is composed around the Amber Cottage as the primary landmark.
The plaza and north-south path provide the readable route; the notice board, bench, lamp, flowers,
and workstation frame a social middle ground. A pine anchors the background, a maple frames the
foreground, fencing and rocks close the west edge, and a water band plus two-tile bridge establish a
foreground boundary.

The scene uses deliberate clusters rather than isolated prop scattering. Baked material shading and
soft contact shapes are paired with the renderer's foot-position depth sorting and contact-shadow
layer. Player, object, and shadow ordering remains based on logical foot anchors rather than
transparent media bounds.

## HUD and modal

Permanent panel area is limited to compact edge-safe groups: identity/objective at top-left,
location/candidate/version at top-center, review/network/settings/help at top-right, minimized chat
at bottom-left, a five-slot hotbar and interaction prompt at bottom-center, and
level/DUST/connection/details at bottom-right. Tablet and mobile reduce secondary labels; mobile
keeps touch movement visible.

The notice board continues to use the existing portal and modal-shell architecture. The Phase 12F-A
skin adds a moss surface, warm outline, sharp typography, a restrained blurred backdrop, compact
close control, mobile-safe dimensions, focus trapping, Escape close, and the existing
focus-restoration contract.

## Pipeline lock and expansion boundary

The candidate pipeline is deterministic: authored reference sheets → chroma cleanup → normalized
transparent source PNGs → stable keyed WebP runtime media → thumbnails, manifest, size report, atlas
metadata, hashes, and validation. World runtime media remains manifest `3.0.0`; the avatar atlas has
its own `3.0.0` metadata manifest.

This phase intentionally stops at 20 world assets and one avatar atlas. It does not authorize
complete-world replacement, more outfits, crops, furniture, buildings, seasonal variants, or
candidate activation. Owner acceptance is required before expansion.
