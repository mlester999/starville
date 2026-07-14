# Platform publication and rollback

Lifecycle: **Draft → Validated → In review → Published**. Previous active versions become
superseded. Rollback reactivates an immutable previously published version and never edits its JSON.

Save draft sections, validate, submit for review, review with another authorized administrator, then
publish with a reason, expected draft revision, expected active revision, and idempotency ID. Stale
revisions return conflicts and duplicate request IDs return the prior result. Published JSON and
audit rows cannot be updated or deleted. Idempotency is checked before revision and rate-limit
evaluation; new lifecycle mutations are atomically rate-limited per administrator.
