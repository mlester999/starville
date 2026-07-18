# Phase 10C World Composer operations

Status: local workflow ready; hosted validation and owner acceptance pending.

## Owner workflow

Open the Worlds directory with an authorized administrator account, select a world, and create or
open its current draft head. The detail page distinguishes current public, current editable,
validated, superseded, and historical revisions. “Inspect” always uses the canonical map UUID and
revision UUID. Only the exact draft head can open in the Composer; history is read-only.

In the Composer, use the layer list and canvas together. Click selects. Turn on Move tool before
dragging an existing object; Select is the safe default. Dragging empty canvas space pans after the
movement threshold, which avoids accidental selection. Touch uses pointer capture and cannot move an
existing object unless Move tool is active. Use Alt+Arrow for fine nudge and Shift+Alt+Arrow for
half-tile nudge. Rotation choices are limited by the selected pinned asset version. Review effective
scale, collision, logical Y/depth base, interactions, spawn/exit destinations, and
development-marker status in the inspector.

The asset palette shows only server-authorized candidates. “Use in World Draft” from a World Asset
opens this palette with that key selected; it does not alter the asset or the world. Choose Preview
placement, drag the ephemeral object if needed, then Confirm placement. Development markers require
the explicit marker filter. Replacing a marker preserves the logical object ID/location and creates
asset replacement audit evidence when saved.

Review changes, resolve local schema issues, and select Save draft. A changed save produces a new
revision UUID and number; an unchanged save produces no extra revision. A conflict means another
accepted save advanced the head: reload the newest draft and reapply intentional changes. Do not try
to overwrite the stale revision. Validate only a clean saved head. Validation failure leaves a draft
and identifies structured error paths.

Open in Game Test only after validation. Confirm the exact revision ID/checksum in the launch dialog
and real game client. Test spawn, walking/jogging, camera, collision, depth sorting, assets/markers,
interactions, entrances, exits, responsive behavior, and the absence of progression writes. Record
one explicit result with notes. Opening a session never auto-passes. A new saved revision makes the
earlier pass historical/outdated for publication readiness.

For publication, inspect the current public revision and candidate, compare semantic changes, review
object/asset/collision/spawn/exit/interaction/player and realtime impact, then acknowledge the
generated review. Publication is a separate AAL2 action and accepts only the short-lived receipt
bound to the same actor, admin session, candidate, public pointer, and passed evidence. A stale
pointer, missing/old test, maintenance state, invalid pin, or validation error blocks it.

For rollback, inspect a prior published/superseded revision, compare it with current public,
optionally Game Test it, review rollback impact, enter a bounded reason, and confirm with AAL2.
Rollback creates a new publication derived from the historical target. Use Restore as New Draft when
the old layout needs editing rather than immediate public pointer change.

## Permissions

- Super Admin receives all existing map authorities, including `maps.rollback`.
- World Designer retains the repository’s existing read/edit/preview/publish workflow but does not
  receive rollback by default.
- Game Administrator retains the existing read/edit/preview/audit workflow and does not receive
  publish or rollback by default.
- Live Operations Manager retains read/audit and receives the distinct reviewed rollback authority;
  it does not receive draft edit or ordinary publish authority.
- Moderator, Customer Support, Blockchain Operator, and Read-only Analyst do not receive world
  mutation authority by this phase.

Navigation visibility is convenience only. The Admin API and PostgreSQL recheck the exact
permission, verified admin session, expected revision, request shape, rate limit, and AAL2 where
required.

## Troubleshooting

- **Draft unavailable:** confirm the URL uses the current `draftHeadVersionId`; return to history
  and open the head.
- **Version conflict:** another save/publication changed the expected head or public pointer.
  Reload; do not force-write.
- **Validation failed:** focus the reported manifest path. Check bounds, collision sizes, enabled
  exits, destinations, interactions, assets, and supported rotations.
- **Revision unavailable:** a pinned asset version or processed raster is unavailable. Repair
  through the World Asset workflow; the Composer must not approve or activate it.
- **Game Test required/outdated:** record Passed evidence for the exact current validated revision.
- **Review required:** generate a new impact review while still in the same AAL2 session; receipts
  expire.
- **Maintenance blocked:** wait for the authorized maintenance policy to clear. Do not bypass it.
- **Historical revision incompatible:** inspect broken destinations/interactions/pins; restore as a
  new draft for repair instead of rollback.
- **Marker rendered:** inspect the pinned/active/rendered-version explanation. A missing derivative
  uses a safe repository marker and blocks unsafe publication where required.

## Local-only verification and handoff

The local PostgreSQL harness creates a disposable cluster, applies every migration, runs real
revision save, stale conflict, validation, Game Test evidence, review, copy-on-publish,
copy-on-rollback, RLS/privilege and audit assertions, then removes the cluster. This is not hosted
acceptance. The owner must separately review the migration, apply it through the normal gated hosted
process, run hosted lint/RLS/database validation, and complete the unchecked acceptance checklist.
Never edit an already-applied migration, repair history ad hoc, or publish a world merely to test
the administration UI.
