# Phase 9B-A current Solana, wallet, and token-access assessment

> **Architecture mode only. Token claims are disabled. No treasury signer is connected. No
> blockchain transaction is built, signed, or sent. No database migration is introduced by Phase
> 9B-A.**

## Purpose and evidence boundary

This assessment records the repository behavior that a future token-claim design would inherit. It
is grounded in the current implementation, ignored local public selectors, migrations, and tests. It
does not perform a hosted database read, contact a Solana RPC, inspect a live mint, connect a
wallet, or treat older documentation as fresh external evidence.

The current authority hierarchy is:

1. The API process selects one network and private RPC through server configuration.
2. The validated `token_gate_configs` row is authoritative for the access mint, token program,
   decimals, exact raw threshold, commitment, version, session TTL, and recheck interval.
3. The Solana adapter verifies the selected RPC's genesis hash and reads the exact mint and wallet
   accounts.
4. PostgreSQL atomically consumes wallet challenges and creates, rechecks, rotates, and revokes
   access sessions.
5. Reown and both browser applications are presentation and untrusted-input boundaries only.

Environment mint, symbol, and display threshold values are public selectors/defaults. They do not
override a validated database row and must not be described as independent access authority.

## Current configured selectors

The ignored local development environment currently selects:

| Selector            | Current local value                                                                                                                         | Meaning                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Solana network      | `solana:mainnet-beta`                                                                                                                       | API RPC/genesis boundary and landing AppKit network                       |
| Mint selector       | `GAME_TOKEN_MINT_ADDRESS` is present in ignored local configuration; its exact value is intentionally not copied into tracked documentation | Public expected temporary mint selector, not database authority           |
| Display symbol      | `STAR`                                                                                                                                      | Presentation only                                                         |
| Display requirement | `10000`                                                                                                                                     | Production access threshold; raw authority is stored in the validated row |

Fresh local migrations deliberately seed Devnet and Mainnet development rows as `unconfigured`. They
include only a legacy non-authoritative display placeholder and no mint, program, decimals, or raw
requirement, so a fresh database fails closed until an authorized administrator validates and saves
a mint.

Earlier hosted-operation records state that the development Mainnet row was validated against the
temporary locally selected mint, owned by Token-2022 with six decimals. Phase 9B-A did not perform a
hosted read or live mint inspection, so that statement is historical evidence, not a new external
confirmation. The temporary mint is not the owner-approved production `$STAR` mint.

## Current-code evidence map

The assessment traces these current sources rather than relying on an older status summary:

| Boundary                                                                                             | Current implementation source                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Reown initialization, single-network selection, and disabled transaction-oriented features           | `apps/landing/src/lib/reown.ts`                                                                       |
| Account/network/disconnect behavior and `signMessage` use                                            | `apps/landing/src/components/wallet-access-flow.tsx`                                                  |
| Public token-access client and safe response parsing                                                 | `apps/landing/src/lib/token-access/client.ts`                                                         |
| Canonical message, domain/URI/network/nonce fields, public schemas, and exact amount conversion      | `packages/wallet-access/src/index.ts`                                                                 |
| Nonce/session generation and HMAC/SHA-256 helpers                                                    | `packages/wallet-access/src/server.ts`                                                                |
| Known genesis hashes, Ed25519 verification, mint validation, balance aggregation, timeout, and retry | `packages/solana/src/index.ts`                                                                        |
| Server configuration bounds and process-selected network                                             | `packages/config/src/server.ts`                                                                       |
| Challenge, signature, balance, session, recheck, revocation, and admin-config orchestration          | `apps/api/src/token-access/service.ts`                                                                |
| Trusted Origin, cookie, no-store, verify/recheck/disconnect HTTP boundary                            | `apps/api/src/routes/token-access.ts` and `apps/api/src/token-access/http.ts`                         |
| Token-gate, challenge, rate-limit, access-session, and append-only event schema                      | `infrastructure/supabase/migrations/20260710100000_token_access_schema.sql`                           |
| Atomic challenge consumption, session rotation, monotonic recheck, config invalidation, and grants   | `infrastructure/supabase/migrations/20260710101000_token_access_functions_rls.sql`                    |
| Unique wallet-owned player identity                                                                  | `infrastructure/supabase/migrations/20260711100000_player_vertical_slice.sql`                         |
| Realtime ticket and durable access-session/player-profile binding                                    | `infrastructure/supabase/migrations/20260715100000_realtime_presence_foundation.sql`                  |
| Solana adapter tests                                                                                 | `packages/solana/test/solana.test.ts`                                                                 |
| Canonical message, amount, nonce, and session-token tests                                            | `packages/wallet-access/test/wallet-access.test.ts`                                                   |
| Token-access service and HTTP tests                                                                  | `apps/api/src/token-access/service.test.ts` and `apps/api/src/token-access/routes.test.ts`            |
| PostgreSQL/RLS assertions                                                                            | `infrastructure/supabase/tests/token_access.test.sql` and `packages/database/test/migrations.test.ts` |

## Reown AppKit boundary

The landing uses Reown AppKit and the Solana adapter at version `1.8.22`. Initialization is
browser-only and idempotent. It configures exactly the selected Solana network, sets that network as
the default, and rejects unsupported chains.

AppKit features for onramp, swaps, send, and receive are disabled. Starville requests only the
provider's `signMessage` capability. It does not call `signTransaction`, `signAllTransactions`,
`sendTransaction`, or `sendRawTransaction`. Wallet brands are not separately allowlisted; a Solana
wallet is usable for current access only if the selected provider exposes compatible message
signing.

Connection alone grants nothing. Missing message-signing capability, a rejected prompt, account
change, network change, invalid signature, and verification failure all create no new access
session.

## Network and genesis enforcement

The implementation intentionally supports the configured values `solana:devnet` and
`solana:mainnet-beta`; it does not hardcode Mainnet solely from `NODE_ENV`. This preserves the
master specification's network configurability. The current local configuration selects Mainnet
Beta.

The server maps each supported network to its immutable genesis hash:

| Network             | Required genesis hash                          |
| ------------------- | ---------------------------------------------- |
| Solana Mainnet Beta | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Solana Devnet       | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1`             |

The network is bound independently at several layers:

- AppKit exposes only the configured network.
- Challenge creation rejects a browser network different from the API process network.
- The canonical signed message contains the network identifier.
- Challenge persistence snapshots the network and configuration version.
- Challenge consumption requires the same network.
- The RPC adapter calls `getGenesisHash` before every mint/balance verification and rejects a
  different cluster.

A wrong network never becomes an insufficient balance. It fails closed as a temporary verification
error in the public API.

## Mint, token program, decimals, and threshold

The administrator path validates a proposed mint through the server-owned RPC before saving it. A
valid mint must be a canonical Solana public key, exist, be non-executable, be initialized, and be
owned by either the classic SPL Token program or Token-2022. Decimals are read from the mint account
and must be an integer from 0 through 18.

The save path validates the mint again, converts the requested display amount to exact raw units,
locks the expected configuration version, persists the observed program/decimals/slot, increments
the version, and invalidates sessions on the previous version. During player verification, the
adapter result must match the consumed configuration's exact mint, token program, and decimals.

Thresholds and balances never use floating-point authorization. For the historically validated
six-decimal temporary mint, the expected `1000` threshold is `1000000000` base units. Exactly that
amount qualifies; `999999999` base units does not.

## Server-authoritative balance reads

For initial verification and every due recheck, the server-only Solana adapter:

1. validates canonical wallet and mint public keys;
2. verifies the configured cluster genesis hash;
3. calls `getAccountInfo` for the exact mint with `jsonParsed` and the configured commitment;
4. validates mint owner program, initialization, executable state, decimals, and observation slot;
5. calls `getTokenAccountsByOwner` for the exact wallet and mint with the mint slot as
   `minContextSlot`;
6. rejects a response context below that minimum;
7. de-duplicates account public keys;
8. counts only non-closed accounts whose parsed wallet owner, mint, program, decimals, and state all
   match; and
9. sums `tokenAmount.amount` using `bigint` before comparing it with the stored raw threshold.

Initialized and frozen accounts are intentionally counted for current holdings-based access. Closed,
zero-lamport, uninitialized, unknown-state, wrong-wallet, wrong-mint, wrong-program, and
wrong-decimal accounts do not count. A same-symbol token at another mint cannot satisfy access.

RPC or schema failure never produces a synthetic zero. It produces a temporary error and no new
session.

## Wallet ownership message and replay resistance

The API creates a canonical human-readable message containing:

- the landing domain and exact origin URI;
- the wallet address;
- the configured Solana network;
- a 256-bit server-generated nonce;
- issue and expiration timestamps;
- a challenge UUID; and
- a fixed statement that the signature authenticates Starville access and does not authorize a
  transaction, transfer, or spending authority.

The domain must equal the URI host. The API parses the exact canonical format, compares every signed
field with its persisted snapshot, compares SHA-256 message and nonce hashes using constant-time
comparison, and verifies the exact UTF-8 bytes using Ed25519 against the canonical wallet public
key.

PostgreSQL row-locks challenge lookup and atomically consumes only an unexpired, unused challenge
whose wallet, network, nonce hash, and message hash all match. Consumption happens before RPC work.
Consequently, a valid signature cannot be replayed after successful verification or after an RPC
failure. A challenge can back at most one access session.

Raw messages, nonces, signatures, cookies, IP addresses, user agents, RPC URLs, and provider details
are not persisted in wallet-access events. Only bounded hashes and safe audit context are stored.

## Session creation and wallet-to-player binding

An eligible verification creates a random 256-bit, 43-character base64url browser token. The raw
token exists only in a host-only, HttpOnly, `SameSite=Lax` cookie scoped to `/api/v1/token-access`;
production cookies are `Secure`. PostgreSQL stores only `HMAC-SHA-256(cookieSecret, rawToken)`.

The access-session record binds:

- the consumed challenge;
- wallet address and network;
- token-gate configuration ID and version;
- observed and required raw amounts;
- checked slot and last balance-check time;
- expiry and status; and
- an opaque session reference.

The current wallet-first account model does not put a Supabase user ID or player ID directly on
`wallet_access_sessions`. Instead, `player_profiles.wallet_address` is unique. Every protected API
request resolves the HttpOnly cookie server-side, derives the wallet from the trusted session, and
loads the unique profile by that wallet. A request body cannot choose the authoritative wallet.

Realtime makes the binding explicit: its one-use 30-second ticket and durable realtime session store
both `wallet_access_session_id` and `player_profile_id`. Admission rechecks the access session,
profile moderation, maintenance, and world state. A new realtime admission closes prior active or
stale presence for the same profile.

This is a secure current wallet-to-player binding. A future claim must nevertheless bind the durable
safe player ID and verified recipient wallet explicitly; carrying only a browser wallet string is
not sufficient.

## Freshness, rotation, and revocation

Default access-session TTL is 900 seconds, bounded from 60 through 3,600 seconds. Default balance
recheck is 300 seconds, bounded from 30 through 1,800 seconds and never greater than the TTL.

Every protected API lookup evaluates status, expiry, configuration version, and recheck due time.
Initial balance observations cannot precede the configuration's validated slot. Later observations
cannot regress below the session's previous checked slot.

Rechecks claim a database lease before RPC work. This prevents concurrent requests from amplifying
RPC calls. An automatic request may reuse the most recent trusted snapshot while another request
owns the recheck lease. A future high-value claim boundary must not use this relaxed concurrent-read
behavior: it must require an explicit, strict, successfully completed fresh verification.

The game schedules the server-provided recheck, reconciles every 30 seconds, and reconciles on focus
or visibility restoration. A temporary browser-to-API failure may leave the already-mounted UI
visible, but protected API and realtime services remain authoritative.

Session-ending paths include:

- explicit disconnect;
- expiry;
- a new access session for the same wallet/network, which rotates prior active sessions;
- insufficient balance on recheck;
- configuration change or disablement;
- checked-slot regression;
- moderation and administrator session actions; and
- RPC recheck failure when persistence is available.

Session creation locks the shared configuration row before revoking existing same-wallet/network
sessions and inserting the new one. That transaction serializes concurrent creations even though the
table does not use a partial unique index for active sessions.

Landing account/network changes abort in-flight work and request revocation. The current client uses
the generic `disconnect` reason for that request, so specific `account_changed` and
`network_changed` reasons are not retained in this UI path. This is an audit-quality limitation, not
an authorization bypass.

Disconnect is necessarily best-effort when the API is unreachable. A browser cannot directly clear
or revoke an HttpOnly server credential. The session remains bounded by server expiry and recheck.
Future claims must require fresh proof and must not treat wallet-UI disconnection as authoritative
revocation.

## Duplicate-session behavior

- Access: one active session per wallet/network after each serialized creation; older sessions are
  marked `rotated`.
- Realtime ticket: issuing a new ticket removes older unconsumed tickets for the profile.
- Realtime presence: admitting a new ticket closes the profile's prior active/stale session as
  `replaced`.
- Different supported networks can have separate database rows, but one API process and landing flow
  select only one configured network.

These controls prevent two current browser sessions from independently becoming two authoritative
player identities. They are not a future claim idempotency mechanism; claims need eligibility- and
claim-specific uniqueness.

## RPC timeout and retry behavior

The default per-request timeout is 5,000 ms and is bounded from 500 through 15,000 ms. Maximum
attempts default to two and are bounded from one through three.

Fetch/network failures and HTTP 429 or 5xx responses retry within the configured limit. Terminal
HTTP responses, RPC error envelopes, invalid schemas, and semantic verification failures fail
immediately. Genesis, mint, and token-account calls each pass through this boundary. Recheck leases
cover the maximum three-call timeout/retry budget plus a safety margin.

Errors returned to players omit provider messages, credentials, RPC URLs, SQL detail, and internal
hashes. An RPC error is never mislabeled as insufficient balance.

## Public disclosure inventory

The unauthenticated public configuration intentionally exposes:

- enabled and availability state;
- configured network;
- token display symbol;
- full public mint address;
- required display amount; and
- recheck interval.

The authenticated session view additionally exposes the session's wallet address, observed display
amount, expiry, and next recheck. UI text shortens the address by default and provides an
intentional copy action.

Public responses do not expose the RPC URL, provider credential, raw requirement, token program,
decimals, config version, checked slot, cookie, cookie hash, challenge hashes, signature, nonce, or
internal session ID. The Reown project ID is browser-public by design.

Current public guides accurately state that Mainnet Beta and a 10,000-token threshold are used
unless the reviewed live screen differs. They also state that the token remains in the wallet, the
ownership signature is not a transaction, no seed phrase/private key is requested, no token claim or
payout is active, no withdrawal exists, and DUST cannot convert to `$STAR` or SOL.

## Current tests and remaining acceptance

Existing tests cover:

- canonical message round trips and exact-byte mutation rejection;
- domain/URI and Mainnet identifier binding;
- Ed25519 signature/key matching and replay rejection;
- challenge consumption before an RPC failure;
- Mainnet genesis acceptance and wrong-genesis failure;
- canonical mint, supported program, decimals, and account filtering;
- Token-2022 and values beyond `Number.MAX_SAFE_INTEGER`;
- exact-threshold arithmetic and one-base-unit-below denial;
- bounded RPC retries and safe errors;
- trusted Origin, CORS, cookie, and caching behavior;
- recheck leases, stale slots, configuration invalidation, and session HMAC storage; and
- game-client fail-closed mounting, periodic reconciliation, revocation, and wallet replacement.

Phase 9B-A should add explicit regression assertions for the current Mainnet selector, configured
mint validation, verified decimals, and approved 10,000 display-token requirement, plus source-level
tests for Reown account/network/disconnect behavior. Live supported-wallet, live RPC, and hosted-row
confirmation remain owner-gated external acceptance; offline architecture work does not substitute
for them.

## Phase 9B-A conclusion

The current access boundary rejects browser-invented eligibility, replayed signatures, wrong
genesis, wrong mint, wrong program, inconsistent decimals, and stale configuration. It is adequate
as the identity/access prerequisite for offline claim architecture work.

It is not itself a claim authorization boundary. Phase 9B-A must design separate immutable
eligibility, strict claim freshness, recipient/amount/mint/network binding, caps, reserves,
quarantine, replay prevention, and exactly-once settlement. Those designs remain disabled and cannot
activate a signer or blockchain operation.
