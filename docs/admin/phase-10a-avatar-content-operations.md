# Phase 10A avatar content operations

Status: protected workflows implemented locally; no content was published by this implementation
run.

## Workspaces

- `/game-content/avatars` — catalog and workflow overview
- `/game-content/avatars/catalog` — bounded search, filters, pagination and draft creation
- `/game-content/avatars/catalog/:definitionId` — structured definition/version editor
- `/game-content/avatars/assets` — avatar-specific approved World Asset references
- `/game-content/avatars/review` — immutable submitted-version queue
- `/game-content/avatars/validation` — non-mutating direction, animation and scale evidence
- `/game-content/avatars/presets` — curated starter combinations
- `/game-content/avatars/audit` — bounded append-only events
- `/game-content/avatars/settings` — module behavior independent from publication

All direct routes require the avatar module and backend authorization. The sidebar and section
navigation are not security boundaries.

## Asset preparation

Upload and review source artwork through the existing World Asset Manager. Do not create another
avatar bucket or paste a URL into Avatar Content. Use the supported avatar sprite-sheet,
layer-sheet, preview, thumbnail, palette, or accessory-sheet type. Confirm media type, dimensions,
frame grid, production status, and approval before selecting an exact asset version.

The Avatar Assets page is a reference workspace, not a duplicate intake tool. Source artwork remains
immutable. Mapping metadata can describe rows, columns, frame size, padding, direction/state
ordering, timing, loop behavior, anchors, offsets and preview scale without altering the stored
file.

## Draft authoring

1. Create a stable 3–80 character key and public name.
2. Choose the closed category and visual layer.
3. Describe the cosmetic clearly without identity judgments, ability claims, rarity speculation, or
   financial language.
4. Select compatible base body presets and required/incompatible layers.
5. Select only approved World Asset versions or a clearly labeled development fallback.
6. Configure all eight directions for idle, walk and jog.
7. Check shared frame dimensions, frame counts, foot anchors, offsets, render order, shadow and
   accessory overlap.
8. Save with the current revision. A stale editor must reload instead of overwriting newer work.

Do not use the editor to upload raw files, edit JSON, load an external URL, insert SVG or
JavaScript, or publish automatically.

## Validation preview

Validation is non-mutating. Exercise all eight directions, idle, walk, jog, representative skin
tones, hair, clothing, accessory overlap, shadow alignment, world scale, mobile scale, and
light/dark backdrops. Validation may create bounded evidence and findings; it must not approve,
activate, modify a player, update realtime presence, create a receipt, or publish an asset.

Resolve every blocking error. Warnings require an explicit human decision and evidence. Development
fallbacks must remain visibly labeled and cannot be described as final production art.

## Review and activation

The lifecycle is Draft → Validate → Submit for Review → Review → Approve → Activate → Supersede.

- Authors may edit only mutable draft versions.
- Submission freezes the reviewed payload.
- Reviewers accept or reject with a bounded reason and cannot silently edit.
- Approval is a separate explicit action.
- Activation requires an approved, current revision with valid approved asset references.
- Active content and child mappings are immutable.
- Superseding preserves history and existing compatibility behavior.
- Returning to an older version is a controlled activation, not an in-place rollback edit.

Every mutation uses a request ID, expected revision, narrow permission, rate limit and audit record.
Do not retry by inventing several request IDs after an uncertain response; retrieve current state
first.

## Starter presets and settings

A preset is a curated compatible combination, not a grant or economic item. Publish it explicitly
only after every referenced definition is active. Two competing publications for the same preset
must not create duplicate active versions.

Settings control whether customization is enabled, whether the creator is required for new players,
maintenance mode, the maximum accessory count and the active fallback preset. Settings never publish
content. Maintenance mode should preserve existing resolved appearances while blocking new
mutations.

## Superseding and incident handling

When an asset or definition must be withdrawn:

1. Preserve the original version and audit evidence.
2. Validate the replacement or approved fallback.
3. Review and approve the replacement through the ordinary lifecycle.
4. Activate it explicitly, then supersede the affected version.
5. Verify existing profiles resolve to a compatible active combination.
6. Verify appearance refreshes do not reset player position or create duplicates.

Never delete active content, directly update player selections, expose a private storage location,
or bypass review with a database console operation. Hosted actions require separate owner
authorization; this local Phase 10A run performs none.
