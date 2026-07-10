# First Super Administrator bootstrap

## Purpose

The bootstrap command connects an existing Supabase Auth identity to Starville's trusted
administrator records and assigns the system `super_admin` role. It is a server-only recovery and
initialization tool, not a registration flow. It does not create a public signup route, generate a
password, or infer administrator access from an email domain.

Bootstrap is dry-run by default:

```bash
pnpm admin:bootstrap -- \
  --user-id=<existing-auth-user-uuid> \
  --display-name="Initial Administrator" \
  --project-ref=<exact-development-project-ref> \
  --dry-run
```

An apply operation requires the exact verified development project reference:

```bash
pnpm admin:bootstrap -- \
  --user-id=<existing-auth-user-uuid> \
  --display-name="Initial Administrator" \
  --project-ref=<exact-development-project-ref> \
  --require-mfa=true \
  --confirm-development \
  --apply
```

Do not place a password, database URL, access token, refresh token, service-role key, or Supabase
access token on the command line.

## Apply gates

Dry-run is the default even when environment variables are configured. A write is permitted only
when every gate passes:

- `SUPABASE_ENVIRONMENT=development`
- `SUPABASE_PROJECT_REF` is present and valid
- The project reference matches the hostname in `NEXT_PUBLIC_SUPABASE_URL`
- The canonical CLI workdir is linked to the same project
- `SUPABASE_REMOTE_WRITES_APPROVED=true`
- `ADMIN_BOOTSTRAP_ENABLED=true`
- `--project-ref` exactly matches the independently verified target
- `--confirm-development` is present
- `--apply` is present
- The supplied Auth user UUID identifies an existing Auth user

Production, an ambiguous environment, a mismatched hostname/ref/link, missing approvals, or a
placeholder configuration causes an immediate refusal. Bootstrap must not accept a project reference
silently from only one source.

## Dry-run behavior

A dry run may perform safe reads to verify the target, Auth identity, trusted role, and current
administrator state. It reports the intended operation but performs no Auth, database, or audit
write. Output is limited to safe information such as environment, project reference, project
hostname, link state, planned role, and whether the operation would create or refuse the
administrator record.

Dry-run output must never include credentials, passwords, Auth tokens, cookies, database URLs, or
private environment values.

## Apply behavior

After all gates pass, the protected operation:

1. Verifies the Auth user exists.
2. Loads the system `super_admin` role by its stable key.
3. Refuses an unsafe overwrite or ambiguous existing administrator.
4. Creates the trusted `admin_users` record when none exists.
5. Preserves unrelated administrators and never demotes another Super Administrator.
6. Establishes current authorization versions without accepting client-supplied versions.
7. Records `admin.bootstrap.created` in the append-only audit log.
8. Returns a credential-free result.

Re-running the command must not duplicate the administrator, reset an unknown account, replace an
existing role silently, or weaken last-Super-Admin protection. Keep `ADMIN_BOOTSTRAP_ENABLED=false`
during normal operation and enable it only for the controlled apply window.

## Explicit invited-record activation

An existing trusted record is always refused unless the operator deliberately selects the narrow
invited-activation mode and supplies the exact expected state:

```bash
pnpm admin:bootstrap -- \
  --user-id=<existing-auth-user-uuid> \
  --project-ref=<exact-development-project-ref> \
  --activate-invited \
  --expected-status=invited \
  --expected-role=<current-role-key> \
  --require-mfa=false \
  --dry-run
```

After reviewing that preview, application additionally requires `--confirm-development --apply` and
both write gates. The transaction locks and rechecks the row. It refuses if the row disappeared, its
status is no longer `invited`, its current role differs, or another active Super Administrator now
exists. Activation preserves the existing display name rather than silently overwriting it. The MFA
choice must be explicit; `true` is accepted only when the Auth user already has a verified TOTP
factor supported by the portal challenge, preventing the sole Super Administrator from being made
inaccessible.

## Operator checklist

1. Create the intended staff identity through the approved hosted Supabase Auth administration
   surface.
2. Confirm its email ownership and password-reset policy as appropriate.
3. Run `pnpm db:verify-target` and compare only the safe project identity fields.
4. Run the bootstrap command without `--apply` and review the dry-run plan.
5. Temporarily set both write approval and `ADMIN_BOOTSTRAP_ENABLED=true` in the ignored local
   environment.
6. Repeat the reviewed command with `--confirm-development --apply` and the same exact
   `--project-ref`.
7. Verify the trusted administrator through the protected portal/API flow.
8. Return `ADMIN_BOOTSTRAP_ENABLED` to `false`.
9. Do not commit or print the local environment.

## Manual alternative

An authorized project owner may use the hosted Supabase Dashboard and SQL editor when the protected
command is unavailable. The safe manual sequence is still: create or select an existing Auth user,
verify the exact development project, call the reviewed trusted bootstrap operation, and verify its
audit event. Do not insert an ad hoc role string, edit Auth user metadata to simulate a role,
disable RLS, or paste a service-role key into browser code.

The manual alternative is not a public registration mechanism and must follow the same target,
last-Super-Admin, and audit requirements.
