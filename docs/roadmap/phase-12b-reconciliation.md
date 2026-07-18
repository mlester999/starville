# Phase 12B roadmap reconciliation

Phase 12A remains **locally complete, hosted validation pending**. Its Core Gameplay Integration,
Guided Onboarding, Starter Questline, Daily Player Loop, World Guidance, and Unified Feedback work
is not reclassified or replaced by Phase 12B.

Phase 12B is **locally complete, owner acceptance pending**: Visual Asset Production, Bundled
Default Asset Pack, Asset Resolution, World Art Integration, World Composer Coverage, and Optional
Admin Overrides. It must not be described as hosted, owner-approved, deployed, or production-final.

## Implemented locally

- typed manifest version `1.0.0` with 106 stable Starville entries, safe fallback, authored
  variants, critical groups, usage, collision, anchors, and technical-baseline labels;
- deterministic original SVG to lossless WebP and thumbnail pipeline with manifest, coverage, size,
  hash, alpha, dimensions, path, orphan, and budget checks;
- one shared exact-pin/eligible-active/bundled/missing resolver with immutable cache identities;
- bundled terrain, current world structures/objects, farming stages, enabled furniture, inventory,
  recipe, guidance, social, and validation art;
- Game Client, gameplay UI, World Composer, Admin coverage/comparison, and nonpersistent Game Test
  integration;
- protected bundled-default restore semantics that preserve uploaded and world history;
- additive local database/API/RLS/security/test work for explicit bundled source state, including
  migration `20260718120000_phase12b_world_asset_bundled_lifecycle.sql`.

All generated entries remain technical art. Owner art-direction acceptance and future professional
replacement work are not silently included in this status.

## Reconciliation responsibilities

A bounded asset reconciliation pass should detect and report:

- active uploaded version with missing immutable derivative;
- approved version without successful validation;
- published/draft world, furniture, crop, item, or recipe key absent from the catalog;
- manifest entry with missing source/runtime/thumbnail or unsafe/case-mismatched path;
- runtime/thumbnail file without a manifest descriptor;
- stale generated manifest, coverage, size, or content hash;
- duplicate active source or invalid rollback/restore target;
- missing `system.missing-asset` or other declared bundled fallback;
- generated material outside per-file or 16 MiB total budget;
- persistent asset history that claims a Game Test mutation.

Safe automated work is limited to bounded inspection, deterministic regeneration of repository-owned
outputs, and recommendations. Reconciliation must not activate a version, delete upload history,
rewrite exact pins, replace published-world art, publish a world, or touch player/economy state. The
implemented worker performs advisory-locked recommendations-only pages of 250 entries by default
(500 maximum), follows at most eight advancing pages in one job, and fails a stalled cursor. Its
contract requires zero automatic actions and zero published-pin changes. Repairs must use reviewed
protected lifecycle operations or a forward-only migration rather than one permanent job per asset.

## Explicitly pending

- Supabase migration-list parity, `plpgsql_check`, and hosted RLS validation in an owner-approved
  disposable or development Supabase target;
- signed-in Admin RBAC/AAL2 upload, comparison, activation-fixture, restore, and audit exercises;
- Game Client/Composer visual parity at required desktop/tablet/mobile viewports;
- first meaningful render, transition, network duplication, browser/GPU memory, 200 percent zoom,
  keyboard, screen-reader, touch target, and reduced-motion inspection;
- owner acceptance of the technical pack, projection, readability, and replacement priorities;
- any separately authorized hosted migration, upload, activation, publication, or deployment.

No hosted write, asset activation, world publication, migration push, deployment, commit, or Git
push is authorized by this roadmap. It introduces no animal/livestock phase and no Fablesol,
Pokentara, Sailana, or AIvanza system.

The final repository-local gate passed all deterministic asset commands, environment validation,
formatting, lint and type checks across 39 workspaces, 1,853 tests, all 39 production builds, the
security scan, the isolated PostgreSQL 18.1 suite, and `git diff --check`. Browser pixel inspection
could not run because this desktop session exposed no browser backend; that evidence remains in the
unchecked owner checklist.
