# Phase 2 administrator authentication

## Scope

Phase 2 establishes authentication and authorization for the private Starville Admin Portal. It uses
Supabase Auth for identity, trusted PostgreSQL records for administrator authority, protected
Next.js routes, protected Fastify routes, short-lived administrator sessions, permission checks,
MFA-aware decisions, password recovery, and administrator audit records.

This phase does not add administrator-management screens, operational dashboards, player tools,
wallet authentication, token gating, or gameplay. Those interfaces remain assigned to later phases,
principally Phase 5 for administrator operations.

## Sources of truth

Supabase Auth proves who signed in. It does not, by itself, prove that the identity is an
administrator. Authorization is granted only when all of these server-verified conditions hold:

1. The Supabase Auth access token and user identity are valid.
2. A trusted `admin_users` row exists for the Auth user.
3. The administrator status is `active`.
4. The referenced role is valid.
5. The required permission is assigned to that role.
6. A matching, active, unexpired `admin_sessions` row exists.
7. Its session- and permission-version snapshots still match `admin_users`.
8. The verified Auth assurance level satisfies the effective MFA requirement.

The browser never supplies a trusted role, status, permission set, session version, or MFA result.
User metadata, email domain, local storage, wallet ownership, token ownership, hidden controls, and
query parameters do not grant administrator access.

## Authentication and authorization flow

```text
Credentials submitted to Supabase Auth
  -> verified Auth identity and Auth session
  -> trusted admin_users lookup
  -> active status and valid role
  -> verified MFA assurance when required
  -> trusted admin session created or an MFA-pending session activated
  -> version snapshots recorded
  -> permission-aware server decision
  -> protected route or API response
```

After successful password authentication, the portal verifies the identity on the server before
loading administrator data. The trusted session is bound to the verified Supabase Auth session ID,
the user ID, its expiration, and the current authorization versions. A valid Auth token without a
valid trusted administrator session is insufficient.

The Fastify API applies the same checks to bearer-authenticated requests. `GET /api/v1/admin/me`
returns only the current administrator context: user ID, display name, role, permissions, status,
administrator-session ID, session expiration, and safe MFA-assurance fields. It never returns Auth
tokens, cookies, user metadata, secret configuration, or another administrator's record.

## Next.js and cookie boundary

The admin portal uses the supported Supabase SSR pattern for the installed Next.js version:

- A browser client uses only the public Supabase URL and anonymous or publishable key.
- A server client reads and writes Auth cookies through the framework cookie API.
- The Next.js request proxy refreshes the session when required and passes refreshed cookies to the
  browser response.
- Protected layouts and pages make authorization decisions on the server.
- Server-only modules are separated from browser-safe exports.
- The service-role or modern secret key is never imported into a client component or browser bundle.

Client redirects improve the experience but are not an authorization boundary. The API and database
independently enforce the decision.

## Portal routes

| Route              | Phase 2 behavior                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `/`                | Redirects to login, overview, unauthorized, session-expired, or MFA-required according to the verified server result. |
| `/login`           | Email/password sign-in for authorized personnel; there is no registration path.                                       |
| `/forgot-password` | Requests recovery with a generic response that does not reveal whether the email exists.                              |
| `/reset-password`  | Accepts a valid recovery session, validates password strength and confirmation, then changes the password safely.     |
| `/auth/callback`   | Exchanges only a password-recovery callback code and redirects to fixed, validated local destinations.                |
| `/unauthorized`    | Explains the restriction, links to the configured Starville game URL, and permits sign-out.                           |
| `/session-expired` | Reports only that the trusted administrator session is no longer valid.                                               |
| `/mfa-required`    | Denies protected access until sufficient verified assurance is present.                                               |
| `/overview`        | Minimal protected shell containing only real current-administrator and session information.                           |

There is intentionally no `/signup` route, public invitation flow, wallet login, token login, demo
account, or bypass action.

## Status and response behavior

An absent, invalid, or expired Auth credential returns HTTP 401 from protected API routes. A valid
Auth identity that lacks administrator authority returns HTTP 403. The 403 category includes a
missing administrator record, an invited/suspended/disabled administrator, an invalid role, missing
permission, an invalid trusted administrator session, a version mismatch, or insufficient MFA
assurance.

Public responses are deliberately generic. Internal status and denial details are retained only in
restricted structured logs and audit records where appropriate.

## Administrator sessions

Administrator sessions are separate from Supabase Auth sessions. Their lifetime is configured by
`ADMIN_SESSION_TTL_MINUTES`, limited to at most 60 minutes, and cannot be extended by a
browser-supplied value. Validation checks:

- Auth user and Auth session identifiers
- Active administrator status
- Role existence
- Explicit revocation and expiration
- `session_version` snapshot
- `permission_version` snapshot
- Effective MFA requirement and verified assurance level

Current-session logout revokes only the matching administrator session. Suspension, disabling, role
changes, permission changes, password changes, or an explicit version increment invalidate stale
authorization. Password invalidation is authoritative in PostgreSQL: an `auth.users` password-change
trigger increments the administrator's `session_version`, revokes every pending or active trusted
session for that user, and appends `admin.password.changed`. The UI does not reveal whether an
invalid session was revoked, expired, or invalidated by a policy change.

## MFA-aware authorization

The authoritative per-user MFA requirement is `admin_users.mfa_required`.
`ADMIN_REQUIRE_MFA_BY_DEFAULT` controls the bootstrap default; it does not override or weaken an
existing database record. A first-factor-only session is denied when stronger assurance is required.
Authorization reads verified Supabase assurance information; it never accepts a browser boolean or a
decoded, unverified claim.

Phase 2 includes enforcement and a functional TOTP challenge on `/mfa-required`. The server lists
only the signed-in user's verified TOTP factors, validates the selected factor again, and sends the
six-digit code directly to Supabase `challengeAndVerify`; it never logs or persists the code. A
successful challenge refreshes the verified session to AAL2 before the trusted administrator session
is activated.

Factor enrollment, unenrollment, recovery, and administrator-facing factor-management screens are
not included. Enrollment must be completed through an approved Supabase flow or dashboard until a
later authorized phase adds a dedicated interface. The requirement must not be disabled merely
because enrollment UI is absent.

## Password recovery

The forgot-password action always presents the same result whether or not an email is registered.
Its redirect is derived from the validated administrator URL. The callback establishes a verified
recovery session before `/reset-password` accepts a new password. Both the callback and reset action
require a verified Auth user/session whose verified `amr` contains `recovery`. They also require a
ten-minute HttpOnly recovery marker signed with `ADMIN_RECOVERY_COOKIE_SECRET` and bound to that
same user ID and Auth session ID. The marker signature is checked with timing-safe comparison; an
expired, tampered, cross-user, or cross-session marker is rejected.

The reset form requires matching, policy-compliant values. Passwords, recovery links, callback
codes, access tokens, refresh tokens, recovery-marker contents, and cookies must never be logged or
written to audit metadata. Updating `auth.users.encrypted_password` invokes the database trigger
that increments `session_version`, revokes every pending/active trusted administrator session, and
records the password-change audit event before the portal clears its local Auth and recovery state.
Expired, malformed, tampered, or replayed recovery links and markers fail without exposing Auth
internals.

Actual email delivery depends on the hosted Supabase email provider and templates. The required
hosted redirect and provider configuration is documented in
[`hosted-supabase-development.md`](../deployment/hosted-supabase-development.md).

## Audit events

Authentication and authorization operations create server-owned events including successful and
denied login, logout, trusted-session creation and revocation, access and permission denial,
password change, bootstrap, role change, and status change. Events carry the server request ID and
administrator-session ID when available. The non-enumerating recovery request is intentionally not
written with an email address or claimed user identity. Audit data is append-only for normal
application identities and never stores credentials or raw Auth material.

## Deferred to Phase 5 or later

Phase 2 deliberately omits administrator invitation and management UI, role and permission editing,
session-management screens, operational dashboards, player and wallet tools, economy tools, map or
asset tools, audit-log browsing UI, and live metrics. The permission catalog exists now so future
server operations can use stable keys; it does not imply that those pages or operations are already
implemented.
