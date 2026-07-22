# Phase 13C working-tree inventory

Captured before Phase 13C implementation on 2026-07-22 in
`/Users/marklesteracak/Documents/Marky Files/Programming/starville`.

- Branch: `master`.
- Starting HEAD: `f9b6a08 chore: checkpoint Phase 12E technical beta candidate`.
- Starting tree: dirty, with 89 tracked paths changed (5,842 insertions and 858 deletions) plus
  untracked paths.
- Initial `git diff --check`: passed.

## Preserved pre-existing work

The dirty tree contained Phase 12E visual/audio work, Phase 12F/V3 source-art and bundled-asset
candidates, Phase 13A gameplay integration, Phase 13B security hardening including the untracked
`20260722130000_phase13b_closed_beta_security_hardening.sql` migration, generated assets/reports,
and unrelated `.claude/` content. Phase 13C preserves these changes without resetting, deleting,
staging, committing, or pushing them.

The exact starting `git status --short` was inspected before edits. Phase-specific inventories
remain in:

- `docs/deployment/phase-13a-working-tree-inventory.md`
- `docs/deployment/phase-13b-working-tree-inventory.md`

## Phase 13C-owned additions

- Deployment, migration, reference-seed, and evidence manifests under
  `infrastructure/deployment/manifests/`.
- Read-only validation and tests in `scripts/phase13c-release-readiness*`.
- Deployment-target validation integration, package script, example environment documentation, and
  production source-map controls.
- Shared operational capability model/tests in `packages/live-operations/`.
- Protected Admin Portal `/operations/release-live-ops` page, styles, tests, navigation, and route
  metadata.
- Phase 13C architecture, operations handbook/runbooks, validation, acceptance, handoff, roadmap,
  and final report documents.

## Overlap policy

`package.json`, `.env.example`, service build configs, Admin Operations navigation/metadata, shared
live-operations exports, README, and roadmap are intentional overlap points. Changes are minimal and
additive. Generated dependencies or user-owned earlier phase files are not regenerated except when
required by the final repository validation command.

The final report must compare the ending tree to this inventory and must not describe the overall
dirty tree as Phase 13C-only work.
