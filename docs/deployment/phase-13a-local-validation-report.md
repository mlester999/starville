# Phase 13A local validation report

## Result

**PASS — local gameplay integration candidate ready; hosted validation and owner acceptance
pending.**

Validation ran on 2026-07-22 from branch `master`, starting Phase 13A at
`f9b6a08 chore: checkpoint Phase 12E technical beta candidate`. The working tree was already dirty
with preserved Phase 12E, Phase 12F, generated, and owner-authored work. No command staged,
committed, pushed, deployed, published, activated, or wrote to a hosted service.

The environment checker reported the approved development Supabase project. Its local configuration
currently permits remote writes, but Phase 13A did not invoke any remote/hosted command or use that
permission. `starville-prod` was never selected or contacted.

## Required command matrix

| Command                    | Result | Evidence                                                                                         |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `pnpm env:check`           | PASS   | All applications/services parsed; Supabase environment `development`; hosted tests disabled      |
| `pnpm format`              | PASS   | Repository-wide Prettier completed                                                               |
| `pnpm format:check`        | PASS   | All checked files matched Prettier                                                               |
| `pnpm lint`                | PASS   | 39/39 workspace lint tasks plus root scripts                                                     |
| `pnpm typecheck`           | PASS   | 39/39 workspace typecheck tasks plus root scripts                                                |
| `pnpm test`                | PASS   | 69/69 Turbo tasks plus 11 root test files / 112 root tests                                       |
| `pnpm build`               | PASS   | Asset validation plus 39/39 builds; Admin route includes `/operations/gameplay-health`           |
| `pnpm security:scan`       | PASS   | 1,580 source files, 689 browser files, six local secret values checked                           |
| `pnpm db:test:local:world` | PASS   | PostgreSQL 18.1; full chain through `20260718123000`; gameplay and concurrency assertions passed |
| `pnpm realtime:load:test`  | PASS   | Local 10/20/40-player, two-channel, reconnect, and owner-plus-ten fixtures completed             |
| `git diff --check`         | PASS   | No whitespace errors after implementation and reports                                            |

## Focused evidence

- `@starville/player-experience`: 28 tests passed, including the 26-step new-player journey, 12-step
  returning journey, 20 capabilities, 30 authoritative states, 20 failure rows, 20 fixtures, and
  every exact-once retry class for 15 mutation families.
- `@starville/game-client`: 392 tests passed across 82 files. Phase 13A adds two Game Test scenario
  tests and three settlement-invalidation tests, and extends the existing shop mutation test with
  the authoritative settlement callback assertion.
- `@starville/admin-portal`: 452 tests passed across 71 files, including the protected read-only
  Gameplay Health route contract.
- `@starville/api`: 387 tests passed across 50 files.
- Worker: 25 tests passed across nine files.
- Realtime server: 35 tests passed; shared realtime: 32 tests passed.
- Existing focused suites for wallet/token access, profile, world entry, farming, inventory,
  workstations, store/economy/DUST, progression/objectives/achievements/titles, housing/visits,
  friends/parties/chat/gifts/trades, persistence, reconnect, worker, Game Test, and Admin all
  remained green in the full run.

## Database and migration chain

The temporary local PostgreSQL harness applied every migration through the existing Phase 12D head.
It passed Phase 11A farming, Phase 11B workstations, Phase 11C General Store, Phase 11D progression,
Phase 11E housing, Phase 11F home visits, Phase 12A Player Experience, economy, social, chat,
realtime, avatar/cosmetic, world, and concurrency assertions.

Local `plpgsql_check` function lint was skipped because that extension is unavailable in the
temporary harness. Phase 13A created/replaced no function and changed no migration, RLS policy, or
grant, so this is a recorded local-tool limitation rather than a Phase 13A integration failure.

## Realtime performance boundary

The synthetic local harness completed 10-, 20-, and 40-player cases, two-channel activity cases, and
a five-reconnect case. It recorded no rejected movement, unsafe cosmetic payload, remaining social
reservation, leaked temporary activity item, leaked active activity instance, dropped home-visit
movement update, or duplicate home-visit acknowledgement in the applicable cases. The 40-player
single-channel case reported a 31 ms maximum visible movement latency and the owner-plus-ten local
visit case reported a 0.62 ms maximum home update latency.

These values describe this local synthetic run only. They do not complete Phase 13B hosted load,
physical network, database/worker contention, browser/device, observability, or production
performance gates.

## Remaining gates

- Phase 12E owner acceptance and hosted visual/device validation.
- Phase 13A owner checklist and hosted-development cross-service validation.
- Phase 13B RLS/role, contention, abuse/rate/moderation/economy, approximately 40-player hosted,
  real owner-plus-ten, network interruption, device/browser, observability, backup/recovery, and
  closed-beta operational evidence.
