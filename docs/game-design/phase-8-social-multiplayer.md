# Phase 8 social multiplayer boundary

This document originated as the Phase 4 boundary. Phase 8A now implements authenticated presence and
channels, Phase 8B implements bounded player chat and safety, Phase 8C implements nearby public
inspect, item gifts, and mutually confirmed item trades, and Phase 8D-A implements durable friends,
parties, private party chat, ready checks, and social persistence. Phase-specific architecture,
security, API, deployment, and acceptance documents describe each delivered slice.

Realtime play should target approximately 40 active characters per authenticated server channel and
create additional channels when population requires it. Switching must be safe and truthful: no
duplicate entity, cross-channel state leakage, false occupancy, or unauthenticated presence.

Chat is presented near the bottom-left with Nearby/Channel/System scopes. It has independent rate
limits, bounded text, moderation, report, mute/block, retention, and evidence boundaries and never
solicits or displays wallet secrets.

Nearby selection exposes only approved public fields such as display name, public level, appearance,
world, and channel. Distant players are removed from the interaction list and selection; range,
visibility, and performance limits are explicit.

Nearby interactions offer public inspect, eligible item gifts, and item trades. The server and
database validate proximity, connection, world version, matching channel, block/moderation state,
item policy, ownership, reservations, capacity, and exact revision. Gifts require recipient
acceptance. Trades require mutual consent, revision-clearing confirmations, atomic settlement,
cancellation/expiry cleanup, and immutable evidence. Clients never authoritatively transfer items or
currency. DUST transfer remains disabled until paired ledger reservations can settle in the same
transaction, and no social transfer sends a blockchain token transaction.

Guilds, clans, party-based co-op activities, shared objectives, matchmaking, visits, offline gifts,
marketplaces, auctions, and direct messages remain Phase 8D-B or later and require a separately
reviewed authority model.
