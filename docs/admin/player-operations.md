# Player operations guide

## Pages

- `/operations` requires `operations.read` and displays only defined database counts, configuration,
  and bounded service readiness.
- `/players` requires `players.read`. Search is a normalized display-name prefix; exact-wallet
  matching is enabled only with `wallets.read`. Filters and allowlisted sorting stay in the URL;
  pagination is server-side and capped at 100 rows.
- `/players/[playerId]` requires `players.read`. Full wallet copy is shown only with `wallets.read`.
  Player audit history and recent safe wallet-access events are requested only with
  `player_audit.read`; each view is bounded.

“Last entered” and active access-session counts must never be presented as online presence.

## Sensitive action checklist

The UI shows an action only when the current role has its exact permission and the current state is
valid. The server and database repeat those checks even if a direct request bypasses the UI.

Every dialog:

1. identifies the player and exact effect;
2. requires a 12–500 character reason;
3. carries the currently displayed moderation version;
4. carries one stable server-generated idempotency UUID through the API request ID;
5. requires explicit confirmation;
6. traps focus while open, supports Escape before submission, restores trigger focus, and disables
   controls while pending;
7. reports a safe outcome and any revoked-session count.

Do not put credentials, signatures, cookies, database/RPC URLs, or wallet secrets in a reason.

## Action effects

| Action          | Permission                | Effect                                                             |
| --------------- | ------------------------- | ------------------------------------------------------------------ |
| Suspend         | `players.suspend`         | Blocks map entry and revokes active sessions; no wallet effect     |
| Restore         | `players.suspend`         | Restores app status; creates no session                            |
| Reset to spawn  | `players.reset_position`  | Uses the reviewed spawn, revokes stale sessions; no economy change |
| Require rename  | `players.require_rename`  | Blocks map entry and revokes sessions until the player renames     |
| Revoke sessions | `players.manage_sessions` | Stops current sessions; player reconnects and signs again          |

The interface cannot assign a replacement name, alter token balances, bypass the configured token
requirement, or send a transaction.

## Audit events and outcomes

Player operations append one player-scoped event and one Phase 2 administrator audit event in the
same transaction. The player log uses these allowlisted event keys:

| Event key                              | Definition                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| `player.suspended`                     | Application entry blocked; current Starville sessions revoked       |
| `player.restored`                      | Application status restored; no access session created              |
| `player.position_reset`                | Safe state reset to the reviewed Lantern Square spawn               |
| `player.rename_required`               | Normal map entry blocked until the player completes a valid rename  |
| `player.rename_completed`              | Player supplied a valid changed name and cleared the requirement    |
| `player.sessions_revoked`              | Current Starville access sessions administratively revoked          |
| `player.access_denied.suspended`       | Protected entry denied because the application profile is suspended |
| `player.access_denied.rename_required` | Protected entry routed to the minimum rename flow                   |

`success` means the trusted operation committed, `denied` records an authorization/state/version
rejection, and `error` is reserved for a safely recorded failed operation. Before/after metadata is
bounded and excludes cookies, signatures, credentials, token material, RPC URLs, and request
headers. Both audit tables reject updates and deletes.

Player and safe wallet-access history are scoped to the configured environment/network and shown as
a bounded initial result set (25 by default, 100 maximum). Phase 5 deliberately does not offer a
timestamp-only pagination cursor because equal timestamps could skip append-only events.

## Responsive and failure behavior

The directory is a semantic table on wide screens and labelled cards at narrow widths. Filters wrap,
long identifiers wrap safely, dialogs remain within `90dvh`, controls meet touch-size targets, and
reduced-motion settings are respected. Empty/unavailable pages show no placeholder data. Read-only
staff see no enabled mutation control, and direct mutation calls still receive HTTP 403.
