# Phase 8B multiplayer chat architecture

Phase 8B extends the authenticated Phase 8A WebSocket. It does not create a second socket or accept
client-supplied identity, world, channel, position, display name, level, or timestamps.

## Authority and delivery

1. The API issues a one-use realtime ticket after the wallet, token-access, player, moderation,
   maintenance, world, and channel checks already defined by Phase 8A.
2. The realtime server admits the ticket and owns the active public presence and accepted position.
3. A `chat.send` request is strictly parsed, normalized, rate-limited, and persisted through
   `accept_realtime_chat_message` before any delivery.
4. PostgreSQL rechecks the realtime session, access session, player moderation state, published
   world version, and active chat mute. The trusted server supplies its accepted position to
   evidence and history storage.
5. The realtime server selects recipients. Channel chat is limited to the active world/channel;
   Nearby chat additionally uses the configured server-side distance.
6. A fresh game-client session starts with empty player-visible chat. Reconnect and visibility
   reconciliation preserve only messages already received by that running client; messages sent
   while it was offline are not replayed.

Player messages are plain text. System entries are created only by trusted server code and use the
distinct `chat.system_message` contract. Connection and channel-change notices complement rather
than replace the existing Live Operations ticker and maintenance denial flow.

## Data boundaries

Recent message history remains durable for 24 hours by default for safety evidence, moderation,
abuse investigation, and bounded administrator workflows. It is not player-visible session history.
Chat tables force RLS, have no browser policies, revoke direct access (including service-role table
mutation), and are accessible only through narrow `SECURITY DEFINER` functions. Report evidence and
moderation actions are trigger-protected against destructive edits.

The realtime process holds only active presence, recipient preferences, rate windows, and socket
state. It does not retain a second unbounded message cache and PostgreSQL is never used as a
movement bus.

## Failure and reconciliation

Persistence failure rejects a message without broadcast. Repeated request IDs replay the original
safe response to the sender and never rebroadcast. Revalidation closes revoked, suspended,
rename-required, maintenance-blocked, or world-invalid sessions. The same interval refreshes chat
mute and preference state; a changed mute produces a private moderation notice. Every send also
checks the durable mute, so reconnecting or racing the notice cannot bypass enforcement.

## Phase 8C boundary

Phase 8B deliberately excludes global cross-world chat, direct messages, gifting, trading,
inspect-player actions, parties, co-op activities, private social profiles, PvP, Play-to-Earn, and
private deployment configuration. Those require separate product and trust-boundary review.
