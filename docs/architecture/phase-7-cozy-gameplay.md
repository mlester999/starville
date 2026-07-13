# Phase 7 cozy-gameplay architecture

## Scope and status

Phase 7 adds a server-authoritative cozy-gameplay vertical slice on top of the Phase 3 access gate,
Phase 4 movement runtime, Phase 5 player controls, and Phase 6 versioned world. It does not add
multiplayer synchronization, player trading, a marketplace, on-chain rewards, quests, or any Phase
8/9 system.

The implementation is divided into three hard milestones:

1. 7A establishes the item catalog, off-chain DUST account and ledger, bounded inventory, eight-slot
   quickbar, idempotent starter bootstrap, and strict API contracts.
2. 7B adds six private farm plots, server-time crops, deterministic harvests, instant cooking and
   crafting, and fixed-price system shops.
3. 7C adds the private starter-home instance, owned furniture placement, the player UI, and
   permission-protected read-only administrator views.

## Authority boundaries

| Boundary                     | Responsibility                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@starville/cozy-gameplay`   | Strict public schemas, content definitions, response contracts, and canonical Phase 7 development content                       |
| Browser React UI             | Accessible presentation, intent collection, optimistic pending state, and authoritative response reconciliation                 |
| Phaser runtime               | Existing movement/world lifecycle plus typed interaction targets; React renders the development-only farm and home panels       |
| API cozy service             | Token/session/player checks, maintenance enforcement, input validation, safe error mapping, and response revalidation           |
| PostgreSQL trusted functions | Row locks, balances, capacity, ownership, server timestamps, recipes, prices, yields, placement, idempotency, and atomic writes |
| Admin API/portal             | Narrow permission checks and bounded, read-only operational inspection                                                          |

The browser never supplies a balance, price, recipe output, crop readiness timestamp, harvest yield,
ownership decision, or accepted furniture position. The API derives the wallet from the existing
HttpOnly token-access session and passes it to reviewed security-definer functions. Direct gameplay
table access remains revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`.

## Persistence model

Content uses stable UUIDs and slugs. Item, crop, recipe, shop, offer, furniture, and home-template
definitions are immutable-by-version configuration records. Player state is separated into DUST
accounts and append-only ledger entries, inventory stacks and append-only movement history, quickbar
assignments, personal plots, private home ownership, and placed furniture.

Every value-changing operation has an idempotency key and payload fingerprint. PostgreSQL locks the
player and affected state rows, rechecks player eligibility, and either replays the original safe
result or applies the full mutation once. DUST and item mutations share one transaction. Account and
inventory constraints prevent negative values, invalid stack sizes, duplicate slots, and unsupported
references.

Existing players upgrade lazily. The first valid gameplay bootstrap creates missing state and grants
250 DUST, the permanent starter watering can, six plots, one starter home, and configured starter
furniture exactly once. Reconnects and concurrent bootstrap calls do not grant duplicates and do not
change the public map or saved position.

## Time and reconciliation

Crop growth uses database timestamps. Watering records the growth start and ready timestamp from the
active crop definition; reads derive the visible state from server time. The client may animate
progress, but harvest eligibility is decided again inside the harvest transaction.

Mutation responses contain the updated bounded resource and state version. A stale version produces
`GAMEPLAY_STATE_CONFLICT`; the UI refreshes only the affected resource. Ordinary inventory or DUST
updates do not recreate Phaser. Focus/visibility reconciliation is bounded and does not introduce a
rapid whole-state polling loop.

## World and home integration

Public maps remain the five Phase 6 cardinal maps. Phase 7 adds typed, data-only interaction anchors
for farm plots, the system shop, cooking/crafting stations, and the home entrance. Existing
published hosted versions are never silently edited or published by migration.

Personal homes use a separate `personal_home` instance contract rather than a public `MapId`. Home
entry saves an authoritative public return destination, verifies ownership, and loads the owner's
template and placements. Furniture is grid-snapped and validated for bounds, rotation, collision,
blocked cells, spawn/exit clearance, and a safe route to the exit.

## Development art boundary

The repository has no approved production crop, food, station, home-interior, or furniture art.
Phase 7 therefore uses clearly identified, repository-owned development markers so behavior can be
validated without pretending visual acceptance is complete. Replacing those markers with approved
non-pixel production assets does not change the authority or persistence contracts.
