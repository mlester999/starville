# Phase 11C General Store architecture

Phase 11C extends the canonical Phase 7 Lantern General Store and the Phase 9A off-chain DUST
economy. It does not introduce a second inventory, DUST account, world interaction, or shop
authority.

## Runtime flow

The canonical world interaction ID is `phase7-general-store`. A player must be authorized,
bootstrapped, active, in the exact Lantern Square world revision, outside a private home, and within
the server-defined interaction radius. The API passes intent only. PostgreSQL reselects the active
catalog entry, price, eligibility, stock, daily limits, inventory, DUST balance, and current
revisions.

`execute_player_shop_transaction` serializes player and catalog intent with transaction-scoped
advisory locks and row locks. One database transaction applies the inventory mutation, canonical
DUST ledger entry, stock/limit usage, immutable transaction, immutable receipt, event evidence, and
trusted tutorial objective. Any validation failure occurs before settlement.

## Catalogs and lifecycle

`economy_shop_catalogs` organizes the existing immutable `economy_shop_versions`. Catalog versions
are draft, validated, in review, published, or disabled. Published versions and entries remain
immutable. A successor clones entries into new IDs; it never edits historical versions. Validation
rejects protected items, invalid prices or stock policy, and direct same-item buy-to-sell arbitrage.
Publication and rollback move the controlled active pointer and preserve Phase 9A compatibility.

The initial version 2 catalog contains five buy entries and six sell entries. Seeds, Flour, Willow
Timber, crops, Garden Salad, Garden Soup, and Garden Twine reuse canonical item definitions.
Permanent tools and special items are excluded.

## Stock, limits, receipts, and events

Entries support unlimited, global-limited, per-player-limited, and hybrid stock. Restock policy is
none, fixed interval, daily UTC, or manual. The worker processes at most 100 due rows with
`FOR UPDATE SKIP LOCKED`. Player usage and the global sale-DUST cap use UTC windows and locked
counters.

Receipts preserve catalog version, quantity, unit price, total DUST, resulting inventory and
balance, and the canonical DUST ledger reference. Transaction, receipt, event, and administrative
evidence is append-only. Owner events contain private transaction and receipt detail. Player-public
events contain only allowed stock projections. Operations events are not returned to players.

## Rehydration and Game Test

Opening or reconnecting replaces client state with an authoritative workspace: identity, catalog,
prices, stock, limits, eligibility, DUST, inventory quantities, receipts, live-ops state, tutorial,
cursor, and server time. A bounded five-second cursor read runs only while the shop is open and the
document is visible; any event causes full workspace rehydration.

Game Test uses `GeneralStoreGameTest`, an in-memory fixture mounted by the secure preview route. It
imports no persistent mutation client and creates no database transaction, receipt, limit, stock,
DUST, inventory, quest, realtime, or telemetry record.

## Current scope

This phase is off-chain. It adds no `$STAR` transfer, claim, NFT, marketplace, auction, custody, or
token reward behavior. Managed General Store artwork remains a development marker until a separately
authorized asset workflow activates approved media.
