# Phase 12D runtime integration hotfix report

Run date: 2026-07-19 Asia/Manila. Scope: exact local worktree only.

Status: **STARVILLE PHASE 12D RUNTIME INTEGRATION HOTFIX LOCALLY COMPLETE, OWNER REVIEW PENDING**

This report records implementation and deterministic local browser evidence. It does not record
owner acceptance, protected hosted-product validation, publication, activation, deployment, or a Git
handoff.

1. **Root cause — HUD overlap.** The player/guide, location/controls, and bottom HUD groups were
   independently absolutely positioned. Their hard-coded offsets and widths did not share reserved
   regions, so content growth and narrower viewports allowed the groups to occupy the same pixels.
2. **Previous positioning model.** Top and bottom widgets each treated the world frame as an
   unconstrained canvas. The connection warning also used a fixed viewport position, while the
   hotbar, chat, interaction prompt, and status dock used unrelated bottom offsets.
3. **Coordinated HUD architecture.** `GameWorld` now renders named top-left, top-center, top-right,
   bottom-left, bottom-center, and bottom-right anchors. Shared CSS variables coordinate edge, gap,
   left-column, and right-column geometry.
4. **Safe zones.** The top grid reserves mutually exclusive columns. Bottom chat, prompt, quickbar,
   and status use explicit anchor attributes and breakpoint-specific reserved heights. The
   live-operations warning occupies document flow above the world frame instead of covering it.
5. **Priority behavior.** Player identity/onboarding remain top-left, current location remains
   top-center, and controls remain top-right. Location detail auto-collapses after five seconds and
   can be reopened; lower-priority control labels hide before their controls become unreachable.
6. **Responsive behavior.** CSS covers the requested eight viewport sizes, compact phone/tablet
   layouts, landscape-height constraints, and a 200%-zoom-equivalent 720×450 CSS viewport. The
   360/390 phone layout raises the quickbar, prompt, and chat into distinct bands.
7. **Connection consolidation.** `coordinateConnectionHealth` produces one state and one compact
   summary from Player API, Realtime, safe-position persistence, and access verification. Details
   exposes the service breakdown and one composite Retry action replaces duplicate Level, DUST,
   profile, and realtime retry surfaces.
8. **Root cause — old character selection.** The Phase 12D renderer had replaced the default
   `PlayerRenderer` implementation without an explicit runtime candidate gate, so the code did not
   prove that an unrequested normal path remained on the published V1 renderer.
9. **V2 review mechanism.** Only a development build on `localhost`, `127.0.0.1`, or `[::1]` with
   the exact `?visual-candidate=v2` query enables the in-memory V2 review. It displays
   `LOCAL V2 CANDIDATE REVIEW · UNPUBLISHED · IN MEMORY` and is not stored in a cookie, browser
   storage, or the database.
10. **V1 preservation.** The published V1 renderer was restored as the default. With the query
    absent, invalid, nonlocal, or production-built, the original `RuntimeWorld` object and
    `published_v1` renderer mode are returned unchanged.
11. **Character renderer integration.** `createAvatarPlayerRenderer` selects either the restored V1
    `PlayerRenderer` or `Phase12DPlayerRenderer`. `GameCanvas`, `WorldScene`, and remote-player
    rendering carry the explicit mode. Only the local Lantern composition candidate uses V2;
    authorized revision Game Test stays V1.
12. **Direction resolver.** Keyboard and touch feed the canonical collision-safe movement input.
    `nextFacingDirection` resolves all eight directions and preserves the previous facing while
    idle. The shared vector rig resolves the corresponding directional pose.
13. **Idle/walk/jog mapping.** The shared rig contains 24 deterministic mappings: idle, walk, and
    jog for N, NE, E, SE, S, SW, W, and NW. Runtime frame selection uses movement state, Shift
    jogging, time, and Reduced Motion.
14. **Character fallback.** Invalid/missing appearance selections retain the established fallback
    style. The V2 renderer remains procedural and texture-independent; the factory falls back to the
    V1 renderer unless the explicit candidate mode is present.
15. **Other V2 asset resolution.** The local review rebinds stable dependency keys only when an
    exact manifest `2.0.0` `production_candidate` delivery verifies in `game_test` context. Terrain,
    nature, lighting, structures, workstations, furniture, shop, and interaction media therefore
    resolve through the same version-aware path.
16. **V1/V2 parity.** World/version identity, checksum, map/object positions, stable keys,
    collision, interaction, depth anchors, transitions, and player state are preserved. A missing or
    invalid V2 key retains its exact published delivery or the normal V1 fallback.
17. **Root cause — board blur.** The board card was inside the world stacking context at z-index 40,
    while `.world-frame--modal-open::after` blurred/dimmed at z-index 45. The overlay therefore sat
    over the card and made the modal itself appear blurred or absent.
18. **Modal portal.** The notice board uses the canonical `GameModalShell` with opt-in body portal
    `#starville-modal-root`, fixed backdrop, semantic dialog, and a dedicated `WorldNoticeModal`.
19. **Stacking context.** The portalled backdrop owns z-index 80 outside the world frame; the world
    blur pseudo-element remains z-index 45 and the sharp modal surface is a child layer above its
    own backdrop.
20. **Backdrop/blur behavior.** Only the world behind the portal is dimmed and blurred. The modal
    has no filter or backdrop-filter. Closing removes the modal-open class and restores the
    unblurred world.
21. **Modal states.** The component provides explicit ready, empty, loading, and error
    presentations, including retry support for an error state. The current synchronous board notice
    uses ready or empty; the other states are covered in the browser fixture and tests.
22. **Focus.** The shell focuses the dialog, traps Tab/Shift+Tab, closes with Escape or an allowed
    backdrop click, and restores focus to the invoking control. The footer Close button remains
    keyboard accessible.
23. **Game input.** Player keyboard/touch movement and interaction are blocked while the modal is
    open. Realtime/network hooks remain mounted and can continue reconciling.
24. **Player card.** Player identity is now a stable top-left safe-region item with wrapping and
    constrained width for long names.
25. **Onboarding.** Guide and tracked-objective content stack below identity in the same safe region
    instead of competing for a second absolute top-left origin.
26. **Location.** Location owns the top-center region, expands on map/home change, auto-collapses,
    and remains reopenable.
27. **Hotbar/status.** The quickbar is centered within a width that excludes the left chat and right
    status reserves. Phone and short-landscape rules give chat, prompt, quickbar, and status
    distinct vertical bands.
28. **Accessibility.** Named HUD regions, screen-reader labels, keyboard modal behavior, focus
    restoration, Reduced Motion, high contrast/forced-colors support, responsive zoom, and minimum
    touch sizing are covered by code/tests and deterministic browser inspection.
29. **Performance safeguards.** One renderer instance is selected per avatar; no V1/V2 renderer is
    double-mounted. Exact manifest pins prevent variant probing. The 40-player/240-frame load test
    recorded 0 duplicate entities, 0 failed fallbacks, 0 resets, and 0 nonfinite frames.
30. **Security/version safety.** The gate requires development + loopback + exact query on every
    load, is in-memory only, cannot activate hosted V2, and cannot change the server-authoritative
    published revision. Exact manifest/version/checksum validation remains enforced.
31. **Browser evidence.** An actual in-app browser measured every relevant HUD rectangle at 360×800,
    390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080: zero pairwise
    collisions and zero out-of-bounds elements. The 720×450 200%-zoom-equivalent viewport also had
    zero collisions/out-of-bounds. Reduced Motion + high contrast at 390×844 passed. The character
    fixture rendered 24 unique mappings. Modal inspection confirmed a BODY portal, z-index 80 over
    world z-index 45, no modal filter, focus in the dialog, and successful Escape dismissal. Exact
    V2 terrain, tree, lamp, flowers, and General Store URLs carried `manifest=2.0.0`.
32. **Tests.** New tests cover the candidate gate, connection coordinator, safe-region UI, notice
    modal, renderer factory, default V1 behavior, exact V2 images, 24 character mappings, and source
    selection. Full repository tests passed 69 workspace tasks plus 11 root files/112 tests; Game
    Client passed 67 files/314 tests.
33. **Files changed.** Hotfix code/tests are concentrated in
    `apps/game-client/src/{app,components,game,visual-acceptance}`, especially
    `local-visual-candidate`, `connection-health`, `GameWorld`, `PlayerExperience`,
    `PlayerStatusDock`, `GameCanvas`, `WorldGameTest`, `WorldNoticeModal`, `game-ui`, `styles.css`,
    `player`, `phase12d-player`, `avatar-player-renderer`, `remote-player`, `WorldScene`,
    `BundledAssetImage`, and `AssetCoverageGameTest`. Documentation changes are this report, the
    owner checklist, and Phase 12D architecture/security/final/local reports. The pre-existing dirty
    worktree’s broader Phase 12C/12D files were preserved and are not reclassified as hotfix-only
    edits.
34. **Exact validation.** `pnpm format:check`, `pnpm lint` (39/39), `pnpm typecheck` (39/39),
    `pnpm test` (69/69 plus 112 root tests), `pnpm build` (39/39 after V1/V2 validation),
    `pnpm security:scan` (1,486 source files, 595 browser files, 6 local secret values),
    `pnpm env:check`, `pnpm assets:check` (V1 106/335/1,159,625 bytes; V2 106/335/1,864,389 bytes),
    and `pnpm avatar:renderer:load:test` all passed. The renderer test measured 40 players/240
    frames, median 0.077 ms, p95 0.263 ms, maximum 7.888 ms.
35. **Limitations.** The local normal signed-in Game Client could not pass its initial live
    availability check because the local API/auth stack was unavailable. Browser geometry,
    accessibility modes, modal behavior, V2 media, and the full 24-state character matrix were
    therefore exercised in the repository’s deterministic read-only visual-acceptance harness. Owner
    protected-product, touch-device, screen-reader, WAN/CDN, GPU/browser-memory, and subjective art
    acceptance remain pending.
36. **Owner steps.** Complete every unchecked item in
    `docs/deployment/phase-12d-runtime-hotfix-owner-review.md`, first without the query for V1, then
    locally with `?visual-candidate=v2`; verify all eight directions/states, notice-board behavior,
    connection degradation/retry, responsive/zoom/accessibility cases, and record an explicit
    accept/reject/revise decision.
37. **V1 confirmation.** V1 is the code default and the published-world path is unchanged.
38. **V2 activation.** V2 was **not activated**.
39. **World publication.** No world revision was published.
40. **Hosted writes.** No hosted database, storage, auth, player, economy, inventory, progression,
    farming, housing, social, or realtime write was performed.
41. **Migration push.** No migration was created for this client hotfix and no migration was pushed.
42. **Deployment.** No application or asset deployment was performed.
43. **Git handoff.** No commit or Git push was performed.

Final status: **STARVILLE PHASE 12D RUNTIME INTEGRATION HOTFIX LOCALLY COMPLETE, OWNER REVIEW
PENDING**
