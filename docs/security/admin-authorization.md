# Administrator authorization

## Trust chain

Supabase Auth authenticates identity; it does not grant administrator authority. Every protected
request must satisfy this chain:

1. Verify the bearer/cookie JWT and current Auth user server-side.
2. Bind the request to the verified `session_id` claim and a live `auth.sessions` row.
3. Load an `active` `admin_users` row with a valid role.
4. Find the matching trusted `admin_sessions` row.
5. Reject revoked, expired, or MFA-pending sessions.
6. Compare session- and permission-version snapshots.
7. Enforce `admin_users.mfa_required` against the verified `aal` claim.
8. Enforce the stable permission key in the API and RLS policy.

The database function `get_current_admin_authorization()` returns only the caller's safe context and
never writes. Protected page/layout reads therefore cannot resurrect a revoked session. Only the
explicit login endpoint can create a trusted session, and only a pending session bound to the same
Auth session can be activated after verified AAL2.

## Portal boundary

Next `proxy.ts` refreshes Supabase SSR cookies and propagates no-cache response headers. It is not
an authorization boundary. Root and protected route loaders verify identity and call the read-only
trusted RPC on every protected server render. Browser state, URL parameters, hidden UI, Auth user
metadata, email domain, wallet ownership, and token ownership are never consulted for authority.

The administrator Auth cookie uses a dedicated namespace so localhost apps on different ports do not
collide. No access or refresh token is manually stored.

An MFA-required session remains pending until the current user submits a code for one of their
verified TOTP factors. The server re-lists and validates the factor before calling Supabase
Challenge and Verify; factor IDs select a verified server-returned factor and never grant authority.
Codes are neither persisted nor logged. Only the resulting verified AAL2 claim can activate the
trusted session.

Password recovery has an additional server-only boundary. The callback and reset action require a
verified Auth session whose verified authentication-method reference includes `recovery`, plus a
ten-minute HttpOnly marker signed with `ADMIN_RECOVERY_COOKIE_SECRET` and bound to the same Auth
user and session ID. The marker is not authorization and cannot substitute for the verified recovery
session; either check failing denies the reset.

## API boundary

Fastify accepts strict `Authorization: Bearer <token>` syntax, calls Supabase `getClaims()` and
`getUser()`, and confirms subject/session identifiers before any administrator RPC. Reusable checks
then require active admin state, a trusted session, and the requested permission.

- HTTP 401: missing, malformed, invalid, or expired authentication.
- HTTP 403: authenticated non-admin, inactive/invalid admin, stale/revoked/expired trusted session,
  insufficient MFA, or missing permission.

Responses and audit reasons are generic. Request IDs are preserved. Authorization headers, cookies,
callback codes, passwords, and Supabase errors containing secrets are never logged.

## Server-only mutation boundary

`anon` and `authenticated` receive no direct table mutations. Even the API service-role client has
direct table privileges revoked; it calls signature-specific `SECURITY DEFINER` functions instead.
Those functions have empty `search_path`, fully qualified objects, validated arguments, and explicit
execute grants. The bootstrap and hosted fixture paths have separate environment gates.

Password changes are invalidated below the API boundary. A private trigger on the actual
`auth.users.encrypted_password` update increments `admin_users.session_version`, revokes all of that
user's pending/active trusted sessions, and appends an audit event. Portal redirects or client state
are not relied upon for this invalidation.

Administrator invitation/management UI and future operational mutations remain outside Phase 2.
