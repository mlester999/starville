# Phase 8D-B Local Load Report

Generated locally on 2026-07-14 with the in-memory persistence boundary and the actual realtime
WebSocket service. No hosted service or production data was contacted.

The acceptance scenario used 40 authenticated connections across two public channels, ten isolated
activities (five 2-player and five 4-player), 30 activity players, 10 public players, five
reconnects during progress, repeated objective interactions, an invalid-interaction burst,
simultaneous completions/receipt construction, and one bounded cleanup pass.

## Result

| Measurement                                            |                     Result |
| ------------------------------------------------------ | -------------------------: |
| Duration                                               |                   5,991 ms |
| Realtime CPU                                           | 204 ms user / 25 ms system |
| Heap delta                                             |           -3,193,824 bytes |
| Activity interactions sent                             |                         76 |
| Invalid interactions rejected                          |                         16 |
| Activity persistence operations                        |                        352 |
| Average / maximum objective persistence latency        |           0.011 / 0.051 ms |
| Average / maximum reward settlement simulation latency |           0.010 / 0.029 ms |
| Maximum activity snapshot                              |                6,682 bytes |
| Activity reconnects restored                           |                      5 / 5 |
| Completed instances                                    |                    10 / 10 |
| Participant reward receipts                            |                    30 / 30 |
| Cleanup runs                                           |                          1 |
| Leaked temporary items                                 |                          0 |
| Leaked active instances                                |                          0 |

Movement visibility remained isolated: the activity/public scenario emitted 60 movement broadcasts
rather than broadcasting all 40 players to each other. The load persistence is deliberately
in-memory; correctness of real PostgreSQL settlement and cleanup is covered separately by isolated
execution and ten race tests. This report is a controlled local capacity signal, not a production
benchmark or hosted acceptance result.
