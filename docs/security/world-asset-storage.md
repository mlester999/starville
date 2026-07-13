# World Asset Storage and Security Model

## Trust boundaries

The admin browser is untrusted. File name, extension, MIME type, metadata, dimensions, transparency,
checksum, anchor, collision, and lifecycle requests are all untrusted input. The browser receives no
Supabase service-role credential, private object identifier, direct intake upload authorization, or
database URL.

The trusted API authenticates the administrator, verifies AAL and the exact asset permission,
enforces origin/CSRF and request rate limits, assigns request IDs, parses one bounded multipart
file, and performs authoritative image processing. Database state transitions are narrow
`SECURITY DEFINER` RPCs. Binary storage is accessed only through a server-only adapter constructed
with the service role.

The game browser receives only immutable public delivery descriptors pinned to a published map
version. It cannot use delivery access to modify asset records, private intake, gameplay
configuration, inventory, or map publication.

## Buckets

### `asset-intake`

- Private.
- PNG/WebP MIME allowlist and hard encoded-size limit.
- Server-generated object names only.
- Contains received source and sanitized pre-activation derivatives.
- No anonymous or authenticated browser list/select/insert/update/delete policy.
- Never included in API DTOs or logs.
- The decoded PNG/WebP original may be streamed only through the authenticated `assets.read` media
  proxy for side-by-side review. That response is bounded, ownership-checked, `private, no-store`,
  and `nosniff`; it exposes neither the private object name nor a reusable Storage URL.
- Failed/expired intake is eligible for a later checked cleanup operation only when no retained
  version depends on it.

### `game-assets`

- Public read-only delivery bucket.
- WebP only.
- Contains sanitized immutable source, preview, and thumbnail derivatives.
- Object identifiers contain only trusted game, asset-slug, and immutable version segments.
- No browser write, update, or delete policy.
- Existing objects are never overwritten; referenced files are retained.

Making this bucket public is intentional: every object has already passed review, contains no
original metadata, and is needed by unauthenticated CDN/image loading after the player has obtained
an authorized published-world response. Database and map access remain separately protected.

## Image validation

The API first limits received bytes, then uses a real decoder with a profile-level pixel limit. It
accepts only decoded PNG or WebP, rejects multiple pages and animation, validates
dimensions/aspect/transparency/profile rules, computes SHA-256, and re-encodes normalized WebP
derivatives without source metadata. It never enables unlimited pixel decoding or an SVG/XML
decoder.

Safe validation results contain closed codes and bounded facts. Raw decoder, filesystem, network,
Postgres, and Storage errors are converted to stable public errors. Logs use existing secret
redaction and omit bytes, signed URLs, private object names, and full internal exception material.

## Database access

New asset tables enable and force RLS. Direct privileges are revoked from public, anonymous,
authenticated, and service-role roles. The service role can execute only explicitly granted public
RPCs; private helpers are revoked. RPCs verify the administrator identity, current session, AAL,
permission, revision, idempotency, and transition rules.

Approved version metadata and checksums are immutable. Audit and review records are append-only.
Hard deletion is not part of Phase 7.5A. Deprecation and archival cannot erase a version referenced
by a map or other registered content.

## Permissions

| Permission          | Capability                                                          |
| ------------------- | ------------------------------------------------------------------- |
| `assets.read`       | Read directory, safe detail, and editor candidates                  |
| `assets.upload`     | Create bounded upload intents and send a source image               |
| `assets.edit`       | Edit draft metadata and render configuration                        |
| `assets.validate`   | Run/record authoritative validation                                 |
| `assets.review`     | Review a candidate, request changes, or reject it                   |
| `assets.approve`    | Approve an immutable candidate when `assets.review` is also present |
| `assets.activate`   | Publish sanitized delivery and select the active version            |
| `assets.deprecate`  | Deprecate/archive subject to references                             |
| `assets.audit_read` | Read bounded asset audit history                                    |

Super administrators, game administrators, and asset managers receive the full asset capability set.
Live-operations managers receive read only. Read-only analysts receive read plus audit read. Other
roles do not receive asset mutation implicitly. Legacy `assets.publish` remains compatibility
metadata and is not a substitute for approve or activate.

## CSP and browser delivery

Only the configured Starville API, Supabase project, and exact immutable delivery origin may be
added to `connect-src`/`img-src`. Wildcard Supabase origins are not permitted. Admin previews use
same-origin, reauthorized media responses; private originals are no-store and sanitized derivatives
remain the production default. `data:`/`blob:` are allowed only where needed for a local pre-upload
preview and are never treated as trusted server validation.

## Threats explicitly addressed

- renamed or deceptive non-image uploads;
- SVG/script and executable content;
- malformed, animated, multipage, oversized, or decompression-bomb images;
- duplicate and replayed operations;
- filename/path traversal;
- metadata leakage;
- direct browser writes to Storage;
- unauthorized lifecycle elevation;
- approved-version mutation;
- silent active-version changes in published maps;
- private path and credential disclosure;
- referenced-asset deletion; and
- collision/gameplay changes disguised as a visual replacement.
