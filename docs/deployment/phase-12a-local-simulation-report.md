# Phase 12A local simulation report

Run date: 2026-07-18 Asia/Manila. Scope: local repository only.

The shared deterministic simulator executed fourteen required early-game scenarios. All persistent
scenarios retained non-negative DUST, beginner affordability, and zero duplicate settlements. The
Game Test scenario reported `persisted: false`, zero economic source/sink, and zero XP. The full
matrix and assumptions are recorded in
[`phase-12a-early-game-balance.md`](../game-design/phase-12a-early-game-balance.md). The shared Game
Test catalog separately provides all twenty-two requested bounded fixture states; each parses as
`persistence: game_test` and has no persistent mutation surface.

The isolated PostgreSQL harness applied every repository migration through
`20260718112000_phase12a_player_experience_admin_worker.sql`. It then passed the Phase 12A fixture
and all prior Phase 11 execution/concurrency fixtures. No hosted database, Auth identity, player,
inventory, DUST, progression, world, asset, or platform row was read or changed. The fixture also
proves revision-bound daily refresh, AAL2 denial, and idempotent draft-policy successor creation
without changing the active policy.

Limits: these are code-path and planning simulations, not observed completion times, retention,
drop-off, concurrency capacity, or production economy behavior. Hosted migration parity,
`plpgsql_check`, database lint, RLS identity tests, signed-in browser QA, and operator acceptance
remain pending explicit approval.
