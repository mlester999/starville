# Phase 7.5A World Asset API

All endpoints use the existing trusted administrator API boundary below
`/api/v1/admin/world-assets`. They require a current administrator session, the configured assurance
level, exact origin protection for mutations, a request ID, and the endpoint's exact permission.
Responses use `Cache-Control: no-store`.

The common error envelope remains:

```json
{
  "success": false,
  "error": {
    "code": "SAFE_ERROR_CODE",
    "requestId": "correlation-id"
  }
}
```

Private bucket names/object identifiers, signed storage internals, full hashes in directory results,
service-role credentials, raw decoder/storage/database errors, and stack traces are never part of an
administrator response.

## Reads

### `GET /api/v1/admin/world-assets`

Requires `assets.read`. Supported query fields are allowlisted:

- `search`
- `assetType`
- `category`
- `lifecycleStatus`
- `productionStatus`
- `sort`
- `direction`
- `limit` (exactly 10, 50, or 100)
- `offset`

Returns safe directory summaries, pagination totals, thumbnail delivery URL, active version,
version/reference counts, and update time. It does not return a private path or original upload URL.

### `GET /api/v1/admin/world-assets/:assetId`

Requires `assets.read`. Returns the asset identity, versions, tags, active version, and bounded
reference counts.

### `GET /api/v1/admin/world-assets/:assetId/versions/:versionId`

Requires `assets.read`. Returns decoded source facts, sanitized derivative URLs,
render/anchor/depth/rotation/collision configuration, validation checks, duplicate summary, review
history, revision, and safe reference impact.

### `GET /api/v1/admin/world-assets/:assetId/versions/:versionId/:variant`

Requires `assets.read`. The closed variant set is `original`, `source`, `preview`, and `thumbnail`.
`original` is resolved only from the private intake upload bound to the exact asset/version; it is
content-sniffed as PNG or WebP and is never added to a public DTO or game delivery. The other
variants are sanitized WebP derivatives. Every response is bounded, `nosniff`, private/no-store, and
target-checked before private Storage is read.

### `GET /api/v1/admin/world-assets/review`

Requires `assets.review`. Uses bounded directory-style pagination and returns only versions
currently requiring a review decision.

### `GET /api/v1/admin/world-assets/audit`

Requires `assets.audit.read`. Filters are bounded by asset, search text, outcome, limit, and offset.
Metadata is projected to a safe closed shape.

### `GET /api/v1/admin/world-assets/:assetId/references`

Requires `assets.read`. Returns authorized, bounded map/content references and counts used to
explain deprecation/archive/replacement impact.

### `GET /api/v1/admin/world-assets/editor-candidates`

Requires `assets.read` and is used only inside an authorized draft World Editor. Results contain
active approved production versions plus active repository-owned development markers; the editor
hides development markers until its explicit filter is enabled. Responses contain safe preview facts
and compatibility metadata needed for selection.

## Upload and processing

### `POST /api/v1/admin/world-assets`

Requires `assets.upload`. This is a single-file `multipart/form-data` request. The request contains
one `file` and one bounded JSON `metadata` field containing profile/identity values and the
idempotency request ID. Multipart file, field, part, and byte limits are enforced before
authoritative processing.

The API ignores filename/declared MIME as evidence, decodes actual content, validates the closed
profile, hashes and duplicate-checks it, re-encodes safe derivatives, and stages them in private
intake through a server-only Storage adapter. A completed response identifies the
asset/version/revision and safe validation status. It never returns an intake object name or
original source URL.

Retrying the same operation is idempotent. A different payload cannot reuse the same operation
silently.

## Draft configuration and validation

### `POST /api/v1/admin/world-assets/:assetId/versions/:versionId/draft`

Requires `assets.edit`. The JSON body contains an expected revision and only strict friendly
metadata, tags, render size/scale, anchors, supported rotations, and typed collision configuration.
Approved/active/historical immutable facts cannot be changed.

### `POST /api/v1/admin/world-assets/:assetId/versions/:versionId/validate`

Requires `assets.validate`. Rechecks the persisted sanitized facts and profile configuration,
recording closed validation results and a new revision. It does not trust checks submitted by the
browser.

## Review and lifecycle

### `POST .../:versionId/submit-review`

Requires `assets.edit`. Body: expected revision, request ID, confirmation, and a bounded reason.
Only validated versions can enter review.

### `POST .../:versionId/review`

Requires `assets.review` for request-changes/reject decisions and both `assets.review` and
`assets.approve` for approval. Body contains a closed decision, expected revision, request ID, and
reason. Approval makes version facts immutable but does not activate delivery.

### `POST .../:versionId/activate`

Requires `assets.activate`. Body contains expected asset/version revisions, request ID, reason,
typed confirmation, and explicit confirmation. A database preflight verifies the exact target and
expected revisions before the API reads or copies any object. The API releases already sanitized
derivatives to new immutable public object identifiers without overwrite, then finalizes the
database active pointer/version binding. An exact same-request retry may replay those immutable
writes; different targets or revisions fail closed. Failure before finalization cannot mark an
undelivered version active.

### `POST /api/v1/admin/world-assets/:assetId/deprecate`

Requires `assets.deprecate`. The route identifies the asset; the body contains its expected
revision, request ID, reason, and explicit confirmation. Deprecation hides the target from new
selection but retains existing pinned delivery.

### `POST /api/v1/admin/world-assets/:assetId/archive`

Requires `assets.deprecate` and the same trusted-origin, expected-revision, idempotency,
bounded-reason, and explicit-confirmation controls as deprecation. Archival retains the historical
record while removing it from selectable lifecycles and is rejected while an unsafe reference
remains.

## Draft marker replacement

World Editor replacement uses the existing world-admin mutation boundary or an asset-scoped
draft-replacement RPC. It requires `maps.edit` and `assets.read`, an editable draft ID/version,
expected draft edit/checksum, object ID, expected current asset key, target active version,
idempotency request ID, reason, and an explicit collision-impact decision.

The server copies the entire object and changes only its visual reference, synchronizes version
references, preserves gameplay interactions/configuration, and rejects published versions. Batch
replacement performs the same checks for every affected object and returns a bounded preflight
before mutation.

## Player delivery

Published world responses add `assetDeliveries` outside the map manifest. Every entry is resolved
from the map version's immutable asset-version binding and contains only the stable asset key,
pinned version ID, integrity checksum, sanitized immutable WebP URL, decoded/render dimensions,
anchors, depth anchor, rotation, and collision metadata needed by the renderer. Repository
procedural keys receive a pinned descriptor with no public URL and use the built-in development
fallback.

The player cannot request an arbitrary asset/version or private object. A production manifest key
without a valid pinned delivery is rejected as invalid world content.

## Representative safe errors

- `INVALID_ASSET_REQUEST`
- `ASSET_FILE_REQUIRED`
- `ASSET_FILE_TOO_LARGE`
- `ASSET_FORMAT_UNSUPPORTED`
- `ASSET_IMAGE_INVALID`
- `ASSET_PROFILE_INVALID`
- `ASSET_DUPLICATE`
- `ASSET_REVISION_CONFLICT`
- `ASSET_TRANSITION_INVALID`
- `ASSET_REFERENCE_CONFLICT`
- `ASSET_PROCESSING_FAILED`
- `ASSET_DELIVERY_FAILED`
- existing `ADMIN_AUTH_REQUIRED`, `ADMIN_FORBIDDEN`, `RATE_LIMITED`, and `INTERNAL_ERROR`
