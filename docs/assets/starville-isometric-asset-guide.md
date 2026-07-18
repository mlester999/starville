# Starville isometric asset guide

This guide defines the production contract for bundled technical art and later owner-supplied
Starville replacements. It is a compatibility guide, not a claim that the current technical pack is
final art.

## Projection and base plane

- Tile canvas: 96 by 48 pixels.
- Projection ratio: 2:1 isometric diamond.
- World position: the logical ground-contact point, not the image center.
- Object base: bottom center.
- Baseline light: soft upper-left.
- Baseline shadow: restrained lower-right, with no hard black edge.

For a tile at world coordinates `(x, y)`, the renderer's un-offset screen projection is:

```text
screenX = (x - y) * 48
screenY = (x + y) * 24
```

The map's declared projection origin is then added. Asset authors should test a silhouette on the 96
by 48 ground diamond at 100 percent scale before adding detail.

## Canvas, scale, and transparency

Use an SVG source with explicit width, height, and view box. Keep the outer canvas transparent and
crop unused margin while leaving enough room for soft shadows. World art must not contain a black or
white matte, embedded photograph, base64 payload, external URL, unsupported profile, or hidden
oversized canvas. Runtime output is lossless WebP with alpha; do not use JPEG for transparent world
objects.

Keep texture detail readable at game scale. Do not upscale a small raster into a larger asset. Avoid
front-facing UI symbols pasted onto the isometric plane. Building signs may face the player, but the
structure base and shadow must still match the shared plane.

## Anchors

Anchors are normalized to the image, from `0` to `1`:

- `anchor`: general preview/composition origin;
- `footAnchor`: exact ground contact used to place the image at the world object's coordinates;
- `depthAnchor`: point used for a bounded depth-sort adjustment;
- `interactionAnchor`: optional presentation hint for prompts, separate from server-authoritative
  interaction range.

For most standing objects, start with a foot anchor near `(0.5, 0.92)` and move it only after
testing the actual base. A rug or terrain tile may use the canvas center. Never compensate for a bad
anchor by moving the Composer object; replacing a visual version must not change its logical
placement.

## Footprint and collision

Footprint is the occupied isometric ground area in tiles. Collision is a separate explicit profile:
none, rectangle, or capsule, plus whether it blocks. Keep collision inside the intended footprint
and align it with the visible base, not foliage, signs, glow, or a baked shadow. Decorative overhang
may extend beyond collision.

Gameplay collision and interaction remain authoritative outside the image. A failed visual must not
make an obstacle walkable or disable an interaction. Preview overlays should show footprint,
collision, foot anchor, and depth anchor together.

## Rotation

Declare only valid rotations from `0`, `90`, `180`, and `270` degrees. When perspective or lighting
changes, supply authored directional source/runtime variants. Do not rotate a flat PNG with CSS or
canvas transforms when that produces an invalid isometric view.

For every supported rotation:

1. preserve the logical object key and world coordinate;
2. preserve or deliberately swap the declared footprint dimensions;
3. verify collision and interaction alignment;
4. verify foot and depth anchors;
5. create a readable thumbnail/preview;
6. verify the same orientation in Composer and Game Client.

If only one orientation is valid, declare only rotation `0`. The six current furniture definitions
provide authored four-way technical variants. Fence material currently supplies its supported
directional variant. Unsupported requested rotations resolve to the declared default instead of
distorting the art.

## States and animation

Use distinct semantic keys or declared variants for states that gameplay already supports, such as
farm plot dry/watered/selected, crop growth stages, or workstation idle/active/ready. State art must
not invent settlement or timing behavior.

Animation metadata must declare frame width/height, frame count, duration, and loop mode, and the
sheet dimensions must divide exactly. Keep the first frame a safe static fallback. Respect reduced
motion by showing a stable representative frame. The current Phase 12B pack is static; its active
and ready illustrations are an animation foundation, not a completed animation set.

## Lighting and readability checklist

- [ ] Base aligns to a 96 by 48 isometric diamond.
- [ ] Soft light reads from upper-left and shadow falls lower-right.
- [ ] Shadow is transparent, restrained, and does not imply false collision.
- [ ] Silhouette remains readable on light, dark, and transparent preview surfaces.
- [ ] Outer pixels retain real alpha with no black/white fringe.
- [ ] Foot, depth, interaction, footprint, and collision overlays match the intended base.
- [ ] Every declared rotation uses correct directional art.
- [ ] Stable key and source status have a text label.
- [ ] Reduced-motion preview remains understandable.
- [ ] The SVG and generated WebP pass `pnpm assets:validate`.

Owner-provided replacements should keep the stable key but use a new immutable uploaded version.
Changing dimensions, scale, anchor, collision compatibility, interaction compatibility, or rotation
coverage requires validation and review before activation.
