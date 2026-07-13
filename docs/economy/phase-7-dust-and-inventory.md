# Phase 7 DUST and inventory

DUST is Starville's Phase 7 soft currency. It is always written as **DUST**, never `$DUST`.

DUST is an integer, entirely off-chain, non-transferable, non-withdrawable, and has no real-money or
`$STAR` conversion. It has no effect on token-gate eligibility and is not awarded from token
holdings. Phase 7 contains no player market, gifting, staking, claims, or play-to-earn rewards.

Each player has one current account plus an append-only ledger. The balance is a cached invariant;
trusted database functions update it and append the corresponding ledger entry in one transaction.
The initial grant is 250 DUST and is protected by the same idempotency and uniqueness rules as every
other value change. There is intentionally no administrator balance-adjustment action.

Inventory is server-authoritative and capacity-limited. Stack rules come from the versioned item
definition, not from the browser. Purchases, sales, planting, harvest, recipes, and furniture
changes lock and update DUST, stacks, movement history, and their domain state atomically. Failure
to receive an output leaves every input and balance unchanged.

The Phase 7 item categories are seed, crop, ingredient, cooked food, crafted material, furniture,
permanent tool, and special. Permanent tools cannot be consumed or sold. Inactive definitions remain
readable for existing ownership but cannot create new items.
