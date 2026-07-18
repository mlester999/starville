# Phase 11D progression and balance

All numbers below are local development defaults and remain unpublished.

## Curves and sources

The skill curve cumulative thresholds are
`0, 40, 100, 180, 280, 400, 550, 730, 940, 1180, 1450, 1750, 2080, 2440, 2830, 3250, 3700, 4180, 4690, 5230`.
The Player Level thresholds are
`0, 80, 190, 330, 500, 700, 930, 1190, 1480, 1800, 2150, 2530, 2940, 3380, 3850, 4350, 4880, 5440, 6030, 6650`.
The initial cap is 20.

Initial event rules are intentionally small: prepare soil 2 Farming XP, plant 3, water 1, harvest
`6 + 2 × valid yield` capped at 20, collected cooking `10 + 4 × output` capped at 40, collected
crafting `8 + 4 × output` capped at 40, and a completed quest 20 Player XP. Skill events add half
their awarded XP to Player Level. Repeated watering is constrained by the canonical crop action and
unique source event rather than by trusting a client timer.

## Early progression intent

Farming reaches level 2 at 40 XP and level 3 at 100 XP. Cooking and Crafting reach level 2 at 40 XP.
Player Level 2 requires 80 XP and level 3 requires 190 XP. These values make one activity useful
without letting it bypass the connected farming, cooking, crafting, shop, and quest chapter.

Unlocks remain visible when helpful and explain the exact skill, level, or quest requirement.
Growing Roots follows the three existing tutorials and Farming level 2. Homegrown Help follows
Growing Roots and Player Level 2. A Place in Starville follows Homegrown Help and Player Level 3.

## Simulation policy

`@starville/progression-simulation` validates monotonic thresholds and projects time-to-level for
bounded player populations, event frequency, XP value, and multipliers. It reports dominant/weak
sources and warnings but never writes a curve, activates tuning, or migrates a player. Review
new-player, tutorial-complete, high-activity, duplicate-source, large-batch, multiplier, correction,
maximum-level, inventory-full, and pending-reward scenarios before publication.

The default live-ops multiplier is 1.0. An administrator may schedule 0.5–2.0 for a bounded UTC
window after review. No multiplier is automatically enabled, purchasable, or controlled by a client.
Daily thresholds generate investigation signals rather than silently confiscating ordinary progress.
