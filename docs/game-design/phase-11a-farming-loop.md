# Phase 11A farming loop

## Player journey

Willow Guide introduces one bounded tutorial. The player receives a permanent hoe, the existing
permanent watering can, and four Moonbean seeds. The Home Entrance leads to the player's private
starter cottage plot with eight garden tiles.

The required tutorial asks the player to prepare two tiles, plant two seeds, water both crops, wait
for one crop to mature, harvest it, and deliver two Moonbeans. Completion awards one canonical
25-DUST ledger credit. Repeated acceptance, harvesting, delivery, or network retries do not
duplicate items or DUST.

## Controls and feedback

- `1`: select hoe.
- `2`: select watering can.
- `3`: select Moonbean seed.
- `0`: clear farming selection.
- Touch users receive the same four actions in the farming hotbar.
- Each tile shows its state, contextual action, progress bar, and growth stage.
- The quest tracker shows completed objectives and opens the full Willow Guide panel.

The UI reports stable, recoverable messages for missing tools or seeds, excessive distance,
cooldown, stale revisions, early harvest, full inventory, disabled systems, and settlement failure.
A conflict refreshes the latest server state without replaying a different action.

## Growth and reconnect

Watering records server timestamps. Progress and visual stage are derived from `serverTime`,
`growthStartedAt`, and `maturesAt`, so closing the browser does not pause or accelerate the crop.
Reconnect loads the current authoritative projection. Crops do not die in Phase 11A.

Production Moonbean duration remains the canonical crop duration. A separate bounded local duration
exists for local fixtures and is disabled by default.

## Art status

The private plot, Willow Guide, tools, and crops use explicit processed development markers where
production artwork is not yet approved. They are not presented as final art, and the world is still
modular tile, object, interaction, and collision data.
