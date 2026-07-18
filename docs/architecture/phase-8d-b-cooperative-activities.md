# Phase 8D-B Cooperative Activities

## Scope

Phase 8D-B adds private-party cooperative activities for two to four players. It builds on
authenticated realtime sessions, social safety, durable parties, canonical inventory, DUST ledgers,
versioned worlds, and live operations. Public matchmaking remains disabled. No reward has blockchain
or cash-value behavior.

## Authority and boundaries

- PostgreSQL owns published definitions, exact party roster, instance lifecycle, objective
  checkpoints, contribution, timers, cooldowns, completion, settlement, receipts, audit,
  idempotency, and rate state.
- The realtime server accepts intent only. It binds identity and position to the authenticated
  connection, invokes narrow RPCs, and sends refreshed snapshots only to the instance roster.
- The browser renders catalog, ready state, activity markers, progress, timers, party connectivity,
  results, and receipts. It cannot submit progress totals, participants, rewards, moderation state,
  or position.
- The worker invokes one bounded cleanup RPC. It does not delete active instances, completions,
  receipts, or protected audit.
- Temporary activity items, plots, crops, and objects never enter personal farm, housing, permanent
  inventory, gifting, trading, or normal-world state.

## Versioned definition

`cooperative_activity_definitions` provides the stable key. Immutable published rows in
`cooperative_activity_versions` pin party limits, duration, reconnect/wait timeouts, entry world and
interaction, scene reference, a closed objective sequence, a bounded off-chain reward, cooldowns,
daily limit, required modules/assets, content version, and revision.
`cooperative_activity_active_versions` is the enabled pointer.

Drafts use the structured admin editor and the lifecycle
`draft → validated → in_review → published`; previously published content can become superseded or
disabled without mutation. No executable JSON, script, SQL, regex program, arbitrary formula, or raw
editor is accepted.

## Entry and ready check

1. The leader requests preparation using an activity key and exact party revision.
2. PostgreSQL reloads the authoritative party, leader, members, sessions, moderation/access state,
   blocks, reservations, current participation, cooldowns, and published activity.
3. The existing party ready-check system creates responses for the exact roster and revision.
4. Any party change invalidates preparation. Only a fully ready exact revision can enter.
5. Entry locks the roster in `cooperative_activity_participants`, creates one instance for the
   party, creates durable objective rows, and returns only public IDs.

Unique partial indexes allow at most one active instance per party and one active participation per
player. New party members are never added to a locked run.

## Lifecycle and checkpoints

Instances transition through `preparing`, `waiting_for_players`, `active`, `paused`, and one
terminal state: `completed`, `failed`, `cancelled`, `expired`, or `abandoned`. Revisions and
checkpoint versions advance only at bounded lifecycle or objective events. Server time controls
start, wait, reconnect, and expiry deadlines.

Disconnect marks a locked participant `reconnecting` for the published grace period. Fresh
authentication restores the same instance and temporary state. On expiry the participant becomes
ineligible and is removed; Moonpetal continues with at least two eligible online participants and
fails below two. Party leave/kick, block reconciliation, suspension, or access revocation removes
access immediately. Leader promotion does not recreate the instance. Party disband causes a safe
terminal outcome.

## Objective registry and interaction path

The closed registry is `shared_interact_count`, `shared_collect_count`, `shared_plant_count`,
`shared_water_count`, `timed_wait`, `shared_harvest_count`, `shared_deliver_count`,
`all_members_present`, `all_members_interact`, and `sequence_complete`.

An interaction is accepted only for the authenticated participant, active instance/version, active
objective, matching activity object and interaction key, server-observed in-range position, exact
revision, unique request ID, unexpired timer, and bounded rate. A unique progress-event key prevents
repeated objects or requests from incrementing twice. Only PostgreSQL advances the objective
sequence.

## Settlement

Final objective completion and reward settlement run under row locks in one transaction. A unique
completion per instance and receipt per participant makes retries exact-once. Eligible participants
receive the same 15 DUST and two ordinary Moonbeans. DUST uses the Phase 7 canonical ledger helper.
Items use canonical stack/capacity helpers; a full inventory creates a bounded non-transferable
pending claim instead of blocking other players or destroying the item. Failed runs create no
completion rewards and clear temporary items.

Daily count, entry cooldown, and reward cooldown are durable and use UTC server time. The minimum
contribution of two prevents only zero/near-zero farming; it is not a competitive ranking.

## Presence and map isolation

An active snapshot is attached to the authenticated realtime connection. Activity movement and state
are addressed to the locked public presence IDs; public channel players do not receive activity
entities or interactions. Party chat remains party-scoped. The activity scene is
`moonpetal-harvest-instance-v1`, based on development markers and exact object coordinates. It does
not publish or mutate the normal Moonpetal Meadow map and does not overwrite the saved normal-world
return position.

## Platform and maintenance

The `cooperative_activities` platform module depends on social graph, cozy gameplay, world
management, and audit. Legacy published platform configuration remains valid; only newly inserted
drafts are upgraded to the 17-module schema. No configuration is auto-published.

Activity settings can prevent new entry while allowing existing runs to finish. Full maintenance
uses the existing access denial. The configured bounded shutdown policy either permits an existing
run to finish or safely terminates it without rewards. `public_queue_enabled` is forced false.

## Phase boundary

Combat, raids, guild/clan activities, PvP, public matchmaking, marketplaces, auctions, $STAR, SOL,
NFTs, token claims, and Play-to-Earn are deferred beyond Phase 8D-B.
