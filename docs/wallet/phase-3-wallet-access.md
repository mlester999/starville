# Phase 3 wallet access

Phase 3 introduces wallet-based entry to the Starville foundation; it does not create a permanent
player identity or begin gameplay. The landing connects a Solana wallet through Reown AppKit, asks
the Starville API for a one-time message, signs that exact message, and waits for the API to verify
both ownership and the configured token balance. Only the API can create the short-lived access
session used by the game client.

The flow is intentionally fail-closed:

1. Reown connection proves nothing by itself.
2. The server creates the nonce, challenge UUID, domain, URI, network, and timestamps.
3. The wallet signs a message that explicitly grants no transaction, transfer, or spending power.
4. The API verifies exact bytes and Ed25519 ownership, then atomically consumes the challenge.
5. A server-owned, genesis-verified RPC checks the exact configured mint and sums exact raw
   balances.
6. Eligible wallets receive an opaque HttpOnly cookie; the database stores only its HMAC.
7. The game mounts Phaser only after `/api/v1/token-access/me` returns `access: "granted"`.

Account or network changes cancel the active operation and attempt session revocation. Explicit
disconnect revokes the server session and clears the host-only cookie. Window focus and visibility
changes reconcile with the API rather than trusting stale browser state. No grant is stored in local
or session storage.

The Phase 3 migrations are hosted, database lint and integration/RLS suites pass, and the temporary
Mainnet Token-2022 mint is validated through the protected administrator path. Live insufficient
verification can use a disposable signer, while live eligible approval still requires an
owner-controlled wallet holding the configured threshold.

Detailed references:

- [Reown AppKit](reown-appkit.md)
- [wallet authentication](wallet-authentication.md)
- [token balance verification](token-balance-verification.md)
- [token-access sessions](token-access-sessions.md)
- [Phase 3 architecture](../architecture/phase-3-token-access.md)
- [operations runbook](../deployment/phase-3-wallet-operations.md)

Phase 4 character, movement, world, inventory, economy, and multiplayer systems remain unstarted by
design.
