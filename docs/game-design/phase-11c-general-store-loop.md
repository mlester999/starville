# Phase 11C General Store loop

Mira operates the Lantern General Store through the existing `phase7-general-store` world
interaction. The store supports ordinary supplies rather than permanent tools or special assets.

The player loop is:

1. Earn or retain canonical off-chain DUST.
2. Approach Mira in Lantern Square and open the General Store.
3. Buy a versioned seed, pantry ingredient, or ordinary material.
4. Use Phase 11A farming and Phase 11B cooking/crafting.
5. Sell eligible crops, Garden Salad, Garden Soup, or Garden Twine.
6. Inspect an immutable receipt and reconnect to the same authoritative state.

The shop has Buy, Sell, and Receipts tabs, search, category filtering, owned quantity, stock/restock
text, daily remaining limits, quantity selection, an explicit confirmation, authoritative
success/failure announcements, and receipt references. Stock and limits are never conveyed only by
color.

The tutorial requires the Phase 11B Hearth and Hands reward. Trusted events advance interaction,
open, required Moonbean Seed purchase, required Garden Soup sale, receipt inspection, return to
Mira, and reward receipt. The reward is exactly 15 DUST, lifetime one, and uses the canonical
`starter-shop-tutorial` source and append-only ledger. Failed, wrong-item, cross-player,
duplicate-replay, and Game Test activity cannot advance it.

Direct same-item resale profit is rejected at catalog validation. Farming may yield positive DUST
only after time-gated gameplay and bounded sale limits. Crafted-output values must continue to
account for ingredient opportunity cost. All current tuning is local and unpublished.
