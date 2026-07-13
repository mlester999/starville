# World Asset Administrator Runbook

## Before operating

Confirm that the environment safety gates match the intended target. Local work keeps hosted writes
and hosted tests disabled unless the owner gives explicit approval. Never use a production
service-role credential in a browser or local client bundle.

Use a distinct authorized administrator for upload/edit and review/approval when the deployment's
staffing model supports separation of duties. Confirm the exact permission before diagnosing a
`403`; never add a broad grant as a workaround.

## Normal production-candidate flow

1. Open `/world-assets/upload`.
2. Select the exact asset profile and read its requirements.
3. Upload one PNG/WebP. A local preview is advisory.
4. Wait for authoritative processing. On a safe retry, reuse the presented operation rather than
   changing the file or repeatedly submitting.
5. Resolve validation failures by creating a corrected attempt/version.
6. Configure name, tags, render size, anchors, depth, rotations, and collision.
7. Compare the authenticated original with the normalized preview and thumbnail in all relevant
   preview modes. The original must never reveal an intake URL.
8. Validate, submit for review, and record a concise reason.
9. Review duplicate/reference/validation impact.
10. Approve and activate only after the immutable candidate is correct.
11. Confirm the active version is visible to draft World Editor selection.

## Failure handling

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
