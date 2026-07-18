# World Asset Administrator Runbook

## Before operating

Confirm that the environment safety gates match the intended target. Local work keeps hosted writes
and hosted tests disabled unless the owner gives explicit approval. Never use a production
service-role credential in a browser or local client bundle.

Use a distinct authorized administrator for upload/edit and review/approval when the deployment's
staffing model supports separation of duties. Confirm the exact permission before diagnosing a
`403`; never add a broad grant as a workaround.

## Normal production-candidate flow

For a deliberate hosted upload session, the owner must temporarily set
`SUPABASE_REMOTE_WRITES_APPROVED=true` and restart both the API and admin portal so their narrow
runtime profiles receive the approval. Keep the value `false` for ordinary diagnosis and local mock
testing. After the one reviewed draft upload and audit check, restore `false` and restart both
services. This approval permits the upload attempt only; review and activation remain separate
administrator actions.

1. Optionally open `/world-assets/guide` for type checklists and a local blank PNG template.
2. Open `/world-assets/upload`.
3. Select the exact asset profile and read its requirements.
4. Upload one PNG/WebP. A local preview is advisory.
5. Wait for authoritative processing. On a safe retry, reuse the presented operation rather than
   changing the file or repeatedly submitting.
6. Resolve validation failures by creating a corrected attempt/version.
7. Configure name, tags, render size, anchors, depth, rotations, and collision.
8. Compare the authenticated original with the normalized preview and thumbnail in the Preview room.
   The original must never reveal an intake URL.
9. Validate, submit for review, and record a concise reason.
10. Review duplicate/reference/validation impact.
11. Approve and activate only after the immutable candidate is correct.
12. Confirm the active version is visible to draft World Editor selection.

## Failure handling

- **Remote uploads disabled**: keep the gate closed during diagnosis. If the owner has explicitly
  approved one hosted upload, verify that both the API and admin portal were restarted after the
  temporary approval was set; never remove or bypass the gate.
- **Invalid image/type/dimensions/transparency**: do not rename or bypass it. Correct the source and
  create a new attempt.
- **Duplicate checksum**: inspect the authorized duplicate summary. Reuse the existing asset/version
  when it represents the same content.
- **Upload interrupted**: use the same idempotency operation when the UI offers retry. Do not create
  many parallel attempts.
- **Processing/storage failure**: record the request ID and safe error code. Do not expose or
  manually share private object identifiers.
- **Revision conflict**: reload the current asset/version and reapply only the intended change.
- **Activation failure**: verify the public derivative copy completed before retrying finalization.
  The operation is idempotent and must never overwrite an existing public object.
- **Preview load failure**: verify exact delivery origin/CSP and immutable public object
  availability. Do not make the intake bucket public.
- **Reference conflict**: deprecate rather than delete. Inspect references and migrate editable
  drafts through the normal World Editor flow.

Always correlate API logs by request ID. Public errors are intentionally less detailed than server
logs.

## Rollback

Asset data migrations are forward-only. Do not drop tables, delete versions, remove bucket objects,
or rewrite published maps to roll back.

If a newly active version is unsuitable:

1. deprecate it with a reason;
2. activate another compatible version that is still in the approved state, or create and review a
   corrected Version N+1;
3. replace affected objects only in editable map drafts;
4. validate and preview those drafts; and
5. publish a new map version only with explicit owner approval.

Existing published map versions keep their pinned assets throughout this process. If delivery itself
is unsafe, use the deployment incident process to disable the affected public object/CDN route while
retaining database and audit evidence; do not erase history.

## Audit review

Use `/world-assets/audit` with bounded filters. Confirm actor, permission, request ID,
asset/version, operation, reason, outcome, and timestamp for upload, processing, validation, review,
approval, activation, deprecation, and World Editor replacement. Audit entries are append-only and
must never contain binary data, credentials, private paths, or raw exception text.
