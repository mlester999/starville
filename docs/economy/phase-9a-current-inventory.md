# Phase 9A current economy inventory

This inventory was traced from the current PostgreSQL functions and seeds, not inferred from product
ideas. DUST is an off-chain, integer, server-authoritative game currency. It is not withdrawable,
transferable between players, convertible to `$STAR` or SOL, or guaranteed to have cash value.

## Canonical authority

`player_dust_accounts` is the only current-balance authority. `player_dust_ledger` is append-only
single-entry balance history: every row carries a signed delta and resulting balance. Phase 9A adds
the balance before, safe public receipt, operation key, source/sink version, and correlation ID. The
deferrable account/ledger consistency triggers reject a committed balance change without its ledger
counterpart. This safe design was hardened additively; it was not replaced with a second balance or
rewritten as theoretical double-entry accounting.

## Real sources

| Source key               | Category          |                                Amount | Authority and caller                                                                     | Limits                                                                                      | Idempotency and audit                                                     | Enabled / tested                                 | Main risk                        |
| ------------------------ | ----------------- | ------------------------------------: | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `starter-grant`          | `starter_grant`   |                              250 once | `bootstrap_player_cozy_gameplay` → `private.cozy_apply_dust_delta`; API player bootstrap | one per account/wallet lifetime                                                             | bootstrap receipt plus unique cozy idempotency; DUST ledger               | yes / PostgreSQL replay test                     | repeat bootstrap                 |
| `shop-sale`              | `gameplay_reward` | canonical offer sell price × quantity | `transact_player_shop`; trusted player shop API                                          | item ownership, quantity, capacity/state versions, mutation limit                           | advisory request lock, response replay, inventory history and DUST ledger | yes / Phase 7 tests                              | circular selling or stale state  |
| `moonpetal-harvest-help` | `activity_reward` |            15 per rewarded completion | `private.cooperative_activity_settle`; realtime activity completion                      | 2 rewarded completions per UTC day; 300-second cooldown; exact contribution/objective rules | one reward receipt per completion/player, canonical DUST helper           | yes / Phase 8D-B execution and concurrency tests | collusive or repeated completion |

Published administrative credits and system refunds exist only as privileged resolution paths. The
retired migration-credit definition interprets history and is not an active gameplay source. Farming
harvests, cooking, and crafting currently grant or transform items; they do not grant DUST. No
quest, event, token, wallet, marketplace, or passive-income source exists.

## Real sinks

| Sink key              | Category        |                           Calculation | Authority and caller                                                                      | Limits                                                                                                                | Idempotency and audit                                                                                 | Enabled / tested                                                       | Main risk                         |
| --------------------- | --------------- | ------------------------------------: | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| `village-supply-shop` | `shop_purchase` |       published unit price × quantity | `purchase_player_economy_shop` wraps canonical `transact_player_shop`; trusted player API | published version, exact client price/version, daily limit, cooldown, proximity, capacity, balance and state versions | advisory request lock, original-response replay, DUST/inventory histories, immutable purchase receipt | yes / PostgreSQL stale-price, atomicity, replay and immutability tests | duplicate or stale-price purchase |
| `crafting-fee`        | `crafting_cost` | all published recipes are currently 0 | canonical crafting recipe field                                                           | not playable while zero/disabled                                                                                      | existing crafting idempotency                                                                         | disabled by design                                                     | hidden progression tax            |

Published administrative debits exist only through the reviewed correction workflow. The retired
migration-debit definition interprets history. There is no movement, chat, friendship, party,
channel, world-entry, gift receipt, recovery, rent, tax, durability, token, or transaction-fee sink.

## Initial baseline

The deployed-data baseline is produced by `get_admin_economy_overview` and daily worker rollups, not
fabricated in source control. It reports total supply, funded accounts, average/median/maximum
balance, lifetime and 30-day creation/destruction, daily estimates, source-to-sink ratio, per-source
and per-sink distributions, open risk signals, correction requests, and reconciliation mismatches.
Inactive balance percentage is returned as unavailable until activity history can determine it
without guessing. Median and p90 balance are also stored in `economy_daily_metrics`; broader
distributions are simulation planning metrics. No private wallet address appears in aggregate
output.

The current configuration values—250 starter DUST, 15 activity DUST, two rewards per UTC day, and a
300-second cooldown—are observed baselines, not promises that they are permanently balanced.

## Risk assessment

The most material inflation exposure is repeated activity emission if contribution, daily-limit, or
idempotency authority regresses. The main sink risk is stale catalog pricing or a partial
inventory/DUST settlement. Deterministic controls reject those cases. Velocity, pattern, linked
wallet, and concentration observations are bounded review signals only; they never auto-suspend a
player or rewrite a balance.
