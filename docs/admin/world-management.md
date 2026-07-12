# World Management administrator workflow

## Routes

- `/worlds`: bounded directory with name/slug search, map status, sorting, pagination, empty/error
  states, active publication, open draft, and validation status.
- `/worlds/[mapId]`: stable identity, immutable version history, draft creation/continuation,
  preview/publish/derive actions, and recent map audit.
- `/worlds/[mapId]/editor?version=…`: structured draft editor.
- `/worlds/[mapId]/preview?version=…`: isolated validated draft preview.
- `/world-assets`: approved catalog metadata and the explicit upload limitation.
- `/world-audit`: bounded append-only audit browser.

Navigation and actions appear only when useful, but API and database authorization remain decisive.

## Editor

The editor supports grid/collision/spawn/exit overlays; layer and item selection; approved asset
placement; object position, scale, kind, and Y depth-base editing; rectangle/circle/capsule
collision creation and footprint editing; spawn creation, position, facing, purpose and enabled
state; all four exit trigger/destination fields; safe/camera bounds; metadata; deletion where safe;
up to 50 undo/redo steps; browser issue guidance; server validation results; and unsaved-navigation
protection.

The form serializes the structured editor state into a hidden server-action value. Administrators do
not edit raw JSON, scripts, markup, styles, SQL, or URLs. A draft save is optimistic on edit version
and checksum. A safe but semantically invalid draft remains editable and shows trusted blockers.

## Validate, preview, publish

Validation rechecks the exact saved checksum in PostgreSQL. A valid result changes lifecycle to
`validated`; invalid content remains a draft. Preview requires `maps.preview` and opens only a
validated version. Movement, collision, camera-style view, notices, and inert exits work locally;
there is no player save or economy effect.

Publication requires `maps.publish`, an explicit confirmation, a reason of 12–500 safe characters,
the current edit/checksum, and the expected active publication. Conflict returns 409 and never
silently overwrites another administrator. Successful publication is atomic and audited.

To restore old content, choose a published/superseded version and derive a new draft with a reason.
Historical rows are never edited in place.

## Asset catalog limitation

Phase 6 reads the reviewed 15-key repository-procedural catalog. Upload controls and endpoints are
not implemented because the repository does not yet have the complete safe image-processing/storage
pipeline. This is an intentional security limit, not a placeholder success state.

## Owner acceptance pending

An authenticated owner still needs to exercise directory, edit object/collision/spawn/exit, invalid
validation display, validated preview, publication reason/confirmation, history, derivation, audit,
responsive layouts, and a known unauthorized role. Phase 5 owner administrator acceptance also
remains pending and must not be inferred from Phase 6 automated results.
