# Phase 12A player-experience architecture

Status: locally implemented; hosted migration validation and signed-in owner acceptance pending.

Phase 12A is a coordination layer over the canonical Phase 11 systems. It does not introduce a
second quest engine, inventory, DUST balance, XP system, notification bus, home, shop, player
bootstrap, or daily reward economy. The active onboarding version is `starville_core_onboarding_v1`;
it projects the six canonical `starville-beginnings` quests and records only evidence that trusted
gameplay already produced.

## Player journey

The released journey has fourteen ordered steps in nine chapters:

1. Welcome: arrive in Lantern Square, move, and meet Willow Guide.
2. Your Home: enter the canonical personal home and inspect the starter inventory.
3. First Harvest: plant, water, and harvest one Moonbean through canonical plot actions.
4. Make Something: collect a canonical cooking or crafting output.
5. General Store: complete one canonical purchase or sale.
6. Grow Your Starvillian: review the canonical Player Level, skills, quests, and unlocks.
7. Make It Home: save a valid Decoration Mode layout.
8. Starville Together: optionally review home-visit modes; no other player is required.
9. Daily Rhythm: complete one server-assigned daily objective.

Only `inspect_inventory`, `review_progression`, and `review_home_visits` accept bounded educational
acknowledgements. Farming, production, store, housing, XP, quest, and daily completion cannot be
asserted by the browser. Their evidence is adapted from append-only canonical owner-event tables.
Existing player history is replayed once when the state is lazily created. It never reissues starter
rewards.

## Daily Rhythm

`starville_daily_rhythm_v1` creates one assignment per player and UTC date. The database takes an
advisory transaction lock, evaluates level and feature availability, then deterministically chooses
one farming objective and two different non-farming categories. Every set is solo-safe, contains
three unique keys, and contains at most one social option. Inaccessible housing, production, shop,
economy, progression, and farming actions are excluded from generation. The home-visit objective is
an intentional solo-safe settings review, so it remains achievable while live visits are paused.

The reset authority is `00:00 UTC`. Generation is lazy at the first workspace read or trusted event
after the boundary. Old active assignments are marked expired by the worker. Phase 12A v1
deliberately settles only a non-economic completion mark: **0 DUST, 0 XP, no item, and no streak
multiplier**. This preserves the unpublished Candidate D economy recommendation.

The player refresh operation is revision-bound and rate-limited. It performs an authoritative reread
and accepts neither a client game-day key nor client objective definitions. Authorized
administrators can create an AAL2-audited draft policy successor. The successor clones all eight
objective definitions under its own version ID, is idempotent, and never switches the active policy;
active and historical policy children are immutable.

## State and contracts

`@starville/player-experience` owns the shared Zod contracts, catalog, deterministic selection,
twenty-two bounded Game Test fixtures, and fourteen-scenario local simulator. PostgreSQL owns
version pointers, step evidence, daily assignments/contributions, semantic guidance targets,
feedback events, telemetry, rate limits, recovery, and audit history.

The API uses service-role-only `SECURITY DEFINER` RPCs. Browser roles have no direct table or
function access. The player client loads once on entry, after relevant panels close, after world
transitions, and on focus. It does not continuously poll. The compact HUD shows one Phase 12A
objective at a time; the canonical tracked quest appears only when no onboarding/daily objective is
active.

## World guidance and fallback

Guidance targets resolve stable semantics rather than screen coordinates: Willow Guide,
personal-home entrance, farm tiles, Cooking Hearth, Crafting Workbench, General Store, My Journey,
Decoration Mode, home visits, and Daily Rhythm. Each target has a stable object key, world key,
severity, accessible text, and fallback hint. Missing target metadata never fabricates progress. A
text route remains available and a bounded recovery request can be queued.

## Feedback and accessibility

Owner feedback has five priorities: critical, action required, progress, social, and informational.
The UI uses `alert` only for critical messages and polite status announcements otherwise. The Guide
uses semantic headings, tab navigation, native buttons/details, text labels, progressbar roles,
keyboard focus, responsive single-column layouts, safe-area insets, reduced-motion behavior, and
text alternatives for every world hint. Color is not the only status signal.

## Recovery and reconciliation

Player recovery is reason-coded, revisioned, rate-limited, idempotent, and evidence-preserving. The
worker processes at most 100 rows with `FOR UPDATE SKIP LOCKED`. Inventory-full, invalid crop, and
shop-paused cases produce guidance only. State drift replays canonical evidence. A missing starter
Moonbean Seed can receive at most one verified seed repair per player/onboarding version, only when
none is owned and the canonical inventory helper accepts it. Ambiguous recipe or target problems go
to investigation. Each bounded run also reconciles up to 100 active onboarding projections, reports
repaired drift, counts active objectives whose canonical system was paused after assignment, and
validates semantic targets against canonical world/NPC/home/workstation/shop registries. Missing
targets are reported; the worker never publishes a world or guesses a replacement.

Administrators can inspect funnel/drop-off, player state, daily readiness, guidance readiness,
recovery, aggregate telemetry, and audit. A current AAL2 support session may only resume a blocked
guide, retry reviewed recovery, or reset UI-only guide preferences. There is intentionally no
arbitrary step completion, reward grant, inventory edit, DUST edit, or XP edit. Daily policy
managers can create an inactive draft successor only; activation/publication is not part of Phase
12A's local administration path.

## Game Test

World Game Test includes an inspection-only onboarding, Daily Rhythm, and Help view sourced from
twenty-two named local fixtures covering new/migrated/completed onboarding, inventory and crop
states, production, shop availability, housing, home visits, UTC reset, settlement retry, missing
guidance, and isolated new-player state. Every workspace contract is explicitly
`persistence: game_test`. It calls no mutation API and changes no real player, inventory, DUST, XP,
quest, daily, or telemetry state.

## Local database evidence

`phase12a-postgres-execution.sql` verifies the seeded versions, RLS and grants, strict workspace,
balanced daily selection, canonical quest reuse, zero Phase 12A DUST emission, exact-once onboarding
evidence, exact-once daily contribution, refresh non-duplication, AAL2 successor creation, recovery
replay, and fail-closed worker behavior. The isolated harness applies every migration through
`20260718112000` and reruns all prior Phase 11 fixtures and concurrency assertions.

No migration in this phase has been applied to hosted Supabase.
