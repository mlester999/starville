# Phase 12A player-experience trust boundaries

## Authority matrix

| Concern               | Authority                                                                           | Browser capability                                       |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Onboarding completion | Canonical gameplay evidence plus server projection                                  | Read; acknowledge three educational views only           |
| Starter rewards       | Existing canonical bootstrap/quest functions                                        | No direct grant                                          |
| Daily assignment      | PostgreSQL, server time, UTC date, deterministic eligibility                        | Read; revision-bound refresh without day/objective input |
| Daily contribution    | Canonical farming, production, shop, housing, progression, or acknowledgement event | Cannot submit counts                                     |
| DUST/inventory/XP     | Existing canonical ledgers and progression functions                                | Existing narrow gameplay actions only                    |
| World guidance        | Versioned semantic target registry                                                  | Render marker/hint; no completion authority              |
| Recovery              | Rate-limited queue and bounded worker                                               | Request a reason-coded verification                      |
| Admin support         | Verified permission plus current AAL2 session                                       | Three audited narrow actions                             |
| Daily policy          | Immutable active version and version-pinned definitions                             | AAL2 draft successor only; no active switch              |
| Game Test             | In-memory shared fixture                                                            | Inspect only; no mutation route                          |

All new state tables enable and force RLS. `public`, `anon`, and `authenticated` receive no table
privileges. Only `service_role` can execute the public Phase 12A RPCs; private helpers are revoked
even from service role and are reached only by owning definer functions and triggers. Service-role
credentials stay in the API and worker server processes.

Input boundaries enforce wallet shape, UUIDs, revisions, bounded strings, finite enums, pagination,
rate limits, and idempotency hashes. API failures map to stable public codes; database error text is
not returned. Revision conflicts require a fresh workspace. Gameplay trigger adapters catch Phase
12A projection failures so a secondary tutorial projection cannot roll back a canonical crop,
workstation, shop, housing, or progression action.

Append-only evidence, owner events, telemetry, and admin audit rows reject update/delete. Active
version rows and their onboarding/daily definition children are immutable. Admin reads exclude
wallet addresses, access tokens, IP data, private inventory contents, and raw message content.
Telemetry is aggregate and operations-only.

The local PostgreSQL fixture proves browser-role denial, function grants, replay safety, zero
duplicate DUST, one daily assignment, and bounded worker behavior. Hosted RLS, lint, signed-in
cross-player denial, and current migration-list validation remain pending explicit hosted approval.

## Upstream dependency advisory

`pnpm audit --audit-level=high` currently reports GHSA-3gc7-fjrx-p6mg in the transitive
`bigint-buffer@1.1.5` dependency used by the latest Solana SPL Token packages. The reviewed advisory
has no published patched version. Starville prohibits the package's optional native build in
`pnpm-workspace.yaml`, so installed server and browser bundles use its pure-JavaScript conversion
path. This is a bounded availability-risk mitigation, not a claim that the upstream advisory is
resolved; the dependency must be upgraded or removed when a patched upstream chain becomes
available.
