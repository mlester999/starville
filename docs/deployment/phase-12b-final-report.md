# Phase 12B final local report

Run date: 2026-07-18 Asia/Manila. Scope: local repository only.

Status: **PHASE 12B LOCALLY COMPLETE, OWNER ACCEPTANCE PENDING**. This report must not be read as
hosted validation, deployment, publication, or owner acceptance.

## Discovery, audit, and visual direction

1. **Existing asset architecture discovered.** Starville already had a server-authoritative World
   Asset lifecycle with immutable versions, validation/review/approval/activation, exact
   world-version pins, storage-backed derivatives, audit history, Admin permissions, and RLS. It did
   not have a complete repository-owned runtime art pack or one shared fallback resolver.
2. **Existing bundled assets discovered.** The Game Client used procedural development markers and
   simple drawn terrain; no validated, versioned, complete bundled default pack existed.
3. **Existing uploaded-asset workflow.** Upload initialization/completion, processing, validation,
   review, approval, activation, deactivation, rollback, protected media, audit, and exact published
   references remain intact. Phase 12B extends that workflow instead of replacing it.
4. **Existing stable keys.** Current world, gameplay, farming, housing, inventory, recipe, guidance,
   and social identifiers were reconciled into 106 manifest entries plus seven compatibility
   aliases.
5. **Asset coverage audit.** The manifest covers every Phase 12B current-scope world object and
   every enabled React gameplay visual surface; 79 replaceable non-world keys are allowlisted for
   bounded active-override delivery.
6. **Missing assets.** Before Phase 12B, current gameplay areas lacked repository-owned runtime art.
   The generated pack now has a declared runtime source and safe fallback for all manifest keys;
   final coverage is 106 logical entries, 118 runtime WebPs, 99 thumbnails, and zero missing files.
7. **Inconsistent assets.** The audit found generic/byte-identical development states, procedural
   transition flashes, all-rotation eager loading, and UI surfaces that ignored active overrides.
   Distinct generator silhouettes, staged loading, stable missing material, and shared override
   resolution address those inconsistencies.
8. **User-owned assets preserved.** The pre-existing dirty Phase 11F/12A worktree, uploaded-version
   history, world revisions, exact pins, placements, and user-owned storage are preserved. Asset
   commands operate only on repository-owned `assets/` paths.
9. **Bundled default strategy.** Manifest `1.0.0` is the built-in technical baseline. It renders
   when no eligible approved override exists and makes Admin upload optional.
10. **Original generated asset strategy.** Deterministic TypeScript templates generate original SVG
    sources, lossless WebP runtime material, and WebP thumbnails. No external game-art pack is used.
11. **Starville style direction.** Warm, cozy, readable isometric silhouettes use amber, sage,
    meadow, moon, hearth, stone, and diagnostic palettes with strong outlines and no pixel art.
12. **Isometric projection.** The canonical projection is 96 by 48 pixels per tile, bottom-center
    object bases, normalized anchors, and world-unit footprints.
13. **Lighting and shadows.** Lighting comes from the upper left; authored shadows fall to the lower
    right across terrain, structures, stations, crops, and furniture.
14. **Transparency validation.** Runtime and thumbnail WebPs retain alpha, WebP signatures and
    dimensions are inspected, and visual QA includes transparent, light, dark, and grid surfaces.

## Produced pack and identity

15. **Terrain assets.** Grass base/clover, dirt, stone path, plaza, water, bridge, dry soil, and
    watered soil are modular isometric tiles rather than one flattened world image.
16. **Lantern Square assets.** Cottages, trees, rocks, flowers, bushes, fences/gates, lamps, signs,
    notice board, route marker, terrain, store, and interaction material cover the published base
    map.
17. **General Store assets.** A readable store exterior, highlight, UI category, inventory/store
    icons, anchors, footprint, collision, and interaction metadata are bundled.
18. **Cooking Hearth assets.** Default and active/ready visual states retain the authoritative
    cooking interaction and collision metadata.
19. **Crafting Workbench assets.** Default and active/ready visual states retain the authoritative
    crafting interaction and collision metadata.
20. **Farming assets.** Empty, tilled, planted, watered, ready, and exhausted plot material plus dry
    and watered soil are mapped from authoritative plot state.
21. **Crop stages.** Enabled crops have seed/sprout/growing/ready stages and related seed/crop
    icons; visuals observe state and never advance farming themselves.
22. **Housing assets.** Enabled interior furniture and housing-category material are bundled for the
    catalog, placement preview, saved layout, and gameplay panels.
23. **Furniture rotation.** Supported 0/90/180/270 variants are authored and manifest-declared where
    needed; unsupported rotation is rejected, and render/collision projection uses the same
    metadata.
24. **UI icons.** Inventory, currency, category, validation, item, seed, crop, recipe, furniture,
    and shop icons are text-free, lazy-loadable WebPs with accessible surrounding labels.
25. **Guidance assets.** Quest, objective, direction, interaction, spawn, exit, warning, success,
    and error markers cover current guidance behavior.
26. **Social assets.** Home visit, photo area, guestbook, and appreciation material covers current
    Phase 11F surfaces without adding a new social mechanic.
27. **Stable asset identities.** Stable logical keys do not encode upload versions. Visual versions
    can change without moving placed objects or changing their gameplay identity.
28. **Manifest architecture.** A strict Zod manifest declares paths, dimensions, aspect ratio,
    anchors, footprint, collision, animation, rotations, variants, fallbacks, critical groups,
    usage, replacement policy, generator inputs, and technical-baseline quality.
29. **Resolver architecture.** `@starville/asset-management` owns the shared pure resolver used by
    Phaser, React gameplay surfaces, World Composer previews, Admin comparison, and Game Test.
30. **Resolution precedence.** Resolution is exact immutable pin, then eligible approved active
    upload where that context permits it, then bundled default, then `system.missing-asset`.
31. **Immutable published-world behavior.** A published bundled pin must carry manifest identity
    `1.0.0`; mismatched identity resolves to the diagnostic placeholder instead of silently
    selecting newer art. Exact uploaded pins do not float to the latest active upload.

## Runtime, Admin, and operations

32. **Optional Admin overrides.** A bounded authenticated player endpoint returns only approved,
    active, replacement-allowed Starville gameplay overrides with immutable version/checksum/render
    metadata. World revision pins use their existing separate path.
33. **Restore bundled-default workflow.** A protected AAL2 operation requires activate/deprecate
    permissions, expected revision, reason, idempotency key, and exact confirmation. It switches the
    active pointer to the catalog default without deleting uploads, history, files, maps, or pins.
34. **World Composer integration.** The palette and canvas show bundled/uploaded/missing provenance,
    use shared source resolution, and project authored anchors, footprints, collision, rotation, and
    depth without changing placement semantics.
35. **Game Client integration.** Phaser terrain and world objects and React inventory/farming/store/
    housing/crafting surfaces use the pack and shared resolver while gameplay remains server-owned.
36. **Missing-asset handling.** The diagnostic material is queued first; load failures are
    sanitized, fall back without a black box, and preserve logical collision/interaction owned by
    the manifest.
37. **Validation pipeline.** Validation covers manifest/schema uniqueness, safe paths, case, source/
    runtime/thumbnail presence, signatures, dimensions, alpha, animation divisibility/capacity,
    rotations, anchor/footprint/collision bounds, aliases/fallback cycles, orphans, hashes, margins,
    gameplay references, file budgets, and deterministic generated-byte drift.
38. **Asset-generation commands.** `assets:generate`, `assets:validate`, `assets:manifest`,
    `assets:thumbnails`, `assets:coverage`, and `assets:check` are local-only deterministic
    commands. The build starts with bundled validation.
39. **Source organization.** Editable SVGs live under `assets/source`; runtime WebPs and thumbnails
    live under `assets/starville/bundled/v1`; generated manifests and QA reports live under
    `assets/generated` and `assets/reports`.
40. **File-size controls.** Global derivative and aggregate budgets are enforced, reports aggregate
    by category/key/kind, and generated material excludes caches, dependencies, and uploaded
    storage.
41. **Total generated size.** The 335 media files total 1,159,625 bytes: 135,969 bytes of editable
    SVG, 556,608 bytes of runtime WebP, and 467,048 bytes of thumbnails. All 338 managed outputs,
    including the manifest and reports, total 1,749,225 bytes.
42. **Largest files.** Runtime leaders are `lamp-star.webp` at 20,480 bytes, General Store at
    20,366, Amber Cottage at 14,022, Sage Cottage at 13,384, and Store highlight at 12,936.
43. **Performance results.** The initial Lantern Square set is 17 unique textures, 101,718
    compressed bytes, and a 3,219,456-byte decoded RGBA upper bound. All runtime textures are
    556,608 compressed bytes with a 17,176,576-byte decoded upper bound. Exact queue identities,
    transition gating, and lazy-load structure passed automation; browser/CDN/GPU measurements
    remain owner-pending and no local number is presented as hosted performance.
44. **Preload and lazy-load behavior.** Missing material plus the current map's exact terrain kinds
    and object rotations form the Phaser queue; upload sources queue their bundled fallback. React
    icons, galleries, and Admin media load on demand. Map transitions retain the old map until the
    destination loader completes, then swap once.
45. **Cache identity.** Bundled URLs carry `?manifest=1.0.0`; upload identities include stable key,
    immutable version, and checksum. Queues de-duplicate identities and never use timestamps.
46. **Admin coverage dashboard.** The read-only dashboard shows stable/bundled/registered counts,
    uploaded and active overrides, missing/invalid/unused/oversized/placeholder states, thumbnails,
    and world/furniture/farming reference breakdowns.
47. **Asset comparison tool.** Bundled and uploaded material can be compared on transparent, light,
    dark, and isometric surfaces with dimensions and byte sizes; comparison itself cannot activate
    art.
48. **Game Test coverage.** A deterministic nonpersistent fixture covers terrain, nature, buildings,
    store, stations, farm/crop states, furniture rotations, UI/guidance/social icons, missing and
    upload-failure resolution, depth, real footprint/collision/anchor overlays, and modal keyboard
    behavior.
49. **Security validation.** Manifest allowlists, canonical realpath containment,
    MIME/signature/size checks, bounded schemas, authenticated routes, RBAC, AAL2, RLS, path-safe
    public delivery, safe logging, and no service-role/client secret exposure protect each trust
    boundary.
50. **Idempotency.** Existing upload/process/review/activation/rollback protections remain; restore
    adds a unique request intent and replay-safe result. Generation is content-deterministic and
    `assets:check` detects drift rather than mutating it away.
51. **Concurrency.** Expected revisions, row locks, protected lifecycle transitions, idempotency
    intents, and database constraints yield one authoritative active pointer under concurrent
    restore or activation attempts.
52. **Worker behavior.** One advisory-locked, bounded, paginated recommendations-only job aggregates
    at most eight pages and performs zero activation, deletion, pin rewrite, publication, or player/
    economy mutation.
53. **Reconciliation.** The local RPC/worker reports representable catalog, source-state,
    derivative, thumbnail, validation, manifest metadata, deprecated-candidate, active-pointer, and
    rollback anomalies. Storage-file existence, content-domain references that may be legitimate
    custom keys, and Game Test persistence need separate evidence and are documented limitations.
54. **Database migrations.** One additive local Phase 12B migration,
    `20260718120000_phase12b_world_asset_bundled_lifecycle.sql`, introduces the immutable catalog,
    default/version pointers, restore intent/RPC, summary data, and reconciliation. It reuses an
    exact repository marker but appends after legacy/uploaded key collisions while preserving active
    uploads and exact pins. It has not been pushed to a hosted database.
55. **RLS.** Catalog rows and lifecycle state remain backend-controlled; Admin authorization and RLS
    deny public activation, catalog mutation, cross-game access, and public Admin registration.
56. **Error codes.** Stable API errors distinguish authentication/authorization/AAL2, invalid input,
    missing assets/versions, conflicts/revisions/idempotency, ineligible lifecycle state, and safe
    delivery failure without exposing storage paths.
57. **Tests added.** Manifest/resolver/pipeline, Vite serving, Phaser rendering/loading, React
    override delivery, Game Test, Composer, Admin comparison/coverage/restore, API
    service/routes/persistence, worker, migration/RLS, and local PostgreSQL fixtures are covered.
    The final run passed 1,741 tests across 39 workspaces plus 112 root tests: 1,853 total.
58. **Visual QA fixtures.** The Game Test and comparison surfaces cover transparent/light/dark/grid,
    collision, footprint, anchor, depth, supported rotations, current states, missing material, and
    simulated uploaded override/failure without persistent writes.
59. **Responsive results.** Structural tests passed the 360×800, 390×844, 768×1024, 820×1180,
    1024×768, 1280×800, 1440×900, and 1920×1080 harness matrix. Browser pixel/overflow inspection
    could not run because no browser backend was available; signed-in Admin acceptance remains an
    owner step.
60. **Accessibility results.** Focus trap, Escape/restore, labels, keyboard traversal, reduced
    motion, and bounded-overflow structure passed automation. Browser 200 percent zoom,
    touch-target, and screen-reader acceptance remain unchecked owner steps.
61. **Documentation.** Architecture, bundled-default workflow, style/isometric guide, security trust
    boundaries, local validation, owner acceptance, roadmap reconciliation, and this report are
    under `docs/architecture`, `docs/assets`, `docs/security`, `docs/deployment`, and
    `docs/roadmap`.
62. **Roadmap update.** Phase 12A remains locally complete with hosted validation pending. Phase 12B
    is locally complete with owner acceptance pending; it is not hosted, deployed, or owner
    approved.
63. **Files changed.** Changes are grouped across the asset-management/pipeline packages, generated
    `assets/`, Game Client, API, worker, Admin Portal, one additive migration/database fixtures,
    root commands/configuration, README, and Phase 12B docs. Pre-existing Phase 11F/12A changes
    remain user-owned and are not reclassified as Phase 12B work.
64. **Exact local validation results.** All six asset commands, environment validation, formatting,
    39-workspace lint/typecheck/build gates, 1,853 tests, security scan, isolated PostgreSQL 18.1
    suite, and final diff check passed. See `docs/deployment/phase-12b-local-validation-report.md`.
65. **Remaining limitations.** The art is explicitly a technical baseline; hosted migration/storage/
    CDN parity, signed-in Admin lifecycle exercise, real uploaded-file disappearance checks, content
    references indistinguishable from legitimate custom keys, measured production GPU/network
    behavior, and owner visual/accessibility acceptance remain pending.
66. **Exact owner acceptance steps.** The entirely unchecked checklist is
    `docs/deployment/phase-12b-owner-acceptance.md`; it covers bundled startup, Store, stations,
    farming, housing/rotation, Composer, controlled optional upload/restore, missing material,
    performance, and accessibility.

## Required confirmations

67. **Bundled defaults work without Admin uploads.** Confirmed by resolver/pipeline/runtime tests
    and the production build; no upload is part of the default path. Browser pixel acceptance
    remains an owner step.
68. **Admin uploads remain optional.** Confirmed by architecture: no upload is required to resolve
    any current-scope manifest key.
69. **Uploaded overrides do not move placed objects.** Confirmed by stable-key/pointer design:
    source changes do not rewrite map coordinates, logical footprint/collision, or published
    placements.
70. **No animal or livestock system was added.** Confirmed.
71. **No Fablesol mechanic was added.** Confirmed.
72. **No Pokentara mechanic was added.** Confirmed.
73. **No Sailana mechanic was added.** Confirmed.
74. **No AIvanza mechanic was added.** Confirmed.
75. **No copyrighted external game assets were copied.** Confirmed; the pack is deterministic,
    original repository-generated material with no downloaded commercial game-art dependency.
76. **No hosted asset was activated.** Confirmed.
77. **No hosted world was published.** Confirmed.
78. **No hosted write occurred.** Confirmed.
79. **No migration was pushed.** Confirmed.
80. **No deployment occurred.** Confirmed.
81. **No commit or Git push occurred.** Confirmed for this Phase 12B implementation run.

Final status after the final local gate: **PHASE 12B LOCALLY COMPLETE, OWNER ACCEPTANCE PENDING**.
