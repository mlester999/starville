# Phase 11E housing DUST sink

Housing adds one off-chain DUST sink key, `home_upgrade`, to the canonical versioned economy sink
catalog. The published sink version permits only bounded positive costs, is reversible only through
the established correction/refund authority, and records the exact home and upgrade-version
reference.

The only initial local candidate is Cozy Home Tier 2 at 250 DUST. PostgreSQL selects that amount
from the active immutable upgrade version; the client cannot lower or replace it. Purchase locks the
player DUST account, home, storage projection, and upgrade state, then atomically appends the DUST
ledger entry, updates the balance, changes tier/capacity, records the upgrade transaction, emits
trusted progression/realtime evidence, and stores an idempotent result. Any failure produces no
charge and no upgrade.

The deterministic simulation evaluates affordability, capacity headroom, payload limits, replay
settlement count, and Game Test persistence. It reports `autoActivatesTuning: false`; it cannot
activate content or migrate players. The 250-DUST value is development-safe, unapproved, and
unpublished to hosted environments. Owner review must compare progression pacing, median balances,
storage pressure, placement usage, and DUST sinks/sources before any hosted decision.

Phase 11E does not use `$STAR`, Solana, NFTs, real money, paid furniture, paid capacity bypasses,
marketplaces, property trading, or rent.
