# Phase 11B crafting operations

The Admin Portal crafting workspace is under **Game Content → Cooking & Crafting**. It provides
bounded recipe/workstation/job visibility and intentionally does not grant raw table access or
arbitrary job editing.

## Permissions

- `crafting.read`: content, jobs, telemetry, and audit summaries.
- `crafting.player_read`: one player’s tutorial, workstations, jobs, and pending reconciliation.
- `crafting.content_manage`: immutable recipe successors and workstation policy updates.
- `crafting.liveops`: start/collection/unlock/reward/fee/local-duration controls.
- `crafting.job_reconcile`: bounded recovery requests.

Game administrators and live-operations managers receive all five. Content managers receive
read/content management. Customer support receives read/player read. Read-only analysts receive
read. Super administrators inherit the full system catalog. Sensitive operations require AAL2.

## Recipe lifecycle

Search and filter recipes by cooking/crafting. Inspect the active immutable version, ingredients,
output, duration, workstation, unlock rule, batch limit, fee, active-job count, and compatibility
warnings. To change behavior, create a successor version with the expected current version and a
reason. The prior version stays immutable for historical jobs. Referenced definitions and versions
are never destructively deleted.

Before activating a successor, review warnings for missing station placements, disabled content, and
active jobs pinned to the prior version. Existing jobs keep their snapshot and remain collectable.

## Workstations and live operations

Workstation updates are limited to queue capacity, interaction radius, enabled state, and expected
configuration revision. Disabling a station blocks new starts but preserves owner reads and
collection of existing work. Queue reduction does not rewrite active jobs; warnings expose
conflicts.

Live-ops controls independently gate cooking starts, crafting starts, collection, tutorial unlocks,
tutorial rewards, fees, and local durations. Every change requires the expected revision and an
operator reason. Prefer the smallest control necessary and restore it with another audited change.

## Job inspection and recovery

Inspect player, station, recipe/version, status, timestamps, snapshots, state version, output
settlement reference, failure code, and reconciliation state. Never promise output before the ledger
confirms collection.

For a genuinely stuck or failed job:

1. Confirm player identity and current job state.
2. Check inventory capacity, original station, completion time, and event/audit history.
3. Request bounded reconciliation with expected job version, idempotency key, and a specific reason.
4. Let the worker process the queue; do not alter records manually.
5. Re-open the player view and verify evidence, inventory history, and job state.

Queue-full is not a failure: the player must collect Ready output. Inventory-full is recoverable by
freeing a slot and collecting again. Already-collected and idempotent replay results require no
correction.

## Troubleshooting

- **Recipe locked:** inspect unlock prerequisite and tutorial/farming status; do not grant output
  manually.
- **Wrong workstation:** recipe and station categories must match.
- **Job appears overdue:** readiness is derived from server time; request bounded reconciliation if
  persistence has not caught up.
- **Collection fails:** check collection live ops, proximity/home, revisions, inventory capacity,
  and job ownership.
- **State conflict:** reload and retry with current revisions and a new intent key when appropriate.
- **Art fallback:** development markers are expected until an approved, pinned asset is available.
