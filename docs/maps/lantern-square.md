# Lantern Square map

Lantern Square was the Phase 4 vertical-slice map and is the center of the Phase 6 five-map graph.
It is a 24 × 20 logical isometric map described by the canonical manifest in `@starville/game-core`,
seeded as an immutable published world version; it is not a screenshot or flattened background.

## Manifest content

- 96 × 48 isometric tile projection with explicit origin, camera bounds, safe save bounds, and spawn
- layered grass, crossing paths, central plaza, three-tile stream, and three-tile bridge
- two cottage structures, three trees, a rock, two fence runs, two lamps, a notice board, flowers,
  and bushes
- full-width building ground bases, compact tree-trunk/rock circles, complete fence runs with
  protected ends, compact lamp-pole bases, stream rectangles that leave the bridge open, a
  notice-board base, and map boundaries
- one data-driven `notice` interaction near the board
- explicit asset identifiers checked against the available development-art registry

Manifest validation rejects duplicate identifiers, missing assets, invalid spawn/object bounds,
malformed or out-of-map collision shapes, and unsupported interaction types before rendering.
Flowers and bushes are explicitly visual decoration and remain nonblocking.

Each cottage footprint is a world-space capsule centered exactly on the cottage's manifest foot
anchor. Its segment runs along the isometric screen-horizontal axis with a 0.35-tile ground radius,
matching the visible wall/foundation shadow rather than the roof overhang. Rounded, equal left/right
ends avoid both skewed rectangle corners and asymmetric invisible dead space.

Collision movement is subdivided from the previous valid position. A blocked substep derives the
physical contact normal and removes only the inward component before testing a tangent slide. It
never resolves by arbitrarily preferring world X or world Y, because those axes are diagonal on
screen and previously allowed sustained input to route around a shallow footprint unexpectedly.

## Safe spawn and resume

The default spawn is `(12, 7.5)`, facing south. Named transition-entry spawns sit safely inside all
four edges. The API checks every saved point with a compact foot collision boundary against the same
bounds and collision shapes used by the client. The active client foot circle uses a 0.24-tile
radius. A saved point with a missing/unknown map, non-finite coordinate, unsafe boundary, or
blocking overlap falls back to this spawn instead of preventing game entry.

## Replacement boundary

Terrain and object placement are content data. Phaser drawing lives in focused terrain, object, and
player renderers. Future approved art may replace individual asset IDs or rendering adapters while
preserving logical coordinates, collision bases, interactions, and persistence. Phase 6 adds
versioning, four directional exits, protected structured editing, validation, preview, and
publication. Secure browser asset upload remains intentionally unavailable.
