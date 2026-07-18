# Phase 10B controlled local validation report

Recorded: 2026-07-16 Asia/Manila. Scope: local repository and isolated local services only.

Status: local engineering evidence complete; hosted migrations, hosted validation, production art,
signed-in administrator checks, and owner acceptance remain pending. No hosted write, migration
push, deployment, content publication, platform publication, player-balance mutation, or token claim
was performed.

## Database evidence

`pnpm db:test:local:world` built a fresh PostgreSQL 18.1 instance, applied every migration through
`20260716113000_world_asset_version_upload_recovery.sql`, and completed the full cross-phase
execution suite. Phase 10B additionally proved:

- actual `information_schema` columns, forced-RLS flags, table privileges and function privileges;
- no purchase RPC, no enabled shop, no published offer, and no direct browser table authority;
- SQL Wardrobe output parsed by the shared `@starville/cosmetics` TypeScript contract;
- definition-owned display names even when version fixture metadata differs;
- save, rename, apply and delete loadouts; wheel update; emote activation; collection settlement;
  grant/revoke; disabled module; public appearance privacy; immutable receipts; and bounded keys;
- changed-intent replay conflicts for outfits, wheels, emotes, collections, grants and revocations;
- 125 authoritative Wardrobe reads plus 125 administrator audit pages of at most 20 items; and
- coherent outcomes for two concurrent grants, two outfit updates from one revision, two collection
  settlements, and two wheel updates.

All fixture mutations ran in isolated test data and were rolled back or destroyed with the temporary
database. Existing hosted player, DUST, inventory, wallet, avatar, presence and content rows were
not read or changed.

## Economy simulation evidence

`pnpm economy:load:test` completed the existing 360-run candidate matrix and the new 36-result
cosmetic participation matrix across 100, 1,000 and 10,000 players and 30, 90 and 180 days. Every
same-seed replay matched, every negative-balance count was zero, and the report fixed
`playerBalancesMutated = false`, `liveDataRead = false`, `published = false`, and
`tokenClaimsCreated = 0`.

The 10,000-player/180-day synthetic comparison produced:

| Participation |   Source/sink ratio | Beginner affordability | Median balance | Top-decile concentration | Shop participation | Repeat spending | Collection exhaustion | Late-period usefulness | Modeled DUST destroyed |
| ------------- | ------------------: | ---------------------: | -------------: | -----------------------: | -----------------: | --------------: | --------------------: | ---------------------: | ---------------------: |
| None          | No sink denominator |                100.00% |          2,032 |                   11.13% |                 0% |              0% |                    0% |                     0% |                      0 |
| Low           |            6.355990 |                 99.80% |          1,748 |                   12.41% |             88.33% |          63.67% |                    0% |                 51.36% |              3,199,680 |
| Moderate      |            2.087468 |                 97.54% |          1,082 |                   16.47% |             99.71% |          98.60% |                 0.63% |                 87.85% |              9,739,680 |
| High          |            1.221445 |                 91.85% |            306 |                   24.64% |               100% |            100% |                20.44% |                 98.75% |             16,618,890 |

These values are sensitivity evidence under documented illustrative assumptions, not telemetry,
prices, forecasts, recommendations, published configuration, or authorization to enable purchases.

## Realtime and renderer load evidence

The corrected `pnpm realtime:load:test` ran 10, 20 and 40-player single-channel scenarios plus two
40-player/two-channel activity-isolation scenarios, one with five reconnects. Every player sent one
server-resolved appearance refresh and one entitled `wave` emote.

The 40-player single-channel scenario observed 1,600 exact appearance broadcasts and 1,600 exact
emote broadcasts, zero emote rejection, zero unsafe/private cosmetic payload fields, and 22 ms worst
cosmetic broadcast latency. The two-channel/activity-isolated scenarios each observed the expected
100 appearance plus 100 emote broadcasts, proving events did not cross the current routing scope.

`pnpm avatar:renderer:load:test` simulated 40 modular avatars over 240 frames: 0 duplicate entities,
0 position resets, 0 failed fallbacks, 0 non-finite frames, 0.235 ms p95 frame work and 4.054 ms
maximum measured frame work in the local procedural renderer harness. This is not a production
device-capacity claim.

## Responsive and accessibility evidence

The real Phase 10B `PremiumWardrobe` component was rendered through the development-only visual
acceptance entry with a clearly isolated fixture response. Browser checks covered 360×800, 390×844,
768×1024, 820×1180, 1024×768, 1280×800, 1440×900 and 1920×1080.

An initial check found 43.2 px tab controls. The CSS was repaired to make every Wardrobe button,
input and select at least 44 px. The repeated matrix showed:

- zero page-level horizontal overflow at every required viewport;
- the dialog remained entirely inside each viewport;
- horizontal category tabs remained internally scrollable where needed;
- equipped, unavailable and revoked states remained visible in explicit text;
- all tested form and action controls met the 44 px minimum;
- five outfit slots rendered with stable labels;
- one owned emote was enabled while one unowned emote was disabled;
- the shop showed purchases disabled with no Buy button and no form; and
- keyboard focus stayed inside the dialog with a visible solid outline.

At 390×844, 820×1180 and 1440×900, the component also passed each of 90%, 110% and 120% UI scale
with both reduced-motion and increased-contrast fixture states active. There were no browser console
warnings or errors.

The protected administrator area is covered locally by CSS breakpoints, semantic component tests,
permission tests and production builds. A real signed-in browser check for each administrator role
is still part of hosted owner acceptance and is not represented as completed here.

## Automated suites

Focused suites completed with these observed counts before the final repository-wide gate:

- database migration tests: 141;
- economy-simulation tests: 25;
- cosmetic-contract tests: 5;
- game-client tests: 173;
- API tests: 291;
- administrator tests: 284;
- realtime tests: 30; and
- Phase 10A/10B documentation tests: 10.

The canonical repository-wide quality commands remain the final source of truth for handoff. Hosted
commands and signed-in acceptance cannot be replaced by this local evidence.
