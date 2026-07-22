# Phase 13A gameplay integration architecture

## Status and evidence boundary

Phase 13A is the Gameplay Completion Audit and Integration Repair phase. The local repository now
contains a deterministic cross-system audit, complete new- and returning-player journey fixtures,
exact-once retry coverage, settlement-driven client invalidation, an isolated Game Test surface, and
a protected read-only Admin Gameplay Health surface.

This is local automated evidence. It is not hosted validation, production telemetry, owner
acceptance, a deployment, a world publication, or an asset activation. The work used only the
`starville-dev` boundary and did not connect to `starville-prod`. Phase 12E remains a closed-beta
visual candidate locally ready with owner acceptance pending.

No migration was required. The current migration head remains
`20260718123000_phase12d_repository_authored_bundled_registry.sql`. No applied migration was edited,
no function was created or replaced, and RLS/grants were not changed.

## Architectural decision

The audit found one real client integration defect: a successful cozy or nested housing/home-visit
mutation reloaded its own panel, but the global onboarding and progression projections were not
consistently invalidated until later navigation. That could temporarily leave objectives or the HUD
level stale after a canonical settlement.

The repair adds a narrow settlement signal:

1. The mutation completes in the existing authoritative API/database transaction.
2. The owning panel reloads its canonical inventory, DUST, farm, home, shop, workstation, housing,
   or visit projection.
3. Only after rehydration succeeds, `onAuthoritativeMutation` is emitted.
4. `GameWorld` reloads progression and increments the Player Experience refresh revision.
5. DUST continues to use its explicit `loading | ready | unavailable` state and inventory remains
   the Cozy projection; no new global authority or optimistic settlement cache was introduced.

Failure and conflict paths do not emit the success signal. They rehydrate the latest authoritative
projection and retain the safe error state.

## Capability matrix

The executable canonical matrix is `packages/player-experience/src/gameplay-audit.ts`. Every entry
records player entry, client, API, realtime, database, worker, authorization, RLS, idempotency,
audit, loading/error/retry/reconnect, tests, documentation, status, blocker, and owner-acceptance
state. Only the brief's allowed status vocabulary is accepted.

| Capability                              | Local status                | Authority and important limitation                                             |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Wallet token access and session handoff | complete                    | Server-issued session; wallet/network key remounts all player state            |
| Player profile and character creation   | complete                    | One moderated profile; revisioned owned avatar selection                       |
| World entry and position restoration    | complete                    | Active immutable world version plus versioned player checkpoint                |
| Core onboarding                         | complete                    | Canonical event evidence; starter recovery/settlement exact once               |
| Daily Rhythm objectives                 | integrated with limitations | Canonical UTC assignments; v1 deliberately non-economic; balancing pending     |
| Farming plot lifecycle                  | complete                    | Plot/crop/inventory/XP transition is atomic and revisioned                     |
| Canonical inventory                     | complete                    | Containers/stacks/receipts are authoritative; client reloads after settlement  |
| Cooking jobs                            | complete                    | Ingredients once at start, output once at collection                           |
| Crafting jobs                           | complete                    | Ingredients once at start, output once at collection                           |
| General Store                           | complete                    | Catalog, stock, limits, inventory, DUST, objectives, receipt settle atomically |
| Off-chain DUST ledger                   | complete                    | Immutable ledger and account version; zero is distinct from unavailable        |
| XP, levels, skills, and unlocks         | complete                    | Unique source events and canonical progression workspace                       |
| Achievements, badges, and titles        | complete                    | Versioned definitions and unique player settlement                             |
| Housing layout, storage, and upgrades   | complete                    | Immutable revisions, storage transfers, upgrade receipts                       |
| Home visits and bounded interactions    | integrated with limitations | Local integration complete; hosted owner-plus-ten/reconnect gate remains       |
| Friends and parties                     | integrated with limitations | Versioned graph/party state; hosted contention/abuse gates remain              |
| Chat                                    | integrated with limitations | Realtime accepted messages; moderation/rate/abuse hardening remains Phase 13B  |
| Gifts and trades                        | integrated with limitations | Atomic settlement; hosted contention/collusion/abuse gates remain              |
| Realtime presence and reconnect         | integrated with limitations | Snapshot reconciliation; hosted interruption/~40-player gate remains           |
| Animal Care                             | disabled                    | No player entry, API, database authority, or worker was added                  |

There are no confirmed locally disconnected or blocked capabilities. “Complete” in this table means
the local implementation chain and automated evidence are complete; it does not mean hosted or owner
acceptance passed.

## Authoritative state map

The executable full map is also in `gameplay-audit.ts`. Realtime and client caches are never treated
as durable authority.

| State                   | Canonical table/function family                                           | API/RPC and cache behavior                                                                  |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Wallet identity         | `wallet_access_sessions`, `wallet_access_events`                          | Token-access session/recheck/revoke; account/network change unmounts player tree            |
| Player identity/profile | `player_profiles`                                                         | Profile routes; client projection is replaced after create/update                           |
| Character appearance    | `player_avatar_profiles` and catalog versions                             | Avatar routes; reference-counted public cache keys include revision                         |
| Current world/position  | `player_profiles` world state and immutable world versions                | World bootstrap/checkpoint; expected `gameStateVersion`; invalid coordinates use safe spawn |
| Channel                 | `realtime_sessions` plus channel definitions                              | Realtime admission/switch; channel change clears old remotes before new snapshot            |
| Inventory               | `player_inventory_state`, `player_inventory_stacks`, reservations/history | Inventory/settlement routes; reload after settlement/focus/reconnect                        |
| DUST                    | `player_dust_accounts`, `player_dust_ledger`                              | Account/history/settlement routes; immutable receipt plus account version                   |
| Progression             | XP events, skill/level/reward/unlock tables                               | Progression workspace; settlement signal reloads HUD and panel                              |
| Objectives              | onboarding, daily, quest objective tables                                 | Player Experience/progression workspaces; event-driven, versioned refresh                   |
| Achievements            | achievement definitions/progress/contributions                            | Progression workspace; unique evidence contribution                                         |
| Titles                  | `progression_titles`, `player_progression_titles`                         | Title selection route; earned ownership and selected revision                               |
| Farming plots/crops     | `player_farm_plots`, home tiles/crop instances                            | Farming RPCs; expected tile/crop revision; reconciliation worker                            |
| Cooking/crafting jobs   | `player_crafting_jobs`, active recipe/workstation versions                | Workstation workspace/start/collect; job UUID is exact-once boundary                        |
| Shop purchases          | shop versions/stock/limits/transactions/receipts/events                   | Transaction/receipt/event cursor; rehydrate on cursor gap or conflict                       |
| Housing layout          | layout head/revisions/placement snapshots                                 | Validate/save/history; only server-validated revision becomes active                        |
| Furniture inventory     | inventory, `player_home_furniture`, home storage                          | Storage transfer/layout save; one instance has one authoritative location                   |
| Home visibility         | `home_social_settings`, active visit policy                               | Settings routes; expected configuration revision                                            |
| Home visitors           | visit sessions/participants/invitations/events                            | Visit routes plus private realtime; owner plus ten enforced by authority                    |
| Guestbook               | `home_guestbook_entries`                                                  | Guestbook route; moderated bounded entry                                                    |
| Appreciation            | `home_appreciations`                                                      | Bounded appreciation route; revision/idempotency receipt                                    |
| Helper watering         | `home_helper_actions` plus owner crop transition                          | Helper route; unique bounded action and canonical crop mutation                             |
| Friends                 | requests/friendships/social audit                                         | Friend lifecycle routes; graph notifications trigger rehydrate                              |
| Parties                 | parties/members/invitations/ready checks                                  | Party lifecycle; versioned realtime snapshot                                                |
| Chat                    | chat messages/reports/moderation evidence                                 | Realtime accept; bounded client list deduplicates by message ID                             |
| Gifts                   | social request/item/idempotency/audit tables                              | Gift lifecycle; version notification and settlement receipt                                 |
| Trades                  | trade offers/social interaction/idempotency/audit tables                  | Trade lifecycle; offer changes clear both confirmations                                     |

## Complete new-player journey

The deterministic journey has exactly 26 steps and is defined in
`packages/player-experience/src/gameplay-journey.ts`:

1. Open Landing.
2. Connect wallet.
3. Pass token-access validation.
4. Create player profile.
5. Create character.
6. Enter Lantern Square.
7. Receive onboarding objective.
8. Complete first movement guidance.
9. Reach the first landmark.
10. Receive starter resources through the exact-once path.
11. Prepare a farm plot.
12. Plant an approved starter crop.
13. Water the crop.
14. Advance through deterministic safe test time.
15. Harvest.
16. Confirm the inventory item and receipt.
17. Complete a cooking or crafting introduction.
18. Visit the General Store.
19. Complete an approved DUST transaction.
20. Receive progression credit and refresh dependent projections.
21. Complete onboarding.
22. Flush versioned state.
23. Disconnect and release transient resources.
24. Reconnect without replaying settled mutations.
25. Restore the last valid world/position or approved safe spawn.
26. Confirm inventory, DUST, progression, objectives, and farming match receipts.

## Returning-player journey

The returning path revalidates the current wallet/network, loads profile and character, bootstraps
world/cozy/progression projections with independent loading states, restores a safe location,
reconciles offline crop/job time, restores versioned social/realtime state, reviews current
objectives, completes one canonical action, performs focus reconciliation, proves account switching
unmounts prior-player state, and flushes/revokes/cleans up on logout.

## System handoffs

- **Token access:** transient background failure keeps the last trusted grant with a warning;
  confirmed denial unmounts gameplay. The React key contains wallet and network.
- **Character → world:** the canonical profile/avatar selection is loaded before world rendering;
  public realtime carries a compact appearance reference, not ownership authority.
- **World entry/transitions:** the immutable authorized revision loads with the versioned player
  state. Persistence flushes before leave and expected versions reject stale checkpoints.
- **Onboarding/daily:** canonical events advance steps/objectives; three UTC daily assignments are
  solo-safe and v1 produces no repeatable DUST/XP.
- **Farming → inventory → progression:** plot/crop/inventory/XP and objective evidence settle in the
  authoritative path; successful rehydration now refreshes global projections.
- **Cooking/crafting:** jobs continue by server time while offline. Full inventory leaves ready
  output collectable; it does not delete or duplicate it.
- **General Store/DUST:** trusted catalog and stock revisions, inventory/DUST versions, limits, and
  operation key bind the atomic transaction. Event cursor gaps force rehydration.
- **Progression/achievements/titles/objectives:** unique source events grant XP/rewards and evaluate
  dependent state; the UI reloads after gameplay settlement.
- **Housing/visits:** layout/storage/upgrade/visitor actions remain separately authorized and
  revisioned. Visitors never receive owner inventory, DUST, workstation, upgrade, or harvest
  authority.
- **Friends/parties/chat/gifts/trades:** persistent graph/interaction state is database
  authoritative; realtime delivers versioned safe representations and reconnect snapshots.
- **Workers:** farming, crafting, economy, housing, home visit, progression, player experience,
  chat, cooperative activity, and social cleanup/reconciliation are retryable and duplicate-safe.

## Failure, recovery, and UI accuracy

The 20-row executable failure matrix covers wallet, token access, profile, world manifest, asset,
realtime, inventory, DUST, farming, cooking, crafting, shop, housing, home visits, friends, parties,
chat, gifts, trades, and workers. Every row states authoritative result, rollback, safe message,
retry/idempotency/reconnect, audit, and support evidence.

The UI must continue to distinguish loading, empty, zero, unavailable, blocked, unauthorized,
retrying, reconnecting, completed, expired, disabled, and unreleased. Important enforced examples:

- `0 DUST` is a ready value, not unavailable.
- Level 1 is a ready value, not loading.
- An empty inventory is valid empty state, not failure.
- Disconnected realtime is never labelled connected.
- Disabled Animal Care and unreleased systems have no claim surface.
- A mutation timeout never creates a success banner before a receipt/rehydration result.

## Cache and invalidation rules

- Player component caches are scoped below the wallet/network keyed `PlayerExperience` tree.
- No gameplay state is stored in `localStorage` or `sessionStorage` as authority.
- Successful mutations reload the owning projection, then invalidate Player Experience/progression.
- Conflicts reload without emitting a success invalidation.
- Focus/visibility reconciliation reloads mutable Cozy state.
- World changes flush versioned position and replace runtime world state.
- Realtime channel changes clear remote entities before the next snapshot.
- Trade-offer changes replace the revision and clear confirmations.
- Logout unmounts listeners/caches after the registered persistence flush and session revoke.

## Exact-once integration framework

The local framework covers starter grant, planting, watering, harvest, cooking, crafting, shop buy,
shop sale, DUST reward, objective reward, gift, trade, furniture/inventory layout save, helper
watering, and appreciation. Every mutation is exercised for repeated request, timeout then retry,
reconnect then retry, concurrent request, stale key, and same key with changed payload.

The deterministic fixture expects one settlement. Same key/payload replays the receipt. Changed
payload conflicts. This framework is nonpersistent integration evidence; production authority
remains the existing database transaction/RPC and constraints.

## Local fixtures and performance boundary

Twenty local-only fixtures cover every requested state, including owner plus ten visitors. They are
marked `persistence: game_test`, use the fixed clock `2026-07-22T00:00:00.000Z`, and cannot write
hosted records.

The bounded performance fixture records seven bootstrap request classes, zero duplicate requests,
five reconnect request classes, six listener classes, eleven participants, zero duplicate worker
settlements, and zero retained logout resources. These are deterministic counts, not production
timings or hosted load claims. Full performance/load certification remains Phase 13B.

## Game Test and Admin

The protected Game Test adds **Complete Gameplay Integration**, a 27-step in-memory scenario
covering all requested systems and failure simulations. It imports no player mutation client,
persistence hook, chat sender, visit creator, or social mutation path.

Admin reuses the protected Operations area at `/operations/gameplay-health`. It requires
`operations.read`, compiles the shared matrix, contains no private player identifiers, has no form
or server action, and states the local/hosted/owner boundary on the page.

## Known limitations and Phase 13B boundary

Hosted RLS/role validation, contention, abuse/rate/moderation hardening, economy abuse testing,
approximately 40-player load, real owner-plus-ten visitors, physical network interruption, worker
contention, browser/device testing, observability, backup/recovery, and closed-beta operational
readiness belong to Phase 13B. Owner acceptance for both Phase 12E and Phase 13A remains pending.
