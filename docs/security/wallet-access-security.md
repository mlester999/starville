# Wallet-access security boundary

Wallet access is a server-authenticated, short-lived capability. The browser may request and display
it but cannot create, store, or extend authority itself.

Core controls:

- Reown connects wallets but does not authenticate Starville access.
- Nonces, timestamps, canonical message content, and challenge IDs originate on the API.
- Exact Ed25519 verification occurs before an atomic one-time database consume.
- Solana network, exact mint, program, decimals, account ownership, and raw balances are
  independently checked by the API.
- The opaque 256-bit cookie is host-only, HttpOnly, `SameSite=Lax`, path-scoped to
  `/api/v1/token-access`, and `Secure` in production. Only an HMAC is stored.
- Session status, expiry, config version, and due recheck are resolved on every trusted lookup.
- Balance reads use `minContextSlot`; a due recheck atomically claims its wallet/session before RPC,
  and any checked-slot regression revokes instead of preserving access.
- Exact Origin checks and JSON bodies protect cookie mutations in addition to credentialed CORS.
- Forwarded client IPs are ignored unless the immediate proxy matches an explicit bounded CIDR.
- RLS is enabled and browser/service roles have no direct Phase 3 table privileges; service access
  is through narrow security-definer functions with empty search paths.
- Logs and bundle scans protect RPC URLs, cookies, session tokens, signatures, messages, nonces,
  authorization headers, service keys, private keys, and seed phrases.

The production landing, game, and API must remain under the same registrable site for the current
`SameSite=Lax` cookie model. Do not weaken this to `SameSite=None` to compensate for an unrelated
API domain; fix deployment topology and review CORS/origin settings instead.

Current residual dependencies are the configured RPC provider, Reown/wallet compatibility, owner
selection of the correct mint, and approved hosted deployment. All remain fail-closed. See the
[token-gate threat model](token-gate-threat-model.md) and
[session design](../wallet/token-access-sessions.md).
