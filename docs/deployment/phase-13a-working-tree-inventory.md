# Phase 13A starting working-tree inventory

## Snapshot

- Repository: `/Users/marklesteracak/Documents/Marky Files/Programming/starville`
- Branch: `master`
- Starting HEAD: `f9b6a08 chore: checkpoint Phase 12E technical beta candidate`
- Initial diff check: passed
- Initial tracked diff: 64 paths, 5,165 insertions, 762 deletions
- State: dirty before Phase 13A; preserved, not normalized, staged, committed, or pushed

This is the classification captured before Phase 13A edits. Mixed files are deliberately called out
instead of attributing the entire dirty tree to this phase.

## Pre-existing Phase 12E work

- Game-client audio/settings/dialog/GameWorld/Phase 12E scenario, viewport, style, and visual-matrix
  changes.
- Admin Beta Readiness model, repository, page tests, and related route/navigation work.
- Phase 12E architecture, audio, security, deployment, owner, validation, final-report, and roadmap
  documentation.
- Root package/README overlap and the local release-candidate audio validator.

## Pre-existing Phase 12F work

- Admin bundled-asset route test and app Vitest configuration.
- API, game-client, and realtime Vitest configuration.
- Game-client App, GameCanvas, input/interaction prompt, rendering, WorldScene, visual-acceptance,
  bundled-asset, and Vite changes.
- Asset-management/pipeline, avatar, game-content, game-core, and avatar renderer/load work.
- Untracked production-slice source/tests/components, V3
  manifests/assets/references/sources/reports, Phase 12F docs/packages/scripts, and performance
  work.

## Generated output

- V3 generated manifests/reports.
- Generated avatar assets and `assets/starville/bundled/v3` output.

Authored V3 source/reference material is preserved as Phase 12F work, not classified as generated
merely because it participates in a pipeline.

## Unrelated owner work

- `.claude/`

## Mixed or uncertain paths

- `README.md`
- `package.json`
- `apps/game-client/src/components/GameWorld.tsx`
- game contracts and shared styles

These paths contained overlapping prior-phase changes. Phase 13A patches only the narrow integration
areas required by the brief and preserves all other hunks.

## Phase 13A edit boundary

Phase 13A adds shared player-experience audit/journey modules and tests; targeted gameplay
settlement callbacks; a new isolated Game Test component/data/test; a new Admin Gameplay Health
page/test and small route/navigation entries; and Phase 13A documentation. It does not claim
ownership of the pre-existing changes above.
