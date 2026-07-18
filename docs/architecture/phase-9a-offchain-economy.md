# Phase 9A off-chain economy architecture

Phase 9A hardens the existing DUST authority and adds planning and operations around it. It does not
implement Play-to-Earn, token payouts, custody, claims, conversions, staking, burning, deposits,
withdrawals, or blockchain transactions.

## Settlement and ledger integrity

All player mutations enter through a trusted API/realtime/worker boundary and a narrow PostgreSQL
RPC. `private.cozy_apply_dust_delta` locks the one player account, rejects a negative or excessive
result, honors the active published policy and active source/sink version, updates the balance, and
inserts one ledger row in the same transaction. The ledger preparation trigger supplies normalized
metadata for older Phase 7/8 callers. Its append-only trigger remains active.

A purchase takes locks and validates in this order: current player/moderation and trusted access;
maintenance and policy; active shop and exact published version; offer, canonical item and price;
daily/cooldown controls; current DUST/inventory state; capacity and funds. The existing canonical
shop transaction deducts DUST and grants inventory atomically. Phase 9A then writes a receipt tied
to the exact DUST and inventory history rows before commit. An advisory idempotency lock makes a
retry return the original receipt.

The Village Supply Shop reuses `cozy_shop_definitions`, `cozy_shop_offers`, and
`cozy_item_definitions`. It excludes permanent tools, special/protected items, inactive items, and
items without buy eligibility. It is a real sink, not a parallel catalog.

## Configuration lifecycle

Policies and shops use a reviewed presentation lifecycle of
`draft → validated → in_review → approved → scheduled or published`. Approval and scheduling are
stored separately from the original closed database lifecycle values so the forward repair does not
weaken published immutability. Inputs are structured and bounded; no arbitrary expression, SQL,
JavaScript, or raw JSON editor is accepted. Draft creators cannot approve their own version.
Published rows and their offers are immutable. Immediate publication is explicit; the bounded worker
activates only an independently approved scheduled revision whose effective time has arrived.

The active pointers allow rollback by publishing or reactivating a reviewed immutable version.
Global `economy_enabled`, reward, spending, and correction switches preserve reads, receipts,
balances, and history. Removing an active source, sink, or shop blocks new settlement; an atomic
transaction already holding its locks finishes as one transaction.

## Reconciliation, quarantine, risk, and corrections

Single-player, bounded global, and worker reconciliation compare stored balances with ledger sums.
Results are immutable evidence with `auto_corrected=false`. A mismatch creates an explainable risk
signal; it does not alter DUST.

`economy_reward_quarantine` durably models a held authoritative reward, source version, reason,
request, and review state without making it spendable. It is reserved for confirmed authority or
integrity uncertainty, not weak heuristics. Existing ordinary Moonpetal rewards still settle
immediately under their tested limits.

Corrections are signed deltas, never a set-balance operation. Creation captures before/after and an
explanation. A different reviewer settles low-value requests; values above the published threshold
require two distinct reviewers. Account drift, negative results, retries, and terminal edits are
rejected. Settlement writes the canonical ledger and administrator audit atomically.

Risk signals contain a safe category, severity, score, bounded evidence, deduplication key, and
review state. Worker velocity signals have `automaticPlayerActions=0`. No device fingerprinting or
invasive identity collection was added; the existing verified wallet/account relationship remains
the only wallet authority.

## Packages and services

- `@starville/economy` owns strict source, sink, policy, receipt, risk, correction, shop, and
  `$STAR` utility contracts.
- `@starville/economy-simulation` is a deterministic, seeded, isolated planning engine.
- API player routes expose summary/history, the published shop, and purchase. Admin routes expose
  bounded overview, ledger, reconciliation, correction/risk review, and simulation.
- The worker runs reconciliation, risk aggregation, privacy-safe daily metrics, and activation of
  already-approved effective versions. It never automatically corrects or punishes.
- The game client adds friendly DUST history and versioned Village Supply Shop settlement while
  preserving the Phase 7 sell path.
- The admin portal exposes aggregate operations without a generic balance setter.

## Platform boundary

`offchain_economy` and `economy_simulation` are enabled in local defaults. `star_utility` remains
disabled beyond the existing access gate. Module visibility hides entry points but never grants an
authorization permission. No active platform configuration was published by this work.
