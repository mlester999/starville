# Wallet authentication protocol

Starville uses a custom server-controlled challenge rather than treating Reown connection as login
or delegating session persistence to default SIWX. This choice preserves one-time challenge state,
configuration snapshots, atomic consumption, and revocable access in Starville's PostgreSQL trust
boundary.

The signed message contains the Starville identity, landing host/origin, canonical Solana address,
the configured `solana:devnet` or `solana:mainnet-beta` identifier, a 256-bit server nonce, issue
and expiry timestamps, challenge UUID, version, and a statement that it authorizes no transaction,
token transfer, or spending authority. The client signs the returned UTF-8 bytes without modifying
them.

The API then validates:

- strict request schemas and canonical public key;
- challenge existence, expiry, attempt ceiling, and unused state;
- exact address, network, domain, URI, timestamps, nonce hash, challenge ID, and message hash;
- canonical message reconstruction and base64 encoding;
- an exactly 64-byte Ed25519 signature against the claimed public key; and
- atomic challenge consumption with the same configuration version.

Nonce and message hashes are SHA-256; the raw nonce, message, and signature are not persisted. IP
and user-agent context are HMAC-hashed with a server-only key. A challenge is consumed before Solana
RPC work, so RPC failure cannot make a valid signature replayable.

Mutation endpoints require an exact allowlisted Origin, JSON POST bodies, no-store responses, and
atomic durable counters: challenge creation by wallet/IP, verification by wallet/IP/challenge, and
rechecks by wallet/session. Forwarded client IPs are accepted only from explicitly configured proxy
IPs/CIDRs. Safe public errors never include SQL, provider, signature, or stored-hash details.

The canonical format, account/network handling, audit events, tests, and threat controls are fully
specified in [the wallet-authentication security document](../security/wallet-authentication.md).
