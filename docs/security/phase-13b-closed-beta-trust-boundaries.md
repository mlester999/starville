# PHASE 13B CLOSED-BETA TRUST BOUNDARIES

## Canonical boundary map

| Boundary                    | Accepted identity / credential                        | Allowed                                                   | Denied                                             | Validation and evidence                                                         | Rate/failure                                                        | Secret risk                                      |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Browser                     | None by default                                       | Render; submit bounded intent                             | Claim authority or balances                        | Strict client/API schemas; safe errors                                          | UI backoff; no infinite retries                                     | Never embed private env or service role          |
| Wallet provider             | Wallet public key + signed challenge                  | Sign canonical one-time message                           | Supply trusted token balance                       | Server signature, wallet, domain, origin, network, nonce, expiry                | Wallet/IP challenge and verify limits; fail closed                  | Do not log signature/message/nonce               |
| Reown                       | Public project ID and wallet transport                | Connection UX                                             | Authorization or settlement                        | Public config only; API remains authority                                       | Provider outage is retryable and bounded                            | Project ID is public; no private key             |
| Landing                     | Public app config + token cookie                      | Challenge/verify/recheck/logout                           | Gameplay/economy mutation                          | Exact mutation origin, JSON, path cookie                                        | Database-backed wallet limits                                       | No service role or raw session hash              |
| Game Client                 | Token-access cookie; realtime ticket                  | Player intent and subscriptions                           | Cross-player/private/admin access                  | API ownership plus realtime admission/message schemas                           | Route/identity/message limits                                       | Never expose cookie/token hash                   |
| Admin Portal                | Supabase user/session                                 | Fixed permission routes                                   | Service-role RPC or self-grant                     | Backend RBAC, current session, AAL, origin, revision, reason                    | Admin action limits; audited denial                                 | No service role; recovery marker signed/HttpOnly |
| API                         | Valid player/admin credential                         | Call narrow authoritative RPCs                            | Direct table authority                             | Strict schemas, authorization middleware, safe errors, request ID               | Distributed limits plus local defense-in-depth; 503 on dependencies | Logger redaction and closed responses            |
| Realtime Server             | One-time ticket bound to session/player/world         | Admit, route validated events                             | Impersonation/private subscription/admin events    | Exact origin, ticket hash, admission/revalidation RPCs, 16 KiB schema limit     | Connection/message/chat/social/activity limits; close fail-closed   | Ticket secret/server credentials only            |
| Worker                      | Service role in private runtime                       | Bounded reconciliation/cleanup RPCs                       | Browser-facing action or direct arbitrary mutation | Job-specific RPC contract, idempotency, retry audit                             | Bounded retry/concurrency; startup not-ready on failure             | No key in logs or client bundles                 |
| Supabase Auth               | Supabase-issued user/session claims                   | Admin identity and AAL source                             | Permission grant by claim alone                    | `getClaims`/`getUser`, admin catalog/session lookup                             | Revocation/expiry fail closed                                       | Auth cookies never logged                        |
| PostgREST                   | `anon`, `authenticated`, `service_role` JWT role      | Exact granted RPC/table path                              | Inherited PUBLIC or broad table access             | Applied-catalog grants and RLS                                                  | PostgreSQL errors close safely                                      | Service role server-only                         |
| PostgreSQL functions        | Exact role plus function arguments                    | Validated atomic operation                                | Dynamic identifier authority or cross-scope action | SECURITY DEFINER owner/search_path, internal auth, locks, receipts/audits       | Database rate/lock/idempotency rules                                | No secret output                                 |
| Storage                     | Authorized server/admin path                          | Private intake; immutable public delivery                 | Arbitrary path/MIME/version replacement            | Path canonicalization, PNG/WebP, size/dimension/alpha processing, authorization | Upload/admin limits; cleanup/replay behavior                        | Private buckets and keys remain server-side      |
| Solana RPC / token provider | Server request for configured network/mint/wallet     | Read finalized/confirmed token state                      | Browser-asserted balance                           | Program, decimals, amount, owner, slot, config version                          | Timeout/cache/recheck bounds; deny on unavailable                   | RPC URL treated as sensitive by logger           |
| Administrator               | Active admin user/session + role, AAL2 where required | Fixed role permissions                                    | Self-grant or specialist-role crossover            | API and database authorization/audit                                            | Identity/action limits; disabled user loses access                  | No MFA secret or raw token evidence              |
| Moderator                   | Moderator permission set                              | Reports, approved moderation actions                      | World publish, economy correction, admin identity  | Permission+AAL/reason/audit                                                     | Moderation rate limits; reversible states                           | Only bounded moderation evidence                 |
| Customer Support            | Support permission set                                | Safe player/session/history inspection; approved recovery | Direct DUST/inventory alteration                   | Permission and audited correction workflow                                      | Support action limits; conflict-safe                                | No private messages/secrets without need         |
| Read-only Analyst           | `*.read` / `*.inspect` permissions only               | Aggregated/read-only operational evidence                 | Any mutation                                       | Catalog assertion rejects non-read permission                                   | Read limits; denied mutation audited                                | No unnecessary private player data               |

## Applied role/grant model

| Principal            | Direct table posture                                                                       | Function posture                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| PUBLIC               | No Starville table grant                                                                   | No public/private function execution                                                                  |
| anon                 | No Starville table grant                                                                   | Exact authentication/public-read entry points only                                                    |
| authenticated player | Six SELECT grants on protected admin catalog tables, usable only through RLS/admin context | Exact browser-safe auth/admin functions; representative economy/trade/correction settlement is denied |
| service_role         | No direct public table grants                                                              | Exact API/realtime/worker RPC signatures only                                                         |
| database owner       | Trusted `postgres`/`supabase_admin` ownership                                              | Migration/function ownership; not a browser identity                                                  |

The six authenticated table grants are `admin_roles`, `admin_permissions`, `admin_role_permissions`,
`admin_users`, `admin_sessions`, and `admin_audit_logs`. Their RLS and backend authorization remain
mandatory; the grant is not a public read policy.

## Admin role boundaries

| Role                | Representative allowed work                        | Explicitly denied boundary                   |
| ------------------- | -------------------------------------------------- | -------------------------------------------- |
| Super Admin         | Approved identity/role and highest-impact controls | Cannot bypass session/AAL2/audit/idempotency |
| Game Administrator  | Game content/player operations assigned in catalog | `roles.manage` and Super Admin-only controls |
| Live Ops Manager    | Maintenance/announcement/live controls             | Administrator identity management            |
| Moderator           | Reports, mute/warn/suspend/restore as granted      | World publish and asset activation           |
| Customer Support    | Bounded inspection/recovery/correction proposal    | Direct economy policy or correction approval |
| Blockchain Operator | Token/blockchain configuration as granted          | Inventory/player-audit private data          |
| Read-only Analyst   | Read/inspect permissions                           | Every mutation permission                    |

Disabled admins and revoked admin sessions fail authorization on the next backend check. Role
changes do not rely on stale navigation state. High-impact paths such as publication, asset
activation, economy correction/policy, token configuration, maintenance, session revocation, and
role/identity management require current server-verified AAL2 according to their existing
route/function policy.

## RLS, function, and grant result

- Applied public tables: 318; all 318 have RLS enabled and FORCE RLS.
- Explicit public policies: 6. Most authoritative tables intentionally have no browser policy and
  are reachable only through authorized functions.
- Functions: 785; SECURITY DEFINER functions: 742; procedures: 0.
- All audited public/private SECURITY DEFINER functions use `search_path=""`, the established
  strongest repository convention requiring schema-qualified references.
- PUBLIC execute findings: 0. Direct `service_role` table grants: 0. Authenticated table grants: 6
  allowlisted SELECT grants.
- Trusted relation/function owners are `postgres` or `supabase_admin`.
- Dynamic SQL and unqualified-reference review found no new Phase 13B defect; the full 742-function
  semantic review remains represented by migration grammar, focused pgTAP, applied-catalog checks,
  and subsystem tests rather than a claim that `plpgsql_check` ran locally.

## Player and subsystem isolation

The database and API suites cover anonymous/authenticated denial, Player A/Player B profile and
state isolation, inventory/DUST/progression authority, farm/home ownership, visibility/invite/block
rules, helper bounds, party/chat scope, gift/trade participants, moderator evidence, and admin-only
data. No permissive fallback policy was added. The service role does not bypass operation-level
authorization merely because it can execute an RPC.

## Wallet, session, and token access

Challenge entropy, hash storage, expiry, one-time consumption, wallet/network/domain/origin binding,
signature verification, cleanup, concurrent verification, and rate limits are covered by existing
wallet/API/PostgreSQL tests. Token sessions bind wallet/config/version and revalidate
server-observed Solana state. Expired/revoked/token-lost/suspended states clear or reject the
session and close realtime access. Cookies are HttpOnly, bounded, path-scoped, SameSite, and Secure
in production.

## Abuse and moderation posture

Route- and identity-aware authorities cover wallet challenge/verify, profile/player operations,
position/world transitions, chat/reporting, friends/parties, gifts/trades, cooperative activities,
home visits/helper actions, farming/cooking/crafting/shop/economy operations, uploads, and sensitive
admin actions. Database authorities provide cross-instance enforcement where required; in-memory
limits are supplemental.

Text is length/schema bounded and rendered as text. Chat/party/home scopes, mute/block/suspension,
report/moderator audit, reconnect, retention, and cleanup remain authoritative. Gift/trade/economy
risk signals are review evidence, not automatic punishment or confiscation.

## Browser, file, and secret boundary

API/realtime/worker response headers are deny-by-default. Admin CSP precisely derives API/Supabase
origins; Landing CSP is deferred until exact Reown hosted origins can be verified. World Asset input
requires protected admin permission and origin, declared and downstream byte caps, allowlisted
PNG/WebP types, canonical generated storage keys, image processing/dimensions, immutable versions,
private previews, and separate activation/restore authorization. SVG upload is not accepted.

Server source maps are build artifacts for private diagnostics and must not be served by the hosting
layer. Logs recursively redact authorization/cookies/tokens/signatures/nonces/MFA/private keys,
database/RPC URLs, service-role material, and secret query parameters. No secret was added or
printed by Phase 13B.
