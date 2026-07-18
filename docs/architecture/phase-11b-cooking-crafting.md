# Phase 11B cooking and crafting architecture

Phase 11B extends the Phase 11A personal-home and inventory authority. It does not replace the DUST
ledger, inventory settlement, quest, private-home realtime, RBAC, RLS, world-manifest, or Game Test
boundaries.

## Player loop

Harvest Ingredients → Use Workstation → Select Recipe → Start Job → Wait or Go Offline → Return →
Collect Output → Continue Tutorial

The initial owner-only home placements are a Cooking Hearth and Crafting Workbench.
`player_home_workstations` binds each placement to a player, home, world object, definition,
coordinates, interaction point, enabled state, and optimistic state version. The Game Client builds
interactions from these server UUIDs; it does not invent a station identity or enumerate another
home.

## Recipes and immutable versions

`cozy_recipe_definitions` holds canonical identity. `cozy_recipe_versions` holds immutable behavior:
category, required workstation, output, duration, optional DUST fee, unlock rule, discovery policy,
batch limit, and configuration revision. `cozy_recipe_version_ingredients` holds the immutable
per-batch inputs. `cozy_active_recipe_versions` is the active pointer.

The initial recipe set reuses existing Phase 7 identities and adds Garden Soup. Cooking includes
Garden Soup and the existing cooking definitions; crafting includes the existing crafting
definitions. A job pins its exact recipe version and snapshots ingredient quantities, output,
duration, fee, workstation definition, and configuration. A later successor version cannot change an
existing job.

Recipe unlocks are explicit in `player_recipe_unlocks`. Starter, Phase 11A completion, Phase 11B
tutorial acceptance, and collected-cooking prerequisites are currently implemented. Level, skill,
seasonal, and administrative grant rules remain typed foundations and are not claimed as live
progression systems.

## Transaction and queue model

The decision is **consume on start**. `start_player_workstation_job` validates the wallet-bound
player, active private home, canonical station ownership, proximity, station/category compatibility,
unlock, live-ops state, queue capacity, optimistic revisions, ingredients, DUST, quantity, and
idempotency. It then consumes exact ingredients and any enabled fee in the same transaction that
creates the job and snapshots. A rejected or rolled-back start consumes nothing.

Each station uses `bounded_owner_queue`; the initial capacity is two. Running and Ready jobs occupy
slots. A slot is released only after collection. Cancellation is deliberately disabled, so no
partially consumed refund policy is implied. Maximum batch quantity is versioned and the server also
derives the presently startable maximum from inventory, DUST, unlock, queue, and live-ops state.

## Job lifecycle and offline completion

The persisted lifecycle supports `pending`, `running`, `ready`, `collecting`, `collected`,
`canceled`, `failed`, and `blocked`. Normal Phase 11B jobs move through:

`running → ready → collecting → collected`

`started_at` and `completes_at` are server timestamps. Read projections derive remaining time and
readiness from the database clock, so disconnecting does not pause or lose work. The browser may
display a one-second, visibility-aware countdown, but it cannot complete a job. There are no per-job
server timers.

The worker calls `reconcile_phase11b_crafting` in bounded batches. It persists overdue running jobs
as Ready, records evidence, and processes explicit reconciliation requests with row locking and
`SKIP LOCKED`. Read and collect paths also recognize an elapsed server completion time, so
collection does not depend on the worker having run first.

## Collection and settlement

`collect_player_workstation_job` locks the owned station and job, rejects early, foreign, canceled,
failed, or already-collected jobs, and derives output only from the job snapshot. Inventory output
and the collected state commit together. If inventory is full, the job remains Ready and retains its
output; retrying after space is available settles once. The idempotency ledger makes a matching
retry replay the prior result and rejects a reused key with different intent.

Cooking and crafting tutorial objectives advance only from successful server collection events. No
client-supplied output, completion time, reward, quest progress, or fee is accepted.

## API, realtime, and Game Client

The player API exposes one owner-scoped read and four narrow mutations:

- `GET /api/v1/token-access/player/cozy/workstations/:workstationId`
- `POST /api/v1/token-access/player/cozy/workstation-jobs/start`
- `POST /api/v1/token-access/player/cozy/workstation-jobs/collect`
- `POST /api/v1/token-access/player/cozy/quest/workstations/accept`
- `POST /api/v1/token-access/player/cozy/quest/workstations/turn-in`

Requests carry canonical UUIDs, requested batch quantity, expected state versions, and an
idempotency key. Authentication, trusted origin checks, rate limits, schema validation, and
owner-safe errors remain in the API/service boundary.

The existing private-home channel can deliver `crafting_job_started`, `crafting_job_ready`,
`crafting_job_collected`, `crafting_job_failed`, and `workstation_queue_changed`. Admission is
independently authorized to one player and one home. These events are never published to Lantern
Square, and the client message protocol has no completion command.

The workstation panel provides recipe search, immutable version detail, required/owned comparison,
output, duration, fee, quantity, locked reasons, queue usage, jobs, progress, Ready announcements,
collect action, and tutorial progress. Missing production art uses explicit development markers; it
is not presented as approved art. Existing world depth and collision logic remains authoritative for
rendered objects.

## Game Test and persistence boundary

World Game Test remains an isolated, revision-bound, non-publication preview. It does not mount
production player inventory or Phase 11B mutation routes, create jobs, consume ingredients or DUST,
grant output, or advance quests. Any future workstation preview fixture must remain session-local
and non-mutating.

## Local fixtures and known limitations

`packages/database/test/fixtures/phase11b-postgres-execution.sql` provisions bounded local-only
players, homes, stations, ingredients, unlocked/locked recipes, DUST-fee cases,
running/Ready/collected jobs, queue-full behavior, inventory-full collection, tutorial progress,
reconciliation, ownership denials, and replay checks. Hosted environments are never seeded by this
fixture.

Known limitations: cancellation is disabled; production workstation/output art may still use labeled
fallbacks; failure remediation is bounded reconciliation rather than arbitrary state editing;
level/skill/season unlock engines are foundations only; owner acceptance and hosted migration
validation remain external follow-up work.
