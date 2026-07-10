# Administrator-session revocation

## Session model

`admin_sessions` is independent from Supabase Auth. It stores only identifiers, state, expiration,
and version snapshots—never tokens, cookies, passwords, raw IP addresses, or raw user agents.
Configured trusted-session lifetime is validated at startup and cannot exceed 60 minutes.

States are `pending_mfa`, `active`, `revoked`, and `expired`. Expiration is enforced by comparing
`expires_at` with database time; a background expiry job is not required. Missing rows and stale
snapshots fail closed.

## Creation and activation

An explicit successful password login calls `POST /api/v1/admin/session`. A new trusted row is
allowed only for a matching live Auth session issued within the last five minutes. Reusing that
endpoint cannot recreate a revoked/expired/stale row with the same Auth session ID.

If MFA is required at AAL1, the row is `pending_mfa` and protected access remains denied. A later
explicit POST with the same verified Auth session at AAL2 can activate that row transactionally.
Route reads never create, extend, or activate a row. Existing active sessions are validated rather
than silently extending their TTL.

## Invalidation rules

- Current logout revokes only the matching trusted session.
- Explicit revocation changes its state and records a reason.
- Suspension, disabling, role change, or MFA-requirement change increments `session_version` and
  revokes pending/active rows.
- Role-permission mapping changes increment affected users' `permission_version`; existing snapshots
  become invalid immediately.
- Password change is enforced by an `AFTER UPDATE OF encrypted_password` trigger on `auth.users`.
  The trigger increments `session_version`, revokes every pending or active trusted session for that
  user with reason `password_changed`, and appends `admin.password.changed`.
- Auth-session deletion makes authorization fail even if the trusted row still says active.

The public session-expired screen deliberately does not distinguish revocation, expiration, or
version mismatch.

## Concurrency and recovery

Database row locks serialize activation/revocation of a matching Auth session. The last active Super
Admin trigger uses a transaction advisory lock to prevent concurrent demotion/disable races. A fresh
explicit Auth login is required after revocation or version invalidation; normal route access cannot
repair the session.
