# Administrator Row Level Security policies

All six Phase 2 tables are in `public`, have RLS enabled in the same migration that creates them,
and start with explicit privilege revocation from `anon`, `authenticated`, and `service_role`.

## Direct access matrix

| Table                    | Anonymous | Normal authenticated | Authorized browser read | Browser write |
| ------------------------ | --------- | -------------------- | ----------------------- | ------------- |
| `admin_roles`            | Deny      | Deny                 | `roles.read`            | Deny          |
| `admin_permissions`      | Deny      | Deny                 | `roles.read`            | Deny          |
| `admin_role_permissions` | Deny      | Deny                 | `roles.read`            | Deny          |
| `admin_users`            | Deny      | Deny                 | `roles.read`            | Deny          |
| `admin_sessions`         | Deny      | Deny                 | `roles.manage`          | Deny          |
| `admin_audit_logs`       | Deny      | Deny                 | `audit_logs.read`       | Deny          |

Policies call `private.has_admin_permission()` to avoid recursive RLS evaluation. That security
definer evaluates the complete trusted session chain; it is not a string role check. No INSERT,
UPDATE, or DELETE browser policy exists.

## RPC exposure

`authenticated` may execute only `get_current_admin_authorization()`, which returns the current
caller and cannot mutate. Service role may execute narrowly scoped authorization, session,
denial-audit, and bootstrap RPCs. Password invalidation is not a browser or service-role RPC: a
private `auth.users` trigger reacts to an actual password-field change, increments the trusted
session version, revokes the user's pending/active administrator sessions, and writes the audit
event. All other private helpers are revoked from public roles.

System role/permission keys, Super Admin mappings, the last active Super Admin, and append-only
audit rows are protected by triggers below the API layer. Ordinary database grants cannot bypass
these invariants.

## Validation

The committed pgTAP suite checks table presence, deterministic catalog counts, RLS flags, and direct
privilege denial. The gated hosted TypeScript suite uses real anonymous and normal-user JWTs,
creates a test-owned active administrator through privileged fixture setup, verifies the caller RPC
and API, then proves direct mutation and revoked-session denial. Until migrations and those suites
run on the approved development project, hosted RLS behavior is not claimed complete.
