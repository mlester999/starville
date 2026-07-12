# Phase 4 player trust boundary

## Identity and authorization

The wallet address in `player_profiles` is a server-derived subject, not a browser credential. The
API resolves the existing HMAC-hashed token-access session for every player request and passes only
its validated wallet to the trusted database function. The client has no route field for selecting
another wallet and no public profile enumeration endpoint.

The cookie remains host-only, HttpOnly, `SameSite=Lax`, production `Secure`, and scoped to
`/api/v1/token-access`. Player routes were placed below that path rather than broadening cookie
scope. Raw cookies, HMACs, signatures, signed messages, private RPC URLs, service-role keys, and
database URLs are not logged or returned.

## Database boundary

RLS is enabled on `player_profiles` and `player_api_rate_limits`. `anon`, `authenticated`, and
`service_role` have no direct table access and there are intentionally no direct browser policies.
The service role can execute only four public player RPC functions. Those functions are
security-definer, use an empty search path, validate all inputs, and call private helpers that are
not executable by browser or service roles.

This design is intentionally server-mediated. A future Supabase user account cannot acquire a
profile merely by setting user metadata, and a wallet token-access session never grants
administrator permissions.

## Gameplay-state limitation

Client movement is acceptable as a visual Phase 4 experience, but its saved position is untrusted
resume data. The API validates a narrow map/bounds/collision allowlist before saving. Even a valid
position is not proof for token rewards, currency, anti-cheat, quests, achievements, multiplayer,
leaderboards, or marketplace actions.

No transaction, transfer, spending approval, token burn, stake, reward, or on-chain position write
exists. The temporary Mainnet token remains an entry requirement only.

## Failure behavior

- Missing, expired, revoked, configuration-changed, or unavailable access prevents profile loading
  and Phaser bootstrap.
- Access loss after bootstrap unmounts and destroys Phaser; the client does not continue as an
  authenticated offline player.
- Invalid persisted state falls back to spawn and records only a request/profile diagnostic.
- API/database failure returns a fixed safe error and does not expose provider details.
- Hidden tabs stop accepting movement input and request a safe keepalive checkpoint only while the
  session remains accepted by the API.
