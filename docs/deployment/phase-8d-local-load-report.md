# Phase 8D-A controlled local load report

Run on 2026-07-14 with `pnpm realtime:load:test`. The in-process persistence boundary is
deterministic and does not contact Supabase. It exercises 10/20/40 players, one/two channels, five
reconnects, ten friend requests, ten simultaneous party creations, invitation bursts, five ready
checks, five party chat messages, block/rate-limit traffic, movement, Phase 8B chat, and Phase 8C
transfers.

| Players / channels / reconnects | Duration | CPU user/system | Max graph persistence | Graph events | Graph rate limits |
| ------------------------------- | -------: | --------------: | --------------------: | -----------: | ----------------: |
| 10 / 1 / 0                      | 4,397 ms |     164 / 17 ms |              0.189 ms |           80 |                 3 |
| 20 / 1 / 0                      | 4,792 ms |     393 / 41 ms |              0.190 ms |          112 |                 3 |
| 40 / 1 / 0                      | 4,817 ms |     305 / 50 ms |              0.410 ms |          112 |                 3 |
| 40 / 2 / 0                      | 6,049 ms |     210 / 40 ms |              0.150 ms |          112 |                 3 |
| 20 / 2 / 5                      | 4,830 ms |     134 / 21 ms |              0.103 ms |          110 |                 3 |

Every scenario created ten friend requests and ten parties. The 20/40-player scenarios accepted six
party invitations; the 10-player scenario correctly had no eligible non-party targets. Five ready
checks and five party-chat sends ran per scenario. The deliberate invitation burst produced bounded
rate-limit errors without disconnecting healthy sockets. Movement had zero rejections, existing
social settlement left zero reservations, and no unhandled persistence error occurred.

This is a local saturation/regression signal, not a production capacity claim. Hosted/database
latency, multi-instance fan-out, regional networking, and long-duration soak testing remain owner
acceptance work.
