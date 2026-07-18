# Phase 8B controlled local load report

Run at 2026-07-14 14:14 PHT with the in-process persistence boundary. This is a deterministic local
capacity/abuse harness, not hosted infrastructure evidence. Every scenario included normal Channel
and Nearby conversation, a short repeated-message burst, six report attempts, durable-mute
enforcement, movement, and the stated reconnect/channel topology.

| Players | Channels | Reconnects | Accepted chat | Broadcasts | Chat msg/s | Avg / max visible chat latency | Rejections | Reports | Muted rejects | CPU user/system | Heap delta |
| ------: | -------: | ---------: | ------------: | ---------: | ---------: | -----------------------------: | ---------: | ------: | ------------: | --------------: | ---------: |
|      10 |        1 |          0 |            22 |        220 |      10.16 |                     21 / 22 ms |          6 |       5 |             1 |       81 / 9 ms |   −0.16 MB |
|      20 |        1 |          0 |            42 |        840 |      19.41 |                     28 / 30 ms |          6 |       5 |             1 |     117 / 20 ms |   +4.54 MB |
|      40 |        1 |          0 |            82 |      3,280 |      37.29 |                     61 / 66 ms |          6 |       5 |             1 |     211 / 48 ms |   −5.98 MB |
|      40 |        2 |          0 |            82 |      1,640 |      37.93 |                     23 / 26 ms |          6 |       5 |             1 |     126 / 32 ms |   −1.32 MB |
|      20 |        2 |          5 |            42 |        420 |      19.51 |                     13 / 14 ms |          6 |       5 |             1 |      64 / 12 ms |  +10.19 MB |

Mock persistence latency averaged 0.005–0.018 ms and peaked at 0.079 ms, so those numbers measure
gateway overhead only—not hosted PostgreSQL latency. Movement had zero rejected valid updates and
remained channel-isolated. Each abuse scenario accepted five bounded reports, rejected the sixth,
rejected duplicate/flood chat, and rejected one durably muted send. The realtime server retains no
unbounded message-history cache; reconnect history remains the database's capped 50-message result.

Heap deltas include JavaScript garbage-collection timing and are not a leak conclusion. The
five-reconnect scenario's +10.19 MB delta warrants normal longer soak monitoring before production,
but connections were finalized and the process completed without duplicate presence or failed
shutdown. Production capacity requires deployment-specific network/PostgreSQL testing under an
owner-approved non-production environment.
