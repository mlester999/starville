# Phase 11D player progression architecture

Phase 11D adds one server-authoritative progression layer over the existing Phase 11A–C gameplay. It
creates no second profile, inventory, DUST ledger, recipe catalog, shop, or quest engine.

## Models and versioning

Three released skills—Farming, Cooking, and Crafting—use immutable skill versions and the explicit
20-level starter skill curve. Foraging, Fishing, Animal Care, Social, and Exploration are disabled
future definitions. Player Level is a separate 20-level hybrid projection: trusted skill XP
contributes 50 percent and bounded quest milestones contribute direct Player XP. Both curves store
every cumulative threshold in PostgreSQL. Earned progress pins its skill and curve versions;
activating a reviewed successor never silently migrates players.

Every XP rule is an immutable version selected through an active pointer. Farming grants come from
settled soil, planting, watering, and harvest events. Cooking and Crafting grant only when a
completed job is collected, never when it starts. Batch quantity scales through a bounded per-unit
component and event cap. Every grant records the authoritative source UUID, source table, rule
version, prior/resulting XP and level, request ID, idempotency key, and safe metadata. The unique
source index and row locks make replay exact-once.

## Settlement flow

1. A trusted Phase 11A–C transaction commits its canonical event.
2. A database trigger selects the active XP rule and locks player progress.
3. PostgreSQL rejects disabled skills/live ops, duplicate sources, invalid quantities, and unsafe
   configuration.
4. One transaction appends XP evidence, updates skill and Player Level projections, records every
   crossed level, grants eligible unlocks, advances quests/achievements, and emits owner events.
5. The client rehydrates the authoritative workspace and bounded owner-event cursor.

Normal gameplay never reduces XP. A correction requires the dedicated AAL2 workflow, an impact
preview, an expected revision, written evidence, and an append-only compensating event. Earned
unlocks are permanently grandfathered; the worker does not revoke rewards or manufacture XP.

## Unlocks, quests, and rewards

Unlock records are durable grants tied to an immutable configuration version. Initial examples cover
existing crops, seed shop entries, Moonbean Salad, Sunroot Soup, Willow Chair, the Growing Roots
quest, and a disabled future area-access foundation. Recipe, crop, and shop endpoints revalidate
these grants server-side. Active jobs, planted crops, inventory, and prior grants remain pinned and
safe across configuration changes.

`starville-beginnings` connects the existing Farming Introduction, Hearth and Hands, and General
Store Tutorial to Growing Roots, Homegrown Help, and A Place in Starville. Legacy chapters stay in
their original workflow; only `progression_chapter` quests use the new mutation RPCs. Objectives
advance from trusted level, harvest, collection, shop, NPC, unlock, achievement, and quest events.
Completion settles configured DUST, item, title, or badge rewards once. Inventory-full item rewards
remain pending and retryable.

Eleven initial non-repeatable achievements use exact-once event contributions. Hidden achievements
withhold their criteria until earned. Titles and badges are cosmetic profile projections only;
disabling presentation clears an active selection without deleting ownership.

## Client, Game Test, and operations

The HUD loads authoritative Player Level and one tracked objective on entry. My Starville Journey
contains overview, skills, quest journal, achievements, titles/badges, recent XP, unlocks, and
pending rewards. Focus/online recovery performs bounded rehydration; it does not run an unbounded
polling loop.

Game Test imports a static local progression fixture. It has no progression mutation client and
cannot create XP, unlock, quest, achievement, inventory, DUST, telemetry, or public profile rows.

Admin operations use granular RBAC, AAL2 for sensitive actions, optimistic revisions, immutable
successors, blocking validation, explicit curve activation, append-only audits, bounded live-ops
multipliers, private player inspection, correction previews, and reconciliation. Simulations return
planning output only and always report `autoMigratesPlayers: false`.

## Current boundaries

The event cursor is the Phase 11D reconnect/notification transport; a dedicated socket event is not
required for settlement correctness. Future skills, area access, housing upgrades, cosmetics,
inventory capacity, and additional reward kinds remain disabled foundations. This phase adds no paid
XP, booster, pass, token claim, NFT progression, marketplace, withdrawal, or on-chain reward.
