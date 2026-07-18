# Phase 8 game-client UI visual acceptance

This report covers the local Phase 8 game-client HUD, modal, activity, settings, and social UI
polish. The fixture at `apps/game-client/visual-acceptance.html` renders the production React
components with typed development-only state. It does not bypass wallet access, create a player
session, or call an external service.

## Exact viewport matrix

The default HUD was measured at 100% and 120% UI scale at every required size. Document width
matched viewport width and the measured fixed elements had no intersecting rectangles.

| Viewport    | Default HUD | 120% UI scale | Active party HUD | Active activity HUD |
| ----------- | ----------- | ------------- | ---------------- | ------------------- |
| 360 × 800   | Pass        | Pass          | Pass             | Pass                |
| 390 × 844   | Pass        | Pass          | Pass             | Pass                |
| 768 × 1024  | Pass        | Pass          | Pass             | Pass                |
| 820 × 1180  | Pass        | Pass          | Pass             | Pass                |
| 1024 × 768  | Pass        | Pass          | Pass             | Pass                |
| 1280 × 800  | Pass        | Pass          | Pass             | Pass                |
| 1440 × 900  | Pass        | Pass          | Pass             | Pass                |
| 1920 × 1080 | Pass        | Pass          | Pass             | Pass                |

Settings, Activities, Nearby, Friends, Requests, and Party were also measured at 360 × 800, 390 ×
844, 768 × 1024, 1024 × 768, and 1440 × 900. Every surface remained inside its viewport, exposed a
close control, produced no horizontal document overflow, and suppressed the background HUD. Settings
was additionally measured at 120% UI scale across all eight required sizes; its footer remained
visible and inside the viewport.

## Interaction checks

- The custom channel popover marks the current channel, shows population and full state, closes
  after a channel action, and restores its collapsed state.
- Settings Gameplay toggles update component state; keyboard tests cover roving section navigation,
  focus trapping, Escape, and focus restoration.
- Activity catalog keyboard navigation, eligible preparation, party-routing CTA, cooldown status,
  terminal success, and terminal failure have focused regression coverage.
- Nearby uses natural distance language and compact empty and populated states; `Within 3 tiles` is
  absent from player-facing UI.
- Friends, Requests, and Party use compact content-height sheets and functional empty-state actions.
- Active activities hide the redundant party card and inactive Activities launcher. Party connection
  state remains present inside the activity HUD.

## Representative screenshots

- [Mobile HUD, 390 × 844](./mobile-hud-390x844.png)
- [Mobile channel popover, 390 × 844](./mobile-channel-popover-390x844.png)
- [Tablet Activities, 768 × 1024](./tablet-activities-768x1024.png)
- [Desktop Settings](./desktop-settings-1280x720.png)
- [Desktop active activity HUD](./desktop-active-activity-hud-1280x720.png)
- [Desktop active party HUD](./desktop-active-party-hud-1280x720.png)

## Remaining owner acceptance

The available in-app browser did not contain an authenticated wallet session, so it correctly
stopped at the production access gate. An owner should repeat the visual pass in an authenticated
two-player session to confirm live names, real unread counts, party invitations, nearby selection,
chat content, and authoritative activity transitions. No authentication, token-gate, realtime
authority, or persistence bypass was added for this report.
