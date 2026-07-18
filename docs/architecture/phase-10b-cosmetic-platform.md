# Phase 10B cosmetic platform architecture

Status: locally implemented and verified; hosted migrations and signed-in owner acceptance pending.

## Scope and invariants

Phase 10B extends the Phase 10A modular avatar contract with server-authoritative cosmetic
ownership, a five-slot saved-outfit system, bounded emotes, cosmetic-only collections, and an
administrator operating area. It does not replace the canonical player, avatar profile, World Asset
Manager, DUST ledger, token-access, realtime admission, or platform-configuration systems.

Cosmetics grant presentation only. They grant no statistics, movement advantage, access authority,
inventory capacity, currency, token claim, tradable value, or administrator permission. There is no
purchase RPC. The cosmetic shop schema is a disabled preview whose database constraints require
`enabled = false` and `purchase_available = false`.

## Authority flow

1. The browser authenticates through the existing wallet-access cookie and submits a strict bounded
   command with an expected revision and request ID.
2. The API derives the wallet and hashed access session, enforces Origin, body-size, and rate-limit
   controls, and calls one narrow service-role RPC.
3. PostgreSQL resolves the canonical player, module state, ownership, active compatible content, and
   revision while holding the relevant row and advisory locks.
4. The database writes the mutation and its durable receipt or idempotency result atomically.
5. Avatar changes reuse the Phase 10A profile mutation path. Realtime receives only compact
   appearance references or a bounded server-authorized emote activation.

The browser never selects a trusted player ID, asset path, render order, price, reward, ownership
state, revision result, or public appearance identifier.

## Data model and ownership

| Relation                                                            | Purpose                                                                       | Lifecycle and ownership                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `avatar_content_definitions`                                        | Stable cosmetic identity, public display name, category and composition layer | Definition owns `display_name`; versions do not own public names         |
| `avatar_content_versions`                                           | Reviewed renderable content and active version                                | Existing Phase 10A lifecycle and World Asset references remain canonical |
| `cosmetic_acquisition_sources`                                      | Closed acquisition source catalog                                             | Server-managed; no browser writes                                        |
| `player_cosmetic_ownership`                                         | Current owned or revoked state for one player/definition pair                 | Server-authoritative compare-and-set state                               |
| `cosmetic_ownership_receipts`                                       | Grant, revoke, starter and collection evidence                                | Immutable after completion                                               |
| `player_cosmetic_loadouts`                                          | Up to five named selections with optimistic revisions                         | Player-owned through RPC only; selection is a closed Phase 10A shape     |
| `player_avatar_profile_history`                                     | Avatar revision history used by outfit application                            | Append-only evidence around the canonical profile                        |
| `cosmetic_emote_definitions`                                        | Stable emote key, duration, interruptibility and lifecycle                    | Server-authorized active registry                                        |
| `player_emote_entitlements`                                         | Which optional emotes a player may use                                        | Starter or server-issued entitlement                                     |
| `player_emote_wheels`                                               | Up to eight unique stable emote keys                                          | One revisioned wheel per player                                          |
| `player_emote_activations`                                          | Bounded activation evidence                                                   | Server-created; never a client-authored broadcast                        |
| `cosmetic_collection_definitions` and `cosmetic_collection_members` | Cosmetic-only set membership and optional reviewed reward                     | Draft/active/disabled lifecycle; no DUST or token reward type            |
| `cosmetic_collection_reward_receipts`                               | Exactly-once collection completion reward                                     | Immutable and request-unique                                             |
| `cosmetic_shop_settings` and `cosmetic_shop_offer_drafts`           | Future-safe disabled preview and draft-only structure                         | Purchases structurally impossible in Phase 10B                           |
| `cosmetic_settings`                                                 | Wardrobe, emote and collection operational switches                           | Controlled administrator settings boundary                               |
| `cosmetic_idempotency`                                              | Short-lived exact replay evidence                                             | Same request plus changed intent is rejected                             |

All Phase 10B public tables enable and force RLS. Direct privileges are revoked from `public`,
`anon`, `authenticated`, and `service_role`; the trusted service role receives only the reviewed
function grants it needs. Immutable receipt tables do not grant direct update or delete authority to
the service role.

## Wardrobe and outfit behavior

The Wardrobe response separates ownership from current usability. Each item reports `owned` or
`revoked`, whether an active compatible version is available, whether it is equipped, and the usable
version reference when one exists. Revoked and unavailable records remain visible so the player is
not misled into believing history vanished. Public names come from the stable definition.

Players may search and filter ownership and may save, rename, delete, and apply five outfit slots.
Every mutation is optimistic and replay-safe. Applying an outfit invokes the canonical Phase 10A
avatar profile authority; it does not create a second appearance profile or bypass compatibility.

Revocation changes the entitlement state, preserves its immutable receipt, removes invalid equipped
references through the canonical selection resolver, and falls back in this order:

1. keep every still-owned, active and compatible selected item;
2. use the active approved fallback for an affected Phase 10A layer when configured;
3. use the reviewed starter/default compatible layer;
4. retain the legacy appearance preset as the renderer safety fallback.

No fallback creates ownership, DUST, inventory, or public content.

## Emotes and realtime

The wheel contains at most eight unique stable keys. The server checks module state, player
entitlement, definition lifecycle, duration bounds, current session and channel before activation.
The realtime event contains only the presence/player reference, emote key, activation ID, start
time, and duration. Asset URLs, animation scripts, ownership history, grant reasons, wallet data,
and administrator data are excluded.

Emotes are interruptible only according to the reviewed definition. A rejected entitlement, disabled
module, stale channel, oversized key, or conflicting replay is not broadcast. Appearance refresh
continues to update the existing remote entity in place and preserves accepted position, direction
and movement state.

## Collections and shop boundary

Collection completion is computed from current server-authoritative ownership. A completed active
collection can grant at most one active reviewed cosmetic through a single transaction. The global
request lock and unique receipt prevent two concurrent claims from producing two rewards. Reusing a
request ID for another player or collection is a conflict.

Collections cannot reward DUST, `$STAR`, wallet access, gameplay power, items, land, or transferable
assets. The shop page is an honest preview: empty offers, no Buy control, no checkout route, no
wallet prompt, and no mutation function. Enabling purchases requires a separately authorized future
phase, migration, economic review, and owner publication.

## Compatibility

Phase 10B preserves the Phase 10A stable-key selection contract, active avatar versions, render
ordering, World Asset review, profile revisions, legacy fallback, and compact realtime appearance
reference. The forward reconciliation migration adds missing hosted definition/settings columns and
does not edit already-applied migration files. The companion avatar mutation repair deploys the
current create/update boundary and parses resolved accessory UUID strings without JSON quote casts.

An account with no cosmetic rows is bootstrapped idempotently. Existing profiles, appearance
revisions, DUST, inventory, rewards, wallet sessions, presence, world state, and published platform
configuration are not reset.
