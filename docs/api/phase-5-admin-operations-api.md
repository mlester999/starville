# Phase 5 administrator operations API

All routes use the standard `{ success, data, requestId }` envelope, disable response caching, and
require a verified Supabase bearer identity plus an active trusted administrator session. Mutations
also require an allowlisted Origin, JSON, a 4 KiB body limit, an expected version, and a bounded
reason. PostgreSQL independently verifies the same identity/session/AAL and permission.

| Method | Route                                             | Permission                             |
| ------ | ------------------------------------------------- | -------------------------------------- |
| GET    | `/api/v1/admin/players`                           | `players.read`                         |
| GET    | `/api/v1/admin/players/:playerId`                 | `players.read`                         |
| GET    | `/api/v1/admin/players/:playerId/activity`        | `players.read` and `player_audit.read` |
| POST   | `/api/v1/admin/players/:playerId/suspend`         | `players.suspend`                      |
| POST   | `/api/v1/admin/players/:playerId/restore`         | `players.suspend`                      |
| POST   | `/api/v1/admin/players/:playerId/reset-position`  | `players.reset_position`               |
| POST   | `/api/v1/admin/players/:playerId/require-rename`  | `players.require_rename`               |
| POST   | `/api/v1/admin/players/:playerId/revoke-sessions` | `players.manage_sessions`              |
| GET    | `/api/v1/admin/operations/summary`                | `operations.read`                      |

Directory query fields are `page`, `pageSize`, `search`, `status`, `rename`, `mapId`, `recentDays`,
`sort`, and `direction`. Page is 1–10,000; page size is 1–100; search is at most 128 characters;
every filter/sort value is allowlisted. Search never appears in application logs because request
logging strips query strings.

Mutation body:

```json
{
  "expectedVersion": 3,
  "reason": "Reviewed operational reason"
}
```

Reset position has no coordinate field; unknown fields are rejected.

The portal generates one UUID per rendered action and forwards it as `x-request-id`; Fastify uses
that value as the response correlation ID and PostgreSQL idempotency key. Sensitive database rate
limits are claimed after administrator authorization but before target lookup. Activity accepts only
a bounded `limit` (default 25, maximum 100); Phase 5 does not expose an unsafe timestamp-only
cursor.

Relevant safe errors include `AUTHENTICATION_REQUIRED`, `ADMIN_ACCESS_DENIED`,
`INVALID_PLAYER_OPERATION`, `PLAYER_NOT_FOUND`, `PLAYER_VERSION_CONFLICT`,
`PLAYER_OPERATION_CONFLICT`, `RATE_LIMITED`, and `OPERATIONS_UNAVAILABLE`.

Player-facing additions remain under the protected token-access cookie path:

- `GET /api/v1/token-access/player/profile` returns `entryState`;
- `POST /api/v1/token-access/player/rename` accepts only `{ displayName }`;
- `PUT /api/v1/token-access/player/state` requires `expectedGameStateVersion` and returns the next
  `gameStateVersion`; a stale write returns `PLAYER_STATE_VERSION_CONFLICT`;
- suspended state returns `PLAYER_SUSPENDED` before map bootstrap;
- rename-required state returns `PLAYER_RENAME_REQUIRED` for map/state operations.

No endpoint accepts a wallet as player authority, returns raw session material, calls a
per-directory wallet balance RPC, or sends a blockchain transaction.
