# Phase 10C world publication trust boundary

Status: locally validated; hosted security validation pending. No secrets, raw preview tokens,
private storage URLs, or hosted records are included in this document.

## Authority separation

The browser is an editor and reviewer, never publication authority. It may submit a structured
manifest and expected revision values through same-origin server actions. The Admin API
authenticates a verified administrator session, requires the route-specific permission, validates
strict UUIDs and bounded schemas, removes unknown fields, applies rate limits, and maps database
failures to owner-safe codes. PostgreSQL rechecks the actor, auth session, assurance level,
permission, request ID, expected state, manifest, pins, evidence, and maintenance policy.

Forced-RLS tables hold draft-head routing, revision metadata, publication reviews, and publication
records. `anon`, `authenticated`, and browser clients receive no table grants or policies.
`service_role` reaches only narrow SECURITY DEFINER RPCs with `search_path = ''`. The old in-place
publish RPC is revoked from service role. New review, publish, rollback, revision-read, and compare
functions expose only their exact signatures.

Draft manifests are immutable after insertion. The database trigger permits only validation evidence
fields on the exact current draft head; it rejects historical draft changes, deletion,
validated-source mutation, and published-history mutation. A trusted publication transition can only
change the current published row to superseded without modifying any other field. Save inserts a
successor and advances `world_draft_heads` under a row lock. UUID, edit version, checksum, and
idempotent request metadata prevent lost updates.

Exact World Asset pins are copied into successors/publications. Newly introduced keys resolve
through the current approved active pointer only during save. Validation and runtime readiness
require a real pin, matching asset ownership, active/deprecated immutable version, successful
automated validation, processed raster availability when needed, object-kind/interaction
compatibility, and supported rotation. The Composer cannot approve, activate, archive, publish, or
upload an asset.

## Game Test boundary

Game Test grants are random opaque values returned only once; PostgreSQL stores hashes. The launch
grant is put in the URL fragment, not query parameters or logs. Internal return paths must begin
with one slash, remain bounded, contain no scheme/control/angle characters, and are supplied by
trusted Admin Portal routes. Exchange consumes the grant atomically and stores only a session-token
hash. Sessions are exact-revision, short-lived, revocable, private solo, and excluded from public
realtime/progression authority.

Evidence is append-only and bound to the game-test session, map, exact revision, tester
administrator, admin session, result, checklist, notes, and timestamp. Opening or exchanging a
session does not create Passed evidence. Publication requires the latest eligible Passed evidence
selected for the exact candidate at review time, then rechecks that same evidence at execution. A
successor revision has a new UUID and cannot inherit the pass.

## Publication and rollback controls

Publication requires `maps.publish`, AAL2, a current validated draft head, expected public revision,
expected edit/checksum, current validation, safe pins, no maintenance block, and an unexpired
acknowledged review receipt. The receipt is bound to one actor, trusted admin session, target,
operation, expected public pointer, change summary, and evidence. Execution copies source data into
a new published row, advances the pointer atomically, preserves the validated source and previous
publication, and writes append-only ledgers/audit.

Rollback uses distinct `maps.rollback` authority and AAL2. The target must be historical
published/superseded content, not the current pointer or arbitrary draft. It must still validate
against current supported schema, destinations, interactions, checksum, exact pins, and processed
derivatives. Historical Game Test evidence is optional but revision-specific. The acknowledged
receipt and expected public pointer prevent confused-deputy and stale-review execution. Rollback
creates a new publication derived from the target; it never reopens, mutates, or deletes history.

Public game RPCs ignore draft query parameters and load only the server-controlled active pointer
whose target lifecycle is `published`. Game Test uses separate internal RPCs. Realtime identities
include the exact revision, preventing a newly published/rolled-back bootstrap from joining an
incompatible prior revision cohort. Publication performs no balance, inventory, reward, token,
wallet, progression, asset lifecycle, or deployment mutation.

## Failure, logging, and rate boundaries

Reads use the existing bounded world-read bucket. Draft writes, validation, preview/Game Test,
derivation, and publish/review/rollback use existing validated action scopes; publish and rollback
share the stricter publication limit. Request IDs are bounded and used for idempotent retry.
Mutation endpoints require trusted browser origin. Safe API failures distinguish missing revision,
conflict, validation, AAL2, acknowledgement, review, Game Test, maintenance, and runtime
incompatibility without returning SQL, storage, token, or secret detail.

Audit records contain actor, admin session, world, exact revision, prior/next pointer, bounded
reason, request ID, outcome, safe change summary and evidence IDs. They exclude manifests when not
required, binary content, raw grants/session tokens, cookies, service credentials, signed URLs, and
private storage paths. Publication/revision ledgers are append-only under forced RLS.

## Residual risks and pending validation

Owner browser acceptance is pending, including accessibility/responsive interaction and visual
depth/collision inspection. Hosted database lint, hosted RLS tests, hosted migration application,
and post-migration Game Client verification are pending and must be performed through owner-gated
commands. No hosted write, publication, rollback, asset activation, deployment, or player mutation
was authorized or performed in this task.
