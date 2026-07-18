# Phase 12B asset trust boundaries

Status: locally implemented controls; hosted migration/RLS validation and signed-in owner review are
pending. This document authorizes no hosted write.

## Boundaries

| Boundary              | Trusted input                                                                        | Rejected or constrained input                                                               |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Bundled build         | typed Starville manifest and deterministic generator                                 | unknown key, duplicate/unsafe path, external SVG content, stale or orphaned output          |
| Public game media     | manifest-allowlisted runtime WebP path                                               | source SVG, arbitrary filesystem path, traversal, malformed encoding                        |
| Admin bundled preview | authorized request plus manifest key/variant                                         | caller-supplied storage/filesystem path, symlink escape, non-WebP/oversized file            |
| Uploaded intake       | authorized admin, trusted origin, bounded multipart body                             | anonymous/player/read-only upload, MIME spoof, unsafe name, oversize or decompression abuse |
| Review/activation     | protected server route, permission, current asset revision                           | direct browser table mutation, unvalidated/unapproved version, stale revision               |
| Restore default       | AAL2, lifecycle permissions, reason, idempotency/request identity, expected revision | deletion, unaudited pointer edit, competing stale operation                                 |
| Published world       | exact immutable version pins                                                         | silent latest-active substitution                                                           |
| Game Test             | in-memory deterministic fixtures                                                     | upload, approval, activation, publication, persistent telemetry/history mutation            |

## Bundled media exposure

The game development server serves only paths present in the bundled manifest under
`/assets/starville/bundled/v1` and requires the exact `?manifest=1.0.0` identity. Unversioned,
stale-version, unknown, traversal, and nonallowlisted requests return `404` with `no-store`. The
Admin route resolves a stable key to an allowlisted runtime or thumbnail path, checks containment
after real-path resolution, limits size, verifies a WebP signature, and returns immutable visual
bytes only to an authorized Admin request. The route does not concatenate user input into a
filesystem path and does not serve editable SVG sources.

The manifest is explicitly scoped to `game: starville`. Unknown or cross-game keys resolve to the
safe missing visual rather than another project's storage. Public runtime URLs contain semantic pack
paths only. Private intake/processed storage paths and service-role credentials are never returned
as asset diagnostics.

## Uploaded asset lifecycle

The existing World Assets intake uses protected server routes and private storage. It validates
content from bytes rather than trusting the extension: signature/MIME, size, decoded dimensions,
alpha, frame layout, decompression bounds, filename/path safety, collision/anchor compatibility, and
safe derivatives. Processed public derivatives are immutable and content-checked before activation.
The API uses `nosniff`, same-site resource policy, no-store responses for protected metadata, and
safe public error codes.

Anonymous users, normal players, and read-only administrators cannot upload or mutate. Approval,
activation, deprecation, archival, and bundled restoration require the relevant RBAC permission and
current AAL2. AAL1 is denied even if the account otherwise has the permission. The server checks
active admin status; player wallet/token-gate state never grants Admin access. Remote write routes
also fail closed when the explicit remote-write gate is disabled.

The Game Client's optional active-override bootstrap is a separate bounded authenticated read. It
accepts only a deduplicated allowlist of at most 96 stable keys, and the client requests the 79
replaceable non-world gameplay keys. The database and API require Starville scope, an active
approved storage-backed version, valid validation status, complete immutable delivery metadata, and
catalog permission for replacement. They return public derivative metadata only; the operation
cannot enumerate catalog state, return private intake paths, mutate an asset, or override an exact
published-world pin.

## Idempotency, concurrency, and audit

Mutations bind the trusted request ID/idempotency key to a fingerprint containing the operation,
asset/version target, expected revision, reason, and other relevant intent. A retry can return the
same authoritative result but cannot repurpose the key for different intent. Expected asset/edit
revisions reject stale clients. Database lifecycle functions serialize the asset transition and
leave one authoritative active source under concurrent attempts.

Restore selects the seeded bundled version through a dedicated narrow RPC. It preserves uploaded
versions, files, validation records, world usage, immutable pins, and audit history. It does not
delete storage and does not publish or rewrite a world. Audit rows remain server-authored evidence
and are not editable through ordinary Admin tools.

## Database and RLS

The additive forward-only migration
`infrastructure/supabase/migrations/20260718120000_phase12b_world_asset_bundled_lifecycle.sql`
extends the existing World Asset catalog with explicit bundled-default/source state rather than
creating a public mutable asset store. It seeds the 106 immutable bundled identities. An exact
existing repository-procedural checksum is reused; a stable-key collision with legacy or uploaded
history receives a new repository version after that history. The migration preserves uploaded
active pointers and every exact world pin. The bundled catalog has RLS enabled and forced, with
direct grants revoked from browser roles. Narrow `SECURITY DEFINER` functions use a fixed safe
search path, active-admin/permission checks, expected revisions, bounded rate limits, idempotency,
and audit logging. Service-role access remains inside protected server/worker environments.

Exact `world_map_version_assets` pins remain authoritative. A failed derivative may display the
bundled fallback, but no resolver or reconciliation worker is allowed to rewrite immutable
published-world art automatically.

## Reconciliation and failure handling

The local pipeline reports missing or orphaned repository files, stale manifest/report hashes,
thumbnail/runtime structural failures, and budget breaches. The database reconciliation RPC and
worker separately detect missing bundled identities, catalog media drift, pointer mismatch, invalid
bundled material, missing active source, invalid active validation, missing thumbnails, incomplete
derivatives, invalid approved or deprecated rollback candidates, and stale mutable references. The
worker uses an advisory lock, scans at most 250 entries per page by default (500 maximum), follows
at most eight advancing pages per job, rejects a stalled cursor, and returns recommendations only.
Its typed result requires `automaticActionCount: 0` and `publishedPinMutationCount: 0`. A repair
recommendation identifies the stable key and safe next operation without revealing private paths.

The visual resolver fails in this order: selected upload, bundled key, stable missing placeholder,
then compact renderer fallback. Logical collision and interaction survive every visual failure.
Observability callbacks are isolated so a logging failure cannot crash gameplay.

## Pending security evidence

- [ ] Apply the additive migration through Supabase tooling only to an owner-approved disposable or
      development target, then rerun migration-list parity, `plpgsql_check`, and hosted RLS
      evidence.
- [ ] Verify anonymous, normal-player, read-only, wrong-permission, AAL1, stale-revision, and
      cross-game denials with real signed-in sessions.
- [ ] Exercise MIME spoof, oversize, decompression, unsafe SVG, traversal, malicious filename, and
      missing derivative cases end to end.
- [ ] Confirm Admin bundled media response headers and private-path redaction in a browser.
- [ ] Run hosted parity/lint/RLS validation only after explicit owner authorization.
