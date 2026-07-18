# Phase 12B owner acceptance

Status: pending. This checklist is prepared exactly for owner review and is intentionally entirely
unchecked.

No hosted operation is authorized by this checklist. Any upload/activation exercise must use the
controlled local fixture described below unless the owner separately approves a specific hosted
development target.

## Bundled defaults

- [ ] Start the game without uploading assets
- [ ] Enter Lantern Square
- [ ] Confirm terrain loads
- [ ] Confirm buildings load
- [ ] Confirm trees, bushes, and flowers load
- [ ] Confirm interaction assets load
- [ ] Confirm no black boxes
- [ ] Confirm no missing assets during normal route

## General Store

- [ ] Find the store
- [ ] Confirm readable exterior
- [ ] Confirm correct collision
- [ ] Confirm interaction anchor
- [ ] Open store
- [ ] Confirm gameplay unchanged

## Cooking and crafting

- [ ] Inspect Cooking Hearth
- [ ] Inspect Crafting Workbench
- [ ] Confirm active and ready states where supported
- [ ] Confirm interactions unchanged

## Farming

- [ ] Inspect empty plot
- [ ] Plant crop
- [ ] Water crop
- [ ] Inspect all growth stages
- [ ] Harvest
- [ ] Confirm visual state follows authoritative state

## Housing

- [ ] Enter Decoration Mode
- [ ] Inspect furniture thumbnails
- [ ] Place furniture
- [ ] Rotate supported furniture
- [ ] Test unsupported rotation
- [ ] Confirm collision
- [ ] Save layout
- [ ] Confirm Game Client and preview match

## World Composer

- [ ] Open object palette
- [ ] Search asset
- [ ] Filter category
- [ ] Place bundled asset
- [ ] Inspect footprint
- [ ] Inspect collision
- [ ] Rotate asset
- [ ] Save draft
- [ ] Open Draft Preview
- [ ] Open Game Test
- [ ] Confirm visual parity

## Optional upload

- [ ] Open World Assets
- [ ] Select a stable asset key
- [ ] Upload a controlled replacement
- [ ] Preview
- [ ] Validate
- [ ] Compare against bundled default
- [ ] Confirm unauthorized role cannot activate
- [ ] Activate only in controlled local fixture
- [ ] Confirm same placed object uses replacement
- [ ] Restore bundled default
- [ ] Confirm placement remains unchanged

## Missing asset

- [ ] Load missing-asset fixture
- [ ] Confirm safe placeholder
- [ ] Confirm collision remains
- [ ] Confirm Admin diagnostics
- [ ] Confirm no secret path exposed

## Performance

- [ ] Test desktop
- [ ] Test tablet
- [ ] Test mobile
- [ ] Inspect initial loading
- [ ] Inspect world transition
- [ ] Inspect memory behavior
- [ ] Confirm no duplicate downloads
- [ ] Confirm no giant bundled file

## Accessibility

- [ ] Keyboard asset palette
- [ ] Keyboard version history
- [ ] Screen-reader labels
- [ ] 200 percent zoom
- [ ] Reduced motion
- [ ] Touch targets

Owner decision: [ ] accept [ ] reject [ ] revise. Record reviewer, timestamp, environment, exact
commit, migration list, manifest version, tested stable keys, uploaded fixture identity, and all
unresolved observations.
