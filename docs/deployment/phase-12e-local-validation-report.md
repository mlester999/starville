# Phase 12E local validation report

Run date: 2026-07-19 Asia/Manila.

Status: **PHASE 12E LOCALLY COMPLETE**.

Release interpretation: **BETA CANDIDATE READY LOCALLY; HOSTED VALIDATION AND OWNER ACCEPTANCE
PENDING**. This report is not hosted validation, owner acceptance, V2 activation, world publication,
deployment approval, or production readiness.

## Repository and safety context

- Repository: `/Users/marklesteracak/Documents/Marky Files/Programming/starville`
- Branch: `master`
- Starting revision: `63a7262` (`feat: complete Phase 12B visual asset system`)
- The worktree was already materially dirty with user-owned Phase 12C, Phase 12D, runtime-hotfix,
  and hosted-pgTAP-repair work before Phase 12E began. Phase 12E preserved it.
- V1 manifest `1.0.0` remains the normal published/unpinned default.
- V2 manifest `2.0.0` remains an unpublished local `production_candidate`.
- No hosted write, migration push, V2 activation, V1 deactivation, hosted world publication,
  deployment, commit, or Git push occurred.

## Required command results

| Command                          | Result | Exact local evidence                                                                                                                                                                                                                         |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:check`                 | PASS   | Six applications/services recognized; Solana Mainnet and token-access configuration parsed; environment `development`; hosted-test approval remained false.                                                                                  |
| `pnpm format`                    | PASS   | Repository-wide Prettier write completed; Phase 12E files were already formatted.                                                                                                                                                            |
| `pnpm format:check`              | PASS   | `All matched files use Prettier code style!`                                                                                                                                                                                                 |
| `pnpm lint`                      | PASS   | 39/39 Turbo package tasks plus root scripts.                                                                                                                                                                                                 |
| `pnpm typecheck`                 | PASS   | 39/39 Turbo package tasks plus root strict TypeScript.                                                                                                                                                                                       |
| `pnpm test`                      | PASS   | 69/69 Turbo tasks plus 11 root test files/112 tests. Key applications: Game Client 76 files/346 tests; Admin Portal 70/449; API 50/387; realtime server 2/35.                                                                                |
| `pnpm build`                     | PASS   | Both 106-asset registries revalidated; 39/39 package/application builds; Landing, Game Client, Admin Portal, API, realtime, and worker artifacts produced.                                                                                   |
| `pnpm security:scan`             | PASS   | 1,522 source files and 596 browser files scanned; six local secret values checked; no browser-secret boundary failure.                                                                                                                       |
| `pnpm db:test:local:world`       | PASS   | PostgreSQL 18.1 applied the full local chain through the preserved Phase 12D registry migration; execution and concurrency fixtures passed. Local `plpgsql_check` was unavailable, so Supabase function lint was skipped and is not claimed. |
| `pnpm realtime:load:test`        | PASS   | 10, 20, and 40 public players plus two 40-player mixed activity cases, including five reconnects; zero rejected movements, unsafe cosmetic payloads, remaining reservations, leaked temporary items, or leaked active activity instances.    |
| `pnpm avatar:renderer:load:test` | PASS   | 40 procedural avatars, 240 simulated frames, median 0.050 ms, p95 0.109 ms, maximum 1.815 ms, zero duplicate entities, failed fallbacks, position resets, or non-finite frames.                                                              |
| focused runtime soak             | PASS   | One file/two tests; 10,000 cycles over 1/5/10/20/40 remote loads; maximum 40 remotes; zero duplicates, remaining remotes, or listeners; at most three failed-asset fetch attempts; retry schedule `[500, 1000, 2000, 4000, 8000, 10000]`.    |
| `git diff --check`               | PASS   | No whitespace error after final source and documentation reconciliation.                                                                                                                                                                     |

## Asset pipeline

| Command                  | Result                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `pnpm assets:generate`   | PASS — V1 and V2 each reported 338 outputs, zero written, 338 unchanged.                       |
| `pnpm assets:validate`   | PASS — V1: 106 assets, 335 files, 1,159,625 bytes; V2: 106 assets, 335 files, 1,864,389 bytes. |
| `pnpm assets:manifest`   | PASS — one output, zero written, one unchanged, 212,691 bytes.                                 |
| `pnpm assets:thumbnails` | PASS — 99 outputs, zero written, 99 unchanged, 467,048 bytes.                                  |
| `pnpm assets:coverage`   | PASS — two outputs, zero written, two unchanged, 377,122 bytes.                                |
| `pnpm assets:check`      | PASS — both registries revalidated with no deterministic drift.                                |

## Browser validation

The in-app browser loaded the real Vite visual-acceptance server over a local-network URL. The final
default-world matrix produced zero same-region HUD collisions, zero page-level horizontal overflow,
zero out-of-viewport audited actions, and visible Settings, Chat, and Details controls at every
required viewport:

- 360 × 800
- 390 × 844
- 768 × 1024
- 820 × 1180
- 1024 × 768
- 1280 × 800
- 1440 × 900
- 1920 × 1080

Additional 1180 × 900 and 1240 × 900 narrow-desktop, 844 × 390 and 800 × 360 mobile-landscape, and
720 × 450 CSS-viewport checks passed. The last case is the layout/reflow equivalent of a 1440 × 900
page at 200-percent browser zoom. The automation surface did not change browser-chrome zoom, so a
physical browser 200-percent review remains intentionally unchecked in owner acceptance.

The first matrix exposed an offscreen Player Status **Details** action at tablet widths and at a
narrow desktop width. The responsive status-grid minimums were corrected in `styles.css`; the full
matrix and narrow-desktop cases then passed with the action inside the viewport.

Representative modal checks passed for Settings at 360 × 800, Housing at 390 × 844, Cooking at 1024
× 768, notice-error at 1280 × 800, and Settings in the zoom-equivalent viewport. Each audited dialog
was portalled, viewport-bounded, focus-contained, body-scroll-locked, and free of page-level
horizontal overflow. Housing owns an `overflow: auto` dialog for its tall workspace; the visible
Decoration Mode action and lower scrollable content remain reachable.

The connection-details flow was exercised through **Details → Technical details** at 390 × 844. Its
portal dialog stayed in bounds, retained focus, locked the body, and exposed no URL, UUID, Supabase,
token, bearer, API-key, or service-role text.

Reduced Motion plus high contrast passed on phone, narrow desktop, mobile landscape, and the
24-mapping character matrix. The default preview had zero computed animations. The character matrix
kept its authored animation durations for deterministic frame composition but all 88 animated
sub-elements reported `animation-play-state: paused`; the matrix exposed 24 labeled mappings and a
bounded horizontal matrix scroller on phone.

## Service-health smoke

All service smokes were local and non-mutating.

- Landing built server: `/` HTTP 200; `/game-status` HTTP 200.
- Game Client built Vite preview: `/` HTTP 200. The browser matrix also loaded its live local Vite
  acceptance route.
- Admin Portal built server: `/login` HTTP 200; anonymous `/operations/beta-readiness` HTTP 307 to
  `/login`, confirming the protected route fails closed.
- API built bundle: `/health` HTTP 200 and `/ready` HTTP 200 in an `env -i` isolated process with
  unreachable loopback Supabase/RPC/service dependencies.
- Realtime built bundle: `/health` HTTP 200 and `/ready` HTTP 200 with zero active/admitted
  connections under the same isolated dependency boundary.
- Worker production entrypoint was deliberately not started because it runs registered
  reconciliation jobs. Its isolated loopback runtime test passed one file/seven tests, including
  `/health`, `/ready`, registered-job readiness, and clean shutdown with mock jobs.

The service smoke caught and repaired a production-only bundle defect: intentional workspace
bundling pulled CommonJS transitive code into ESM without a lexical Node `require`. API, realtime,
and worker tsup configs now add a `createRequire(import.meta.url)` banner. All three bundles
rebuild; API/realtime start and stop cleanly. API emitted the existing Node `punycode` deprecation
warning, which did not affect health or readiness.

## Maintenance drill

The separate maintenance report records a local code-path pass for new-session denial, the existing
client notice and one bounded flush, cozy-route mutation blocking, single-flight recheck, protected
Admin form validation, and the current bounded-worker continuation policy. It truthfully leaves the
integrated signed-in stack, existing websocket closure, true-to-false resume, database settlement,
inventory/DUST invariants, and owner/hosted drill pending.

## Local conclusion

The implemented Phase 12E repository candidate passes its required deterministic asset, format,
lint, type, test, build, security, local PostgreSQL, realtime load, avatar load, accelerated soak,
service-health, and browser layout gates. Those results qualify the working candidate for hosted and
owner review; they do not satisfy either review and do not make Starville production ready.
