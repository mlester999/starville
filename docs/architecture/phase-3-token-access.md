# Phase 3 token-access architecture

## Status and scope

Phase 3 adds the landing-page wallet journey and a server-authoritative Solana token gate. The code
supports explicitly configured Solana Devnet and Mainnet networks. Reown AppKit is a browser-only
wallet connection and message-signing adapter; it is not an authorization authority.

The Phase 3 migrations are hosted, lint and hosted integration/RLS suites pass, and the configured
temporary Mainnet mint has been validated through the administrator path. Full eligible-wallet
acceptance remains dependent on an owner-controlled wallet holding the configured threshold.

Phase 3 does not create a player account, character, inventory, economy, reward, movement, map, or
other Phase 4 gameplay system. A granted game client shows only the existing foundation scene.

## Major decisions

- Starville uses a canonical custom signed challenge instead of Reown's default SIWX persistence.
  The custom flow keeps nonce generation, one-time consumption, configuration snapshots, session
  issuance, and audit records under the Starville API and database.
- Reown AppKit 1.8.22 is initialized client-side with `SolanaAdapter`, only the configured Solana
  network, and transaction-oriented features disabled. It supplies connection state and
  `signMessage`; it never decides eligibility.
- The API owns Ed25519 signature verification, RPC calls, exact token arithmetic, and session
  issuance. Browser values are untrusted inputs.
- PostgreSQL is the durable concurrency boundary for challenges, sessions, rate limits,
  configuration versions, revocation, and audit events.
- The browser receives an opaque cookie. PostgreSQL stores only an HMAC-SHA-256 digest made with an
  independent server-only secret.
- Token balances are summed as raw integers with `bigint`; display decimals are formatting only.
- A disabled, invalid, or unconfigured gate fails closed. It does not become free access.

## Component boundaries

| Component                  | Phase 3 responsibility                                                                                                                       | Explicitly not trusted for                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Landing                    | Render the Starville hero and access dialog; connect Reown; request a challenge; ask the wallet to sign exact bytes; display safe API states | Signature validity, balance, eligibility, session validity |
| Reown/wallet provider      | Select a Solana wallet and sign the displayed authentication message                                                                         | Token balance, Starville access, administrator access      |
| API                        | Validate origins and inputs; verify signatures; call the Solana adapter; create/recheck/revoke sessions; expose safe responses               | Client-submitted eligibility or balance                    |
| `@starville/wallet-access` | Canonical message, public schemas, exact amount conversion, nonce/session primitives, server hashes                                          | Network I/O or persistence                                 |
| `@starville/solana`        | Canonical address checks, Ed25519 verification, Devnet genesis check, mint validation, raw balance aggregation                               | Database or UI state                                       |
| Supabase/PostgreSQL        | Trusted config, atomic challenge consumption, sessions, configuration invalidation, rate limits, RLS/grants, audit history                   | Direct browser writes                                      |
| Game client                | Ask `/me` and `/recheck` for a trusted grant before mounting Phaser                                                                          | Wallet connection, local access booleans, cached grants    |
| Admin portal               | Server-side authenticated interface to read, validate, and update token-gate configuration                                                   | Direct database mutation or browser-supplied RPC metadata  |

## End-to-end flow

1. The landing loads `GET /api/v1/token-access/config` and `GET /api/v1/token-access/me` with
   caching disabled.
2. Reown connects a wallet on the configured Solana Devnet or Mainnet network. No session is created
   by connection alone.
3. The landing sends the wallet address and configured network identifier to
   `POST /api/v1/token-access/challenge` from an allowlisted origin.
4. The API validates that the trusted database configuration is enabled and fully validated. It
   creates a 32-byte nonce and a canonical message bound to the landing origin, wallet, network,
   issue time, expiry, and challenge UUID.
5. PostgreSQL stores the wallet/configuration snapshot and SHA-256 nonce/message hashes. The raw
   nonce and message are not persisted.
6. The wallet signs the exact UTF-8 message bytes. This is authentication only and creates no
   transaction or spending approval.
7. The landing sends the challenge ID, exact message, address, network, and base64 signature to
   `POST /api/v1/token-access/verify`.
8. The API reloads the unused challenge, compares every signed field and both hashes, and verifies
   the Ed25519 signature against the submitted wallet public key.
9. PostgreSQL atomically consumes the challenge and verifies that its configuration snapshot is
   still current. A consumed challenge is never reusable, including after an RPC failure.
10. The API verifies the Devnet genesis hash, validates the mint and token program, queries all
    matching token accounts, and compares their exact summed raw amount with the stored raw
    threshold.
11. An insufficient balance produces a denial record and no session. An RPC failure produces a
    temporary error, never a synthetic zero or insufficient result.
12. An eligible wallet receives a random host-only HttpOnly cookie. The database stores its HMAC,
    balance/configuration snapshot, expiry, and recheck state.
13. The game client calls `/me` with credentials. Phaser mounts only when the server returns the
    typed `granted` state. Due rechecks happen through the API and can revoke access.

See [wallet authentication](../security/wallet-authentication.md),
[token verification](../security/token-gate-verification.md), and
[session design](../wallet/token-access-sessions.md) for the detailed controls.

## HTTP surface

| Method and path                          | Purpose                                                   | Authority                                                |
| ---------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/v1/token-access/config`        | Safe public requirement and availability                  | Trusted DB configuration via service-role RPC            |
| `POST /api/v1/token-access/challenge`    | Create a short-lived, one-time challenge                  | Exact Origin, JSON input, database config and rate limit |
| `POST /api/v1/token-access/verify`       | Verify ownership and balance; issue a session if eligible | API signature/RPC checks plus atomic DB functions        |
| `GET /api/v1/token-access/me`            | Resolve current cookie to a trusted state; recheck if due | HMAC lookup, expiry/config checks, optional RPC recheck  |
| `POST /api/v1/token-access/recheck`      | Force a balance recheck                                   | Exact Origin, valid cookie, durable interval limit       |
| `DELETE /api/v1/token-access/session`    | Revoke the current session and clear the cookie           | Exact Origin and HMAC lookup                             |
| `GET /api/v1/admin/token-gate`           | Read the real administrator configuration                 | Supabase bearer identity and `token_gate.read`           |
| `POST /api/v1/admin/token-gate/validate` | Validate a proposed mint through the server RPC           | `token_gate.configure` in API and trusted DB function    |
| `PATCH /api/v1/admin/token-gate`         | Validate and apply a versioned configuration update       | `token_gate.configure`, expected version, reason, audit  |

All token-access responses use `Cache-Control: no-store`. Mutating player endpoints require an exact
allowlisted `Origin`; POST, PATCH, and PUT requests require JSON. CORS permits credentials only for
configured origins and does not use a wildcard.

## Database model

| Table                     | Purpose                                                                                                        | Sensitive-data rule                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `token_gate_configs`      | Environment/network-scoped validated mint, token program, decimals, exact threshold, TTLs, commitment, version | Contains identifiers, not RPC credentials                                         |
| `wallet_auth_challenges`  | Wallet/config snapshot, hashes, domain/URI, expiry, attempt count, request and hashed client context           | No raw nonce, message, signature, IP, or user agent                               |
| `wallet_auth_rate_limits` | Durable fixed-window counters for challenge, verification, and recheck abuse controls                          | Subjects are public wallet/challenge identifiers or HMAC-hashed IP/session values |
| `wallet_access_sessions`  | Revocable HMAC session lookup, wallet, balance/config snapshot, slot, expiry and status                        | No raw cookie                                                                     |
| `wallet_access_events`    | Append-only access and configuration audit events                                                              | Metadata rejects signature, nonce, cookie, token, RPC URL, and key fields         |

RLS is enabled on all five tables. `anon`, `authenticated`, and `service_role` have no direct table
privileges. The service role receives execute permission only on reviewed `SECURITY DEFINER`
functions with empty search paths. Administrator functions re-evaluate the active admin session and
required permission inside PostgreSQL; the API check is not the only check.

The development seed is intentionally `unconfigured`: symbol `STAR`, a legacy non-authoritative
display placeholder, 15-minute session TTL, five-minute recheck, no mint/program/decimals/raw
threshold. It cannot issue a challenge until an authorized administrator validates and saves a real
Devnet mint.

## Configuration and invalidation

The active token requirement comes from `token_gate_configs`, not from the landing bundle or a
wallet response. Production additionally pins `GAME_TOKEN_MINT_ADDRESS` and the 10,000 display-token
requirement; the validated database row must match those values and on-chain-derived metadata.

Every accepted admin update:

1. validates the mint against the configured server RPC;
2. converts the display threshold to an exact raw integer using the observed mint decimals;
3. compares an expected configuration version under a row lock;
4. increments the version;
5. invalidates active sessions for the prior version; and
6. writes administrator and wallet-access audit records.

## Repository validation versus live validation

Unit and integration tests exercise canonical messages, altered signatures, replay, expiry, exact
amount arithmetic, SPL and Token-2022 metadata, frozen-account aggregation, network mismatch,
bounded RPC failure, route origins/cookies, administrator permissions, client fail-closed states,
and game-runtime gating. The committed pgTAP suite verifies schema, grants, RLS, append-only events,
and trusted-function properties.

These tests do not prove that an owner-selected mint exists, that a particular external wallet can
sign, that hosted migrations were applied, or that a sufficient/insufficient live wallet works.
Those items remain pending in the
[Phase 3 operations runbook](../deployment/phase-3-wallet-operations.md).

## Future authenticated presence boundary

The landing page currently reports `World status / Village preparing`. It must not derive a player
count from landing visitors or unauthenticated real-time sockets. A future count may replace this
fallback only after a trusted service exposes an aggregate of authenticated, authorized game
sessions. That endpoint and its public URL must remain configuration-driven, return only an
aggregate count, and must not expose wallet addresses, access cookies, room membership, or session
identifiers.

## Phase boundary

The following are not implemented by design: player profile creation, wallet-to-player linking,
character creation, gameplay movement, farming, inventory, rewards, economy, marketplace,
multiplayer synchronization, and administrator operations beyond the minimal token-access
configuration surface. Starville gameplay begins in Phase 4 only after Phase 3 is deployed and
validated.
