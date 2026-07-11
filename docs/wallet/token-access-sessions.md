# Token-access sessions

## Purpose and Phase 3 identity boundary

A token-access session is a short-lived server record proving that one wallet recently passed the
current Starville token requirement. In Phase 3 it is bound to the wallet, Solana Devnet, observed
and required raw balances, checked slot, token-gate configuration/version, verification time,
expiry, and a random session reference.

It is not a Supabase player login, player profile, administrator session, transferable credential,
or permanent account link. Player IDs and player-account creation remain future work and are not
silently fabricated in Phase 3.

## Cookie and database representation

After an eligible verification, the API generates 32 random bytes and encodes them as a 43-character
base64url token. The raw token is returned only as the `starville-token-access` cookie.

Cookie properties are:

- `HttpOnly`;
- `SameSite=Lax`;
- `Secure` when the API runs in production;
- host-only, because no `Domain` attribute is set;
- path `/api/v1/token-access`; and
- `Max-Age` equal to the configured session TTL.

The API computes `HMAC-SHA-256(TOKEN_ACCESS_COOKIE_SECRET, rawToken)` and stores only the
64-character digest. The cookie secret is server-only, at least 32 characters, and must be
independent from the Supabase service-role key, admin recovery-cookie secret, and Reown project ID.
The security scanner checks compiled browser output for this and other private values.

The HMAC design means a database read alone does not reveal a usable cookie, and a guessed token
cannot be checked offline without the independent secret. TLS remains mandatory because the raw
cookie is a bearer credential in transit.

## Session lifecycle

1. A valid challenge is atomically consumed and the RPC balance meets the exact raw requirement.
2. PostgreSQL locks the active configuration and checks its version, enabled/validated state,
   network, requirement, and requested expiry.
3. Any existing active session for the same wallet and network is revoked as `rotated`.
4. The new session and `wallet.access.granted` event are created transactionally.
5. `/me` resolves the HMAC and checks status, expiry, configuration validity, and recheck time. A
   due recheck must atomically claim the session before RPC work; concurrent attempts reuse the last
   trusted snapshot or receive a rate limit without amplifying provider calls. The claim lease
   covers the full configured timeout × retry × three-RPC budget and clears on completion.
6. The game client mounts Phaser only for a typed `granted` response. It schedules a recheck at the
   server-provided time and reconciles again on focus or visibility restoration.
7. Explicit disconnect calls `DELETE /api/v1/token-access/session`, marks the record revoked, writes
   an event, and clears the cookie.

Default TTL is 900 seconds. The permitted range is 60–3,600 seconds. Default recheck interval is 300
seconds; it must be 30–1,800 seconds and cannot exceed the TTL.

## Status and revocation rules

| Stored or returned state | Meaning and client behavior                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `active` / `granted`     | Current configuration is valid and balance is not due or passed recheck                  |
| `expired`                | TTL elapsed; record is marked expired and cookie is cleared                              |
| `revoked`                | Explicit disconnect, rotation, account/network change, or administrative action ended it |
| `insufficient_balance`   | A recheck fell below the stored exact requirement; cookie is cleared                     |
| `configuration_changed`  | Gate was changed, disabled, or became unvalidated; cookie is cleared                     |
| `none`                   | Missing, malformed, or unknown cookie; no access                                         |

RPC failure during recheck does not preserve a stale grant: the API attempts an administrative
revocation, clears the cookie, and returns a temporary RPC error. A balance observation below the
session's prior checked slot also revokes access. It does not report either case as insufficient
balance.

Changing the connected wallet or Solana network in the landing aborts in-flight work and attempts
session revocation. Changing an admin configuration increments its version and invalidates every
active session on the previous version.

## Production cookie topology

All browser requests use `credentials: include`, and the API uses exact credentialed CORS origins.
For `SameSite=Lax` cookies to work reliably on background `fetch` requests, deploy landing, game,
and API under HTTPS origins that share the same registrable site. A typical shape is:

```text
https://www.starville.example   landing
https://play.starville.example game
https://api.starville.example  API and host-only cookie owner
```

The host-only cookie is sent only to `api.starville.example`, which is intentional. The landing and
game never need to read it; they call the API with credentials. Do not set a broad parent-domain
cookie just to share it with browser applications.

An API hosted on an unrelated site becomes a cross-site cookie flow and is incompatible with the
current `SameSite=Lax` design. Choose a same-site API hostname instead of weakening the cookie.
Configure each exact landing/game/admin origin in `CORS_ALLOWED_ORIGINS`; never use `*` with
credentials.

For local development, use `localhost` consistently for landing, game, admin, and API. Do not mix
`localhost` and `127.0.0.1`, because they are different hosts/sites for cookie and Origin behavior.

## Secret rotation

Rotating `TOKEN_ACCESS_COOKIE_SECRET` immediately makes every existing cookie lookup fail. Treat
rotation as a global token-access logout:

1. announce the maintenance impact;
2. deploy the new independent high-entropy secret to the API only;
3. restart all API instances consistently;
4. optionally mark remaining active records revoked through a reviewed administrative operation;
5. verify `/me` returns no grant for a pre-rotation cookie; and
6. confirm new verification creates and resolves a fresh session.

Never reuse an old admin recovery secret, service-role key, Reown ID, or RPC credential as the new
cookie secret. Do not print either secret during rotation.

## Cleanup and retention

Phase 3 does not schedule automatic deletion. The migration provides
`private.cleanup_expired_token_access_records(p_before)` as a maintenance-only primitive:

- only `postgres` or `supabase_admin` may invoke it;
- `service_role`, `anon`, and `authenticated` have no execute grant;
- the cutoff must be at least 24 hours in the past;
- it deletes only expired challenge/session rows that no audit event still references and expired
  rate-limit buckets older than the reviewed cutoff; and
- it does not delete `wallet_access_events`.

Before scheduling cleanup, the owner must approve retention periods for wallet addresses, raw
balances, request IDs, hashed client context, and audit events. Privacy/legal requirements and
incident-investigation needs may differ. A reviewed job should first report candidate counts, use a
fixed cutoff, run with the maintenance identity, verify deleted counts, and record an operator
change ticket without secrets.

Do not use `TRUNCATE`, broad deletes, remote database reset, or event deletion as routine cleanup.
Append-only events require a separate approved archival/retention design. Because event foreign keys
preserve referenced challenge/session rows, current cleanup may intentionally delete few or no rows
until event retention is designed.

## Operations and diagnosis

Use request IDs and safe audit fields to diagnose access. Never copy raw cookies into tickets, logs,
analytics, URLs, or screenshots. If a cookie is exposed, rotate the cookie secret when the scope is
unknown; otherwise revoke the exact session through a reviewed server-side operation.

Live cookie behavior remains unvalidated until hosted migrations are applied and a real Devnet mint
and test wallet are available. See
[Phase 3 wallet operations](../deployment/phase-3-wallet-operations.md).
