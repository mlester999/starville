# Phase 13B closed-beta hardening architecture

## Status and input

Phase 13B consumes the repository state reported by Phase 13A as **PHASE 13A GAMEPLAY INTEGRATION
CANDIDATE LOCALLY READY, HOSTED VALIDATION AND OWNER ACCEPTANCE PENDING**. Phase 13A reported no
unresolved local critical gameplay-authority blocker. Its hosted validation, manual journeys, device
checks, and owner acceptance remain pending and are not inferred here.

Phase 13B is a hardening phase, not a feature phase. It adds no currency, marketplace, animal,
livestock, NFT, reward-token, or production-commissioning system. Animal Care remains disabled and
unreleased.

## Environment boundary

- Intended hosted target: `starville-dev`, only after explicit owner approval.
- Prohibited target: `starville-prod`.
- Work in this phase is local. No migration push, deployment, hosted player mutation, hosted
  inventory/DUST/progression/social mutation, world publication, or asset activation is authorized.
- `SUPABASE_REMOTE_WRITES_APPROVED`, `RUN_HOSTED_SUPABASE_TESTS`, and `ADMIN_BOOTSTRAP_ENABLED`
  default to `false`. A write approval is single-command, owner-controlled, and must be returned to
  `false` immediately.

## Authority architecture

The browser is untrusted. Landing and Game Client provide intent and presentation; they do not
settle token access, inventory, DUST, rewards, progression, gifts, trades, housing, or moderation.
The Admin Portal is also an untrusted browser boundary: it obtains a Supabase-authenticated admin
session and calls protected API routes. It never receives the service-role key.

The API, Realtime Server, and Worker use narrowly granted service-role RPC entry points. PostgreSQL
functions validate identity, role/AAL, ownership, expected revision, operation key, payload
fingerprint, bounds, and current authoritative state before mutation. Critical state changes and
their audit/receipt evidence are committed atomically.

```text
wallet/Reown -> Landing -> API -> Supabase/PostgreSQL -> Solana RPC
                              \-> signed, bounded token-access session

Game Client -> API -----------> authoritative gameplay/economy RPCs
            -> Realtime ------> admission + channel/party/home authority RPCs

Admin Portal -> Supabase Auth -> API -> admin authorization/AAL2 -> audited RPCs

Worker -----------------------> bounded reconciliation/cleanup RPCs
```

## Database hardening

The Phase 13B forward-only migration repairs only catalog defects proven by the applied full-chain
audit:

1. FORCE RLS is applied to 20 early public tables that enabled but did not force RLS.
2. Direct `service_role` CRUD grants are revoked from 19 Phase 12A Player Experience tables; the API
   and worker keep only their narrow RPC execution paths.
3. Inherited `PUBLIC` execution is revoked from 19 private progression helper functions.

The deterministic applied-catalog fixture then asserts that every public table enables and forces
RLS, every public/private SECURITY DEFINER function uses the repository's established empty
`search_path`, PUBLIC executes no Starville function, browsers cannot call representative settlement
RPCs, table-grant allowlists are exact, object owners are trusted, and specialist admin roles do not
cross high-risk boundaries.

## Authentication and sessions

- Wallet challenges are server-created, entropy-backed, wallet/network/domain/origin bound,
  expiring, one-time, hashed at rest, rate-limited, and signature-verified server-side.
- The token-access cookie is HttpOnly, path-scoped to `/api/v1/token-access`, SameSite=Lax, bounded,
  and Secure in production. World Game Test uses a separate HttpOnly, SameSite=Strict, path-scoped
  cookie.
- Token balances are read through server-side Solana RPC logic. Browser-provided balances are never
  accepted. Network, mint, token program, decimals, amount, wallet, slot, config version, and expiry
  are validated.
- Admin authentication is separate from player token access. Sensitive admin routes enforce the
  fixed permission and current `aal2` server-side; UI badges are informational only.
- Logout, revocation, suspension, role changes, token loss, and realtime revalidation fail closed.

## Authorization and input validation

API routes use strict schemas and safe error envelopes. Unknown or malformed identifiers,
quantities, coordinates, revisions, operation keys, enum values, reasons, pagination, uploads, and
text are rejected before authority work. Mutation origins are exact allowlists and credentialed CORS
reflects only configured origins. Player IDs and privileged reasons are never accepted as authority
by themselves.

Admin roles remain fixed: Super Admin, Game Administrator, Live Ops Manager, Moderator, Customer
Support, Blockchain Operator, and Read-only Analyst. The applied catalog contains 12 system roles
and 186 system permissions. Direct-call denial and role boundaries are enforced by API and database
authorization, not navigation visibility.

## Concurrency and exact-once behavior

Inventory, DUST, shops, farming, cooking/crafting jobs, objectives, progression, gifts, trades,
housing, visits, corrections, publication, and reconciliation use the established combination of row
locks, deterministic lock order, expected revisions, immutable receipts/audits, idempotency keys,
and payload fingerprints. A replay returns the stored result; reuse with changed payload is
rejected. Multi-party settlements occur in one database transaction.

The isolated PostgreSQL chain exercises final-slot races, final-stock purchases, concurrent DUST and
inventory updates, reward/correction review separation, gift/trade settlement, party/home capacity,
publication races, reconciliation, and replay/conflict behavior. Phase 13B does not replace the
subsystem receipts with a new incompatible global registry.

## Abuse, moderation, and support

Distributed database-backed limits protect wallet, player, world, social, cooperative, economy,
home-visit, and admin authority paths. Process-local API/realtime limiters remain defense-in-depth,
not the only cross-instance authority. Chat uses bounded text, scope isolation,
mute/block/suspension checks, duplicate-spam/rate controls, safe rendering contracts, reporting, and
audited moderation.

Gift/trade eligibility, ownership, capacity, revisions, confirmation resets, atomic settlement, and
risk evidence remain authoritative. Risk signals are evidence for review; they do not automatically
confiscate assets or treat a shared address as guilt. Customer Support sees bounded operational
evidence and must use approved correction workflows rather than direct ledger/table mutation.

## Realtime and load boundary

Realtime admission binds the token-access session, player, world, version, and channel. Message
parsing validates protocol version/type, identity derived from the connection, sequence, movement,
coordinates, payload size, social scope, chat scope, and operation-specific revisions. Exact origin,
16 KiB payload, connection-cap, message-rate, channel/party/activity/home isolation, revalidation,
checkpoint, and disconnect cleanup are enforced server-side.

The local harness covers 1/5/10/20/40 public clients, one/two channels, mobile-like user agents,
dormant-tab dwell, movement/chat bursts, five reconnects, cooperative instances, and owner-plus-ten
home visits. It is protocol-level synthetic evidence, not browser-rendering, physical-device,
hosted, or production-capacity evidence.

## Health, observability, and browser boundary

`/health` means the process is alive. API `/ready` now loads authoritative token-access catalog
state; Realtime `/ready` now executes its session-revalidation dependency path; Worker becomes ready
only after its bounded startup jobs succeed. Dependency failure returns 503 with a closed response.

API/realtime/worker responses include no-store, nosniff, no-referrer, deny-framing, restrictive
Permissions-Policy, strict API CSP, correlation IDs, and production-only HSTS. Admin retains its
allowlisted CSP and gains Permissions-Policy/HSTS. Landing gains non-breaking baseline headers; a
strict Landing CSP is intentionally deferred until Reown's exact hosted origin set is captured so
wallet flows are not broken. Game Client production headers remain a Phase 13C hosting-boundary
task.

Structured logs include request/correlation ID, operation, route, status/result, and duration where
available. The shared logger recursively redacts credentials, cookies, tokens, signatures, nonces,
database/RPC URLs, service-role material, and secret-bearing URL parameters.

## Known limitations

- Hosted catalog/RLS parity, Solana RPC behavior, service readiness, and network interruption remain
  owner-controlled starville-dev validation.
- `plpgsql_check` is unavailable in the isolated local PostgreSQL runner.
- The load harness does not measure browser frame time, real mobile throttling, event-loop delay, or
  physical-device behavior.
- Worker readiness proves successful startup reconciliation, not continuous database probing after
  startup; hosted alerting/cadence and a continuous probe are Phase 13C operational tasks.
- Production source maps are server build artifacts and must not be served publicly by the Phase 13C
  deployment configuration.
- Owner acceptance is deliberately deferred and never automated.
