# Phase 11A trust boundaries

## Authority

The database is authoritative for plot ownership and lifecycle, inventory quantities, tool and seed
ownership, farming tile and crop revisions, timestamps, growth, maturity, yield, quest progress,
delivery quantity, and DUST settlement.

The browser sends only intent and expected revisions. Request schemas are strict and do not accept
player IDs, plot owners, coordinates, maturity, timestamps, yield, inventory deltas, quest
completion, or DUST amounts.

## Action validation

Every persistent farming RPC validates the wallet-backed player, moderation state, system
availability, rate limit, idempotency key, private home lifecycle, exact owner tile, server-known
private coordinates, bounded logical-world distance, required item, cooldown, and optimistic
revision. Distance uses logical world coordinates and a maximum configured radius of four; screen
pixels are never an authority.

Compound operations use one PostgreSQL transaction. Seed removal cannot commit without crop and tile
creation. Produce cannot commit without crop harvest and tile reset. Tutorial produce removal cannot
commit without quest and DUST settlement.

## Isolation and RLS

All new tables enable and force RLS. `anon`, `authenticated`, and `service_role` have no direct
table access. The trusted service role receives only reviewed public RPC execution. Private helpers
have execution revoked.

Public realtime is disabled while inside the private home, so private coordinates or farming events
cannot leak into Lantern Square. Direct cross-plot tile UUIDs fail owner-scoped lookup. A private
socket requires a short-lived one-use ticket issued for the authenticated owner home. Admission,
event reads, revalidation, cursor recovery, and close are service-only RPCs; a consumed ticket
cannot be replayed and a session cannot switch homes. Private sessions expose no public room or
presence.

## Replay and concurrency

Mutation receipts bind operation, player, idempotency key, and request hash. Reusing the same key
and payload returns the stored response. Reusing it for different intent returns
`REQUEST_ALREADY_PROCESSED`. Tile, crop, home, quest, inventory, and DUST records use expected
revisions or locked transaction state.

## Preview safety

World Game Test continues to mount no player persistence, Cozy gameplay, inventory, DUST, social,
chat, or public realtime systems. Its checkpoint and final-state callbacks are inert. Phase 11A
persistent RPCs are used only by normal authorized gameplay.

## Administration

Farming content reads require `farming.read`. Player farming inspection additionally requires
`players.read` and `farming.player_read`. Live-operations mutation requires `farming.liveops`. Item,
crop, plot-template, and quest changes require `farming.content_manage`; a changed quest DUST amount
separately requires `farming.reward_manage`. All mutations keep the trusted-browser origin boundary,
current verified administrator session, AAL2 enforcement, expected revision, bounded reason, unique
request ID, and append-only audit evidence. Audit foreign keys store the trusted
administrator-session UUID returned by authorization, never the caller-supplied auth-session UUID.

Referenced items cannot be deleted. Item dependency and stack guards reject unsafe updates. Planted
crops retain their stored snapshot. Existing homes and accepted quests remain pinned while active
pointers move only to validated successor rows. The active-template pointer and all farming tables
have forced RLS and no direct client or service-role table grants.

There is no balance editor, inventory grant, force-complete, arbitrary yield, destructive item
deletion, or crop-instance rewrite control.
