# Phase 8B player chat and safety guide

The bottom-left chat opens with Enter and closes/unfocuses with Escape. Nearby reaches eligible
players in the same world/channel and within server-calculated range. Channel reaches only the
current channel. System contains trusted Starville connection, channel, maintenance, moderation, and
approved Live Operations notices. Players cannot post to System.

While the chat field is focused, WASD, Shift, E, and quickbar number keys do not control the game.
On mobile the compact button opens a safe-area-aware bottom sheet with internal scrolling. Messages
are plain text; HTML, embeds, scripts, and dangerous link schemes are not rendered.

Use a message's actions to mute, block, or report its sender. Mute and block are private preferences
and do not suspend the other player. Reporting attaches the exact server message; choose the closest
category and add a concise reason. The reported player is not told who reported them. Never include
wallets, passwords, seed phrases, private keys, or personal contact information in chat.

Chat is live-session-only for players. It starts empty when the player enters Starville, displays
only messages delivered while that game client is online, and cannot be opened while realtime is
offline. Reconnects preserve messages already seen in the running client but do not replay messages
missed while offline. If sending is unavailable, the panel closes without exposing service
internals; durable records remain private moderation evidence.
