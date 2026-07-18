# Phase 11A owner acceptance checklist

Do not mark this checklist complete until the forward migration is deliberately applied to the
intended environment and the normal hosted validation window is approved.

## New player

- [ ] Create or load character.
- [ ] Enter Lantern Square.
- [ ] Find Willow Guide.
- [ ] Accept farming quest.
- [ ] Receive hoe, watering can, and four seeds.
- [ ] Repeat interaction and confirm no duplicate items.

## Home plot

- [ ] Use Home Entrance.
- [ ] Confirm personal plot provisions once.
- [ ] Confirm safe private spawn and eight reachable tiles.
- [ ] Confirm another player cannot read or mutate the plot.
- [ ] Leave and return to Lantern Square.
- [ ] Re-enter the same plot identity.

## Inventory and farming

- [ ] Confirm hoe, watering can, seeds, quantities, hotbar, inventory, and mobile controls.
- [ ] Prepare two tiles and confirm retry does not duplicate progress.
- [ ] Plant two Moonbeans and confirm each seed decreases once.
- [ ] Water both crops.
- [ ] Confirm visible growth stages.
- [ ] Disconnect through the local test duration.
- [ ] Reconnect and confirm authoritative progress.
- [ ] Harvest one mature crop and confirm produce is added once.
- [ ] Repeat harvest and confirm safe denial or replay without duplicate produce.

## Quest and DUST

- [ ] Confirm all objectives update from server actions.
- [ ] Return to Willow Guide.
- [ ] Deliver two Moonbeans.
- [ ] Confirm produce is removed once.
- [ ] Confirm one 25-DUST canonical ledger receipt.
- [ ] Repeat interaction and confirm no duplicate DUST.

## Public and preview safety

- [ ] Confirm the public realtime channel disconnects inside the private home.
- [ ] Confirm the private-home one-use ticket joins only the owner home and cannot be replayed.
- [ ] Confirm reconnect resumes from the private event cursor without cross-plot leakage.
- [ ] Confirm private plot state does not appear in Lantern Square.
- [ ] Confirm another player cannot use a captured tile UUID.
- [ ] Confirm Open in Game Test mutates no persistent inventory, crop, quest, DUST, player, or
      public world state.
- [ ] Confirm normal authorized gameplay does persist.

## Administration

- [ ] Inspect items, crop snapshot safety, template, quest, player farming state, and audit history.
- [ ] Verify read-only roles cannot change live operations.
- [ ] Verify content managers can make safe item/crop revisions but cannot change DUST rewards.
- [ ] Create a local plot-template successor and confirm only a newly provisioned player uses it.
- [ ] Create a local quest successor and confirm an accepted player remains pinned.
- [ ] With separate reward authority, create a local reward successor and verify the compatible
      economy-source range; do not adjust a player balance.
- [ ] With an approved AAL2 administrator session, record and reverse one bounded local
      live-operations change.
- [ ] Confirm no existing crop is deleted or rewritten.

## Responsive and accessible review

- [ ] 360×800.
- [ ] 390×844.
- [ ] 768×1024.
- [ ] 820×1180.
- [ ] 1024×768.
- [ ] 1280×800.
- [ ] 1440×900.
- [ ] 1920×1080.
- [ ] Keyboard-only navigation and visible focus.
- [ ] Screen-reader labels for quest, hotbars, progress, dialogs, and live status.
- [ ] Reduced-motion behavior.

## Known acceptance blockers

- [ ] Apply the three forward Phase 11A migrations only in an approved hosted window, then perform
      hosted migration, RLS, and function-lint validation.
- [ ] Complete this entire owner checklist against the intended environment; no item is pre-approved
      by local automated validation.
- [ ] Publish Willow Guide only through the reviewed Phase 10C world revision workflow after hosted
      migration approval.
