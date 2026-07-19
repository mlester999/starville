# Phase 12D production-candidate classification

Status: local classification complete for the checked-in V2 candidate catalog; owner review and
`FINAL` classification are pending.

## Classification result

| Material set                |             Logical entries | Classification                | Owner accepted | FINAL |
| --------------------------- | --------------------------: | ----------------------------- | -------------- | ----- |
| Phase 12B bundled V1        |                         106 | `technical_baseline`          | No             | 0     |
| Phase 12D bundled V2        |                         106 | `production_candidate`        | No             | 0     |
| Character vector rig        | 24 state/direction mappings | `production_candidate` system | No             | No    |
| Eight-direction concept PNG |           1 reference image | concept reference only        | No             | No    |

`assets/manifests/starville-bundled-v2-candidate.json` is the exhaustive per-entry source of truth.
Every V2 entry declares `qualityStatus: production_candidate`. The coverage report independently
records the same 106/106 count and states that automated validation is not final approval and owner
review is required.

No current asset is classified as `FINAL`. No owner acceptance has been recorded. A successful
build, checksum, file-size check, alpha check, or visual fixture does not change that result.

## Candidate catalog coverage

| Category    | V2 entries |
| ----------- | ---------: |
| boundary    |          3 |
| crop        |         19 |
| farming     |          9 |
| furniture   |          7 |
| interaction |         16 |
| interior    |          2 |
| inventory   |         15 |
| lighting    |          1 |
| nature      |          6 |
| recipe      |          5 |
| shop        |          2 |
| signage     |          3 |
| structure   |          9 |
| terrain     |          9 |
| **Total**   |    **106** |

The catalog retains 19 authored variant records and 7 compatibility aliases. The aliases preserve
stable historical keys; they do not represent seven additional physical designs.

## V1 replacement audit

The pre-production V1 review found no final-quality entries. Excluding the protected
`system.missing-asset` fallback:

- 26 logical entries were suitable for refinement-led review; and
- 79 logical entries required complete visual replacement or a materially stronger identity pass.

The highest-priority replacement groups were the player character, General Store, cooking and
crafting stations, home entrance, wardrobe markers, player-facing entries whose stable key retains
historical `dev` wording, major landmarks, and authored terrain adjacency/variation. Stable keys
must not be renamed merely because their historical identifier contains `dev`.

V2 is the additive response to that audit. Its manifest classification is still provisional: actual
owner review may retain `production_candidate` or reclassify an entry as `needs_refinement`,
`needs_owner_replacement`, or `blocking`. It may not promote an entry to `final` without the full
gate below.

## Final-review gate

An entry may become `FINAL` only after recorded review of:

- originality and source provenance;
- Starville visual consistency;
- scale and 96×48 projection;
- outline, palette, light, and shadow direction;
- transparency and edge quality;
- foot, depth, and interaction anchors;
- footprint and collision readability;
- front/behind depth sorting;
- animation, frame timing, and Reduced Motion where applicable;
- World Composer presentation;
- exact Draft Preview identity;
- production Game Client rendering;
- responsive desktop, tablet, and mobile behavior;
- accessibility and owner-facing visual fixture evidence; and
- file, decoded-memory, loading, and frame-time budgets.

The database readiness term `repository_authored` records checked-in provenance. It does not mean
final art. The local activation guard requires a separate final readiness record and owner evidence.

## Character classification

The shared vector rig materially improves directional readability:

- eight distinct body orientations;
- idle, walk, and jog mappings for every direction;
- separate front/back/profile/three-quarter face treatment;
- direction-aware near/far limb order and gait;
- deterministic frame timing; and
- Reduced Motion behavior with a fixed foot position.

It remains `production_candidate` because it is procedural vector rendering rather than an authored
sprite set, lacks final frame-by-frame cleanup, and does not cover the broader farming, crafting,
social, furniture, and tool-action animation catalog.

## Concept-reference classification

`assets/references/phase12d/starville-character-eight-direction-reference.png` was generated during
this task and locally converted to an RGBA concept image. It is not referenced by the bundled
manifest or runtime. It is not a sprite sheet, animation frame, final character, user-owned upload,
or approval evidence.

No external marketplace pack or copyrighted commercial game asset was imported. That provenance
statement does not replace the required owner originality review.

## Preservation rule

V1 bytes, uploaded-version history, exact immutable pins, stable keys, user-owned artwork, map
placements, collision, and gameplay state remain preserved. V2 cannot replace an uploaded or
published hosted source without a separately authorized lifecycle operation. No such operation
occurred in Phase 12D.
