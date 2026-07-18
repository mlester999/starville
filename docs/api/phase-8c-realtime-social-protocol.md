# Phase 8C realtime social protocol

All messages use protocol version `1` over the existing authenticated realtime socket. Unknown or
extra fields are rejected. Clients never send actor identity, world, channel, position, ownership,
balance, display name, completion state, or receipt content.

## Client intent

- `social.inspect.request`: request ID and target public presence ID.
- `social.gift.create`: request ID, target public presence ID, item slug, bounded quantity.
- `social.gift.accept`, `social.gift.decline`, `social.gift.cancel`: request and interaction IDs.
- `social.trade.request`: request ID and target public presence ID.
- `social.trade.accept`, `social.trade.decline`: request and interaction IDs.
- `social.trade.offer.update`: request/interaction IDs, expected revision, and the complete bounded
  item offer.
- `social.trade.confirm`: request/interaction IDs and exact expected revision.
- `social.trade.cancel`, `social.trade.resume`: request and interaction IDs.

Request IDs are 1–64 characters from the approved opaque alphabet. Item slugs, quantities, offer row
count, and total quantity are schema-bounded before the persistence boundary.

## Server events

- `social.bootstrap`: transferable inventory projection, pending requests, at most one active trade,
  recent immutable receipts, distance setting, and truthful DUST-transfer capability.
- `social.inspect.result`: safe public profile only.
- `social.request.received` / `social.request.updated`: participant-only gift/trade request state.
- `social.gift.completed`: completed gift plus immutable receipt.
- `social.trade.opened`, `social.trade.updated`, `social.trade.confirmation_changed`: exact
  authoritative trade revision.
- `social.trade.completed`: completed trade and immutable receipt.
- `social.trade.cancelled` / `social.trade.invalidated`: terminal non-settlement state.
- `social.interaction.error`: safe request ID, bounded error code, and optional retry delay.

Safe errors include unavailable/out-of-range/blocked players, expiry or revision change, restricted
or unavailable items, inventory capacity, paused trade, rate limit, access/maintenance change,
settlement failure, and persistence unavailability. Errors never include SQL, credentials, private
profile fields, or another player's inventory.

## Administrator HTTP surface

`GET /api/v1/admin/social-interactions` requires `social_interactions.read` and accepts bounded
type/status/search/page/page-size filters. `GET /api/v1/admin/social-interactions/:interactionId`
requires `social_interactions.audit.read`. Both are read-only; no endpoint edits a completed trade
or receipt. Persistence failures map to `SOCIAL_INTERACTIONS_UNAVAILABLE` without leaking internals.
