# Phase 13E-A local validation report

Date: 2026-07-24  
Scope: Supabase-first foundation only  
Starting branch: `master`  
Starting commit: `fd2026e78645` (`fixed vercel issues`)

Hosted-unblock baseline: `phase-13e-supabase-first` at `2300f5a4764d0fd957318cea541dcf5e79db921e`;
clean and synchronized before correction.

Compatibility-correction baseline: `phase-13e-supabase-first` at
`d23d137b0660a0d3c199d2f8f9dcefc8ca52ca5c`; clean and synchronized before correction.

## Outcome and hosted compatibility correction

The Phase 13E-A source, migration, contract, and production-safety checks pass locally. The
repository remains configured for the existing custom Realtime and worker providers in production.
Supabase migration parity is intentionally incomplete, hosted mutation remains unauthorized, and
Phase 13D remains `STAGE A BLOCKED`.

The owner selected hosted `starville-dev` validation without Docker or a local Supabase runtime. The
first read-only attempt found 84 matching migrations and no history drift. After the permission
repair and hosted harness preparation, a separate retry successfully applied Phase 13B, then the
Realtime migration failed because it tried to enable RLS on Supabase-owned `realtime.messages`. That
Phase 13E transaction fully rolled back, the migration is absent from remote history, and no Phase
13E object remains remotely. The compatibility correction removes that redundant `ALTER TABLE` and
the same table’s ownership-sensitive `GRANT`; it preserves all four policies and exact helper ACLs.
No hosted write occurred during this repository correction, and no completed hosted Phase 13E proof
is claimed.

## Completed checks

| Check                                                                                       | Result                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                            | Passed; 39 package tasks and root TypeScript checks                                                                          |
| `pnpm lint`                                                                                 | Passed; 39 package tasks and root lint checks                                                                                |
| `pnpm test`                                                                                 | Passed; 69 tasks, including 395 game-client tests, 408 API tests, 217 database tests, 35 Realtime tests, and 32 config tests |
| focused parser/checksum/review/target/harness tests                                         | Passed; 8 files and 69 tests                                                                                                 |
| Phase 13E post-failure migration capture review                                             | Passed; 85 matched, three pending in exact order, zero remote-only                                                           |
| Phase 13E Realtime and cleanup harness dry runs                                             | Passed; zero remote calls and zero remote writes                                                                             |
| `pnpm test:root`                                                                            | Passed; 20 files and 183 tests                                                                                               |
| `NEXT_PUBLIC_REALTIME_PROVIDER=custom STARVILLE_BACKGROUND_JOBS_PROVIDER=custom pnpm build` | Passed; 39 of 39 packages                                                                                                    |
| `pnpm format:check`                                                                         | Passed                                                                                                                       |
| `pnpm security:scan`                                                                        | Passed; 1,692 source files and 695 browser build files scanned, with six local secret values checked without disclosure      |
| `pnpm production:audit`                                                                     | Passed as an audit command; remains `STAGE A BLOCKED`, production mutation unauthorized, and Phase 14 `NO-GO`                |
| `git diff --check`                                                                          | Passed                                                                                                                       |

The security boundary recognizes a complete `sb_secret_...` credential-shaped value while allowing
the bare prefix string bundled internally by the official Supabase browser SDK. Explicit server-only
environment identifiers and actual configured secret values remain forbidden in browser output.

## Migration and manifest integrity

| Artifact                                                            | SHA-256                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| previous hosted-failing Realtime migration                          | `d6d8058834df5361cda218f19edd1969594e93f0e2cdf573422f09954b52b1af` |
| `20260724100000_phase13e_supabase_realtime_authorization.sql`       | `20532eb6c659da4d3d93a6f3183ed4a8719921e26efb0822049fae065bb51b84` |
| `20260724100500_phase13e_realtime_authorization_permission_fix.sql` | `4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723` |
| `20260724101000_phase13e_social_cleanup_cron_foundation.sql`        | `147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97` |
| previous `migrations.v1.json`                                       | `fcdee9ed405e96c483b88d55e758109dcb5cc42687c803b80964bb2a357daf59` |
| corrected `migrations.v1.json`                                      | `54b2136ea9e06755a7452e308611d283bb9b32429142c77ffb8a2dd487322bce` |
| `production-environment.v1.json`                                    | `e75c1e6dd44942584f6e10be882b1a41405e1959739f356ecbb618d9c2d58a46` |

The migration manifest contains 88 ordered entries and records the three Phase 13E-A hashes above.
The commissioning manifest pins the migration and production-environment manifest hashes.

## Environment-limited check

`pnpm exec supabase status` returned:

```text
failed to inspect container health: Cannot connect to the Docker daemon at
unix:///var/run/docker.sock. Is the docker daemon running?
```

The Docker result remains historical evidence only; Docker is no longer part of the selected
validation workflow. Required hosted follow-up:

1. Verify exact linked `starville-dev`, migration history, private-only settings, and the dry run.
2. Confirm Phase 13B is applied and report exactly the Realtime foundation, permission repair, and
   disabled-Cron foundation as pending, in that order.
3. Apply only after explicit hosted-test and remote-write approval.
4. Run the allowlisted Phase 13E pgTAP, two-client Realtime, and transactional cleanup harnesses.
5. Archive successful masked output as separate hosted evidence.

## Intentionally not performed

- No hosted Supabase migration, RLS, Auth, Realtime, Cron, Vault, or project-setting mutation.
- No production environment/provider switch.
- No public Realtime enablement and no Cron schedule activation.
- No deletion of the custom Realtime server or worker.
- No Phase 13D readiness promotion.
- No commit or push.
