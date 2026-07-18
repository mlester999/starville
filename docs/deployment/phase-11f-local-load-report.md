# Phase 11F bounded local load report

Generated locally on 2026-07-18 at 13:39 Asia/Manila with `pnpm realtime:load:test`. This is an
in-process fixture using the real websocket server and a deterministic persistence gateway. It is
not hosted, network-scale, database-throughput, or production-capacity evidence.

| Visitors | Movement sent/acked | Dropped | Duplicate acks | Average update | Maximum update | Home messages/s |
| -------: | ------------------: | ------: | -------------: | -------------: | -------------: | --------------: |
|        1 |                 1/1 |       0 |              0 |       0.529 ms |       0.529 ms |            3.23 |
|        5 |                 5/5 |       0 |              0 |       0.469 ms |       0.481 ms |            8.37 |
|       10 |               10/10 |       0 |              0 |       0.560 ms |       0.593 ms |           14.90 |

The 10-visitor fixture admitted the owner plus ten visitors, delivered all movement
acknowledgements, processed simultaneous emote event batches through synchronized snapshots,
exercised one visitor and one owner reconnect, and recorded disconnect/closure checkpoints. The
database concurrency gate separately raced two final-slot admissions and proved exactly one join,
one full/conflict response, and a reconciled count of ten visitors. Database fixtures also cover
invitation replay, guestbook limits, appreciation replay, and exact-once helper watering.

Whole-process heap deltas for the surrounding mixed realtime scenarios were +8,678,056 bytes at the
1-visitor point, -7,811,872 bytes at the 5-visitor point after garbage collection, and +300,800
bytes at the 10-visitor point. These deltas include the existing public movement, chat, social
graph, and cooperative-activity load traffic, so they demonstrate bounded cleanup behavior but are
not an isolated per-home memory benchmark.

Limitations: persistence latency is mocked in the websocket run; the stock-PostgreSQL fixture covers
transaction/concurrency semantics separately; no WAN, mobile-radio, hosted Supabase, multi-process,
or production observability load was performed. Seat/photo contention and owner/helper moderation
remain deterministic function tests rather than a high-volume websocket benchmark.
