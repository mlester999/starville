# Wallet authentication

## Security objective

The Phase 3 wallet flow proves control of a Solana public key for one short-lived Starville access
attempt. It does not authenticate an administrator, transfer a token, submit a transaction, approve
spending, expose a seed phrase, or establish permanent player identity.

The current implementation uses a Starville-owned canonical challenge instead of default SIWX. Reown
AppKit remains the client-side connection and signing adapter, while the API and PostgreSQL retain
full control of nonce generation, exact message content, one-time consumption, expiry, configuration
snapshots, and session issuance.

## Canonical signed message

The API generates the exact message; the client never composes or edits it. Its shape is:

```text
<landing-host> wants you to sign in to Starville with your Solana account:
<wallet-address>

Authenticate access to Starville. This does not authorize a blockchain transaction, transfer tokens, or grant spending authority.

URI: <landing-origin>
Version: 1
Network: <configured solana:devnet or solana:mainnet-beta>
Nonce: <32-byte-random-base64url>
Issued At: <ISO-8601 timestamp>
Expiration Time: <ISO-8601 timestamp>
Challenge ID: <UUID>
```

The domain must equal the URI host. The URI is the origin of `NEXT_PUBLIC_LANDING_URL`; paths,
credentials, non-HTTP schemes, and mismatched hosts are rejected. The expiry must be after issue
time. The message parser reconstructs the canonical form and rejects alternate spacing, ordering,
labels, byte changes, oversized content, or unknown networks.

Production operators must make `NEXT_PUBLIC_LANDING_URL` match the public URL registered with Reown.
Changing that origin changes the signed domain and requires a fresh challenge.

## Challenge lifecycle

1. The browser connects through Reown on the configured Solana network.
2. `POST /api/v1/token-access/challenge` requires an exact allowlisted Origin and JSON body.
3. The API validates the canonical wallet address and loads the trusted database configuration.
   Disabled, invalid, or unconfigured access is rejected before challenge creation.
4. The API creates a random 32-byte nonce and a UUID. The default challenge TTL is 300 seconds;
   configuration accepts 60–600 seconds and PostgreSQL enforces a maximum of ten minutes.
5. PostgreSQL stores SHA-256 nonce/message hashes, the wallet/network/configuration snapshot,
   domain, URI, timestamps, request ID, HMAC-hashed IP, and optionally an HMAC-hashed user agent. It
   never stores the raw nonce, canonical message, signature, IP, or user agent.
6. The wallet signs the exact UTF-8 bytes through `signMessage`.
7. The API reloads the challenge under the durable attempt limit, parses the exact message, compares
   all fields and hashes, then verifies the 64-byte Ed25519 signature using the wallet public key.
8. Only after those checks does the API atomically mark the matching, unexpired challenge consumed.
   Consumption also checks that its token-gate configuration version remains current.
9. RPC balance verification starts after consumption. If RPC verification fails, the challenge stays
   consumed. The player must request and sign a fresh challenge.

Expired and successfully consumed challenges use distinct terminal timestamps. Expiry receives one
audit event but can never satisfy session creation; consumed challenges return a generic invalid
response and cannot be replayed.

## Reown boundary

`apps/landing` initializes AppKit only in a browser and only once per public configuration. It uses:

- `SolanaAdapter`;
- the configured Devnet or Mainnet network as the only supported and default AppKit network;
- Starville name, URL, icon, and description;
- email, social login, analytics, on-ramp, swaps, send, and receive disabled; and
- `allowUnsupportedChain: false`.

The landing reads the connected address and network from AppKit and requests `signMessage`. It does
not accept AppKit connection state as proof of ownership or access. Starville does not enable
Reown-hosted/default SIWX storage because it would not replace the database's one-time challenge and
session authority.

## Account, network, and disconnect behavior

The landing tracks the address and network used for each active operation.

- Address changes abort the operation, ask the API to revoke any current cookie session, and require
  a new challenge and signature.
- Network changes abort and revoke. Any network other than the configured Solana network is
  unsupported.
- A wallet disconnect attempts server revocation, clears local presentation state, and disconnects
  AppKit. The browser remains fail-closed if the revocation request cannot reach the API.
- The address and network are rechecked after `signMessage` and before sending verification.
- Window focus and visibility restoration refresh the trusted server session instead of trusting
  stale React state.

No wallet address or eligibility boolean in local storage is an authority.

## Replay and abuse controls

- Challenge IDs are UUIDs and nonces contain 256 bits of randomness.
- Challenge creation uses atomic durable one-minute counters for both wallet and HMAC-hashed IP.
- Signature verification uses atomic five-minute counters by HMAC-hashed IP, challenged wallet, and
  challenge, plus a per-challenge attempt ceiling. Mismatches and invalid signatures consume
  attempts even when they do not consume the challenge.
- Rechecks atomically claim a session before any RPC call and are limited by wallet and session.
- Administrator mint validation is separately limited per administrator through audited database
  claims.
- Mutating browser requests require an allowlisted Origin; POSTs require `application/json`.
- Responses include a request ID and no-store headers. Public errors do not reveal provider details,
  signature bytes, stored hashes, or database state.

## Threat handling

| Threat                       | Control                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Modified message             | Canonical parser, exact field comparison, exact SHA-256 message hash, Ed25519 verification        |
| Challenge replay             | Atomic one-time `consumed_at` transition before RPC work; expiry is a separate terminal state     |
| Cross-wallet replay          | Wallet appears in signed bytes, request, stored challenge, and signature public key               |
| Cross-domain phishing/replay | Landing host and origin are embedded and matched exactly                                          |
| Cross-network replay         | The configured network is signed, stored, checked, and independently verified by RPC genesis hash |
| Configuration race           | Challenge stores a config version; consume rejects changed/disabled/unvalidated config            |
| RPC outage after signing     | Challenge remains consumed; no session and no false balance result                                |
| CSRF-style mutation          | Exact Origin allowlist, JSON requirement, host-only SameSite cookie                               |
| Log or audit leakage         | Logger/database redaction rules and metadata keyword rejection                                    |

## Audit data

Database events cover challenge creation/expiry, signature success/denial, access grant/denial,
recheck, revocation, RPC errors, and configuration updates. Session creation and other critical
state transitions write their event in the same trusted database function. Non-critical
application-level event recording is best effort and logs only a redacted audit failure if the event
insert is unavailable.

Never add raw messages, signatures, nonces, cookies, bearer tokens, RPC URLs, IP addresses, user
agents, private keys, or seed phrases to logs or event metadata.

## Validation status

Repository tests cover exact-byte signing, mismatched bytes/public keys, malformed base64, challenge
replay, expiry, consumption before RPC failure, mutation origin checks, and browser-safe error
mapping. Live verification with a real wallet is still pending because the current Devnet mint
candidate does not exist and hosted Phase 3 migrations have not been applied. Follow
[Phase 3 wallet operations](../deployment/phase-3-wallet-operations.md); do not describe the live
flow as validated until that checklist passes.
