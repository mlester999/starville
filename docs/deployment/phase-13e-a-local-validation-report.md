# Phase 13E-A local validation report

Date: 2026-07-24  
Scope: Supabase-first foundation only  
Starting branch: `master`  
Starting commit: `fd2026e78645` (`fixed vercel issues`)

## Outcome

The Phase 13E-A source, migration, contract, and production-safety checks pass locally. The
repository remains configured for the existing custom Realtime and worker providers in production.
Supabase migration parity is intentionally incomplete, hosted mutation remains unauthorized, and
Phase 13D remains `STAGE A BLOCKED`.

Local PostgreSQL migration execution and pgTAP could not run because this workstation's Docker
daemon is unavailable. The SQL migrations passed PostgreSQL 17 parser coverage and the repository
contains executable local PostgreSQL fixtures and pgTAP coverage for use once Docker is restored. No
hosted Supabase project was used as a substitute.

## Completed checks

| Check                                                                                       | Result                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                            | Passed; 39 package tasks and root TypeScript checks                                                                           |
| `pnpm lint`                                                                                 | Passed; 39 package tasks and root lint checks                                                                                 |
| `pnpm test`                                                                                 | Passed; 69 tasks, including 395 game-client tests, 408 API tests, 214 database tests, 35 Realtime tests, and 32 config tests  |
| `pnpm test:root`                                                                            | Passed; 14 files and 153 tests                                                                                                |
| `NEXT_PUBLIC_REALTIME_PROVIDER=custom STARVILLE_BACKGROUND_JOBS_PROVIDER=custom pnpm build` | Passed; 39 of 39 packages                                                                                                     |
| `pnpm format:check`                                                                         | Passed                                                                                                                        |
| `pnpm security:scan`                                                                        | Passed; 1,679 source files and 692 browser build files scanned, with six local secret values checked without disclosure       |
| `pnpm production:audit`                                                                     | Passed as an audit command; reported `STAGE A BLOCKED`, 87 migrations, production mutation unauthorized, and Phase 14 `NO-GO` |
| `git diff --check`                                                                          | Passed                                                                                                                        |

The security boundary recognizes a complete `sb_secret_...` credential-shaped value while allowing
the bare prefix string bundled internally by the official Supabase browser SDK. Explicit server-only
environment identifiers and actual configured secret values remain forbidden in browser output.

## Migration and manifest integrity

| Artifact                                                      | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260724100000_phase13e_supabase_realtime_authorization.sql` | `d6d8058834df5361cda218f19edd1969594e93f0e2cdf573422f09954b52b1af` |
| `20260724101000_phase13e_social_cleanup_cron_foundation.sql`  | `147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97` |
| `migrations.v1.json`                                          | `240ba42c89c004195d92c73aa49d8cf36074a31f349cb0dac414d6df4e3674c9` |
| `production-environment.v1.json`                              | `e75c1e6dd44942584f6e10be882b1a41405e1959739f356ecbb618d9c2d58a46` |

The migration manifest contains 87 ordered entries and records the two Phase 13E-A hashes above. The
commissioning manifest pins the migration and production-environment manifest hashes.

## Environment-limited check

`pnpm exec supabase status` returned:

```text
failed to inspect container health: Cannot connect to the Docker daemon at
unix:///var/run/docker.sock. Is the docker daemon running?
```

Required follow-up after Docker is restored:

1. Start the local Supabase stack.
2. Apply all local migrations from a clean database.
3. Run `supabase test db` for the Phase 13E-A pgTAP suite.
4. Run the local PostgreSQL execution fixtures, including Realtime allow/deny and Cron
   idempotency/locking coverage.
5. Archive the successful output as new evidence; do not change hosted configuration during this
   validation.

## Intentionally not performed

- No hosted Supabase migration, RLS, Auth, Realtime, Cron, Vault, or project-setting mutation.
- No production environment/provider switch.
- No public Realtime enablement and no Cron schedule activation.
- No deletion of the custom Realtime server or worker.
- No Phase 13D readiness promotion.
- No commit or push.
