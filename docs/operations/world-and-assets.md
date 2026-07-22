# World and asset publication runbook

Starville worlds remain modular isometric tilemaps, tilesets, structures, and object layers. A
flattened world image and pixel art are prohibited. Publication changes a version pointer; it does
not overwrite immutable source history.

## World publish and rollback

1. Confirm `worlds.publish`, AAL2, the exact environment, change identifier, and intended
   map/version/revision.
2. Review validation results: manifest/schema, coordinates, layers, transitions, collision, spawn
   safety, object references, size limits, and referenced asset availability.
3. Complete preview/game-test evidence at supported desktop and narrow layouts. Verify
   server-authoritative interaction/settlement and bundled fallback behavior.
4. Compare the currently published revision immediately before publishing. Submit the protected
   publish action with reason, expected revision, and idempotency context.
5. Verify the public manifest, world topology, spawn, transitions, Realtime population binding, and
   representative interactions. Preserve the publication and audit IDs.

Rollback selects a previously reviewed immutable world version through the protected rollback
action. Keep maintenance enabled if player safety or topology is uncertain. Verify active sessions
revalidate safely; never delete a failed version or rewrite audit history.

Production version selection is a product-owner gate. Local V3 evidence does not authorize
production publication.

## Asset activation and recovery

1. Confirm `game_assets.publish`, AAL2, asset/version identity, immutable file metadata, review
   state, validation/coverage evidence, and all world references.
2. Ensure the object is served through the approved asset route/storage boundary. Reject SVG/script
   content, external arbitrary URLs, private intake URLs, oversized variants, or mismatched hashes.
3. Activate with the expected revision, reason, and current intent. Verify rendered scale, depth,
   collision alignment, fallback, mobile memory, and representative world scenes.
4. Observe errors and performance for the agreed window. Never remove V1 while a candidate is
   active.

Recovery uses `restore_admin_game_asset_bundled_default` or reactivates another owner-accepted
immutable version. V1 is the current accepted fallback. V2 and V3 are inactive candidates until
owner acceptance; missing assets must fall back safely instead of producing a broken or external
URL.

## Evidence and concurrency

Evidence includes manifest hash, asset/world version IDs, reviewer and publisher, expected/actual
revisions, validation output, screenshots, smoke checks, and rollback result. A stale revision or
idempotency mismatch is a stop condition, not a reason to retry blindly. World and asset publishers
must not bypass Admin/API/database functions with direct table updates.
