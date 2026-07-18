# Phase 12B visual-asset architecture

Status: locally complete; hosted validation and owner acceptance are pending.

Phase 12B adds a repository-owned visual baseline to the existing World Assets and immutable-world
systems. It does not replace either system. Normal gameplay no longer depends on an administrator
uploading art first, while an approved uploaded version can still replace a supported stable key
through the protected lifecycle.

## Product terms

- **World Assets** uploads, validates, reviews, approves, activates, compares, deactivates, and
  rolls back visual versions.
- **World Composer** selects and places stable world-object identities. It does not place filenames
  or storage paths.
- **Bundled Default** is repository-owned material used when no eligible exact upload is selected.
- **Uploaded Override** is an optional, validated, versioned visual replacement for the same stable
  key.
- **Restore Bundled Default** stops selecting the uploaded override without deleting its file,
  version, usage, or audit history.

The bundled pack is original deterministic technical art. Every current entry is explicitly marked
`technical_baseline`. It is coherent and game-ready, but it is not represented as final professional
production art. The owner can replace supported entries later without changing map object identity.

## Components and ownership

| Concern                                                  | Canonical owner                                            |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Typed bundled catalog, stable keys, render metadata      | `@starville/asset-management`                              |
| Deterministic SVG, WebP, thumbnails, reports, validation | `@starville/asset-pipeline`                                |
| Uploaded version intake, processing, review, activation  | existing World Assets API and database                     |
| Exact map-version asset pins                             | immutable world revision and `world_map_version_assets`    |
| Runtime source selection and cache identity              | shared asset resolver                                      |
| World-object placement, collision, interaction           | world manifest and server-authoritative systems            |
| Composer presentation                                    | shared resolver metadata plus protected Admin media routes |
| Local visual coverage                                    | Game Test, with no persistence surface                     |

The manifest describes presentation metadata: source/runtime/thumbnail paths, dimensions, anchors,
footprint, collision profile, interaction anchor, render layer, supported rotations, variants,
critical groups, usage, fallback, and accessibility text. Gameplay authority does not move into the
image manifest. A failed image cannot remove a world collision or interaction.

## Resolution precedence

The shared resolver has one explicit decision path:

1. If an exact immutable pin exists, resolve that pin.
   - An eligible uploaded pin resolves to its protected immutable derivative.
   - A repository/bundled pin resolves to the matching bundled manifest version.
   - If pinned upload media is unavailable, show the bundled visual fallback without rewriting or
     pretending to satisfy the original pin.
2. If there is no exact pin and the calling policy explicitly permits current-active discovery, use
   an eligible active approved uploaded override.
3. Resolve the stable key to bundled manifest version `1.0.0`.
4. If the key or bundled media is unavailable, resolve `system.missing-asset`.

Published gameplay calls the world-delivery adapter with `allowActiveOverride: false`; an exact
published pin therefore cannot silently become the latest active upload. Draft/Game Test/Admin
preview callers must make active-version discovery an explicit policy choice. World Composer keeps
retained exact pins ahead of current candidates and labels bundled, uploaded, and safe-placeholder
sources in text.

An unavailable uploaded image changes only the selected visual. The stable key, placed coordinates,
footprint, collision, interaction, and immutable revision remain unchanged. Restoring the bundled
default similarly changes the active source pointer, not the object placement or historical pins.

## Runtime integration

The Phaser loader queues the stable missing material first, then stable keys referenced by the
current immutable world manifest, only the terrain kinds actually present, and only authored
rotations currently placed. An uploaded selection also queues its same-direction bundled fallback.
Texture keys are resolver cache identities, not signed URLs:

- uploaded: stable key + immutable version/identity + checksum;
- bundled: manifest version + stable key + selected runtime variant.

Bundled URLs carry `?manifest=1.0.0`; the Vite boundary serves and emits only manifest-allowlisted
WebPs after canonical real-path containment. The cache identity prevents a successor upload from
reusing stale texture bytes and lets refreshed signed URLs identify the same immutable uploaded
material. Phaser de-duplicates repeated keys in a queue. On map travel, the old map stays visible
until the destination's queued media settles, then the destination renders once. UI and gallery
images use native lazy loading unless explicitly marked eager.

World rendering uses normalized foot anchors for placement and depth anchors for bounded sort
offsets. Terrain is drawn with the same 96 by 48 isometric tile assets. Bundled furniture uses
authored quarter-turn files; it is not distorted with CSS rotation. If all image paths fail, a
compact procedural fallback remains, and authoritative collision still exists independently.

The React gameplay surfaces resolve the same stable identities for inventory, crops, plot states,
workstation states, store material, and furniture. One bounded authenticated batch reads only
approved active uploaded versions for the 79 replaceable gameplay keys; absent or failed delivery
falls closed to bundled material. Published-world pins remain on their separate immutable path. Game
Test provides deterministic bundled, simulated-uploaded, missing, collision, anchor, depth,
crop-stage, furniture-rotation, and reduced-motion fixtures. Its uploaded state is a local resolver
fixture, not a stored version.

## Admin and Composer integration

The Admin Portal reads bundled files only through manifest-allowlisted media routes. User input is
resolved to a manifest entry first and cannot become an arbitrary filesystem path. Coverage reports
show bundled/registered totals, available and active uploads, validation failures, unused records,
world/furniture/farming references, thumbnail/size gaps, and development-marker material. The
comparison view presents bundled and selected material on transparent/light/dark/isometric surfaces
with dimensions, file size, anchors, footprint, collision, and source status.

World Composer preserves `object.assetId`, coordinates, scale, and collision while its rendering
source changes. Exact draft pins remain exact. Unpinned active discovery is opt-in. Unsupported
rotations resolve to the asset's declared default; supported rotations use authored directional
media when supplied.

## Restore and rollback semantics

Restore is a protected lifecycle operation, not deletion:

- require the lifecycle permissions and current AAL2 session;
- require a reason, trusted request/idempotency identity, and expected asset revision;
- serialize competing lifecycle changes in the database;
- point the active source back to the seeded bundled version;
- preserve uploaded versions, derivatives, validation, usage, and audit evidence;
- preserve exact pins on immutable draft or published revisions;
- never publish a world as a side effect.

Rollback to another uploaded version remains a separate protected World Assets action. Neither path
is a Composer placement edit.

The additive migration
`infrastructure/supabase/migrations/20260718120000_phase12b_world_asset_bundled_lifecycle.sql` seeds
all 106 repository-owned identities. For an existing Phase 6/7 procedural record it reuses only the
exact checked-in logical checksum; when a stable key already has user or legacy history, it appends
the repository material at the next version number. It never reclassifies that history, replaces an
uploaded active pointer, or rewrites an immutable world pin. The migration records the immutable
bundled pointer and derived active-source state and exposes narrow restore/reconciliation RPCs. The
worker runs one advisory-locked recommendations-only scan in pages of at most 250 entries by
default. One job follows at most eight advancing pages, detects a stalled cursor, and aggregates
safe issue counts. It reports missing identities, catalog metadata/pointer drift, missing/invalid
active material or derivatives, thumbnail gaps, invalid approved/rollback candidates, and stale
mutable references. Its contract fixes automatic actions and published-pin changes at zero.

## Current limitations

- All bundled entries are static technical baselines. Active/ready workstation visuals provide an
  animation-ready state foundation, not authored production animation.
- First-meaningful-render timing, CDN performance, and browser memory behavior have not been
  measured in a hosted environment.
- The exact eight-viewport and reduced-motion matrix has structural automated coverage, but browser
  pixel/overflow inspection could not run because this desktop session exposed no browser backend.
  Signed-in Admin QA, hosted migration parity/RLS checks, and owner art-direction acceptance remain
  pending.
- One uploaded v1 image represents only its declared default direction; non-default furniture
  directions intentionally retain authored bundled variants until uploaded directional derivatives
  are part of the delivery contract.
- The reconciliation worker is intentionally a bounded detector; reviewed repair uses a protected
  lifecycle action or a future forward-only migration.
- No hosted asset was activated and no world was published for this phase.
