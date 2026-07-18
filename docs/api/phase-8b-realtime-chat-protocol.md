# Phase 8B realtime chat protocol

All messages use protocol `version: 1` and the existing authenticated `/connect` socket. Unknown
fields or message variants fail strict parsing. Payloads remain subject to the Phase 8A 16 KiB
socket limit; chat text is additionally capped at 400 Unicode characters and 800 UTF-8 bytes.

## Player requests

- `chat.send`: bounded `requestId`, `nearby|channel` scope, and plain text.
- `chat.history.request`: retained for protocol compatibility but returns an empty history; player
  clients do not use durable chat replay.
- `chat.report`: server message ID, reviewed category, bounded reason, and request ID.
- `chat.mute_player`, `chat.unmute_player`, `chat.block_player`, `chat.unblock_player`: target
  public presence ID only.
- `chat.mark_read`: scope and the last visible server sequence.

No request contains trusted sender identity, world, channel, position, timestamp, or moderation
state.

## Server responses

- `chat.bootstrap` carries current preferences and moderation state with empty histories.
- `chat.history` is an empty compatibility response. `chat.message` and `chat.system_message` carry
  only live messages delivered while the authenticated socket is online.
- `chat.message_rejected` uses safe reasons: `invalid_content`, `rate_limited`, `duplicate_spam`,
  `chat_muted`, `access_changed`, or `persistence_unavailable`.
- Player preference acknowledgements expose only the target public presence ID.
- `chat.report_received` returns a public report ID without revealing reporter identity to anyone
  else.
- `chat.moderation_notice` privately communicates mute, unmute, or warning state.

Messages use server UUIDs and monotonic durable sequences. A newly mounted client begins with empty
chat, keeps at most the newest 50 live messages per scope in memory, and clears nearby/channel chat
when the player changes channel. Persisted messages remain private moderation evidence and are not
replayed to players. Player-posted links are not fetched, previewed, or made executable.

## Administrator HTTP API

- `GET /api/v1/admin/multiplayer-chat/reports`
- `GET /api/v1/admin/multiplayer-chat/reports/:reportId`
- `POST /api/v1/admin/multiplayer-chat/reports/:reportId/actions`

The first two require `multiplayer_chat.reports.read`. Actions require `multiplayer_chat.moderate`,
trusted-origin/content-type checks, a reason, expected revision, and request ID. Safe error
envelopes retain the API request ID and never return SQL/RPC internals.
