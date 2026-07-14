# Phase 7.5A World Asset Architecture

## Scope

Phase 7.5A adds a secure, reusable production-art pipeline without changing the gameplay, economy,
authentication, map-publication, or live-operations models implemented in earlier phases. The
pipeline accepts PNG and WebP raster images, produces trusted derivatives, supports an explicit
review lifecycle, and makes only active approved versions available to draft world editing and
runtime delivery.

The repository's procedural world catalog remains a development-art fallback. Existing published map
versions are immutable and continue to resolve the asset keys they already pin. No migration
silently replaces art in a published world.

## Existing foundation

Before this phase, Starville had:

- an immutable-key `world_assets` delivery catalog used by map manifests;
- `world_map_version_assets` references that pin those catalog rows;
- repository-owned procedural development markers;
- a read-only admin asset list and a development-asset picker in the World Editor; and
- trusted API, administrator RBAC, map draft/version, audit, and Supabase service boundaries.

It did not have binary intake, image decoding, derivatives, versioned asset identity, review and
activation states, storage policies, production thumbnails, reference impact analysis, or a safe
visual-replacement operation.

## Architectural decisions

### Identity, versions, and delivery bindings

The existing `world_assets` catalog evolves additively into the stable, game-scoped management
identity. `world_asset_versions` is an immutable-version record once approved. A version contains
the checksum, decoded image facts, render configuration, validation results, private intake object
identifiers, public delivery identifiers, review facts, and optimistic record version.

The existing legacy file columns remain a compatibility snapshot for seeded procedural development
art. New production binary facts live only on version rows. `world_map_version_assets` gains an
immutable version binding while the manifest retains its stable asset-key reference. Draft map
synchronization binds new references to the active version, and publication preserves those
bindings. This provides version pinning without a manifest-schema rewrite and without silent
"latest" resolution.

`world_assets.active_version_id` is a convenience pointer for discovery in the admin editor; it is
never used to reinterpret an already published map.

### Lifecycle

The supported lifecycle is:

`draft -> processing -> validation_failed | validated -> in_review -> approved -> active -> deprecated -> archived`

Transitions are server-authoritative, permission checked, revision checked, and idempotent.
Validation failure can be retried as a new version. Approved version facts cannot be edited.
Activation never mutates another version or a published map. Deprecation removes a version from new
selection but does not break existing references. Archival is rejected while unsafe references
remain.

Review decisions, lifecycle changes, configuration changes, duplicate findings, and replacement
operations are captured in append-only audit records with safe metadata. Reasons are required for
consequential transitions.

### Storage and trust boundaries

Two Supabase buckets have distinct purposes:

- `asset-intake` is private and contains the received source plus sanitized pre-activation
  derivatives. Browsers never receive its object names or URLs.
- `game-assets` is public and contains only validated, metadata-stripped, immutable delivery
  derivatives. Object names are server-generated from the trusted game namespace, asset slug, and
  immutable version number; user filenames are never used.

The browser sends a bounded multipart request to the trusted API. The API checks the declared type
only as an early hint, then identifies and decodes the actual image content. It rejects unsupported
formats, animation/multiple pages, oversized encoded or decoded data, invalid dimensions,
decompression-bomb ratios, and profile violations. It computes a cryptographic checksum, detects
duplicates, normalizes orientation, strips source metadata by decoding and re-encoding, and produces
WebP source, preview, and thumbnail derivatives.

Only the API service-role boundary may write either bucket. Supabase storage policies do not grant
direct browser uploads. Public delivery is deliberately read-only. Private object identifiers,
service-role credentials, database URLs, and stack traces are absent from browser responses and
logs.

### Validation profiles

A shared, closed catalog defines the allowed asset types and their limits. Each profile supplies
allowed media types, encoded byte and pixel limits, dimension ranges, transparency expectations,
render-size defaults, rotation support, anchor defaults, collision constraints, and operator helper
text. The catalog is shared by API validation and the admin interface, but only the API result is
authoritative.

Anchor and collision values use logical isometric world coordinates. They are strictly bounded
finite numbers in small, schema-validated objects rather than arbitrary JSON. Uploaded SVG, HTML,
script, model, archive, and executable content is never accepted.

### API boundary

All management operations live below `/api/v1/admin/world-assets` and use the existing administrator
session, CSRF/origin, request-ID, rate-limit, idempotency, structured-error, and audit boundaries.
Permissions are narrow:

- `assets.read`
- `assets.upload`
- `assets.edit`
- `assets.validate`
- `assets.review`
- `assets.approve`
- `assets.activate`
- `assets.deprecate`
- `assets.audit.read`

List responses use allowlisted filters, sorts, and exact page sizes of 10, 50, or 100. DTOs expose
friendly metadata, lifecycle state, safe reference counts, and trusted public derivative URLs only.
They never expose a private bucket, private object key, database identifier not needed by the
operation, or raw storage error.

Image processing and storage are behind explicit interfaces so tests use memory adapters and never
contact Supabase. Database RPCs own authorization-sensitive state transitions; the API owns binary
inspection and storage coordination.

### Administrator experience

The asset manager provides directory, upload, review, asset detail, version detail, and audit
routes. It reuses Starville's responsive tables, state chips, `PremiumSelect`, trusted server API
client, focus-trapped confirmation dialogs, notices, and administrator authorization layout.

The upload experience is a progressive wizard. Requirements are shown before selection. Progress,
validation, processing, retry, duplicate, and failure states are announced accessibly. The preview
workspace can compare an authenticated, no-store original with sanitized derivatives on
checkerboard, light, dark, mobile, and isometric contexts with anchor, depth, grid, player-foot,
collision, and rotation overlays. The original remains in private intake and is never given a
browser-visible storage URL. Pointer edits always have bounded numeric and keyboard alternatives and
persist only on an explicit save.

### World Editor integration

The candidate boundary returns only active approved production versions and active repository-owned
development markers. The editor hides development markers until the operator explicitly enables the
development-art filter.

Visual replacement is allowed only in an editable draft. One atomic editor transaction:

1. changes the object's version-specific visual asset key;
2. preserves object ID, logical position, kind, interaction and destination/shop/ station/farm/home
   configuration;
3. updates the manifest reference set, retaining keys still used elsewhere;
4. retains the existing map collision by default;
5. displays anchor/collision differences and requires explicit confirmation that the map collision
   remains unchanged and must be revalidated against the new visual; and
6. creates one undo entry and leaves the draft requiring normal save and validation.

Batch replacement uses the same transaction after a preflight enumerates every affected object and
collision impact. Published map manifests are never edited.

### Runtime delivery

Published-world responses resolve version-pinned public delivery descriptors outside the manifest
itself. The game client preloads only validated HTTP(S) immutable derivative URLs produced from the
configured Supabase delivery boundary and renders them at trusted size/anchor settings. Procedural
art is the explicit development or load-failure fallback. Runtime validation merges repository
development keys with database-approved immutable delivery keys; production keys are not required to
exist in the compile-time catalog.

A map object's logical world position is its ground-contact point. The Phaser renderer therefore
aligns the configured foot anchor to the projected object position; the generic render anchor
remains preview/composition metadata and the depth anchor only applies a bounded ordering offset. A
Phaser file-load failure emits the browser event `starville:world-asset-fallback` with only the safe
asset key, pinned version ID, and `WORLD_ASSET_LOAD_FAILED` code. URLs, checksums, loader/network
details, and credentials never cross that observability boundary.

Missing or failed delivery does not weaken collisions, interactions, saving, travel, access loss, or
gameplay authority. It is a visual fallback only.

## Reference and deletion safety

References are derived from map-version bindings and other bounded asset-reference records. Detail
and activation responses include safe counts and affected draft identifiers for authorized
operators. An asset/version cannot be hard deleted through this phase's API. Deprecation and
archival preserve delivery objects and published references. Public immutable objects are not
overwritten.

## Operational failure behavior

Binary and database operations are deliberately staged:

1. reserve the version and trusted object identifiers;
2. validate and upload private sanitized derivatives;
3. finalize the validation result;
4. review and approve using database transitions;
5. copy sanitized derivatives to immutable public identifiers; and
6. finalize activation and its delivery binding.

Every step is retry-safe. A storage failure cannot mark an un-delivered version active. A
database-finalization failure may leave an unreachable immutable object, which is safe and can be
reconciled; it never exposes private intake or mutates a published reference. Logs include request
and asset/version IDs but redact image bytes, credentials, signed URLs, and private object
identifiers.

## Deliberate exclusions

Phase 7.5A does not generate final art, auto-approve or auto-publish assets, write hosted Supabase
state, redesign gameplay, introduce arbitrary file management, accept vector/executable content, or
implement Phase 8 or later systems.
