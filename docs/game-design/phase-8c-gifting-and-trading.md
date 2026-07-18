# Phase 8C gifting, trading, and item eligibility

## Gifting rules

- The sender and recipient must be authenticated, eligible, online, in the same published world
  version/channel, within three logical tiles, and not blocked or suspended.
- A gift is a request, not an immediate browser-side mutation. Only recipient acceptance invokes the
  atomic database transfer.
- Decline, sender cancellation, expiry, access change, channel/world change, block, maintenance, or
  inventory-capacity failure transfers nothing.
- Acceptance is idempotent. Repeating it returns the existing completed outcome and cannot duplicate
  the item.
- Offline gifting is not implemented.

## Item transfer policy

Transferability is explicit content policy, mirrored by shared TypeScript contracts and database
columns. A normal item must be active, owned in sufficient unreserved quantity, within its minimum
and maximum transfer quantity, and marked giftable/tradable for that operation.

The starter watering can is a permanent, account-bound tool. Permanent tools, account-bound items,
disabled definitions, unavailable quantities, and out-of-bounds quantities cannot be gifted,
offered, reserved, or settled. Inventory capacity is rechecked at acceptance/settlement time.

## Trading rules

- One pending request becomes a negotiating trade only after the target accepts.
- Either participant may replace their complete item offer. Duplicate item rows and more than eight
  rows or 999 aggregate quantity are rejected.
- Every offer change increments the authoritative revision and clears both confirmations.
- A confirmation is meaningful only for the exact current revision displayed to the player.
- Settlement locks both profiles and relevant inventory/reservation rows in deterministic order,
  revalidates both offers and capacities, removes all outgoing quantities, adds all incoming
  quantities, writes one receipt, releases reservations, and marks the trade completed in one
  PostgreSQL transaction.
- Cancel, block, expiry, disconnect timeout, channel/world change, or access loss releases
  reservations and cannot partially transfer an offer.

## DUST policy

DUST transfer is disabled in Phase 8C. The current DUST ledger is server-authoritative but does not
yet provide the paired reservation/settlement semantics required to combine currency and items in
one deadlock-safe atomic trade. Adding a direct balance update would weaken the economy boundary, so
the client and bootstrap truthfully report `dustTransferEnabled: false`. Inventory and DUST continue
to persist independently; no wallet or blockchain transfer occurs.

## Deferred social economy

The global marketplace, auction house, player shops, offline gifts, token transfers, treasury
operations, and Play-to-Earn rewards are not implemented. Parties, co-op activities, and guilds are
reserved for Phase 8D or later.
