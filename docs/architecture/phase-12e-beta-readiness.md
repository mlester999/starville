# Phase 12E beta-candidate architecture

Status: local implementation and validation complete; beta candidate ready; hosted validation and
owner acceptance pending. This document is local repository evidence, not hosted validation, owner
acceptance, V2 activation, world publication, deployment, or production readiness.

## Gate truth

- Phase 12A is locally implemented. Its protected hosted and signed-in owner gates remain pending.
- Phase 12B is the frozen bundled-default and asset-lifecycle foundation. V1 manifest `1.0.0`
  remains the published/unpinned default.
- Phase 12D supplies the additive V2 manifest `2.0.0`, 106 stable keys, 19 variants, seven aliases,
  and the 24-state eight-direction character rig. Every V2 entry is still a `production_candidate`.
- The Phase 12D runtime hotfix restores normal V1 play as the default and permits V2 only through
  explicit loopback development review or protected nonpersistent Game Test.
- The pgTAP seed-contract repair is locally complete. Repository evidence does not record the
  owner-controlled hosted rerun as passed.
- The starting worktree contains uncommitted Phase 12C/12D/hotfix/pgTAP work. Phase 12E preserves it
  and does not relabel it as newly authored work.

The pending hosted gate does not block local 12E development because the local migration replay,
asset contracts, and package tests are intact. It does block any claim of hosted readiness.

## Reused systems

Phase 12E extends these existing paths instead of creating parallel frameworks:

- immutable World Composer drafts, validation, Game Test grants, exact revision pins, and
  publication controls;
- V1/V2 bundled manifests and the shared asset resolver;
- the checked-in unpublished Lantern Square composition;
- production `GameCanvas`, collision, isometric projection, depth sorting, movement, and remote
  presence rendering;
- Phase 12A Player Experience, Daily Rhythm, recovery, and accessibility feedback;
- Phase 7/11 farming, workstation, General Store, DUST, progression, housing, and home-visit
  projections;
- coordinated HUD safe regions and `GameModalShell`;
- live-operations maintenance and announcement controls;
- existing Admin Portal authorization and Operations module.

No second map editor, asset resolver, readiness database, admin authorization system, game-state
store, or maintenance framework is introduced.

## Lantern Square candidate composition

The candidate is an immutable, repository-local `local_draft`. It is never selected by normal
published play. Its source baseline contains 47 modular objects, 36 authoritative collision shapes,
eight interactions, six terrain regions, and 19 stable world asset keys. The Phase 12E candidate
preserves those identities and adds one nonblocking semantic photo-garden interaction, for nine
interactions total. Its separate visual dependency projection adds five interaction-marker keys
without treating interface media as authoritative map assets.

Composition follows three tiers:

1. Primary landmarks: central lantern/plaza, General Store, home entrance, Cooking Hearth, Crafting
   Workbench, notice board, and four exits.
2. Secondary landmarks: seating/photo gathering areas, lamps, signs, flower clusters, and planters.
3. Supporting environment: trees, bushes, flowers, rocks, fences, paths, and ground variation.

The candidate audit checks:

- a walkable default spawn and onboarding anchors;
- visible path/plaza/bridge treatment to enabled exits;
- primary and secondary landmark coverage;
- route-clearance corridors that do not intersect blocking collision;
- stable object IDs and stable asset keys;
- collision/interaction parity with the authoritative manifest;
- restrained repetition and boundary framing;
- deterministic depth test positions in front of and behind tall objects.

Artwork does not change collision. A visual/collision disagreement is a candidate finding, never a
client-side collision rewrite.

## V1/V2 safety and fallback

Normal play resolves the exact published world revision and its immutable asset pins. An unpinned
bundled request resolves V1. V2 can be selected only when all of these are true:

- development build;
- loopback host;
- exact local candidate control, or a protected Game Test source;
- exact candidate manifest `2.0.0`;
- `production_candidate` classification;
- stable key and checksum-compatible delivery.

Local V2 review uses exact V2 media where available. A failed media request is suppressed by stable
cache identity and falls back without changing collision or interaction. No query parameter can
change a hosted world version, published pin, asset lifecycle row, or player state. Candidate
selection is not persisted.

## Scale, anchors, depth, and shadows

Presentation scale is category-driven. Authored per-object scale is bounded and multiplied by the
shared category token; CSS viewport scaling is not used to conceal bad metadata.

Every rendered asset retains:

- bottom-center origin;
- foot anchor;
- depth anchor;
- footprint and collision metadata;
- supported rotations;
- stable object position.

Player, remote players, buildings, trees, props, stations, crops, furniture, labels, and interaction
markers share deterministic depth bands. Contact shadows are nonblocking presentation layers and
never become collision geometry. Focused fixtures place the player on both sides of trees/buildings
and exercise diagonal movement and multiple remote players.

## Environmental visual ambience

Ambience is restrained and deterministic:

- bounded terrain motes;
- bounded water ripples where water exists;
- object-level foliage, flower, lantern, hearth, and workstation presentation where eligible;
- contact shadows and time-of-day lighting tokens;
- a quality-aware cap of 16 simultaneous object-ambience animations.

Low quality suppresses continuous ambience, shadows, and animated water. Reduced Motion replaces
continuous sway/flicker/pulsing with stable static feedback. Owned ambience nodes and tweens are
destroyed on world replacement and scene shutdown. Ambience never creates blocking or interactive
layers.

## Release-candidate audio

Phase 12E now provides an integrated, original procedural development-safe foundation with separate
master, music, ambience, and SFX preferences. It supports:

- explicit user gesture before playback;
- master and per-group mute;
- separate visible group volumes with immediate preview;
- one music and one ambient identity for Lantern Square or the personal home;
- pause on hidden/background state;
- bounded sound-effect cooldowns;
- teardown on location change or disposal;
- no duplicated loop after reconnect.

The ten cues contain repository-declared Web Audio synthesis parameters rather than downloaded or
embedded media. Every entry records project-owned provenance, no third-party audio, and an honest
`development_safe` classification. The binary audio payload and decoded audio-file memory are both
zero bytes. Meaningful cues retain visible text equivalents and Web Audio failure leaves the game
playable with an unavailable notice. Production audio replacement and subjective owner listening
acceptance remain pending.

## Gameplay-state readability

Visuals observe authoritative state; they never decide an action succeeded.

- Farming: empty, prepared, selected, planted, dry, watered, growing, harvest-ready, exhausted, and
  invalid states have stable asset/text treatment.
- Workstations: idle, available, active, completed, blocked, missing-ingredient, and inventory-full
  feedback remain distinct.
- General Store: availability, affordability, DUST, stock/quantity limits, receipts, and server
  conflicts are explicit.
- Housing: placement validity, collision, supported rotation, revision conflicts, unsaved state, and
  saved state remain textual as well as visual.
- Home visits: hosting/closed, join/remove, permission, guestbook, appreciation, and helper-watering
  feedback preserve owner authority.

## Interaction and guidance

One semantic marker model serves nearest, keyboard, touch, unavailable, quest, and onboarding
targets. It owns:

- one stable ground marker/outline;
- prompt key and readable label;
- disabled reason;
- quest/onboarding emphasis;
- high-contrast tokens;
- static Reduced Motion presentation;
- bounded screen/HUD placement.

Guidance uses semantic interaction and objective keys. It does not bind progression to a temporary
asset filename. Route direction, distance, unavailable location, cross-location target, and
completion remain text-accessible.

## HUD and modal coordination

The Phase 12D safe-region system remains authoritative for identity/onboarding, location, controls,
interaction prompts, chat, quickbar, and status. Connection state is represented once, with
technical detail behind Details.

The shared modal layer provides:

- body portal above the world stacking context;
- controlled backdrop and sharp panel surface;
- focus trap, Escape, and focus restoration;
- game input blocking without unmounting recovery hooks;
- responsive width/height and 44-pixel actions;
- no retained blur after close.

The integrated beta scenario uses this layer as a descriptive inspection coordinator. It can apply
the onboarding, General Store, progression, and asset-coverage fixtures, plus candidate, remote,
Reduced Motion, and high-contrast review settings. Its remaining steps direct owner inspection of
the existing notice, inventory/workstation, journal, settings, housing/home-visit, help, and
recovery surfaces; they do not execute those systems automatically.

## Coordinated recovery

One recovery policy classifies:

- API unavailable;
- realtime unavailable;
- player persistence unavailable;
- world manifest unavailable;
- access/session invalid;
- asset registry/media failure;
- reconnecting and restored.

Retries are bounded, deduplicated, and backoff-aware. A pending retry cannot start a second
equivalent request. Cached visuals may remain only when the exact trusted world is already loaded;
mutations pause when persistence or authoritative services are unavailable. Access revocation always
wins over reconnect.

Player-facing text never treats a transport failure as rejection or success. Stable codes and
request IDs can appear in Details, while raw SQL/database/storage paths cannot.

### Player-persistence policy

The latest collision-safe state is retained in memory. A failed save:

- marks persistence unavailable;
- blocks mutation-capable panels;
- keeps one retryable checkpoint;
- never launches duplicate profile/save calls;
- reconciles the authoritative state/version before normal mutation resumes.

Leaving or entering maintenance attempts one bounded flush. Failure is visible and is not reported
as saved.

### Asset-resolution policy

Failed media identities use a bounded cooldown registry. The runtime:

- records stable key and sanitized request ID;
- suppresses repeated equivalent fetches;
- retains collision and interaction;
- uses the declared V1 or diagnostic fallback;
- emits development/Admin diagnostics without revealing a storage path;
- never crashes the world solely because an image failed.

## Performance instrumentation and budgets

Development diagnostics are opt-in and are not rendered in normal production UI. They may record
frame duration, long frames, asset request/cache/failure counts, estimated decoded texture bytes,
active animations/particles/remotes/listeners, realtime message rate, modal count, and HUD panel
count.

Budgets are local regression guardrails, not production guarantees:

| Surface                         |                                                                                           Local guardrail | Evidence/reason                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------- |
| V2 managed files                |                                                                                           1,864,389 bytes | checked-in Phase 12D size report                                                            |
| V2 runtime media                |                                                                                 859,172 bytes / 118 files | checked-in Phase 12D size report                                                            |
| Initial Lantern Square textures | 26 base identities; at most 31 with five candidate marker dependencies, within the 8 MiB decoded estimate | 19 map keys, six bounded terrain keys, one missing-asset fallback, and optional marker keys |
| Character candidate             |                                                      one renderer per player; no duplicate V1/V2 renderer | renderer factory/load fixture                                                               |
| Ambient motes                   |                                                                                                at most 18 | shared visual token                                                                         |
| Water ripple groups             |                                                                                                at most 20 | shared visual token                                                                         |
| Object ambience                 |                 at most 16 simultaneous animations; Reduced Motion uses zero continuous object animations | Phase 12E ambience model                                                                    |
| Remote players                  |                            bounded by authenticated channel policy; local fixtures stop at supported caps | realtime contract                                                                           |
| World transition                |                                  15-second hard timeout; target near the existing 1–2 second presentation | existing transition policy                                                                  |
| Modal response                  |                                    no network requirement for shell open/close; one mounted primary modal | shared modal layer                                                                          |
| Retry                           |                                                         one in flight per dependency with bounded backoff | recovery policy                                                                             |

Mobile uses the same V2 candidate only after measurement. Low-quality adaptation reduces
particles/ambience, shadows, animated water, label range, and distant update work; it does not
silently switch the asset version to V1.

## Multiplayer and soak evidence

The deterministic accelerated fixture cycles remote-player loads of one, five, ten, twenty, and
forty across 10,000 iterations without claiming production scale. Its current assertions are limited
to maximum remote count, duplicate/remaining remote count, a synthetic listener counter,
failed-asset cooldown suppression, and the bounded realtime retry schedule. Separate focused tests
cover eight-direction remote state, interpolation, idle-facing restoration, and reconnect
replacement, but those behaviors are not exercised by this accelerated fixture.

The fixture does not simulate real world movement, home/world changes, gameplay mutations,
workstation/shop/housing views, modal lifecycle, home visits, audio loops, browser frame cost, or
memory. The owner’s real 30-minute browser session, listener/memory inspection, multiplayer
walkthrough, and WAN test remain pending.

## Responsive and accessibility matrix

The required matrix is 360×800, 390×844, 412×915, 768×1024, 820×1180, 1024×768, 1280×800, 1366×768,
1440×900, 1920×1080, and 2560×1440, plus a 200%-zoom equivalent, narrow desktop, tablet/mobile
landscape, Reduced Motion, and high contrast.

Acceptance requires:

- no safe-region collisions or horizontal page overflow;
- primary actions and modal controls in bounds;
- keyboard menus and focus restoration;
- touch targets at least 44 pixels;
- objective/location text alternatives;
- polite/assertive connection announcements by priority;
- deduplicated notifications;
- screen-reader-safe world interaction summaries;
- separate master/music/ambience/SFX volume and mute controls;
- non-color-only state communication.

## Integrated protected Game Test

The Phase 12E beta scenario is a 23-step descriptive in-memory coordinator over the existing
protected Game Test. It provides review instructions for spawn, movement, V2 character, remote
parity, guidance, home, farming, workstation, General Store, progression, furniture, home visits,
guestbook/appreciation/helper watering, modals, audio controls, audio-unavailable fallback,
reconnect, asset fallback, Reduced Motion, high contrast, and the complete responsive review.
Automated fixture application is limited to four linked review surfaces and the
candidate/participant/accessibility settings; the other steps require owner inspection and are not
automated gameplay execution.

Inspection marks live only in React state. The scenario performs no player, inventory, DUST,
progression, housing, social, world, analytics, or telemetry write and is never owner acceptance.

## Admin Beta Readiness

Operations → Beta Readiness reuses the existing protected Operations authorization. Its computed
repository model uses these statuses:

- Not Started
- Local Evidence Ready
- Hosted Validation Pending
- Owner Review Pending
- Blocked
- Accepted
- Production Ready

Every gate includes evidence source, checked time, environment, responsible gate, blocker, and next
action. Automated evidence and unchecked owner decisions are separate. There is no duplicated
readiness table and no browser mutation path.

## Activation, rollback, maintenance, and deployment

Phase 12E prepares but cannot execute V2 activation. A future authoritative workflow must require
V1/V2 comparison, affected-key/world preview, immutable-pin review, approved candidate, permission,
AAL2, reason, expected revision, audit, runtime verification, and rollback.

Rollback is forward-only and preserves asset/world history, immutable published revisions, player
inventory, DUST, progression, housing, social state, and audit history.

The isolated maintenance code-path drill proves the safe new-admission error, the component-level
notice after one bounded flush, focused cozy-route mutation blocking, and single-flight manual
recheck. Workers currently continue their registered bounded jobs because the runtime has no global
maintenance input. Existing websocket visit closure, database settlement/inventory/DUST invariants,
and a true-to-false integrated resume remain pending; the maintenance drill documents those
limitations explicitly.

Deployment remains owner-controlled and requires reviewed source control, environment checks,
migration verification/dry run, hosted lint/pgTAP/RLS, build/security scans, service health,
signed-in walkthrough, V1 verification, a separate V2 activation decision, rollback readiness, and
monitoring. This phase does not run those hosted or deployment actions.

## Telemetry boundary

Existing authoritative events cover access, world entry, gameplay, economy, progression, housing,
and social activity. Phase 12E development diagnostics cover candidate usage, asset fallback,
reconnect, modal/runtime failures, and long-frame degradation locally.

Game Test telemetry is suppressed. No local diagnostic is sent to production analytics. Any future
production event must use a stable event key, sanitized request/session correlation, bounded
metadata, retention policy, and server-side interpretation.

## Error-recovery matrix

| Failure                    | Player message               | Retry/mutation policy                                          | Cached/fallback policy                  | Diagnostic/escalation     |
| -------------------------- | ---------------------------- | -------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| Player profile 503         | Player service unavailable   | one bounded retry; mutations paused                            | trusted world may remain visible        | request ID; Player API    |
| Database unavailable       | Village records unavailable  | no success assumption                                          | trusted read cache only                 | sanitized service code    |
| Realtime unavailable       | Realtime unavailable         | backoff/reconcile; local mutations requiring realtime disabled | world stays visible                     | attempt and channel       |
| Worker unavailable         | Settlement delayed           | no repeated settlement                                         | authoritative pending state             | job/reference ID          |
| World manifest unavailable | Last safe map could not open | bounded reload                                                 | keep current exact world only           | request ID/version        |
| Asset missing              | Visual fallback used         | suppress equivalent refetch                                    | V1/diagnostic media; collision retained | stable key/request ID     |
| Invalid world revision     | Route changed                | cancel transition                                              | restore last safe position              | expected/current revision |
| Inventory full             | Inventory is full            | user resolves capacity                                         | no grant/reward assumed                 | operation request ID      |
| Insufficient DUST          | Not enough DUST              | no transaction                                                 | current authoritative balance           | offer/catalog revision    |
| Workstation delayed        | Job is still settling        | idempotent refresh                                             | pending job remains                     | job/reconciliation ID     |
| Shop conflict              | Offer changed                | refresh then review again                                      | old offer cannot settle                 | catalog revision          |
| Housing conflict           | Layout changed               | reload/reapply                                                 | no overwrite                            | expected/current revision |
| Visit closed               | Visit ended                  | return to safe home/world                                      | no visitor authority retained           | visit ID                  |
| Session expired            | Verify access again          | stop mutation/realtime                                         | public shell only                       | session reference         |
| Wallet disconnected        | Wallet access interrupted    | reverify; no automatic restoration                             | no eligibility assumption               | token-gate request ID     |

## Security and database conclusion

- The client cannot select an authoritative world/asset/collision version.
- V2 local review cannot activate or publish anything.
- Game Test has no progression and no production telemetry.
- Service-role credentials and storage paths never enter browser diagnostics.
- RLS, AAL2, expected revisions, idempotency, rate limits, and audit requirements remain in force.
- Reconnect cannot restore revoked access.
- No database migration is required for Phase 12E. Existing version, audit, feature-status, and
  computed projection mechanisms are sufficient.

## Known limitations

- Hosted pgTAP/RLS and protected signed-in validation remain owner-controlled and pending.
- V2 remains a production candidate and has not received owner activation approval.
- Current audio is an original procedural `development_safe` foundation, not owner-approved final
  music or sound design.
- Browser/GPU memory, CDN/WAN timing, physical touch devices, screen readers, and a real 30-minute
  session require owner evidence.
- Local load/soak results do not prove production capacity.
- No world, asset, player, economy, progression, housing, or social change is published by this
  architecture.
