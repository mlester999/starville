# Phase 8B abuse and rate-limit strategy

Limits are associated with the authenticated public player and active connection, not trusted to an
IP address. Defaults are intentionally conversation-friendly:

| Boundary                         |       Default | Environment variable                |
| -------------------------------- | ------------: | ----------------------------------- |
| Messages in 5 seconds            |             4 | `REALTIME_CHAT_SHORT_WINDOW_LIMIT`  |
| Messages per minute              |            20 | `REALTIME_CHAT_MINUTE_LIMIT`        |
| Reports per hour                 |             5 | `REALTIME_CHAT_REPORT_HOURLY_LIMIT` |
| Mute/block operations per minute |            20 | `REALTIME_CHAT_SAFETY_ACTION_LIMIT` |
| Malformed frames in 10 seconds   |            10 | `REALTIME_CHAT_MALFORMED_LIMIT`     |
| Nearby distance                  | 8 world units | `REALTIME_CHAT_NEARBY_DISTANCE`     |

Three identical normalized messages within the active minute are rejected as duplicate spam.
Malformed flooding closes the offending connection. Oversized socket payloads and unknown fields
fail protocol parsing. Normalization uses NFKC, canonical line endings, bounded whitespace, and
rejects control characters, HTML tags, dangerous schemes, or obvious System impersonation.

Limits do not permanently suspend players and counters are never exposed. The controlled local load
harness exercises normal conversation, short bursts, repeated spam, report flooding, mute
enforcement, reconnects, one/two-channel populations, and 10/20/40 users. It must never target a
hosted or production service.
