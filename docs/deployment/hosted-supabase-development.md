# Hosted Supabase development workflow

## Selected Phase 2 and Phase 3 environment

Phases 2 and 3 use the dedicated hosted Starville Development Supabase project. Docker and the local
Supabase stack are not required for this selected workflow. The development project is the only
authorized remote target; a production project or unrelated project must never be linked, migrated,
tested, bootstrapped, or cleaned by these commands.

The canonical CLI project is `infrastructure/supabase`. Because the CLI expects a directory that
contains a `supabase/` child directory, every raw CLI command uses:

```text
--workdir infrastructure
```

Do not run a remote migration command from the repository root without that option. Generated
`.temp` link state is local tooling state and must not be tracked.

## Required environment gates

Real values belong only in the ignored `.env.local` or an approved secret manager. Phase 2 remote
and Phase 3 remote operations use:

```dotenv
SUPABASE_ENVIRONMENT=development
SUPABASE_PROJECT_REF=<development-project-ref>
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false

ADMIN_SESSION_TTL_MINUTES=60
ADMIN_BOOTSTRAP_ENABLED=false
ADMIN_REQUIRE_MFA_BY_DEFAULT=false
ADMIN_RECOVERY_COOKIE_SECRET=<at-least-32-random-characters>
```

The existing public URL and anonymous/publishable key remain browser-safe. The service-role or
modern secret key and database URL remain server-only. Never copy a private value into a
`NEXT_PUBLIC_` variable.

`SUPABASE_REMOTE_WRITES_APPROVED` authorizes only the reviewed operation being run; it is not a
permanent authorization to mutate any project. `RUN_HOSTED_SUPABASE_TESTS` authorizes controlled
fixture writes only after target verification. Bootstrap additionally requires its separate,
normally-disabled gate, an exact `--project-ref`, and `--confirm-development` for apply. See the
[bootstrap runbook](../admin/admin-bootstrap.md) for create and explicit invited-activation forms.

## Target verification

Run before every migration, hosted test, or bootstrap operation:

```bash
pnpm db:verify-target
```

Verification must compare all of these independently:

1. `SUPABASE_ENVIRONMENT` equals `development`.
2. `SUPABASE_PROJECT_REF` is a valid project reference.
3. `NEXT_PUBLIC_SUPABASE_URL` has that project reference as its hostname prefix.
4. `infrastructure/supabase/.temp/project-ref` contains the same linked reference.
5. The required write or hosted-test approval is enabled for the requested operation.

Output is limited to environment, safe project reference, hostname, link status, and approval
status. The verifier must never print a service key, database URL/password, access token, refresh
token, cookie, or Supabase CLI token. Any mismatch is a hard stop.

## CLI capability checks

The repository's installed CLI must be used instead of an unpinned global binary. Confirm command
flags before relying on them:

```bash
pnpm exec supabase --version
pnpm exec supabase link --help
pnpm exec supabase migration list --help
pnpm exec supabase db push --help
pnpm exec supabase db lint --help
pnpm exec supabase test db --help
```

Do not use `--debug` during credentialed operations. Do not pass a database URL or password on the
command line when the verified linked project can be used.

## Migration workflow

All schema changes must exist as reviewed, version-controlled files under
`infrastructure/supabase/migrations` before a remote write. Use the gated root scripts:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Review the migration history and complete dry-run output. Only after every identity and approval
gate passes:

```bash
pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
```

The equivalent raw CLI shape is:

```bash
pnpm exec supabase --workdir infrastructure migration list --linked
pnpm exec supabase --workdir infrastructure db push --linked --dry-run
pnpm exec supabase --workdir infrastructure db push --linked
pnpm exec supabase --workdir infrastructure migration list --linked
pnpm exec supabase --workdir infrastructure db lint --linked --schema public,private --level warning --fail-on warning
```

The raw commands do not replace the repository target gates. Prefer the root scripts.

No migration application or hosted lint result is asserted by this document; results must be
reported from the actual command output during the current validation. The Phase 3 operations
runbook records the present dry-run-only status.

## Hosted database and RLS tests

Run hosted tests only after the migration is confirmed and the exact target is reverified:

```bash
pnpm db:test:hosted
pnpm rls:test:hosted
```

The repository executes a fixed allowlist of committed pgTAP files through its target-bound
PostgreSQL connection:

```bash
pnpm db:test:hosted
```

The installed Supabase CLI advertises `test db --linked` but still invokes Docker to provide its
pgTAP runner. The selected Phase 2 and Phase 3 workflow does not require Docker, so the repository
runner reads the committed SQL file, verifies the database URL against the independently verified
project reference, executes it as one transaction, validates the complete TAP plan, and requires its
final rollback. It never accepts SQL from command-line or user input.

pgTAP tests cover SQL constraints, grants, RLS policies, triggers, and trusted functions. Hosted
integration tests additionally use real temporary anonymous and authenticated sessions; service role
is used only for controlled fixture setup and exact cleanup, never as the identity under RLS.

Every run uses a unique run ID, test-owned Auth users, runtime-generated passwords that are never
printed, and an exact-ID cleanup manifest. Cleanup may delete only records that still carry the
matching fixture ownership. Wildcard user deletion, global cleanup, table truncation, schema reset,
or migration rollback is forbidden. A cleanup failure must fail the command and be reported.

No hosted database or RLS test result is asserted by this document. A hosted phase is only fully
validated after both commands actually pass and fixture cleanup is confirmed.

## Hosted Auth settings

Configure the Starville Development project in the Supabase Dashboard using the validated admin
portal URL. For the default development port, allow at least:

```text
http://localhost:3002
http://localhost:3002/auth/callback
http://localhost:3002/reset-password
```

If `127.0.0.1` is used during development, add the corresponding explicit URLs rather than a broad
wildcard. Hosted deployment URLs must be added individually when a development deployment exists.

Review these settings without changing unrelated Auth behavior:

- Site URL and allowed redirect URLs
- Email/password provider and confirmation behavior
- Recovery email template and callback destination
- SMTP/provider delivery and sender identity
- Recovery-link lifetime and rate limits
- MFA/TOTP availability, with Challenge and Verify APIs enabled
- Refresh-token rotation and reuse interval

The password-recovery callback accepts only a verified recovery Auth session. In addition to
verified `recovery` authentication-method evidence, the portal requires a ten-minute HttpOnly marker
signed with `ADMIN_RECOVERY_COOKIE_SECRET` and bound to the same Auth user and session ID. This
server-side protection does not replace the hosted redirect allowlist or recovery-link lifetime.

Protecting the admin portal does not require globally disabling normal Supabase signup. A normal
Auth account remains a non-administrator unless a trusted active `admin_users` record, valid role,
trusted session, and required permissions all exist.

## Development and production separation

Development and production must use different Supabase projects, credentials, Auth redirect URLs,
databases, audit histories, and test policies. Phase 2 tooling refuses `production`; production
deployment and migration approval require a separate future process. Never copy development test
users into production or reuse development service credentials in another environment.

## Prohibited operations

Do not run `supabase start`, `stop`, `status`, `db reset`, `migration down`, `DROP SCHEMA`, global
Auth-user deletion, `TRUNCATE`, broad fixture cleanup, or migration rollback against the hosted
project. Do not run a write when target identity is ambiguous, and do not use a production or
sibling project to unblock development testing.

Phase 3 mint activation, wallet acceptance, cookie deployment, and the current pending external
setup are documented in [Phase 3 wallet operations](phase-3-wallet-operations.md).
