# World Asset Manager Guide

This guide defines the Phase 7.5A operator vocabulary, upload requirements, art profiles, lifecycle,
and safe development-marker replacement workflow. The technical trust model is in
`docs/security/world-asset-storage.md`.

## Operator vocabulary

- **Development marker**: repository-owned procedural art used to make unfinished content
  recognizable. It is never represented as production art.
- **Production candidate**: a decoded and sanitized upload that has not completed approval and
  activation.
- **Approved asset**: an immutable version accepted by an authorized reviewer. It is not yet
  available for new map selection.
- **Active asset**: an approved version explicitly activated for new draft-world selection and
  immutable public delivery.
- **Deprecated asset**: a version hidden from new selection but retained for existing map
  references.
- **Archived asset**: a retained historical record that cannot be selected or mutated. Referenced
  versions remain deliverable.

## Accepted input

The initial pipeline accepts one static PNG or WebP image per upload. The API examines decoded
content; filename and browser MIME type are advisory only.

Rejected input includes SVG, HTML, scripts, executables, archives, renamed non-images,
animated/multipage images, corrupt images, files over the selected profile limit, unreasonable
decoded dimensions or pixel counts, and deceptive declared types. The server computes SHA-256 and
reports duplicate candidates without disclosing private storage details.

All accepted images are decoded and re-encoded as metadata-stripped WebP derivatives. Production
delivery never serves the original upload.

## Initial types

World profiles:

- building, shop, cooking station, crafting station, home entrance;
- decoration, tree, rock, fence, lamp, sign;
- terrain tile, bridge, farm plot, crop stage;
- furniture, home-interior object, interaction marker.

UI and inventory profiles:

- item icon, seed icon, crop icon, recipe icon, furniture icon, shop icon.

The upload screen is authoritative for the exact byte, dimension, aspect, transparency, rotation,
and render-size constraints for the selected profile. Profiles are code-reviewed configuration, not
arbitrary database JSON.

## General production-art checklist

- Use non-pixel artwork consistent with Starville's cozy isometric direction.
- Export a clean static PNG or WebP at the profile's supported dimensions.
- Use transparency when the profile requires an isolated object.
- Keep the object's foot/base contact point visually unambiguous.
- Do not bake a map, room, collision debug shape, label, shadow guide, or UI chrome into an object
  unless the profile explicitly calls for it.
- Keep illumination and cast shadows consistent across supported rotations.
- Ensure the object remains legible at its in-game render size and in a small thumbnail.
- Do not include secrets, personal metadata, source paths, hidden text, brand marks from other
  projects, or unlicensed material.

## Type-specific guidance

### Buildings, shops, and entrances

Use a transparent background. The ground-contact base must be narrower than any roof overhang and
should be visible enough to configure a logical collision footprint. Doors and interaction points
must align with the intended world-facing rotation. Do not include a surrounding terrain tile.

### Stations, furniture, and home-interior objects

Use an isolated transparent object. The base anchor must remain stable across rotations. Keep the
collision default tight to furniture feet or station base; interactive reach belongs to map gameplay
configuration, not the bitmap.

### Trees, rocks, fences, lamps, signs, and decoration

Use transparent margins only where needed for foliage, glow, or a cast shadow. The collision default
should represent the trunk, post, or ground-contact base, not canopy, glow, sign face, or roof-like
overhang.

### Terrain tiles, bridges, and farm plots

Match the isometric tile ratio and tile edge without a surrounding background. Avoid anti-aliased
edge halos. A bridge's default collision describes its solid structure; walkability and water
blocking remain map-authoritative.

### Crop stages

Upload each stage as an explicit immutable version/type entry according to the profile. Use
consistent anchors, scale, lighting, and transparent bounds across the sequence. Growth timing
remains server-authoritative gameplay data.

### UI and inventory icons

Keep the focal object centered within the safe inset and legible at the smallest preview size. Icons
contain no embedded labels or counts. Item identity, ownership, rarity, price, and inventory
behavior are not encoded in artwork.

## Configuration

After successful processing, configure:

- friendly name, slug, category, and bounded tags;
- logical render width, height, and scale;
- render anchor, player-foot anchor, and depth anchor;
- allowed/default rotations; and
- optional `none`, rectangle, or capsule collision default.

Anchors and collision use logical world coordinates. Preview overlays are a visual aid; numeric
values are the persisted source of truth. Collision defaults are suggestions for new placement.
Replacing a visual keeps a map's current collision unless an authorized operator explicitly confirms
the impact.

## Lifecycle and approval workflow

1. **Draft**: an upload intent/configuration can be changed by an uploader.
2. **Processing**: the trusted API verifies and sanitizes the image.
3. **Validation failed**: a safe code and bounded checks explain why a new attempt is needed.
4. **Validated**: all authoritative file/profile checks passed.
5. **In review**: configuration and sanitized previews are frozen for review.
6. **Approved**: an authorized approver accepted the immutable candidate.
7. **Active**: an authorized activator released immutable derivatives and made the version
   selectable in draft editing.
8. **Deprecated**: hidden from new selection; existing references remain safe.
9. **Archived**: historical record retained after reference checks.

Upload, validate, review, approve, activate, and deprecate are distinct permissions. Consequential
operations require a reason, expected record version, and idempotency key. The actor who can upload
is not implicitly allowed to approve or activate.

## Safe marker replacement

1. Open an editable draft in World Editor.
2. Select the development-marker object.
3. Choose **Replace visual asset**.
4. Select an active approved version. Development markers appear only after the explicit
   development-art filter is enabled.
5. Review the object identity, references, anchors, and collision impact.
6. Confirm that the map's current collision remains unchanged and must be revalidated against the
   replacement artwork.
7. Confirm the replacement.
8. Verify that object ID, position, kind, scale, interaction, destination, shop, station, farm, and
   home configuration are unchanged.
9. Save, validate, and inspect Draft Preview through the existing versioned map workflow.
10. Publish only after separate owner approval.

Replacement never mutates a published version. Batch replacement performs the same preflight for
every affected object and is rejected when an unsafe or incompatible change is detected.

## Owner manual acceptance checklist

- [ ] Open World Assets with an authorized administrator.
- [ ] Upload a valid transparent PNG.
- [ ] Confirm helper text matches the selected asset type.
- [ ] Confirm upload and processing progress are announced.
- [ ] Compare the authenticated no-store original with the sanitized preview and thumbnail
      derivatives.
- [ ] Configure anchor and render size using pointer and keyboard/numeric input.
- [ ] Configure and preview collision.
- [ ] Validate and submit for review.
- [ ] Approve with a role that has both `assets.review` and `assets.approve`.
- [ ] Activate with a role that has `assets.activate`.
- [ ] Confirm the active version appears in World Editor.
- [ ] Replace one Phase 7 development marker in a draft.
- [ ] Confirm object ID, position, and interaction configuration are unchanged.
- [ ] Save and validate the draft.
- [ ] Open Draft Preview and confirm art, collision, and depth sorting.
- [ ] Confirm the old published version remains unchanged before publication.
- [ ] Publish only after explicit owner approval.
- [ ] Confirm upload, processing, review, activation, replacement, and publish audit records exist.
- [ ] Confirm unauthorized roles cannot upload, approve, activate, or deprecate.
- [ ] Confirm duplicate upload handling is safe and idempotent.
- [ ] Confirm referenced version deletion/archival is blocked or safely retained.
