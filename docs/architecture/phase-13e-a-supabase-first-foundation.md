# Phase 13E-A — Supabase-first audit, migration foundation, and first vertical slice

Date: 2026-07-24  
Status: local foundation and hosted-unblock harnesses implemented; hosted proof not yet run
Production provider state: `custom` realtime + `custom` Worker  
Supabase parity state: incomplete; API `/ready` deliberately returns 503 in either Supabase mode

## 1. Decision record

The explicit Phase 13E request supersedes the older master-spec deployment preference for a
permanent dedicated movement service. It does not supersede the master-spec trust model. Wallet
verification, moderation, token gating, inventories, currencies, rewards, progression, trades,
cooperative outcomes, and durable state remain server-authoritative.

Phase 13E-A introduces two explicit provider choices:

| Concern            | Variable                             | Allowed              | Local default | Production rule     |
| ------------------ | ------------------------------------ | -------------------- | ------------- | ------------------- |
| Realtime transport | `NEXT_PUBLIC_REALTIME_PROVIDER`      | `custom`, `supabase` | `custom`      | required explicitly |
| Background work    | `STARVILLE_BACKGROUND_JOBS_PROVIDER` | `custom`, `supabase` | `custom`      | required explicitly |

Invalid values stop configuration loading. Production has no implicit default. Supabase selection
never falls back to a custom socket or Worker. The custom Worker refuses to execute its jobs when
the background provider is `supabase`. Phase 13D verification requires `custom/custom` until a later
parity gate changes it.

## 2. Current realtime route inventory

| Route              | Purpose                                                                    | Admission                                                                                         | Durable touch points                                                        | Migration target                       |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| `GET /health`      | process liveness                                                           | public, safe payload                                                                              | none                                                                        | API/provider health                    |
| `GET /ready`       | startup/dependency readiness                                               | public, safe payload                                                                              | Supabase reachability                                                       | API/provider health                    |
| `WS /connect`      | world/channel presence, movement, chat, social graph, cooperative activity | one-use API-issued HMAC ticket; wallet access, moderation, maintenance, world and capacity checks | admission/session/audit, checkpoints, chat, social, party and activity RPCs | split by matrix below                  |
| `WS /private-home` | owner-only home instance                                                   | one-use home ticket and plot/world checks                                                         | home ticket/session and checkpoints                                         | private `home` topic after home parity |
| `WS /home-visit`   | owner/visitor home session                                                 | one-use participant ticket, invitation/admission/block checks                                     | visit participant/session events and checkpoints                            | private `home` topic after home parity |

All socket routes enforce origin allowlists, maximum payload size, authentication timeouts,
connection limits, periodic revalidation, idle handling, structured close reasons, and bounded
malformed/rate counters. Server shutdown closes sockets; maintenance and authorization changes are
reconciled on the current revalidation interval.

## 3. Complete custom protocol inventory

Common properties:

- Client commands use protocol version 1, strict schemas, a 16 KiB ceiling, and server-side
  authorization after admission.
- World movement has monotonic sequence checks, bounds/collision/speed checks, a 20 frames/second
  server limit, rejection/authoritative correction, and periodic durable checkpoints.
- Chat/social/party/activity commands use their own server-side rate limits and database idempotency
  or revision checks where the operation changes durable state.
- Reconnect obtains a new one-use ticket and receives fresh bootstraps/snapshots. In-memory presence
  and interpolation state are not durable authority.

### Client → service messages

| Messages                                                                                                                                                                                                                                                   | Recipients                      | Persistence / ordering / acknowledgement                                           | Privacy and validation                                           | 13E target                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `authenticate`                                                                                                                                                                                                                                             | admission service               | consumes one-use ticket; returns `admitted` or close                               | wallet session, moderation, maintenance, world, channel capacity | API wallet-bound player-Auth exchange + private channel |
| `movement`                                                                                                                                                                                                                                                 | same exact world channel        | per-presence sequence; `movement_rejected` correction; checkpoint only on interval | bounds, collision, speed, frequency, size                        | **13E-A Broadcast slice**, non-authoritative            |
| `switch_channel`                                                                                                                                                                                                                                           | admission/channel registry      | durable session channel switch; `channel_changed`                                  | same-world enabled/capacity check                                | reauthorize and resubscribe                             |
| `resync`                                                                                                                                                                                                                                                   | requesting player               | returns authoritative `snapshot`                                                   | admitted session only                                            | Presence sync + later durable resync                    |
| `appearance.refresh`                                                                                                                                                                                                                                       | same channel                    | reads current compact appearance; `appearance_updated`                             | admitted profile only                                            | later Broadcast/API                                     |
| `emote.activate`                                                                                                                                                                                                                                           | same channel                    | ephemeral; `emote.activated` or `.rejected`                                        | owned/equipped emote and rate checks                             | later Broadcast after entitlement proof                 |
| `ping`                                                                                                                                                                                                                                                     | sender                          | `pong`; no persistence                                                             | envelope/idle validation                                         | transport-native heartbeat                              |
| `chat.send`                                                                                                                                                                                                                                                | nearby/channel/party recipients | accepted message persisted and sequenced; rejection is explicit                    | scope membership, proximity, mute/block/moderation, rate/size    | later database/API + Broadcast notification             |
| `chat.history.request`                                                                                                                                                                                                                                     | sender                          | ordered persisted page via `chat.history`                                          | scope membership and preferences                                 | API/database                                            |
| `chat.report`                                                                                                                                                                                                                                              | moderation persistence          | report receipt                                                                     | message visibility, category/reason, rate                        | API/database                                            |
| `chat.mark_read`                                                                                                                                                                                                                                           | sender state                    | durable unread cursor                                                              | scope and monotonic sequence                                     | API/database                                            |
| `chat.mute_player`, `chat.unmute_player`, `chat.block_player`, `chat.unblock_player`                                                                                                                                                                       | sender preference               | durable preference, bootstrap/update acknowledgement                               | self/target and safety-action rate                               | API/database                                            |
| `social.inspect.request`                                                                                                                                                                                                                                   | sender                          | current safe inspect view                                                          | same-channel/proximity/privacy                                   | API + ephemeral presence lookup                         |
| `social.gift.create`, `social.gift.accept`, `social.gift.decline`, `social.gift.cancel`                                                                                                                                                                    | sender/target                   | durable interaction revision, reservation and receipt; explicit error              | proximity, inventory, ownership, idempotency, expiry             | API/database                                            |
| `social.trade.request`, `social.trade.accept`, `social.trade.decline`, `social.trade.offer.update`, `social.trade.confirm`, `social.trade.cancel`, `social.trade.resume`                                                                                   | trade participants              | durable revisions, reservations, two-party confirmation and receipts               | proximity/reconnect, inventory, idempotency, revision            | API/database                                            |
| `friends.list.request`                                                                                                                                                                                                                                     | sender                          | fresh social graph bootstrap                                                       | admitted profile                                                 | API/database                                            |
| `friends.request.send`, `friends.request.accept`, `friends.request.decline`, `friends.request.cancel`, `friends.remove`                                                                                                                                    | affected players                | durable request/relationship, notifications, idempotency                           | caps, privacy, revision/rate rules                               | API/database + notification Broadcast                   |
| `party.create`, `party.invite.send`, `party.invite.accept`, `party.invite.decline`, `party.invite.cancel`, `party.leave`, `party.kick`, `party.promote`, `party.disband`, `party.snapshot.request`, `party.ready_check.start`, `party.ready_check.respond` | party/invitees                  | durable party revision, membership/invitation/readiness state                      | leader/member role, capacity, revision, expiry, rates            | private `party` topic + API/database                    |
| `activity.catalog.request`                                                                                                                                                                                                                                 | sender                          | published catalog                                                                  | admitted session/module                                          | API/database                                            |
| `activity.entry.prepare`, `activity.entry.ready`, `activity.entry.enter`                                                                                                                                                                                   | party                           | durable preparation/readiness/instance                                             | party revision, eligibility, world/module                        | API/database + party Broadcast                          |
| `activity.instance.snapshot.request`, `activity.interact`, `activity.leave`, `activity.resume`                                                                                                                                                             | instance participants           | durable instance revision, objective progress, rewards through authority           | participant, revision, object/objective, idempotency             | API/database; never client-authoritative                |

The response variants implied above but built as discriminated literals include the exact
`*.accept`, `*.decline`, `*.cancel`, `party.kick`, and `party.promote` values generated from
validated action unions in the custom client.

### Service → client messages

| Messages                                                                                                                                                                        | Source and recipients                           | Ack/retry/reconnect behavior                           | 13E target                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `admitted`                                                                                                                                                                      | admission → player                              | initial authority/bootstrap                            | API authorization response + Presence track     |
| `snapshot`                                                                                                                                                                      | channel → player                                | fresh full snapshot after admission/resync             | Presence sync plus later API snapshot           |
| `presence_joined`, `presence_updated`, `presence_left`                                                                                                                          | channel → peers                                 | ephemeral; snapshot repairs gaps                       | **13E-A Presence slice**                        |
| `channel_changed`, `channels`                                                                                                                                                   | channel registry → player                       | explicit response/current populations                  | reauthorization response                        |
| `movement_rejected`                                                                                                                                                             | movement authority → sender                     | authoritative correction                               | not yet parity; Supabase frames are visual only |
| `appearance_updated`                                                                                                                                                            | profile authority → channel                     | latest revision wins                                   | later Broadcast                                 |
| `emote.activated`, `emote.rejected`                                                                                                                                             | emote authority → channel/sender                | activation id + explicit rejection                     | later Broadcast                                 |
| `chat.bootstrap`, `chat.message`, `chat.history`, `chat.message_rejected`, `chat.report_received`, `chat.unread_count`, `chat.moderation_notice`, `chat.system_message`         | chat authority → scoped recipients              | durable sequences/history or explicit result           | API/database + notification Broadcast           |
| `social.bootstrap`, `social.inspect.result`, `social.request.received`, `social.request.updated`, `social.gift.completed`, `social.trade.completed`, `social.interaction.error` | social authority → participants                 | durable revisions/receipts; explicit error/retry hints | API/database                                    |
| `friends.request.received`, `friends.relationship.updated`, `party.snapshot`, `party.disbanded`, `social.notification`, `social.error`                                          | social graph authority → affected players/party | durable revision/snapshot repairs                      | API/database + private player/party topics      |
| `activity.bootstrap`, `activity.catalog`, `activity.entry.updated`, `activity.error`                                                                                            | activity authority → player/party               | durable revisions and explicit error                   | API/database + private party topic              |
| `error`, `pong`                                                                                                                                                                 | protocol service → sender                       | generic safe error/heartbeat                           | API/transport-native                            |

### First vertical slice boundary

Only private world Presence and `movement` Broadcast are active in Supabase mode. The client:

- resumes a non-anonymous Supabase player session or exchanges the wallet session through the API
  for a one-use magic-link token hash and verifies it with Supabase Auth;
- presents its JWT and existing HttpOnly wallet-access cookie to the API;
- receives a short-lived membership for one exact environment/world/version/channel;
- subscribes with `private: true`, tracks one low-frequency Presence payload, and broadcasts
  movement no more frequently than every 100 ms;
- rejects malformed, oversized, wrong-world, wrong-version, wrong-channel, unknown-membership,
  stale-sequence, and timestamp-skewed inbound movement;
- tears down Presence and the old channel before switching/re-authorizing;
- refreshes authorization before expiry and removes the channel on cleanup.

No database write occurs per movement frame. Broadcast movement cannot authorize inventory,
currency, rewards, progression, moderation, entry, collision-sensitive outcomes, or any other
durable gameplay result. The existing bounded player-state checkpoint remains the resume convenience
path.

## 4. Private topic and RLS model

| Topic form                                        | Authorization rule                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `starville:<env>:world:<map-slug>:channel:<uuid>` | exact active membership environment, map, version, and channel                                                        |
| `starville:<env>:player:<public-presence-uuid>`   | only that membership’s opaque public presence identity                                                                |
| `starville:<env>:party:<public-party-uuid>`       | active party and active party member                                                                                  |
| `starville:<env>:home:<home-uuid>`                | owner, active/reconnecting admitted visit participant, or unexpired pending/accepted invite while admissions are open |

Four policies on `realtime.messages` separately gate Broadcast read/write and Presence read/write.
Every policy uses `auth.uid()`, `realtime.topic()`, exact `extension`, active short-lived
membership, active wallet session, moderation state, maintenance state, current published world, and
environment. Malformed/cross-environment topics return false. There is no `USING (true)` or
anonymous access.

The player-identity and membership tables force RLS and expose no direct `anon`, `authenticated`, or
`service_role` table privileges. Only service-role RPCs can prepare and bind a non-anonymous
Supabase Auth UID to the exact wallet-owned player. Anonymous Auth sign-in stays disabled. Enabling
the player Auth exchange and disabling public Realtime channels in hosted configuration are
owner-controlled deployment actions, not performed in Phase 13E-A.

## 5. Current Worker inventory

All active jobs are registered in `apps/worker/src/index.ts`. The runtime executes the list once on
startup with configured concurrency (default 1). Each job is retried up to `WORKER_MAX_ATTEMPTS`
(default 3) with bounded linear delay `WORKER_RETRY_BASE_DELAY_MS * attempt`. There is no internal
recurring scheduler. `/ready` is not ready until startup jobs settle. `phase-1-foundation-noop`
exists only as an unused foundation/test job and is not registered.

| Job                                                           |              Default bound | Authority and side effects                                                    | Idempotency / retry / concurrency                          | Supabase target                        |
| ------------------------------------------------------------- | -------------------------: | ----------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `multiplayer-chat-retention-cleanup`                          |                      1,000 | deletes/expires retained chat through RPC                                     | bounded database cleanup; startup retry                    | SQL/Cron                               |
| `social-interaction-expiry-cleanup`                           |                      1,000 | expires gift/trade requests, releases reservations, prunes idempotency        | `FOR UPDATE SKIP LOCKED`, terminal statuses, request audit | **13E-A SQL/Cron proof**               |
| `friends-parties-social-graph-cleanup`                        |                      1,000 | expires requests/invites/checks, transfers leadership, closes dormant parties | bounded but multi-entity/revision-sensitive                | later SQL/Cron after shadow comparison |
| `cooperative-activity-lifecycle-cleanup`                      |                        250 | expires readiness/instances and may reconcile rewards                         | bounded; reward and gameplay risk                          | keep custom until reward parity        |
| `economy-reconciliation-risk-metrics-and-approved-activation` | configured bounded batches | ledger reconciliation, risk metrics, approved activation                      | financial controls/separation; high risk                   | keep custom/Edge orchestration         |
| `phase11-farming-bounded-reconciliation`                      |                        100 | reconciles farm state                                                         | bounded gameplay mutation                                  | later SQL/function                     |
| `phase11b-crafting-bounded-reconciliation`                    |                        100 | reconciles crafting state                                                     | bounded inventory mutation                                 | later SQL/function                     |
| `progression-reward-retry-and-reconciliation`                 |                        100 | retries/reconciles progression rewards                                        | receipt/idempotency required                               | keep custom until reward parity        |
| `housing-reconciliation-and-session-cleanup`                  |                        100 | housing transactions/sessions                                                 | bounded multi-table mutation                               | later SQL/function                     |
| `home-visit-expiry-reconnect-and-reconciliation`              |                        100 | visit invitation/session/reconnect expiry                                     | bounded lifecycle mutation                                 | later SQL/Cron                         |
| `player-experience-evidence-reconciliation`                   |                        100 | evidence/reward recovery                                                      | receipt/idempotency required                               | keep custom until reward parity        |
| `world-asset-bundled-reconciliation`                          |          250 × max 8 pages | produces bounded asset recommendations; no automatic activation               | job advisory lock, cursor paging                           | later SQL/Edge; keep approval human    |

### Worker proof selection

| Candidate                    | Advantages                                                                                                            | Risk                                                                                  | Decision               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| Social interaction cleanup   | already bounded, DB-only, `SKIP LOCKED`, terminal-state idempotency, reservations released through existing authority | stale reservation correctness                                                         | selected               |
| Social graph cleanup         | DB-only candidate                                                                                                     | leader transfer, party revisions, invitations and ready checks amplify parity surface | defer                  |
| Cooperative activity cleanup | bounded lifecycle                                                                                                     | reward/inventory and active gameplay outcomes                                         | reject for first proof |

`run_scheduled_social_interaction_cleanup` adds a maximum batch of 1,000, transaction-scoped
advisory lock, successful/lock-skipped run evidence, deterministic result summary, and reuse of the
existing cleanup authority. The seeded `*/5 * * * *` definition is `proof-disabled`; the migration
does not call `cron.schedule`. SQL failure is rethrown for `cron.job_run_details` visibility.
Supabase Queues are not introduced because this cleanup has no evidenced need for durable item-level
delivery/retry semantics.

## 6. Health, configuration, and deployment state

- `/health` remains process liveness and does not contact dependencies.
- In `custom/custom`, `/ready` checks database public configuration plus custom realtime and Worker
  ready endpoints. Either unhealthy dependency returns 503.
- Supabase provider modes do not parse or fetch legacy health URLs.
- Any Supabase provider selection returns 503 with `SUPABASE_MIGRATION_PARITY_INCOMPLETE`, even when
  the first slice works.
- Responses expose provider names and migration state but never internal URLs or credentials.
- Legacy variables and deployment templates remain because production still uses custom services.
- The migration manifest includes the Realtime and disabled-Cron foundations plus the forward-only
  Realtime policy-permission repair. Hosted execution remains unauthorized and the commissioning
  manifest remains Stage-A blocked.

## 7. Capacity, security, and operations risks

Before hosted shadowing, owners must record plan-specific concurrent connection, messages/second,
join, payload, and Presence limits. Presence is deliberately low-frequency; movement uses Broadcast.
Dashboards must alert on authorization denials, channel join latency, connection count, Broadcast
rate, payload rejection, reconnect loops, membership expiry, Cron failures/duration, lock-skipped
cleanup, and cleanup backlog.

Known risks and mitigations:

| Risk                                           | Mitigation / unresolved gate                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| player Auth exchange abuse                     | trusted-origin wallet-cookie gate, one-use token hash, and hosted rate-limit review before enablement            |
| RLS policy join latency                        | short, indexed membership lookup; hosted load evidence required                                                  |
| forged visual frames from an authorized member | receiver identity/schema checks; frames are never authority; server-authoritative correction parity remains open |
| mixed providers or duplicate jobs              | explicit provider variables, no fallback, custom Worker startup guard, disabled Cron definition                  |
| expired JWT/membership                         | Auth refresh + `setAuth`, membership refresh before expiry, fail closed                                          |
| channel switch leakage                         | remove/untrack old channel before new authorization                                                              |
| Cron overlap                                   | transaction advisory lock + deterministic skip evidence                                                          |
| Cron failure rollback removes local run row    | PostgreSQL error and `cron.job_run_details` are canonical failure evidence; external alert required              |
| custom service removal too early               | both applications and all legacy variables stay present through parity and rollback phases                       |

## 8. Migration plan

### Phase 13E-B — hosted private-channel shadow (blocked)

- Scope: apply to owner-approved `starville-dev`, configure environment setting, wallet-bound player
  Auth exchange, private-channel-only Realtime, and shadow world Presence.
- Risks: RLS join latency, Auth exchange abuse, provider quotas, token refresh.
- Migrations: forward fixes only if hosted catalog differs; no production push.
- Tests: exact allow/deny matrix, cross-environment/topic denial, expiry/moderation/maintenance,
  reconnect/switch/load/limit evidence.
- Owner: database owner + security owner + realtime owner.
- Rollback: select custom provider, revoke shadow access/config by forward fix, retain audit.
- Acceptance: zero privacy escapes, bounded join latency/error rate, signed dev evidence.

### Phase 13E-C — movement authority parity

- Scope: add trusted validation/correction architecture for speed, collision, bounds, sequence, and
  checkpoints without PostgreSQL frame writes.
- Risks: Broadcast is client-originated; visual divergence and cheating if treated as authority.
- Migrations: only bounded session/checkpoint evidence if needed.
- Tests: forged/stale/burst/out-of-bounds/collision cases, packet loss, reconnect, load.
- Owner: gameplay authority owner + realtime owner.
- Rollback: custom movement provider and existing authoritative socket.
- Acceptance: correction and anti-cheat parity proven; no reward/economy dependency on frames.

### Phase 13E-D — player, party, chat, and home topic expansion

- Scope: private player/party/home notification channels; transactional commands remain API/RPC.
- Risks: membership churn, invitation leakage, moderation and block-list races.
- Migrations: narrow indexed membership/read-model changes and exact policies.
- Tests: complete sender/recipient/privacy matrices and revision/idempotency behavior.
- Owner: social, housing, moderation, and database owners.
- Rollback: disable new channel producers, retain API truth, custom features remain available.
- Acceptance: feature-by-feature parity with explicit unsupported-state removal.

### Phase 13E-E — background job shadow and cutover

- Scope: run social cleanup in shadow/compare, then migrate other low-risk DB-only jobs one at a
  time. Use Edge Functions only for orchestration/external I/O; Queues only for evidenced durable
  item delivery.
- Risks: double execution, missed schedules, long transactions, reward duplication.
- Migrations: job definitions/run evidence, per-job locks/idempotency, optional pg_cron schedules in
  an explicitly approved commissioning change.
- Tests: duplicate invocation, lock contention, batch limits, eligible/unrelated rows, failure and
  retry visibility, backlog and runtime.
- Owner: operations owner + each domain owner.
- Rollback: unschedule Supabase job before restoring custom Worker; verify no overlap.
- Acceptance: signed shadow equivalence and rollback drill for each job.

### Phase 13E-F — readiness and production commissioning

- Scope: replace foundation-incomplete readiness with provider-native checks only after all required
  features/jobs have parity.
- Risks: false-ready deployments and hidden dependency degradation.
- Migrations: none unless health evidence storage is approved.
- Tests: liveness isolation, every provider failure, secret/URL non-disclosure, deployment smoke.
- Owner: SRE/release owner.
- Rollback: return manifests/provider variables to custom/custom and re-run Phase 13D.
- Acceptance: Stage A/B evidence complete; owner explicitly authorizes production selection.

### Phase 13E-G — legacy retirement

- Scope: only after a stable observation window, remove unused custom runtime paths in a separate
  explicit request.
- Risks: losing rollback, overlooked admin/home/activity event, operational knowledge loss.
- Migrations: archive/retention only; no destructive database cleanup without evidence.
- Tests: repository usage search, full journey/load/DR test, audit retention.
- Owner: product, security, SRE, realtime, database, and domain owners.
- Rollback: redeploy last custom-capable release while retained infrastructure and secrets remain.
- Acceptance: signed zero-usage inventory, completed rollback drill, explicit deletion authority.

## 9. Phase 13E-A acceptance and remaining owner actions

Implemented locally:

- complete route/event/job inventories;
- explicit fail-closed provider boundaries;
- private topic membership schema and exact Broadcast/Presence policies;
- non-anonymous player-Auth-to-wallet binding API;
- private world Presence + throttled movement Broadcast client;
- bounded SQL/Cron proof and disabled repository schedule;
- provider-aware readiness;
- tests, migration manifest, environment contracts, and rollback plan.

Not performed:

- no hosted Supabase settings, migrations, Auth, Realtime, Cron, Vault, Edge Function, or Queue
  mutation;
- no Vercel/deployment-provider mutation;
- no custom service deletion;
- no production provider selection;
- no commit or push;
- no claim that Phase 13D or Supabase parity is ready.

The owner selected hosted `starville-dev` validation without Docker or a local Supabase runtime.
Before 13E-B, the separate hosted validation must review and apply the complete four-file pending
order, run the allowlisted Phase 13E pgTAP suite, prove the wallet-bound two-client harness and
cleanup-function harness, and prove private-only channel restrictions. If Management API read-back
cannot prove the restriction, the owner must use **Dashboard → Realtime → Settings → Channel
Restrictions → Allow public access** to disable public access and then obtain read-back or
behavioral evidence. Player Auth rate limits, quotas, monitoring/SLOs, and rollback sign-off also
remain pending.
