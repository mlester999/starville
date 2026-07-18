# Phase 8A realtime presence architecture

Phase 8A adds authenticated world-scoped channels, safe presence, and movement synchronization. It
does not add chat, gifting, trading, parties, PvP, rewards, or browser-authoritative game state.

## Connection authority

1. The browser completes the existing wallet/token gate, profile, moderation, maintenance, and
   published-world flow.
2. It requests `POST /api/v1/token-access/player/realtime-ticket` with the HTTP-only access cookie.
   The API repeats active-player checks and creates a random 43-character ticket.
3. PostgreSQL stores only a keyed hash. The ticket expires after 30 seconds and is consumed once.
4. The browser opens `/connect`, sends protocol-v1 `authenticate`, and discards the raw ticket. The
   realtime server consumes the hash through a narrow service-role RPC.
5. Only after admission does the server send `admitted` and a same-world/channel snapshot.

The HTTP-only access cookie is never put in a URL or WebSocket message. Wallet addresses, internal
IDs, balances, emails, IP addresses, administrator state, and moderation history are never
broadcast.

## Channels, movement, and rendering

`realtime_channels` provides stable UUIDs, player-facing numbers, enabled state, and capacity. The
initial migration creates three capacity-40 channels per active map. PostgreSQL performs the
cross-instance capacity claim; process-local `ChannelAuthority` performs duplicate prevention and
same-channel routing. Switching is capacity checked and emits leave/snapshot/join boundaries.

The client predicts local movement and sends at most 10 updates per second. The server enforces
strict 16 KiB protocol-v1 messages, monotonic sequences, a 20-message/second ceiling, elapsed-time
walk/jog distance, published bounds/collision, and resolution from the last accepted logical world
position. No movement frame is written to PostgreSQL.

Movement coordinates and sequence are intent, not permission to publish arbitrary animation state.
The server derives canonical eight-way facing from accepted logical displacement projected into
isometric screen space. It classifies the accepted displacement as walking or jogging within the
requested gait envelope. A same-position follow-up with a newer sequence publishes `idle` while
retaining the last authoritative facing. The client sends that follow-up when movement stops; the
server does not synthesize a second sequence on the client's behalf.

Remote samples use a 120 ms interpolation buffer, bounded 100 ms extrapolation, stale-sequence
rejection, and immediate cleanup on leave/channel/world changes. Reduced motion displays the latest
sample. Remote rendering uses the facing and movement state from authoritative presence updates, not
the sender's local animation hints. Phaser reuses the development player renderer, foot-position
depth, and safe name/level nameplates.

## Recovery, persistence, and enforcement

Reconnects use bounded exponential backoff with jitter, a fresh one-use ticket, and a new snapshot.
Focus/visibility restoration sends `resync`. Duplicate presence IDs replace old connections.

The existing protected player-state API remains the safe-position authority at its existing bounded
cadence. The realtime server writes only a 15-second lifecycle checkpoint plus admission, switching,
and disconnect summaries. A crash therefore cannot overwrite the last API-validated safe position.

Every 15 seconds, the server revalidates access, suspension/rename state, maintenance, and published
map version. Revocation closes the socket and removes presence.

Phase 8A is correct for one realtime process and uses PostgreSQL for global capacity claims.
Horizontal movement fan-out requires a future trusted server event bus; browser Supabase Realtime is
not the authority.
