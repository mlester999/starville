# Hosted Supabase test safety

Phase 2 tests may contact only the verified Starville Development project. The command refuses to
run unless environment, URL hostname, canonical link, and `RUN_HOSTED_SUPABASE_TESTS=true` all
match. Migration writes use a different approval.

Before direct SQL fixture setup, the database URL is independently bound to that same project. A
direct URL must use `db.<project-ref>.supabase.co`; a Supavisor pooler URL must use the exact
`postgres.<project-ref>` database username. A mismatch is rejected without printing the URL.

Each run:

1. Generates a UUID test-run ID and strong runtime-only password.
2. Creates only emails shaped `starville-phase2-test+<run-id>-<purpose>@example.com`.
3. Creates confirmed, run-tagged test identities through server-only Auth administration to avoid
   real mail.
4. Signs in normally and uses actual anonymous/authenticated JWTs for RLS and API assertions.
5. Uses privileged SQL only for exact fixture setup and cleanup.
6. Propagates fixture API/audit request IDs as `phase2-test:<run-id>` and tags password-change
   audits with the same server-controlled run ID.
7. Deletes rows only for the exact collected Auth user UUIDs and exact audit run ID.
8. Deletes only those exact Auth users and reports every cleanup failure.

The audit cleanup escape is PostgreSQL-only, accepts a UUID, and deletes only rows whose exact
request ID or server-controlled metadata tag matches that run. It is not executable by `anon`,
`authenticated`, or `service_role`.

Forbidden operations include database reset, migration down, schema drop, truncate, wildcard Auth
user deletion, email-domain deletion, broad date-based cleanup, touching pre-existing administrator
rows, and using service role as the RLS identity under test. Tests run serially and never use
production credentials. A cleanup error fails the run and must be reported.
