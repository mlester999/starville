# Phase 11E owner acceptance — pending

Nothing below is marked passed. Perform it only after separately authorizing hosted migration
validation, choosing a safe owner test account, and reviewing the local Tier 2 tuning.

## Prerequisites

- [ ] Load a player with the required Phase 11D milestone.
- [ ] Confirm the personal home exists.
- [ ] Confirm Willow Chair or tutorial furniture exists.
- [ ] Confirm the DUST balance.
- [ ] Confirm inventory and Home Storage.

## Decoration Mode

- [ ] Enter the personal home.
- [ ] Open Decoration Mode and confirm the owned-furniture palette.
- [ ] Select Willow Chair and confirm the local preview.
- [ ] Try an invalid zone and confirm rejection.
- [ ] Place in a valid zone, move it, rotate it, undo, and redo.
- [ ] Confirm the layout remains unsaved.
- [ ] Attempt to exit and confirm the unsaved-change decision.

## Save Layout

- [ ] Save the layout and confirm the furniture item decreases exactly once.
- [ ] Confirm furniture appears in the saved layout.
- [ ] Repeat the same request and confirm no duplicate placement.
- [ ] Disconnect, reconnect, and confirm the layout persists.

## Layout conflict

- [ ] Open the same home in two authorized sessions.
- [ ] Save one layout, then try the stale second save.
- [ ] Confirm conflict, no overwrite, and no duplicated or lost furniture.

## Furniture removal

- [ ] Remove placed furniture, save, and confirm the item returns once.
- [ ] Repeat the request and confirm no duplicate item.
- [ ] Fill inventory and storage, attempt removal, and confirm furniture is not lost.

## Storage

- [ ] Open Home Storage.
- [ ] Deposit an eligible item and confirm inventory decreases/storage increases once.
- [ ] Repeat the request and confirm no duplication.
- [ ] Withdraw it and confirm storage decreases/inventory increases once.
- [ ] Test storage-full and inventory-full protection.

## Home upgrade

- [ ] Inspect Tier 2 requirements and confirm the configured DUST cost.
- [ ] Attempt while ineligible and confirm denial.
- [ ] Meet local requirements and purchase the upgrade.
- [ ] Confirm DUST decreases once, home tier updates once, and capacity increases.
- [ ] Repeat the request and confirm no duplicate charge.
- [ ] Reconnect and confirm the upgrade persists.

## Tutorial

- [ ] Accept Home Sweet Home and receive or craft the required furniture.
- [ ] Place furniture, save the layout, deposit and withdraw storage, and inspect the revision.
- [ ] Complete the tutorial and confirm its reward once.
- [ ] Repeat interaction and confirm no duplicate reward.

## Game Test

- [ ] Open housing through Game Test.
- [ ] Place preview furniture, simulate a layout save, transfer preview storage, and simulate an
      upgrade.
- [ ] Confirm real furniture, inventory, storage, DUST, home tier, and quest remain unchanged.

## Administration

- [ ] Inspect furniture definitions and World Asset linkage.
- [ ] Exercise the canonical local successor/configuration validation workflow.
- [ ] Inspect placement footprint, home template, upgrade path, player home, and layout history.
- [ ] Run reconciliation and test the local dual-review correction workflow.
- [ ] Toggle the local Decoration Mode pause.

## Responsive and accessible behavior

- [ ] Test 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080.
- [ ] Confirm palette, selected inspector, Save Layout, storage, upgrade confirmation, and controls
      remain usable without overlap or horizontal overflow.
- [ ] Confirm keyboard order, visible focus, screen-reader labels/status, 200-percent zoom, reduced
      motion, and 44-pixel touch targets.
