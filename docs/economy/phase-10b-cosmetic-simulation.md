# Phase 10B cosmetic economy simulation

Status: deterministic local planning evidence only; no cosmetic shop or price is published.

## Purpose

`runCosmeticEconomyParticipationComparison` isolates the potential incremental effect of optional
cosmetic DUST sinks at four participation levels: none, low, moderate, and high. It reports
source-to-sink ratio, seven-day beginner affordability, median balance, top-decile balance
concentration, shop participation, repeat spending, collection exhaustion, late-period sink
usefulness, and total modeled DUST destroyed.

The model runs 100, 1,000 and 10,000-player populations over 30, 90 and 180 days through
`pnpm economy:load:test`. Same inputs and seed must produce byte-equivalent reports, and no balance
may become negative.

## Fixed local assumptions

- Starter balance: 250 DUST.
- Mean modeled daily source: 18 DUST for a participating player.
- Source participation: 55% per modeled day.
- Entry cosmetic price: 120 DUST.
- Collection size: 12 cosmetics with four repeating illustrative price tiers.
- Participation opportunities: 0%, 1.2%, 3.5%, and 7.5% per player-day.
- Cosmetics grant no gameplay power and all social systems remain free.

These are synthetic comparison assumptions, not production facts, recommended prices, forecasts,
telemetry, or published configuration. The model deliberately excludes token gating, token claims,
NFTs, marketplace trading, creator royalties, transfers, future purchases, and all live player data.
A `null` source-to-sink ratio in the no-participation scenario means the modeled cosmetic sink
denominator is zero.

## Safety and interpretation

The returned report fixes `mode = simulation`, `playerBalancesMutated = false`,
`liveDataRead = false`, `published = false`, and `tokenClaimsCreated = 0`. The load command uses
in-memory arrays and controlled local application services; it never connects to the hosted database
or writes player balances.

Results answer sensitivity questions only: whether an optional cosmetic sink may reduce excess
balances, whether beginners remain able to afford the entry item, whether repeat participation
persists into the final third, and whether a finite collection exhausts too quickly. They cannot
justify enabling purchases. A future shop requires separately authorized product scope, economic
review, abuse analysis, pricing approval, migration, UI/API settlement, owner publication, and
hosted acceptance.

## Other load evidence

- The fresh PostgreSQL fixture performs 125 authoritative Wardrobe reads and 125 bounded
  administrator audit-page reads in addition to mutation and race assertions.
- `pnpm realtime:load:test` exercises controlled multi-player presence, appearance and emote
  persistence paths without hosted state.
- `pnpm avatar:renderer:load:test` verifies modular renderer stability under representative local
  load and safe fallbacks.
- API, game, admin and realtime Vitest suites cover strict payloads, error mapping, permissions,
  disabled shop behavior, focus/keyboard behavior and privacy-safe broadcasts.

Load evidence is bounded local engineering evidence, not a production capacity claim.
