# Phase 11A playable vertical slice

## Status

The complete personal-plot farming loop, owner-authorized private realtime, and audit-safe farming
content workspace are implemented and validated locally. Hosted validation and owner acceptance have
not been performed. No Phase 11A migration has been pushed and no hosted player, world, inventory,
crop, quest, or DUST state has been changed.

## Reused foundations

Phase 11A reuses the existing Starville systems instead of creating parallel authority:

- `player_profiles` and the existing wallet-to-player lookup remain the identity boundary.
- `player_homes` remains the one owner-bound private-home record.
- the Phaser runtime and validated map-manifest contract render both public worlds and the private
  home scene.
- `cozy_item_definitions`, inventory state, stacks, quickbar, append-only movement history, and
  `private.cozy_add_item` / `private.cozy_remove_item` remain the inventory authority.
- the Phase 9 DUST account, ledger, source registry, policy, and `private.cozy_apply_dust_delta`
  remain the reward authority.
- the existing home entrance RPC remains the Lantern Square access boundary.
- existing API authentication, origin enforcement, request IDs, rate limits, stable errors, Admin
  RBAC, AAL2 policy, RLS, and worker conventions remain in force.

## Personal plot model

Each player has at most one `player_homes` row. Phase 11A extends it with lifecycle, pinned template
version, current private coordinates, farming revision, and provisioning evidence.
`private.ensure_player_home_plot` takes a transaction-scoped advisory lock, reuses the existing
home, creates the eight versioned farming tiles once, and records append-only provisioning events.

The private runtime uses one canonical home template plus owner-specific state projection. Its
instance key is `personal-home:{home_uuid}`. It uses the normal Game Client renderer and validated
manifest contract. The public world map ID is not replaced with an invented map enum; the exact
private identity is carried by the owner home UUID and private bootstrap.

## Plot transition and isolation

The existing Lantern Square Home Entrance still validates the server-known public position and home
state revision. After entry, the client loads a trusted private runtime scene with the persisted
spawn, exit, and eight farming interactions. Public presence is disconnected and public position
persistence stops while the player is inside. Returning restores the last public runtime state and
public realtime channel.

The private runtime obtains a short-lived, one-use ticket from the authenticated API and joins only
`/private-home`. Admission pins the session to the ticket's player and home. The server returns a
bounded authoritative view and events after a monotonic cursor from the append-only
`cozy_private_plot_events` stream. Exit closes the private session before public presence resumes.
Private sessions never join a public room and do not publish private coordinates or presence.

No RPC accepts a player ID or plot owner from the browser. Farming tile lookup always joins through
the authenticated wallet's player and home. A UUID belonging to another plot returns
`farming_tile_not_found`.

## Inventory and starter grant

The additive item definition is `starter-hoe`, a non-stackable, account-bound permanent tool. The
existing watering can is reused. The published starter quest pins the hoe, watering can, Moonbean
seed, delivery item, quantities, and 25-DUST reward.

Quest acceptance is idempotent and atomic. It creates one quest instance and objective rows, ensures
the plot exists, grants only missing permanent tools, tops the starter seed quantity up to four, and
writes canonical inventory history. Retries return the stored response and cannot duplicate tools or
seeds.

## Farming state

Tile lifecycle:

`empty → prepared → planted → growing → mature projection → prepared`

Crop instances are separate immutable-history records. At planting they snapshot crop definition ID,
crop and item slugs, configuration revision, duration, stage count, deterministic yield, and
watering policy. Later crop-definition edits therefore cannot alter an existing planted crop.

- Prepare validates plot ownership, private-world state, server-known distance, hoe ownership, tile
  revision, cooldown, rate limit, and idempotency.
- Plant removes one seed, inserts the snapshot-pinned crop, updates the tile, records private
  events, and advances the quest in one transaction.
- Water validates the watering can and crop revision, then records `growth_started_at` and
  `matures_at` using database time.
- Growth is derived from timestamps. There is no per-crop polling job or destructive crop death.
- Harvest checks maturity, capacity, revisions, distance, cooldown, and idempotency before adding
  deterministic produce and resetting the tile to `prepared`.

## Starter quest and DUST

The published quest has nine ordered objectives:

1. Meet Willow Guide.
2. Receive the starter kit.
3. Enter the home plot.
4. Prepare two tiles.
5. Plant two Moonbeans.
6. Water both crops.
7. Harvest one mature crop.
8. Deliver two Moonbeans.
9. Receive the tutorial reward.

Objective progress is driven only by trusted database events. Delivery removes two produce, advances
the objective, applies the registered nonrepeatable `starter-farming-tutorial` source through the
canonical DUST helper, stores the ledger reference, and marks the quest reward claimed in one
transaction. The browser cannot choose the delivery quantity, yield, or reward amount.

## API and client

The trusted player API exposes one full vertical-slice read and strict intent-only mutations for
quest acceptance, soil preparation, planting, watering, harvesting, and delivery. Schemas reject
owner IDs, client timestamps, maturity flags, yields, inventory grants, and reward amounts.

The Game Client provides:

- Willow Guide dialogue and a compact nine-step quest tracker;
- keyboard and touch farming hotbar for hoe, watering can, Moonbean seed, and clear;
- owner-only tile prompts and server-derived growth progress/stage display;
- immediate reconciliation from the mutation response followed by a fresh authoritative reload;
- a private-home runtime using the existing renderer;
- one-use owner-authorized private realtime with cursor recovery and authoritative view refresh;
- public realtime and public persistence isolation while inside the home.

Development-marker glyphs are explicit fallbacks; no pixel art or flattened world background was
introduced.

## Worker and telemetry

The worker runs one bounded reconciliation batch of at most 100 rows. It can reconcile stuck
provisioning, impossible derived crop state, and quest settlement failures. It explicitly schedules
no per-crop timers.

Append-only provisioning, private plot, inventory, quest, DUST, and administrator audit rows provide
operational evidence. API mutations emit structured operation names and replay status without wallet
signatures, raw SQL, or secret data.

## Administrator content management

`farming.read`, `farming.liveops`, `farming.content_manage`, `farming.reward_manage`, and
`farming.player_read` separate inspection, availability controls, content changes, reward changes,
and player support. Every write requires a current administrator session, AAL2, trusted browser
origin, optimistic expected version, bounded reason, request ID, and append-only before/after audit.

- Item UUIDs and slugs are immutable. Safe fields increment `content_version`; referenced category,
  metadata, disable, and stack-limit changes are rejected when they would invalidate dependencies.
- Crop edits increment configuration and content revisions. Existing planted crop snapshots are not
  rewritten.
- Plot changes create a validated eight-tile successor and move only the active future-provisioning
  pointer. Existing homes keep their template UUID and version.
- Quest changes create immutable published successors. Accepted players keep their pinned version.
  DUST changes additionally require `farming.reward_manage` and create an economy-source successor
  whose compatible range covers all active immutable quest rewards.

## Remaining limitations

- Private realtime is mutation/event fanout and cursor recovery, not a per-crop timer service.
  Maturity remains derived from database timestamps on authoritative read or action.
- Item and crop definitions are audit-safe revisioned records rather than append-only version
  tables. Safety comes from immutable IDs, optimistic revisions, dependency guards, and planted-crop
  snapshots. Plot templates and quests use immutable successor rows.
- Willow Guide is present in the local canonical Lantern Square manifest and the quest tracker
  provides a fallback entry. No hosted world was published, so a hosted published revision will
  require the normal Phase 10C review and publication workflow later.
- Hosted migration validation, production-scale evidence, approved final artwork, and owner browser
  acceptance remain pending.

## Lifecycle

Meet Starter NPC → Receive Tools and Seeds → Enter Personal Plot → Prepare Soil → Plant → Water →
Grow → Harvest → Deliver Produce → Earn DUST
