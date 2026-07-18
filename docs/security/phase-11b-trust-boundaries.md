# Phase 11B crafting trust boundaries

## Authority

PostgreSQL is authoritative for workstation ownership and world placement, proximity, recipe
version, unlocks, ingredients, output, duration, completion, optional DUST fees, batch limits, queue
occupancy, inventory capacity, tutorial objectives, and rewards. The client submits intent only. The
API binds intent to the authenticated token-access wallet and never accepts a player ID, owner ID,
output, ingredient list, completion time, Ready state, fee, or reward amount.

All Phase 11B tables enable and force RLS, have no browser table grants, and define no permissive
browser policies. Only narrow service-role RPCs are executable. Functions use an empty
`search_path`, schema-qualified references, the existing suspension/rename/token-access checks,
owner-safe status codes, bounded inputs, and transactional row/advisory locking. Service credentials
and raw SQL errors are never returned or logged.

## Start and collect checks

Start rejects a station outside the active personal home, a foreign station, distance beyond the
versioned interaction radius, a disabled station, the wrong recipe category, a locked/disabled
recipe, queue exhaustion, missing ingredients, insufficient DUST, stale inventory/DUST/station
revisions, rate-limit exhaustion, or an idempotency conflict. Consumption and job creation share one
transaction.

Collect requires the original player, home, station, job, elapsed server time, expected
job/inventory/station revisions, enabled collection, and inventory capacity. Output comes from the
immutable job snapshot. Early, duplicate, foreign, failed, or canceled collection is denied.
Inventory-full failure leaves output attached to the Ready job.

The tutorial requires the completed Phase 11A farming quest, advances from server events, and
settles exactly 20 DUST through the existing ledger. Acceptance, progress, and turn-in are
non-repeatable and idempotent.

## Isolation and operations

Private-home realtime admission is scoped to one owner and home. Public-world and cross-home
subscribers cannot receive job events. Reconnect uses the authoritative snapshot/event cursor.
Client messages cannot mark a job complete.

Admin reads and writes require explicit crafting permissions. Sensitive writes require AAL2,
expected revisions, a reason, rate limits, idempotency, and append-only audit evidence.
Reconciliation is a bounded request, not a general-purpose state editor. Existing RLS, active asset
pins, publication safety, and economy history remain unchanged.

World Game Test has no production player-state mutation capability. It cannot create or collect
production jobs, consume inventory or DUST, or advance quests. No token claim, NFT mint,
marketplace, or on-chain settlement is introduced by Phase 11B.

## Verification map

- Shared contract tests reject client-authored settlement and completion fields.
- API tests cover canonical UUID intent and trusted-origin enforcement.
- PostgreSQL execution tests cover ownership, proximity/world checks, exact consumption, fees,
  queue-full rollback, offline readiness, inventory-full retry, duplicate collection, reward replay,
  RLS/grants, and volatility metadata.
- Worker tests cover bounded reconciliation without per-job timers.
- Realtime schemas accept only owner-safe job events and reject client completion event types.
