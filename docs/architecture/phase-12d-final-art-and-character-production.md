# Phase 12D final-art and character-production architecture

Status: repository-local production-candidate implementation. No Phase 12D asset or character system
is classified as `FINAL`. Local automated validation and the development 24-cell character matrix
passed. Protected signed-in product review, complete visual/performance review, hosted validation,
and owner acceptance are pending.

The phase title is retained from the request, but “final” describes the target review gate, not the
current result. Phase 12D adds a stronger original visual candidate beside the frozen Phase 12B
baseline and gives the procedural player a shared eight-direction animation contract. It does not
activate, publish, deploy, or replace hosted material.

## Baseline and additive versioning

Phase 12B manifest `1.0.0` remains the immutable default:

- 106 logical stable keys;
- 19 authored variant records;
- 7 compatibility aliases;
- repository-generated `assets/source` SVGs and `assets/starville/bundled/v1` WebPs; and
- `technical_baseline` quality on every entry.

Phase 12D adds candidate manifest `2.0.0` without changing V1 bytes or stable keys:

- `assets/source-v2` contains the editable candidate SVGs;
- `assets/starville/bundled/v2` contains runtime and thumbnail WebPs;
- `assets/manifests/starville-bundled-v2-candidate.json` is the exhaustive candidate catalog;
- all 106 entries are explicitly `production_candidate`, never `final`; and
- the same anchors, footprints, collision profiles, rotations, aliases, fallbacks, and logical
  identities remain available to existing world and gameplay code.

The candidate generator adds richer surfaces, shading, trim, vegetation, landmark, state, icon, and
grounding details to the deterministic Starville recipes. These remain repository-generated visual
candidates, not hand-approved production illustrations. Automated generation and validation cannot
satisfy originality, consistency, responsive, Composer, Game Client, or owner review by themselves.

The shared resolver accepts exact V1 and V2 bundled identities. An exact pin always wins. An
unpinned V2 preference is permitted only in `draft_world`, `game_test`, and `admin_preview`
contexts. Published gameplay without an exact V2 pin continues to use V1; it cannot silently opt
into the candidate pack. Vite serves and emits only manifest-allowlisted WebPs, and a request must
carry the manifest version matching its V1 or V2 path.

The runtime-integration hotfix adds a narrower review boundary for the normal local Game Client. It
is enabled only when all three conditions hold: a development build, a loopback hostname, and the
exact query `?visual-candidate=v2`. The switch is recomputed from the URL on every load, stores
nothing, and cannot activate in a production build or on a non-loopback host. It rebinds supported
stable keys to exact bundled V2 development deliveries in memory; a missing or invalid V2 key
retains its exact published delivery or normal V1 fallback. Removing the query restores the
unchanged published V1 renderer and asset resolution.

## Eight-direction character rig

`packages/avatar/src/vector-rig.ts` is the shared presentation contract for:

- north, northeast, east, southeast, south, southwest, west, and northwest;
- idle, walk, and jog;
- 24 state/direction mappings;
- distinct front, back, profile, and three-quarter poses;
- deterministic head turn, torso yaw/width, shoulder slope, near/far limb ordering, gait axis,
  stride, arm swing, lean, and body bob;
- a bottom-center mapping anchor and fixed world foot position; and
- a Reduced Motion frame with nonessential motion removed.

Idle uses four 360 ms frames. Walk uses eight 120 ms frames. Jog uses eight 80 ms frames. The
realtime `idle`, `walking`, and `jogging` states are converted to the canonical `idle`, `walk`, and
`jog` avatar states. The API catalog now validates the same canonical names.

The Phaser local and remote player renderers and the DOM avatar preview consume the shared pose and
animation metadata. This removes the former weak diagonal approximation and keeps customization
layers, local movement, remote presence, and preview direction vocabulary aligned.

The normal runtime now selects its renderer through an explicit `published_v1 | phase12d_candidate`
contract. `published_v1` is the default and uses the restored Phase 12B player renderer.
`phase12d_candidate` selects the Phase 12D vector rig for both local and remote villagers only in
the local candidate path or explicit local Game Test composition.

The development-only visual-acceptance route
`/visual-acceptance.html?panel=characters&motion=reduced` presents the exact 8×3 matrix with
direction/state labels and a deterministic Reduced Motion mode. Structural tests and local browser
inspection confirmed all 24 mappings in animated, Reduced Motion, and high-contrast configurations
without console warnings or errors. This remains development-fixture evidence, not protected-product
or owner art acceptance.

This is still a procedural vector rig. It is not an authored frame-aligned sprite sheet and does not
provide final planting, watering, harvesting, cooking, crafting, carrying, sitting, emote, or
tool-use animation. Those omissions prevent a `FINAL` classification.

## Character concept reference

`assets/references/phase12d/starville-character-eight-direction-reference.png` is a task-generated
1536×1024 RGBA concept reference. Its chroma background was removed locally. It is outside the
runtime manifest and is not a frame sheet, texture atlas, character source of truth, or accepted
production asset. It may guide owner discussion of silhouette and direction only. Originality and
owner review remain required.

## World, terrain, Composer, and Game Test parity

`packages/game-core/src/world-asset-dependencies.ts` derives the exact stable terrain keys selected
by the production renderer. Draft normalization records those dependencies for new revisions while
historical immutable revisions remain readable. Player and Game Test projections accept only the
bounded dependency set; arbitrary extra delivery records are rejected.

Terrain resolution follows one visible-material path:

1. exact selected delivery when its immutable texture is available;
2. same-key bundled material for the current resolution context;
3. `system.missing-asset`; and
4. compact procedural fallback only when no texture path is available.

Collision, walkability, coordinates, interactions, and terrain kind remain manifest/gameplay
authority regardless of which visual succeeds.

The checked-in Lantern Square Game Test option explicitly binds its in-memory world dependencies to
candidate manifest `2.0.0` and labels the source local, unpublished, and production-candidate. The
authorized exact revision remains the default source. The Admin comparison view shows V1, V2
candidate, and an eligible uploaded version on transparent, light, dark, and isometric backdrops.
Neither surface activates, uploads, repins, publishes, or persists acceptance.

World Composer remains a structured editor. It places stable asset keys and preserves map
coordinates, collision, rotations, and immutable pins. Its SVG preview is useful inspection, but the
production Game Client renderer remains the pixel-parity authority.

## Repository-authored delivery contract

The local forward-only migration
`infrastructure/supabase/migrations/20260718123000_phase12d_repository_authored_bundled_registry.sql`
adds an immutable bundled-manifest registry and distinguishes:

- `repository_procedural` technical material;
- `repository_authored` checked-in image material; and
- uploaded storage raster material.

`repository_authored` is provenance, not approval. Readiness remains a separate
`technical_baseline`, `production_candidate`, or evidence-backed `final` value. A final manifest
requires an authorized owner-acceptance identity, timestamp, and nonempty evidence. The activation
guard rejects repository-authored material that is not registered as final. The migration seeds the
existing V1 registry identity; it does not activate V2, repoint an asset, or rewrite a world pin. It
remains local and unpushed.

New V2 deliveries must explicitly declare `materialClass: bundled_candidate`,
`bundledManifestVersion: 2.0.0`, and repository fallback provenance. Legacy V1 input remains
parseable for hosted compatibility, while new API projections emit an explicit material class.
Uploaded deliveries cannot claim a bundled identity.

## Size and loading boundary

The current V2 size report records 118 SVG sources, 118 runtime WebPs, and 99 thumbnails: 335 media
files and 1,864,389 bytes. Runtime media is 859,172 bytes; editable sources are 236,763 bytes; and
thumbnails are 768,454 bytes. No reported file is missing or over its per-file budget, and the pack
is below the 16 MiB generated-media budget.

These are file-level figures, not complete browser/GPU evidence. The renderer queues required world
and terrain identities, de-duplicates cache identities, and does not intentionally preload the
entire catalog. The local avatar load harness passed 40 players over 240 frames, but first
meaningful render, GPU memory, mobile memory, protected-product frame time, WAN/CDN timing, and
duplicate-download behavior remain pending.

## Remaining limitations

- Zero assets have passed the complete `FINAL` review matrix.
- The character system remains procedural and covers only idle, walk, and jog.
- Candidate world art remains deterministic generated SVG/WebP, not owner-approved final
  illustration.
- Protected signed-in Admin, Composer, Draft Preview, and Game Test review plus the complete
  responsive, accessibility, performance, and browser pixel matrix remain pending.
- No hosted migration, V2 registration, asset activation, asset replacement, world publication, or
  deployment has occurred.
- Phase 12E remains responsible for final lighting/color grade, audio, remaining motion smoothing,
  loading transitions, release-candidate performance hardening, mobile polish, complete visual
  regression, bug closure, owner acceptance closure, and beta readiness.

The supplied Phase 12D attachment ends mid-sentence at line 379 after “Functional, but should”. This
architecture does not invent requirements from the missing tail.
