# Phase 7 cozy-gameplay API

Player endpoints use the existing `/api/v1/token-access/player` authorization boundary and common
success/error envelope. Reads are bounded; ledger and history use opaque/counted cursors with limits
of at most 100. Mutations require same-origin checks, strict bodies, an idempotency key, and
expected state versions where a stale write could matter.

Capability groups are intentionally separate: gameplay bootstrap, DUST/ledger, inventory/history,
quickbar, farm actions, recipe catalog and cook/craft actions, shop catalog and buy/sell actions,
home load/entry/exit, and furniture placement/move/rotate/removal. A common bootstrap carries the
small HUD state but does not replace bounded diagnostic/history endpoints.

| Method | Player resource                                  | Purpose                                  |
| ------ | ------------------------------------------------ | ---------------------------------------- |
| POST   | `/cozy/bootstrap`                                | Idempotent lazy upgrade and common state |
| GET    | `/cozy/dust`                                     | Bounded DUST ledger                      |
| GET    | `/cozy/inventory`                                | Inventory and quickbar                   |
| GET    | `/cozy/inventory/history`                        | Bounded inventory movements              |
| PUT    | `/cozy/quickbar/:slot`                           | Persistent slot assignment               |
| GET    | `/cozy/items` and `/cozy/farm`                   | Safe content and private plots           |
| POST   | `/cozy/farm/plant`, `/water`, `/harvest`         | Atomic plot actions                      |
| GET    | `/cozy/recipes/:kind`                            | Current availability                     |
| POST   | `/cozy/cook` and `/cozy/craft`                   | Atomic recipe execution                  |
| GET    | `/cozy/shops/:shopSlug`                          | Active trusted offers                    |
| POST   | `/cozy/shops/:shopSlug/:buy-or-sell`             | Server-priced transaction                |
| GET    | `/cozy/home`                                     | Owner-scoped home                        |
| POST   | `/cozy/home/:enter-or-exit`                      | Private-home access                      |
| POST   | `/cozy/home/furniture/:place-move-rotate-remove` | Owned furniture mutation                 |

Administrator reads use `/api/v1/admin/players/:playerId/economy`, `/inventory`, `/cozy-gameplay`,
and `/api/v1/admin/game-content`. Fastify and PostgreSQL both re-check the exact permissions; an
authenticated but unauthorized administrator receives 403.

Approved gameplay errors include `INSUFFICIENT_DUST`, `INVENTORY_FULL`, `ITEM_UNAVAILABLE`,
`INVALID_QUANTITY`, `PLOT_OCCUPIED`, `PLOT_NOT_READY`, `PLOT_DOES_NOT_NEED_WATER`,
`RECIPE_UNAVAILABLE`, `MISSING_INGREDIENTS`, `SHOP_OFFER_UNAVAILABLE`, `HOME_ACCESS_DENIED`,
`INVALID_FURNITURE_PLACEMENT`, `GAMEPLAY_STATE_CONFLICT`, and `REQUEST_ALREADY_PROCESSED`. Existing
access, maintenance, moderation, validation, and rate-limit errors retain their established codes.

Administrator routes are separate from player routes. Player economy, inventory, cozy state, and
game-content inspection are narrow permission-protected resources; no endpoint adjusts DUST or
inventory.
