# Phase 5 secure administrator operations

## Status and scope

Phase 5 adds staff-only player operations and truthful platform status on top of the existing Phase
2 administrator authority, Phase 3 wallet access, and Phase 4 player slice. Phase 4 implementation
and automated validation are complete. Manual desktop acceptance of movement, collision, depth,
camera, interaction feel, and saved-position restoration remains pending an owner desktop test; that
independent manual check is not claimed by Phase 5.

No world editor, cozy system, multiplayer presence, economy, marketplace, reward, claim, or
blockchain mutation is introduced. Phase 6 remains the exact next boundary.

## Component flow

1. The admin portal's protected server component verifies the current Supabase user and trusted
   administrator session.
2. It obtains a verified bearer token server-side and calls the Fastify administrator API. Browser
   components never query operational Supabase tables.
3. Fastify verifies the bearer identity, session, permission, request shape, body size, and mutation
   origin. It passes only the verified user/session/AAL tuple to the operations service.
4. Each security-definer PostgreSQL RPC independently evaluates the administrator session and exact
   permission before reading or mutating data.
5. Reads are bounded by an administrator/route fixed window and database pagination. Mutations lock
   the profile/moderation row, apply an expected-version check, enforce a durable per-administrator
   action rate before resolving a target, make the state/session changes atomically, and append
   player and administrator audits. Charging the mutation limit before target lookup prevents UUID
   enumeration from becoming a free operation.

`@starville/player-operations` owns strict cross-application result contracts. It contains no
database client, credentials, UI, or gameplay authority.

## Data model

`player_moderation_states` contains exactly one current row for every `player_profiles` row:

- `active | suspended` application status;
- current suspension reason/time/actor;
- latest restoration reason/time/actor;
- required-rename reason/time/actor;
- an optimistic `version`.

An insert trigger creates the row for new profiles and the migration backfills existing profiles.
`player_profiles.game_state_version` changes when state is saved or administratively reset. Every
player state write supplies the version it loaded. Because state saves and reset both lock the
profile row, a save that reaches PostgreSQL before reset is overwritten by the approved spawn, while
a stale save that reaches it after reset returns `PLAYER_STATE_VERSION_CONFLICT` and forces a fresh
bootstrap. Revoking the session is not the only reset-race defense.

`player_operation_audit_logs` is append-only and stores the target profile, wallet snapshot,
allowlisted event, actor type, trusted administrator/session IDs when relevant, request ID, bounded
reason, safe before/after state, outcome, and timestamp. Update and delete are rejected by a
trigger.

`admin_player_operation_rate_limits` holds fixed one-minute windows for the five sensitive action
types. It is authority storage, not analytics.

All three tables have RLS enabled, no browser policy, and no direct `anon`, `authenticated`, or
`service_role` table privilege. Only named RPCs are granted to `service_role`.

## Permissions and deliberate mappings

Phase 5 reuses `players.read`, `players.suspend`, `players.manage_sessions`, and `wallets.read`. It
adds only `operations.read`, `players.reset_position`, `players.require_rename`, and
`player_audit.read`.

| Role                    | Phase 5 additions                                                         |
| ----------------------- | ------------------------------------------------------------------------- |
| Super Admin             | all additions                                                             |
| Game Administrator      | operations, reset position, require rename, player audit                  |
| Live Operations Manager | operations, reset position, manage sessions, player audit                 |
| Moderator               | require rename, player audit; existing suspend/session permissions remain |
| Customer Support        | player audit read only; existing player read remains                      |
| Blockchain Operator     | operations aggregate only; no player mutation                             |
| Read-only Analyst       | adds operations; existing non-sensitive reads remain, no audit/mutation   |

Permission deployment bumps affected administrators' permission versions through the existing Phase
2 trigger, intentionally invalidating stale authorization snapshots.

## Mutation semantics

- Suspend: active → suspended; requires reason/version; revokes unexpired active Starville access
  sessions with existing `administrative` revoke reason; records wallet and both audit trails.
- Restore: suspended → active; clears current suspension and records restoration; never creates a
  token-access session. It also revokes any access session that raced into existence during the
  suspended interval, so the player must authenticate again.
- Reset position: accepts no coordinates or map from the caller. PostgreSQL uses the reviewed
  `lantern-square.default` spawn `(12, 7.5, south)`, increments both game-state and moderation
  versions, and revokes active sessions so a stale client cannot overwrite the reset.
- Require rename: marks the profile and revokes current sessions. Staff cannot select the new name.
- Revoke sessions: revokes only currently active, unexpired Starville access sessions for the
  profile's trusted wallet. It cannot affect the wallet or token account.

Successful admin mutations are idempotent by actor, request ID, event, and target. A reused request
ID for another target is rejected. State and version conflicts return safe committed outcomes rather
than partially applying a mutation. Each rendered dialog receives a stable server-generated UUID;
the server action carries it as `x-request-id`, so browser retries correlate to the same database
operation instead of manufacturing a second action.

## Player-entry enforcement

The API resolves a valid token-access session first, then calls `load_player_entry_state`:

- active: normal Phase 4 profile/state behavior continues;
- suspended: HTTP 403 `PLAYER_SUSPENDED`; Phaser is not mounted;
- rename required: profile bootstrap returns only the rename state; map/state endpoints return HTTP
  409 `PLAYER_RENAME_REQUIRED`.

`complete_required_player_rename` is the only rename-required completion boundary. It accepts one
valid changed display name, blocks suspended profiles, clears the flag and increments its version in
the same transaction, and appends `player.rename_completed`. Ordinary profile and state RPCs also
check moderation, closing request-race windows below the API.

Only the protected profile-entry read touches `last_entered_at`; profile creation, rename checks,
state reads, and state writes do not manufacture an entry. The entry RPC receives the HTTP request
ID for correlated denial/revocation events, and a last-entered-only update deliberately preserves
the profile's content `updated_at` timestamp.

While a map is mounted, the client reconciles the trusted access session at most every 30 seconds
and again when the tab becomes visible or the window gains focus. Revocation, account/network
replacement, expiry, suspension, required rename, or a state-version conflict unmounts the private
runtime before a fresh bootstrap. This is bounded reconciliation, not realtime presence.

## Truthful operations definitions

- Total/active/suspended/rename-required are direct profile/moderation counts. Created in 24 hours
  uses the immutable profile `created_at` timestamp.
- Entered in 24 hours means `last_entered_at` changed by an allowed protected entry in that window.
  It is explicitly not online presence.
- Active access session means unexpired, status `active`, config enabled and validated, and session
  config-version snapshot equal to the current version.
- API readiness is the serving API request itself. Real-time and worker readiness use their existing
  `/ready` responses with a bounded timeout, five-second cache, and independent healthy, degraded,
  unavailable, or unknown results. Internal health URLs are never returned.

No chart, trend, revenue, online-player count, or token-balance fan-out is inferred.

## Known limitations

- The additive Phase 4 and Phase 5 migrations are installed on the approved Starville development
  project in order. Production deployment remains out of scope, and every later hosted operation
  remains owner-gated.
- Hosted authorization/RLS fixtures cover real administrator and player-operation flows and clean up
  exact test-owned identities. A human interactive staff-browser pass still requires an explicitly
  supplied test administrator session and is not inferred from the automated hosted result.
- There is no authoritative online presence source in Phase 5.
- The audit UI is player-scoped and shows a bounded initial 25-event window (maximum 100). It does
  not expose a timestamp-only cursor that could skip simultaneous append-only events; a global
  administrator audit browser is future work.
- Phase 4 desktop gameplay feel acceptance remains pending owner testing.

Phase 6 may add approved world management only after an explicit Phase 6 request. This phase does
not prebuild it.
