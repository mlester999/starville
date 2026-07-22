# Environment and deployment preparation

## Environment inventory

| Target           | Purpose                                       | Data                             | Network/provider boundary                           | Mutation policy                             |
| ---------------- | --------------------------------------------- | -------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| `local`          | development, migration chain, automated tests | synthetic/local only             | local Supabase and local services                   | local only                                  |
| `test`           | isolated automated execution                  | disposable synthetic only        | test-scoped processes                               | test fixture only                           |
| `starville-dev`  | hosted rehearsal and closed beta              | approved hosted development data | dedicated development project/domains/Reown project | explicit narrow gate per command            |
| `starville-prod` | production                                    | real production data             | dedicated production project/domains/Reown project  | Phase 13D owner-approved commissioning only |

`NODE_ENV` controls build/runtime behavior; `NEXT_PUBLIC_APP_ENV` controls public application
behavior; `STARVILLE_DEPLOYMENT_TARGET` identifies the infrastructure target. These values must
agree but are not interchangeable. The release validator defaults an absent deployment target to
`local` for backward-compatible local checks and requires an explicit `starville-prod` target for
production validation.

## Configuration procedure

1. Copy the variable names and classifications from `production-environment.v1.json` into the
   provider's encrypted environment editor. Do not copy values into the repository or an evidence
   document.
2. Assign separate service scopes. Only API, Realtime, and Worker may receive the service-role
   credential. Only an authorized commissioning job may receive `DATABASE_URL`.
3. Enter exact HTTPS origins for Landing, Game, Admin, and API and an exact WSS Realtime URL. Do not
   use `*`, origin regexes, preview domains, HTTP, or localhost.
4. Configure the production Supabase ref twice: the current target ref and an independently supplied
   approved production ref. Also retain the development ref solely so the validator can reject
   equality.
5. Set Solana to `mainnet-beta`, the approved mainnet RPC endpoint, and the owner-approved SPL mint.
   Token-gating thresholds and program expectations remain server-authoritative.
6. Keep `SUPABASE_ALLOW_REMOTE_DB_WRITES`, `SUPABASE_TARGET_CONFIRMED`,
   `SUPABASE_REMOTE_WRITES_APPROVED`, `SUPABASE_HOSTED_TESTS_APPROVED`, and
   `SUPABASE_ADMIN_BOOTSTRAP_ENABLED` false during configuration validation.
7. Run `pnpm release:validate`. It prints only target name and counts; it does not print secret
   values or connect to a service.

Failure is fail-closed. Correct the provider configuration; never weaken the validator, add a
wildcard, reuse the development ref, or expose a server variable to a browser prefix.

## Domain and URL plan

The owner must select the deployment provider and exact domains. The logical allocation is:

- Landing: public HTTPS root; initiates Reown and redirects only to the exact Game URL.
- Game Client: public HTTPS application origin; talks only to exact API, Realtime, Supabase,
  approved RPC, and Reown endpoints.
- Admin Portal: separate HTTPS origin; never linked as a registration flow; protected by Supabase
  auth, backend authorization, RLS, module permission, and AAL2 mutation gates.
- API: HTTPS origin with exact Landing/Game/Admin CORS allowlist.
- Realtime: WSS origin with exact Game origin allowlist.
- Worker: private process with no public domain.

Preview deployments must not inherit production secrets or production Supabase/Reown configuration.
Production cookies must use secure attributes and the narrowest applicable domain. Supabase Auth
site URL and redirect allowlist must contain exact accepted Landing/Game/Admin flows and no
localhost entries.

## Reown production preparation

Create a dedicated production Reown project. Register only accepted production Landing and Game
origins, verify the application metadata/icon URLs, and select Solana mainnet. The project
identifier is public but controlled configuration; provider management credentials are secrets.
Verify connect, sign-in challenge, cancel, rejection, unsupported wallet, network mismatch,
reconnect, logout, session expiry, and revoked-session behavior.

The Landing Content Security Policy contains exact API, Supabase, and repository-locked Reown
origins; it does not use `*`, broad `https:`, or broad `wss:` sources. Phase 13D must observe the
locked production build in report-only rehearsal, compare requests to the reviewed list, and reject
unexpected sources before confirming enforcement. A dependency upgrade requires a new CSP review.

## Deployment sequence and rollback

Build one approved commit. Record artifact identifiers and checksums. Deploy in dependency order:
database commissioning, API/Worker/Realtime, Admin, Game, Landing. Keep public admission closed
through maintenance until health, readiness, database invariants, login, wallet, content, and
rollback smoke checks pass.

If a service fails, keep or enable maintenance, stop workers where relevant, redeploy the previous
immutable artifact, confirm health, and record the event. Never solve an application rollback by
reversing migrations or deleting player/audit data.
