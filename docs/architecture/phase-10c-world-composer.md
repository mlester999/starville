# Phase 10C World Composer and revision lifecycle

Status: locally implemented; hosted validation pending, including migration validation, and owner
acceptance pending. No hosted world, asset, configuration, or database record was changed while
preparing this implementation.

## Purpose and lifecycle

The World Composer is the authorized administrator workspace for arranging Starville’s modular
isometric manifests. It reuses the same structured map projection, managed World Asset rendering
configuration, collision geometry, depth anchors, interactions, spawns, and exits used by preview
and game runtime code. It does not flatten a world into a background image and does not let browser
state become publication authority.

The supported lifecycle is:

```text
Active World Asset
→ Use in World Draft
→ Compose
→ Save Revision
→ Validate
→ Game Test
→ Record Passed
→ Review Publish Impact
→ Publish
→ Public Players Receive Revision
```

An active World Asset is merely eligible for selection. It is not automatically present in any world
and it is never activated or approved by the Composer. “Use in World Draft” opens an existing
editable draft head with the selected asset preselected. Placement creates a logical object
referencing the asset key; the server resolves and retains the exact active immutable asset-version
pin when the revision is saved.

Version pinning is deterministic: saved and published objects retain an exact immutable World Asset
version, so changing a canonical asset's active pointer cannot silently change an existing world.

## Composer behavior

The asset palette is server-projected and filters to authorized active candidates. It supports
search, asset type/category, interaction compatibility, approved production assets, and explicit
development markers. An administrator first previews a placement as an ephemeral canvas object, can
drag it within safe-save bounds, and then confirms or cancels. The preview is not added to the
manifest, history, or database until confirmed and later saved.

Objects can be selected from the canvas or layer list. Select is the default tool; pointer or touch
movement of an existing object requires the explicit Move tool. Placement previews remain draggable
only while placement mode is active. Dragging transforms screen deltas back into logical isometric
coordinates and clamps them to the manifest’s safe-save bounds. A drag updates the visual preview
continuously but commits one manifest history entry only on pointer release. Alt+Arrow provides fine
0.125-unit keyboard nudge and Shift+Alt+Arrow provides 0.5-unit nudge. Duplicate offsets by half a
tile. Snap, align-center, saved-position reset, scale reset, and bounded scale controls remain
draft-only.

Rotation options come from the exact pinned World Asset version when available, otherwise from the
authorized active candidate. PostgreSQL independently verifies the stored rotation against that same
pinned version, so a crafted client cannot use unsupported rotation values. Logical Y remains the
base depth coordinate; the renderer combines it with the managed foot/depth anchors. Collision,
spawn, exit, interaction, and terrain layers stay structured and independently validated.
Gameplay-relevant removals require confirmation and validation catches dangling or incompatible
behavior.

Local undo and redo are bounded browser-session history. They are not database rollback. Unsaved
navigation, discard, preview, Game Test, and validation states are explicit. Saving an unchanged
manifest returns `unchanged`. Saving a changed manifest inserts a new immutable revision and
advances the server-owned draft-head pointer; the prior draft remains inspectable. The editor
replaces its URL with the returned revision UUID.

## Revision model

`world_draft_heads` contains the one mutable routing pointer per world. Content lives in
`world_map_versions`. Every accepted changed save inserts a successor with
`derived_from_version_id`, clones retained asset pins, resolves only newly introduced active asset
keys, stores a bounded change summary, and advances the head under optimistic locking. Expected head
UUID, edit version, checksum, and request ID prevent stale overwrite and support idempotent retry.

`world_revision_metadata` records lineage and structured summaries: object
additions/removals/moves/modifications, asset-binding changes, collision/interactions/exits/spawns,
terrain, and bounded metadata changes. Revision history exposes UUID, number, lifecycle, validation,
source relation, publication relation, and Game Test state. Historical pages are read-only.
Comparisons are structured-data comparisons rather than pixel diffs.

Validation checks manifest schema, bounds, collision and interaction semantics, exit destinations,
exact asset pins, processed-runtime availability, and pinned supported rotations. A valid draft
becomes a validated immutable source; validation may attach evidence fields but cannot rewrite its
manifest.

## Game Test, publication, and rollback

Game Test accepts an exact validated, published, or superseded revision UUID with expected
checksum/edit version. Sessions are private, short-lived, token-hash backed, and excluded from
public realtime. Passed/failed/blocked/needs-changes evidence is append-only and revision-specific.
Saving a successor does not copy evidence: a pass remains historical and the new head is untested.

Publication requires `maps.publish`, AAL2, the exact current validated head, current public pointer,
current checksum/edit version, valid runtime pins, passed Game Test evidence for that exact
revision, maintenance clearance, and a short-lived actor/session-bound impact-review receipt. It
copies the validated source into a new immutable published revision, supersedes the old public
revision, atomically updates the map pointer, preserves the source, and records publication and
audit ledgers.

Rollback requires `maps.rollback`, AAL2, an acknowledged rollback review, an unchanged public
pointer, a historical published/superseded target, valid manifest/destinations/interactions, and
still-deliverable exact pins. Optional historical Game Test evidence is displayed in the review.
Rollback also uses copy-on-publication: it creates a new public revision derived from the historical
target. Neither the target nor the newer public history is reopened or deleted. “Restore as new
draft” is separate: it copies any historical revision to a new editable head for further changes and
revalidation.

Public player loaders continue to use only `world_maps.active_published_version_id` joined to a
lifecycle `published` row. Query parameters cannot select private drafts. New sessions use the new
public revision identity after publication or rollback; existing revision-scoped realtime cohorts
are not mixed with a different manifest identity.

## Current limitations

Composer selection is single-object, not bulk selection. Placement preview begins at map center
rather than a mouse-position drop. Collision geometry is edited through the structured inspector
rather than freehand drawing. Comparison is semantic data, not screenshot or pixel diff. No hosted
migration, hosted publication, hosted rollback, application deployment, or owner browser acceptance
was performed in this local task.
