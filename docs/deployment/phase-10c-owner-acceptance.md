# Phase 10C owner acceptance checklist

Status: prepared but intentionally not marked passed. Perform only after owner review, the forward
migration is applied through the normal gated process, and hosted lint/database/RLS checks pass. Do
not use this checklist to justify an unreviewed publication.

Record environment, migration/release IDs, tester, date, browser/device, role, selected map/revision
UUIDs, result, and evidence location. Keep every item unchecked until personally verified.

## World Composer

- [ ] Open Lantern Square Draft.
- [ ] Select an existing object and confirm the inspector shows its exact asset and version.
- [ ] Pan without selecting; click without accidental pan.
- [ ] Move and rotate an object; verify keyboard nudge and touch/pointer drag.
- [ ] Duplicate an object and remove a draft object through confirmation.
- [ ] Undo and redo.
- [ ] Confirm the published world and player state do not change.

## Tree Pine and marker replacement

- [ ] Find Tree Pine in the palette and confirm its active version.
- [ ] Preview, drag, confirm, and render Tree Pine with the exact version.
- [ ] Check scale, reset, collision, logical depth, foot anchor, and supported rotations.
- [ ] Save a new immutable draft revision.
- [ ] Filter Development Markers, select the Tree Pine marker, and replace it with managed Tree
      Pine.
- [ ] Confirm intended position/object identity is preserved; validate and save.

## Revisions and Game Test

- [ ] Confirm a new immutable revision UUID/number and that the prior draft remains unchanged.
- [ ] View the stored change summary and compare with current public.
- [ ] Inspect multiple old revisions read-only.
- [ ] Open exact revision in Game Test; verify revision UUID/checksum and private isolation.
- [ ] Walk with WASD, jog with Shift, and test camera, collision, depth, assets, markers,
      interactions, entrances, exits, and spawn.
- [ ] Return to Admin and separately record Failed, Needs Changes, and Passed on controlled
      sessions.
- [ ] Save another revision and confirm the prior pass becomes Test Outdated for readiness.

## Local publication and rollback evidence

- [ ] In local fixtures only, review current public, proposed revision,
      object/asset/collision/spawn/exit/interaction/player/realtime impact.
- [ ] Confirm missing evidence, stale revision, stale public pointer, missing acknowledgement, AAL1,
      and incompatible pins fail closed.
- [ ] Explicitly publish locally; confirm a new published copy, atomic pointer change, retained
      validated source, and retained old public revision.
- [ ] Confirm the public Game Client loads only the selected new publication and new realtime
      revision identity.
- [ ] Select a prior publication, inspect/compare it, and optionally Game Test it.
- [ ] Review rollback impact and execute rollback locally.
- [ ] Confirm rollback creates a new public revision/pointer while the target and newer publication
      remain history.
- [ ] Restore a historical revision as a new draft and confirm the source remains immutable.

## Roles, security, responsive, and accessibility

- [ ] Verify Super Admin, World Designer, Game Administrator, Live Operations Manager, Moderator,
      Customer Support, Blockchain Operator, and Read-only Analyst against intended `maps.read`,
      `maps.edit`, `maps.preview`, `maps.publish`, `maps.rollback`, and audit permissions.
- [ ] Directly visit prohibited routes and call prohibited APIs; UI hiding alone is not accepted.
- [ ] Confirm public/ordinary authenticated users cannot enumerate drafts, save, publish, rollback,
      or select private revisions by query string.
- [ ] Confirm no raw Game Test grant, token hash, signed/private storage URL, service credential, or
      manifest secret appears in URL queries, logs, errors, or audit.
- [ ] Test desktop, tablet, and mobile, including 360×800, 768×1024, 1024×768, 1440×900, and
      1920×1080.
- [ ] Confirm no overlap/overflow, reachable controls, touch targets, visible focus, keyboard
      access, Escape/focus restoration, semantic headings/forms/tables, labelled state not reliant
      on color, reduced motion, increased contrast, loading/empty/error states, and usable scroll
      regions.

## Owner sign-off

- [ ] Hosted migration history contains the reviewed new forward migration exactly once.
- [ ] Hosted database lint reports no warnings or errors.
- [ ] Hosted database/RLS suites pass without repair or destructive reset.
- [ ] No unintended world, asset, configuration, player, wallet, balance, inventory, reward, or
      progression mutation occurred.
- [ ] Publication/rollback, if intentionally performed later, uses approved content, exact recorded
      revision/evidence/review, and a documented change window.

This local implementation did not run a hosted migration push, hosted lint, hosted database write,
hosted world publication, hosted rollback, asset approval/activation, deployment, player mutation,
commit, or Git push.
