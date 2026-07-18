# Phase 8A local realtime load report

Run on 2026-07-15 with `pnpm realtime:load:test`. This is a controlled localhost protocol/server
test with the published Lantern Square manifest and an in-memory persistence boundary. It makes no
hosted or external writes. Later realtime phases have extended the same runner with chat, social,
party, activity, and reconnect traffic, so the movement assertions run inside the current combined
regression workload.

Each connection first establishes a stationary baseline. It then sends an equal positive-x,
negative-y logical displacement, which resolves east in isometric screen space, while deliberately
claiming a contradictory facing and gait. The run requires the authoritative result to be east and
walking. Each connection then sends the same accepted position with a newer sequence; the run
requires idle with east retained.

| Players / channels / reconnects | Moving broadcasts | Idle broadcasts | Unexpected rejections | East checks | Walking checks | Idle checks | Retained-east checks |
| ------------------------------- | ----------------: | --------------: | --------------------: | ----------: | -------------: | ----------: | -------------------: |
| 10 / 1 / 0                      |                90 |              90 |                     0 |          10 |             10 |          10 |                   10 |
| 20 / 1 / 0                      |               380 |             380 |                     0 |          20 |             20 |          20 |                   20 |
| 40 / 1 / 0                      |             1,560 |           1,560 |                     0 |          40 |             40 |          40 |                   40 |
| 40 / 2 / 0                      |                60 |              60 |                     0 |          40 |             40 |          40 |                   40 |
| 40 / 2 / 5                      |                60 |              60 |                     0 |          40 |             40 |          40 |                   40 |

| Players / channels / reconnects | User / system CPU | Average visible delay | Maximum visible delay |
| ------------------------------- | ----------------: | --------------------: | --------------------: |
| 10 / 1 / 0                      |       100 / 12 ms |                  3 ms |                  4 ms |
| 20 / 1 / 0                      |       273 / 40 ms |                 12 ms |                 13 ms |
| 40 / 1 / 0                      |       306 / 58 ms |                 21 ms |                 25 ms |
| 40 / 2 / 0                      |       234 / 26 ms |                  3 ms |                  4 ms |
| 40 / 2 / 5                      |       215 / 27 ms |                  7 ms |                  7 ms |

The single-channel totals still confirm exact fan-out: 40 senders produce `40 × 39 = 1,560` remote
updates. In the two-channel activity scenarios, presence routing is restricted by both channel and
activity instance, so 60 is the expected authorized fan-out rather than a dropped-update count.

The runner repeats each accepted sequence once to obtain the protocol's authoritative stale-sequence
snapshot for the sender, including isolated activity cohorts with no authorized remote observer.
Those expected probe responses are separate from the unexpected-rejection count. This proves every
controlled sender's canonical facing, moving state, trailing idle, and retained facing without
altering channel or activity isolation.

Heap deltas remain intentionally omitted because all scenarios share one Node.js process and garbage
collection is nondeterministic. These local figures are regression evidence, not hosted capacity or
production latency claims.
