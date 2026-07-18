# Phase 8C controlled local load report

Run 2026-07-14 in an in-process realtime service with a deterministic in-memory persistence
boundary. This measures protocol/routing/rate-limit behavior and process CPU/memory, not hosted
PostgreSQL or network latency. Real settlement concurrency is covered separately by the local
PostgreSQL fixture.

| Players / channels / reconnects | Inspect | Gift requests | Trade requests | Settlements | Social events | Rejected (rate / block) | Replays | Resumes | Social avg / max request | Avg / max settlement | Persistence ops | Reservations left |
| ------------------------------: | ------: | ------------: | -------------: | ----------: | ------------: | ----------------------: | ------: | ------: | -----------------------: | -------------------: | --------------: | ----------------: |
|                      10 / 1 / 0 |      10 |            10 |              0 |          10 |            90 |               0 (0 / 0) |       0 |       0 |         5.874 / 6.090 ms |    8.331 / 12.702 ms |              30 |                 0 |
|                      20 / 1 / 0 |      10 |            29 |              0 |          10 |           158 |               4 (3 / 1) |       4 |       0 |         2.016 / 2.204 ms |     1.212 / 1.888 ms |              46 |                 0 |
|                      40 / 1 / 0 |      10 |            29 |              0 |          10 |           156 |               4 (3 / 1) |       4 |       0 |         2.195 / 2.580 ms |     5.080 / 7.791 ms |              46 |                 0 |
|                      40 / 2 / 0 |      10 |            29 |              4 |          13 |           229 |               5 (4 / 1) |       4 |       0 |         1.870 / 2.097 ms |     4.100 / 8.313 ms |              64 |                 0 |
|                      20 / 2 / 5 |      10 |            20 |              1 |          10 |           141 |               0 (0 / 0) |       0 |       1 |         1.279 / 1.417 ms |     2.936 / 4.574 ms |              43 |                 0 |

The 40-player/two-channel scenario completed three of four simultaneously prepared independent
trades plus ten gift settlements; the remaining request was safely rejected by the configured
per-player request limit after the deliberate duplicate burst. Four duplicate gift retries replayed
one authoritative request, three/four burst messages were rate-limited depending on scenario, the
blocked attempt returned `blocked`, reconnect restored one negotiating trade, and every scenario
ended with zero reservations.

Across scenarios CPU user/system ranged from 96/19 ms to 464/60 ms. Heap deltas ranged from −6.78 MB
to +5.50 MB and include garbage-collection timing, so they are not a leak conclusion. Movement
remained channel-isolated with zero rejected valid updates. Deployment-specific database, network,
and longer soak capacity remain owner acceptance work in a non-production environment.
