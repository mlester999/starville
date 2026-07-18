# Phase 9A.1 controlled local load report

Run on 2026-07-15 with `pnpm economy:load:test`. The test uses real Fastify route injection over an
isolated deterministic economy authority, a loopback-only production Next.js server for public
documentation rendering, in-memory documentation search, and synthetic simulation players. It does
not connect to Supabase or any hosted service, publish configuration, or mutate real player data.

## Economy API workload

| Operation                                 | Count | Local p95 latency |
| ----------------------------------------- | ----: | ----------------: |
| Economy summary reads                     |    40 |         12.315 ms |
| Shop catalog reads                        |    40 |          7.657 ms |
| Valid purchases                           |    20 |          5.657 ms |
| Duplicate purchase retries                |    20 |          2.756 ms |
| Concurrent purchase/reward operations     |    20 |          1.189 ms |
| Concurrent purchase/correction operations |    20 |          1.009 ms |
| Ledger reads                              |    40 |          4.384 ms |
| Reconciliation runs                       |    10 |          1.332 ms |
| Risk aggregation reads                    |    40 |          2.678 ms |
| Policy validations                        |    20 |          2.439 ms |
| Shop validations                          |    20 |          3.696 ms |
| Correction creations                      |    10 |          1.511 ms |
| Expected stale-state rejections           |    10 |          4.302 ms |

All 20 duplicate purchase retries replayed their original receipt. Duplicate debits, duplicate
items, reconciliation mismatches, negative balances, and partial settlements were all zero. The ten
intentional stale-state requests were rejected with `GAMEPLAY_STATE_CONFLICT`; no unexpected
rejection occurred.

## Documentation workload

The search test made 760 queries across the complete typed documentation index. Local average search
time was 0.004 ms and p95 was 0.008 ms. All 20 public documentation routes rendered successfully
through the local production server, totaling 1,460,994 response bytes; route-render p95 was 49.642
ms and the maximum was 61.055 ms.

## Simulation workload

Deterministic 180-day runs completed for 100, 1,000, and 10,000 synthetic players in 5.47 ms, 12.53
ms, and 94.34 ms respectively. The full comparison matrix ran four candidates across three
populations, three durations, and ten scenarios: 360 runs plus an exact replay of every run. Every
replay matched, all 360 runs kept non-negative balances, and every reconciliation mismatch count was
zero. Candidate D remained the conservative, unpublished planning recommendation. Peak process
measurements at report time were 197.69 MiB RSS and 73.01 MiB heap used.

These are bounded local regression measurements, not a production capacity or latency claim. Hosted
database latency, deployed service networking, multi-instance behavior, long-duration soak testing,
and signed-in owner acceptance remain outside this report.
