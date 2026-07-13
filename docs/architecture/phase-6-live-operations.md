# Phase 6 Live Operations Extension

Starville maintenance and announcements are server-authoritative. PostgreSQL timestamps and the
current database clock derive disabled, scheduled, active, expired, and completed states. No browser
tab, worker heartbeat, or realtime connection is required to activate a schedule.

The API reads the public snapshot through a narrowly granted service-role RPC. It validates the
entire response with the shared `@starville/live-operations` contract. A missing, malformed, or
unreachable configuration fails closed to the fixed `SERVER PAUSED` application fallback. Player
profile bootstrap returns `GAME_MAINTENANCE` while active; token access, moderation, rename rules,
and state persistence remain separate and unchanged.

The game client checks availability before mounting gameplay, polls every 30 seconds, and rechecks
on focus and visibility changes. These are the reliable delivery mechanisms. A realtime-only design
was intentionally rejected because delivery can be missed and the existing realtime service has no
authenticated gameplay broadcast channel. Realtime acceleration can be added later without changing
the database authority.

The admin portal uses the existing trusted API-session boundary. Reads and mutations require
distinct permissions, all mutations require an operational reason and optimistic revision, and audit
rows are append-only. CTA destinations accept only internal absolute paths or HTTPS.

## Scheduling decisions

- A future start becomes active based on the database clock.
- Passing an expected end produces `expired` unless `auto_disable_at_end` is explicitly enabled.
- Auto-disable produces `completed`; it never claims service health.
- Admin access and the landing page remain available during game maintenance.
- Maintenance bypass is not implemented. There is no trusted mapping from staff identity to a player
  wallet, so a bypass would create a weak client-side trust path.
