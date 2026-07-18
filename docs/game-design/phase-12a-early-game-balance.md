# Phase 12A early-game balance

Status: deterministic local planning evidence, not hosted player behavior.

## Canonical assumptions

- Starter bootstrap remains exactly 250 DUST once and uses the existing ledger.
- Starter tools, Moonbean Seeds, starter furniture, canonical home, and the six-quest
  `Starville Beginnings` chain are unchanged.
- Moonbean production remains five minutes. Garden Soup remains 30 seconds.
- Farming, production, shop transactions, progression, and housing keep their Phase 11 rewards,
  costs, capacity, unlock, and idempotency rules.
- Phase 12A onboarding itself grants 0 DUST, 0 XP, and 0 items.
- Daily Rhythm v1 grants 0 DUST, 0 XP, and a non-economic completion mark.
- Candidate D remains an unpublished planning recommendation; no active economy pointer changed.

The initial daily catalog has eight eligible objective definitions across farming, production,
General Store, progression, housing, and social-readiness categories. Selection forces one farming
category plus two distinct non-farming categories. Social readiness is solo-safe because reviewing
owner settings is sufficient; no objective requires another player.

## Affordability conclusion

Phase 12A adds no mandatory purchase or housing upgrade. The first crop uses granted seed/tools, the
first furniture placement uses the starter Willow Chair, production recipes keep their existing zero
fee, and a store sale is allowed where a purchase is undesirable. Therefore the integration does not
create a new affordability dead end. Existing Phase 11 prices and quest rewards remain the economic
variables. Recovery does not solve affordability with unlimited grants.

The deterministic matrix starts from 250 DUST and models only existing canonical sources/sinks. For
every persistent row, `ending DUST = 250 + source - sink`. Inventory represents the recovered end
state after the modeled onboarding path, not a hosted measurement.

| Scenario                  | Minutes | Ending DUST |  XP | Blockers | Recoveries | Duplicate settlements | Source / sink | Affordable                  | Persisted |
| ------------------------- | ------: | ----------: | --: | -------: | ---------: | --------------------: | ------------: | --------------------------- | --------- |
| Minimum legal path        |      14 |         282 |  66 |        0 |          0 |                     0 |        39 / 7 | yes                         | yes       |
| Normal new player         |      18 |         297 |  86 |        0 |          0 |                     0 |        54 / 7 | yes                         | yes       |
| Skip optional guidance    |      15 |         290 |  76 |        0 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| Disconnect mid-onboarding |      20 |         290 |  76 |        0 |          1 |                     0 |        47 / 7 | yes                         | yes       |
| Own starter equivalents   |      16 |         290 |  76 |        0 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| Inventory full            |      22 |         290 |  76 |        1 |          1 |                     0 |        47 / 7 | yes after capacity recovery | yes       |
| Spend DUST early          |      18 |         274 |  76 |        0 |          0 |                     0 |       47 / 23 | yes                         | yes       |
| Crop delayed              |      28 |         290 |  76 |        1 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| Recipe delayed            |      22 |         290 |  76 |        1 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| Shop unavailable          |      25 |         290 |  76 |        1 |          1 |                     0 |        47 / 7 | yes after resume            | yes       |
| Social unavailable        |      18 |         290 |  76 |        0 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| UTC daily reset           |      19 |         290 |  76 |        0 |          1 |                     0 |        47 / 7 | yes                         | yes       |
| Repeated requests         |      18 |         290 |  76 |        0 |          0 |                     0 |        47 / 7 | yes                         | yes       |
| Game Test                 |      12 |         250 |   0 |        0 |          0 |                     0 |         0 / 0 | preview only                | no        |

The common ending inventory projection is one starter hoe, one watering can, one Moonbean, one
Garden Soup, and the Willow Chair placed in the home (zero in carried inventory). The inventory-full
path temporarily blocks output collection, frees capacity, then reaches the same state. The
starter-equivalent path recognizes existing ownership and issues no duplicate.

## Interpretation

The minimum and normal paths are planning estimates assembled from deterministic interaction time,
the five-minute Moonbean wait, the 30-second soup job, and modest navigation/reading buffers. They
are not retention or usability observations. The largest modeled delay is crop delay at 28 minutes.
The only recovery-heavy rows are reconnect/reset, inventory pressure, and shop pause; none produces
duplicate settlement. Candidate D remains preferable to a new daily DUST source because Phase 12A
has no evidence that added emission is needed.

Reproduce with:

```bash
pnpm exec tsx -e "import {runPhase12aSimulationMatrix} from './packages/player-experience/src/index.ts'; console.log(JSON.stringify(runPhase12aSimulationMatrix(),null,2))"
```
