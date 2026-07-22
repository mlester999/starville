# Phase 13D working-tree inventory

Captured before Phase 13D edits on 2026-07-22 in
`/Users/marklesteracak/Documents/Marky Files/Programming/starville`.

- Branch: `master`.
- Starting HEAD: `f9b6a08 chore: checkpoint Phase 12E technical beta candidate`.
- Starting tree: dirty, with 99 tracked paths changed (5,928 insertions and 872 deletions) and 79
  untracked status paths, 178 status paths total.
- Initial `git diff --check`: passed.
- Commissioning consequence: **PRODUCTION COMMISSIONING BLOCKED BY UNCOMMITTED RELEASE INPUTS**.

## Pre-existing classification

| Classification       | Preserved path families                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 12E            | `.env.example`, `README.md`, visual/audio/game settings, Game World, Admin beta-readiness, release reports, and local validation             |
| Phase 12F            | `assets/source-v3`, `assets/starville/bundled/v3`, V3 manifests/reports, Phase 12F references/docs, asset-pipeline V3 generation, and avatar |
| Phase 13A            | gameplay integration modules/tests, Gameplay Health, player-experience audit/journey, Phase 13A docs                                         |
| Phase 13B            | security hardening migration/tests, service/realtime/worker hardening, Phase 13B security and deployment docs                                |
| Phase 13C            | production manifests, release validator, operational capability model, Release and Live Ops, operations handbook, and Phase 13C docs         |
| generated output     | `next-env.d.ts` updates and generated asset reports already present at preflight                                                             |
| unrelated owner work | `.claude/`                                                                                                                                   |
| uncertain            | None deleted, renamed, reset, staged, or overwritten; any ambiguous overlap remains preserved                                                |

The detailed predecessor inventories remain in `phase-13a-working-tree-inventory.md`,
`phase-13b-working-tree-inventory.md`, and `phase-13c-working-tree-inventory.md`. Phase 13D does not
relabel the shared tree as Phase 13D-only work.

## Phase 13D-owned additions and overlap

Phase 13D adds the commissioning/evidence/freeze/catalog/audio manifests, provider-neutral
production templates, production target and migration-state validation, production-safe bootstrap
confirmation, the protected Production Release Candidate view, owner command/checkpoint documents,
architecture, acceptance, handoff, roadmap, local validation, and final report.

Intentional additive overlap is limited to `.env.example`, `package.json`, Supabase safety/config
tests, bootstrap arguments, shared live-operations exports, Admin Operations navigation/metadata,
and release evidence. No `git add`, commit, branch change, push, reset, clean, stash, or destructive
file operation is authorized or performed.

## Owner staging guidance

Do not stage from this mixed tree by directory glob. First review `git status --short`, compare each
predecessor inventory, and select one coherent release commit. Phase 12F/V3 candidate art and docs
must be excluded unless the product owner explicitly includes and accepts them. The safe rule is to
stage reviewed paths explicitly, inspect `git diff --cached --name-status` and
`git diff --cached --check`, then run the full Phase 13D validation matrix before the owner creates
the commit. Codex does not stage or commit these files.
