# Phase 5 player-operations trust boundary

## Trusted and untrusted inputs

The browser is untrusted for administrator identity, permission, player wallet ownership, target
state, version freshness, reason validity, coordinates, session count, and operation outcome. Hidden
buttons and route guards are usability features only.

Supabase Auth proves the administrator user/session. The Phase 2 database records prove active
administrator status, role, permission version, trusted admin session, expiry, and MFA/AAL. The API
passes that verified tuple to RPCs; it never passes a browser-selected role or permission.

The target player is a UUID resolved to `player_profiles`; its wallet comes only from that row.
Session revocation queries that trusted wallet. Spawn reset takes no coordinate or map input.

## Database boundary

New operational tables are RLS-enabled with no direct browser policies and no direct service-role
table privilege. Security-definer RPCs use an empty search path, exact parameter validation, row
locks, expected versions, durable rate limits, and `private.assert_verified_admin_permission`.
Direct `anon` or `authenticated` execution is revoked.

Sensitive mutation rate limits are claimed only after database authorization succeeds but before a
target profile lookup. Invalid target UUIDs therefore cannot be enumerated without consuming the
same bounded administrative action budget as valid targets. Player state writes separately require
the exact loaded `game_state_version`, preventing an in-flight pre-reset save from overwriting the
server-approved spawn.

Audit tables are append-only. Player operations append both the player-specific event and existing
administrator audit inside the mutation transaction. Logs contain profile/admin/request IDs and safe
state, but application logs omit wallet addresses and free-form reasons.

The sole deletion exception is a private PostgreSQL-only hosted-test cleanup function. It has no
browser or service-role grant, requires an exact test-run UUID plus a matching `P5Test` profile ID
and wallet, and permits the append-only triggers to delete only that exact temporary fixture.

## Access enforcement

Token access and moderation are distinct:

- token denial means the wallet did not establish/retain the configured signed balance session;
- suspension is an application restriction on a stored player profile;
- required rename is a protected transitional state.

The player API checks token access first and moderation second. Database profile/state functions
repeat moderation checks. Suspended or rename-required profiles cannot write resume state. A valid
required rename clears the state atomically; restoration never manufactures a token session.
Restoration revokes any active session that may have raced with the suspended state. The game client
also reconciles its HttpOnly-backed session every 30 seconds and on focus/visibility; it does not
continue a private map indefinitely after server revocation.

Only the actual protected entry read advances `last_entered_at`. Internal state/profile reads use a
non-touching entry check, and the player profile trigger keeps a last-entered-only touch from
changing the content `updated_at` timestamp.

## Privacy and secrets

Never expose or log administrator cookies/bearers, opaque wallet session tokens or hashes, wallet
signatures, seed/private/recovery phrases, Supabase service keys, database URLs, private RPC URLs,
or provider credentials. Full wallet presentation is limited in the portal by `wallets.read`;
directory rows shorten it visually. Audit retention and wider privacy policy remain an owner
decision.

The operations health reader receives server-only internal URLs and returns only service name,
status, observation time, and response duration.

## Blockchain non-authority

Suspend, restore, rename, reset, and session revocation never transfer, mint, burn, stake, freeze,
or change token/mint authority. They do not modify the temporary Mainnet validation token. The token
gate remains configuration-driven and cannot be administratively bypassed per player.
