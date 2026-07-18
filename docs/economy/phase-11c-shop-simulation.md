# Phase 11C deterministic shop simulation

The local simulator uses seed `11301`, 100 synthetic players, 90 days, 250 starter DUST, 12
inventory slots, and a 2,000 DUST daily global sale cap. It reads no live data, changes no player
balance, and publishes no tuning.

| Activity        | Created | Destroyed |     Net | Median | Purchases | Sales | Stockouts | Restocked |
| --------------- | ------: | --------: | ------: | -----: | --------: | ----: | --------: | --------: |
| Low             |  65,485 |    16,324 | +49,161 |    398 |     1,041 | 1,106 |     1,076 |     1,780 |
| Baseline        |  67,857 |    17,212 | +50,645 |    265 |     1,172 | 1,331 |     3,564 |     1,780 |
| High            |  79,359 |    18,108 | +61,251 |    265 |     1,291 | 1,527 |     5,473 |     1,780 |
| Price-sensitive |  67,170 |    16,844 | +50,326 |    288 |     1,109 | 1,249 |     2,686 |     1,780 |

Covered paths include seed purchases, crop sales, Garden Soup, Garden Twine, purchased Flour to
crafted output, repeated farming cycles, buy/sell limits, global cap behavior under a stricter test
case, daily stock restock, two concurrent final-unit attempts with exactly one success,
inventory-full and insufficient-DUST branches, one tutorial reward, duplicate starter/reward
prevention, optional crafting fees, and a mid-run catalog price-version change.

The model identifies no direct catalog buy-to-sell arbitrage. The seed → timed farming → crop sale
loop is intentionally positive but is bounded by time, stock, and sale limits. Flour → Garden Soup
is not profitable after crop opportunity cost and the modeled optional crafting fee. The strongest
warning is repeated seed stockout pressure, especially at high activity. Net DUST remains
inflationary in the synthetic model because crop/crafted sales are sources; this requires hosted
evidence and owner review before any tuning.

Unpublished recommendations: keep same-item sell values below buy values, review the 20-unit seed
restock rather than changing it automatically, retain the tutorial reward at 15 lifetime-one, and
treat global sale-cap changes as reviewed live-ops configuration.
