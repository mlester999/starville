# Phase 8C nearby social interaction architecture

Phase 8C extends the authenticated Phase 8A socket and Phase 8B safety boundary with nearby inspect,
item gifts, and mutually confirmed item trades. It does not create a second socket or trust a
browser for identity, position, world, channel, ownership, balance, eligibility, revision, or
settlement.

## Authority flow

1. The browser sends strict intent containing only a target public presence ID or an existing
   interaction ID, an opaque request ID, and bounded item/quantity/revision input.
2. The realtime server derives the actor from the authenticated connection. New inspect, gift, and
   trade requests require both players online in the same world version and channel and no farther
   than three logical world tiles. Both positions are checkpointed before the database operation.
3. PostgreSQL reloads the active sessions, moderation state, block relationship, world/channel,
   authoritative positions, item definitions, inventory, reservations, and current interaction
   revision. The database may reject a request even if the realtime preflight passed.
4. PostgreSQL writes the state transition, immutable audit entry, reservation changes, and any
   settlement receipt in one transaction. The server publishes only the returned safe view to the
   two participants and refreshes each participant's bootstrap.

No interaction crosses a world version or channel. A channel switch invalidates active pair work.
Maintenance, access revocation, suspension, or a failed session revalidation continues to close the
authenticated realtime session under the existing Phase 8A policy.

## Public inspect and selection

Remote Phaser entities are selectable by pointer/touch and through a keyboard-accessible nearby
list. Selection is local presentation state, not authority. It clears when the player disappears,
moves outside the configured distance, changes channel/world, or the local world reloads.

The public inspect payload contains only public presence ID, display name, public level, appearance
preset, world key/name, and channel number. It excludes wallet address, email, auth/access session,
IP, token balance, inventory, DUST, private home state, moderation details, and administrator data.

## Request and trade lifecycle

Gifts move `pending` to `completed`, `declined`, `cancelled`, `expired`, `invalidated`, or `failed`.
Trades move `pending` to `negotiating`; every offer replacement increments the revision and clears
both confirmations. Each player confirms the exact current revision. Only matching confirmations on
that same revision can settle.

Inventory offer rows become expiring reservations. Updating an offer replaces only the actor's
reservations. Cancellation, invalidation, expiry, and completed settlement release all reservations.
Completed receipts and their item rows are append-only. Idempotency records make retries return the
same authoritative result.

## Disconnect behavior

A negotiating trade is paused for a configured 30-second reconnect grace. The server publishes the
paused trade as an update, not as a completed or invalidated trade. Resume reloads the database's
exact revision and never accepts a client-restored offer. Missing the grace deadline invalidates the
trade and releases reservations. Pending gifts do not become offline gifts.

## Phase 8D boundary

Phase 8C deliberately defers parties, party chat, co-op activities, shared objectives, guilds,
friend systems, global marketplace, auction house, offline gifting, token transfers, Play-to-Earn,
and cross-channel interaction. Phase 8D may build party/co-op features only through a separately
reviewed authority model.
