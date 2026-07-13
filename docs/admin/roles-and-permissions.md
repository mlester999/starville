# Administrator roles and permissions

## Model

Starville administrator authorization uses stable role and permission keys stored in trusted
PostgreSQL tables. Display names and descriptions may evolve, but code, migrations, tests, API
checks, and audit records use the stable keys documented here.

The canonical TypeScript catalog is `packages/admin-auth/src/catalog.ts`. The migrations seed the
same 12 roles, 59 permissions, and current mappings. Phase 7.5A implements the narrow asset
permissions documented below; other reserved keys still do not imply an implemented feature.

Permission changes invalidate stale administrator authorization through `permission_version`. Role
or status changes invalidate affected trusted sessions. Hiding a navigation item is never a
substitute for API and database enforcement.

## System roles

| Stable key                | Intended responsibility                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`             | Recovery and unrestricted administrator authority; receives all 59 permissions and is protected by the last-active-Super-Admin invariant. |
| `game_administrator`      | Broad day-to-day game administration without role, audit, blockchain, token-gate, reward-approval, or system-setting mutation authority.  |
| `economy_manager`         | DUST adjustments and reward-rule configuration without claim opening, blockchain configuration, or reward approval.                       |
| `live_operations_manager` | Read-oriented operational oversight plus reward simulation and claim opening/pausing.                                                     |
| `content_manager`         | Item and official asset creation, update, and publication.                                                                                |
| `world_designer`          | Map editing/publication and asset upload for world construction.                                                                          |
| `asset_manager`           | Official asset upload, validation, review, approval, activation, deprecation, and audit access.                                           |
| `moderator`               | Player moderation, suspension/ban, and session-management actions.                                                                        |
| `customer_support`        | Read-only support context for players, wallets, inventories, items, rewards, claims, and moderation.                                      |
| `financial_reviewer`      | Financial review, reward approval, claim reconciliation, blockchain read access, and restricted audit-log access.                         |
| `blockchain_operator`     | Narrow blockchain, token-gate, and claim-operation authority.                                                                             |
| `read_only_analyst`       | Non-sensitive domain read permissions; deliberately excludes role and audit-log access.                                                   |

System roles cannot be deleted through normal application operations. Stable keys must not be
renamed accidentally. Phase 2 does not provide role-management UI.

## Permission catalog

| Category        | Stable permission keys                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview        | `overview.read`                                                                                                                                                                   |
| Operations      | `operations.read`                                                                                                                                                                 |
| Players         | `players.read`, `players.suspend`, `players.ban`, `players.manage_sessions`, `players.reset_position`, `players.require_rename`, `players.rename`                                 |
| Player audit    | `player_audit.read`                                                                                                                                                               |
| Wallets         | `wallets.read`, `wallets.force_reverify`                                                                                                                                          |
| Inventories     | `inventories.read`, `inventories.adjust`                                                                                                                                          |
| Items           | `items.read`, `items.create`, `items.update`, `items.publish`                                                                                                                     |
| Maps            | `maps.read`, `maps.edit`, `maps.preview`, `maps.publish`, `maps.audit_read`                                                                                                       |
| Assets          | `assets.read`, `assets.upload`, `assets.edit`, `assets.validate`, `assets.review`, `assets.approve`, `assets.activate`, `assets.deprecate`, `assets.audit_read`, `assets.publish` |
| Economy         | `economy.read`, `economy.adjust_stardust`, `economy.configure_rewards`                                                                                                            |
| Rewards         | `rewards.read`, `rewards.simulate`, `rewards.approve`                                                                                                                             |
| Claims          | `claims.read`, `claims.open`, `claims.pause`, `claims.reconcile`                                                                                                                  |
| Blockchain      | `blockchain.read`, `blockchain.configure`                                                                                                                                         |
| Token gate      | `token_gate.read`, `token_gate.configure`                                                                                                                                         |
| Moderation      | `moderation.read`, `moderation.act`                                                                                                                                               |
| Administration  | `roles.read`, `roles.manage`, `audit_logs.read`                                                                                                                                   |
| System settings | `system_settings.read`, `system_settings.manage`                                                                                                                                  |

## Complete initial matrix

The following lists are exact. An omitted permission is denied. Counts are included to make drift
between this document, the TypeScript catalog, migrations, and tests visible during review.

### `super_admin` — 59 permissions

`overview.read`, `operations.read`, `live_operations.read`, `live_operations.manage`,
`announcements.read`, `announcements.manage`, `players.read`, `players.suspend`, `players.ban`,
`players.manage_sessions`, `players.reset_position`, `players.require_rename`, `players.rename`,
`player_audit.read`, `wallets.read`, `wallets.force_reverify`, `inventories.read`,
`cozy_gameplay.read`, `inventories.adjust`, `items.read`, `items.create`, `items.update`,
`items.publish`, `maps.read`, `maps.edit`, `maps.preview`, `maps.publish`, `maps.audit_read`,
`assets.read`, `assets.upload`, `assets.edit`, `assets.validate`, `assets.review`, `assets.approve`,
`assets.activate`, `assets.deprecate`, `assets.audit_read`, `assets.publish`, `economy.read`,
`economy.adjust_stardust`, `economy.configure_rewards`, `rewards.read`, `rewards.simulate`,
`rewards.approve`, `claims.read`, `claims.open`, `claims.pause`, `claims.reconcile`,
`blockchain.read`, `blockchain.configure`, `token_gate.read`, `token_gate.configure`,
`moderation.read`, `moderation.act`, `roles.read`, `roles.manage`, `audit_logs.read`,
`system_settings.read`, `system_settings.manage`.

### `game_administrator` — 39 permissions

`overview.read`, `operations.read`, `players.read`, `players.suspend`, `players.ban`,
`players.manage_sessions`, `players.reset_position`, `players.require_rename`, `players.rename`,
`player_audit.read`, `wallets.read`, `wallets.force_reverify`, `inventories.read`,
`cozy_gameplay.read`, `inventories.adjust`, `items.read`, `items.create`, `items.update`,
`items.publish`, `maps.read`, `maps.edit`, `maps.preview`, `maps.audit_read`, `assets.read`,
`assets.upload`, `assets.edit`, `assets.validate`, `assets.review`, `assets.approve`,
`assets.activate`, `assets.deprecate`, `assets.audit_read`, `assets.publish`, `economy.read`,
`rewards.read`, `claims.read`, `moderation.read`, `moderation.act`, `system_settings.read`.

### `economy_manager` — 10 permissions

`overview.read`, `players.read`, `inventories.read`, `items.read`, `economy.read`,
`economy.adjust_stardust`, `economy.configure_rewards`, `rewards.read`, `rewards.simulate`,
`claims.read`.

### `live_operations_manager` — 23 permissions

`overview.read`, `operations.read`, `live_operations.read`, `live_operations.manage`,
`announcements.read`, `announcements.manage`, `players.read`, `players.manage_sessions`,
`players.reset_position`, `player_audit.read`, `inventories.read`, `items.read`, `maps.read`,
`maps.audit_read`, `assets.read`, `economy.read`, `rewards.read`, `rewards.simulate`, `claims.read`,
`claims.open`, `claims.pause`, `moderation.read`, `system_settings.read`.

### `content_manager` — 16 permissions

`overview.read`, `items.read`, `items.create`, `items.update`, `items.publish`, `maps.read`,
`assets.read`, `assets.upload`, `assets.edit`, `assets.validate`, `assets.review`, `assets.approve`,
`assets.activate`, `assets.deprecate`, `assets.audit_read`, `assets.publish`.

### `world_designer` — 12 permissions

`overview.read`, `items.read`, `maps.read`, `maps.edit`, `maps.preview`, `maps.publish`,
`maps.audit_read`, `assets.read`, `assets.upload`, `assets.edit`, `assets.validate`,
`assets.audit_read`.

### `asset_manager` — 13 permissions

`overview.read`, `items.read`, `maps.read`, `assets.read`, `assets.upload`, `assets.edit`,
`assets.validate`, `assets.review`, `assets.approve`, `assets.activate`, `assets.deprecate`,
`assets.audit_read`, `assets.publish`.

### `moderator` — 10 permissions

`overview.read`, `players.read`, `players.suspend`, `players.ban`, `players.manage_sessions`,
`players.require_rename`, `player_audit.read`, `wallets.read`, `moderation.read`, `moderation.act`.

### `customer_support` — 9 permissions

`overview.read`, `players.read`, `player_audit.read`, `wallets.read`, `inventories.read`,
`items.read`, `rewards.read`, `claims.read`, `moderation.read`.

### `financial_reviewer` — 9 permissions

`overview.read`, `economy.read`, `rewards.read`, `rewards.simulate`, `rewards.approve`,
`claims.read`, `claims.reconcile`, `blockchain.read`, `audit_logs.read`.

### `blockchain_operator` — 12 permissions

`overview.read`, `operations.read`, `wallets.read`, `rewards.read`, `claims.read`, `claims.open`,
`claims.pause`, `claims.reconcile`, `blockchain.read`, `blockchain.configure`, `token_gate.read`,
`token_gate.configure`.

### `read_only_analyst` — 19 permissions

`overview.read`, `operations.read`, `live_operations.read`, `announcements.read`, `players.read`,
`wallets.read`, `inventories.read`, `cozy_gameplay.read`, `items.read`, `maps.read`, `assets.read`,
`assets.audit_read`, `economy.read`, `rewards.read`, `claims.read`, `blockchain.read`,
`token_gate.read`, `moderation.read`, `system_settings.read`.

## Sensitive assignments

- `roles.manage` and `system_settings.manage` are assigned only to `super_admin`.
- `blockchain.configure` and `token_gate.configure` are assigned only to `super_admin` and
  `blockchain_operator`.
- `economy.adjust_stardust` and `economy.configure_rewards` are assigned only to `super_admin` and
  `economy_manager`.
- `rewards.approve` is assigned only to `super_admin` and `financial_reviewer`.
- `audit_logs.read` is assigned only to `super_admin` and `financial_reviewer`.
- `claims.reconcile` is limited to `super_admin`, `financial_reviewer`, and `blockchain_operator`.
- `players.reset_position`, `players.require_rename`, `players.manage_sessions`, and
  `player_audit.read` follow the explicit Phase 5 mappings above. `blockchain_operator` receives
  none of the player mutations, and `read_only_analyst` does not receive player-audit reasons.
- `players.rename` is limited to `super_admin` and `game_administrator`. Moderator, Customer
  Support, Blockchain Operator, and Read-only Analyst cannot directly rename a player.
- `maps.publish` is limited to `super_admin` and `world_designer`; `game_administrator` can read,
  edit, preview, validate, and audit but cannot publish. `live_operations_manager` receives map read
  and audit visibility without edit/preview/publish. Moderator, Customer Support, and Blockchain
  Operator receive no Phase 6 world permission by default.
- `live_operations.manage` and `announcements.manage` are limited to `super_admin` and
  `live_operations_manager`. The Read-only Analyst can inspect both areas but cannot mutate them. No
  maintenance bypass is implemented because the repository has no trusted administrator-to-game
  wallet linkage; game maintenance therefore applies consistently to normal player sessions.
- Phase 7.5A does not treat legacy `assets.publish` as approval or activation authority. Upload,
  edit, validate, review, approve, activate, deprecate, and audit read each use their exact stable
  key. Super Administrator, Game Administrator, and Asset Manager receive the full asset lifecycle;
  Content Manager also receives the full lifecycle for official content. World Designer can upload,
  edit, validate, and audit but cannot review, approve, activate, or deprecate. Live Operations
  Manager is read-only, and Read-only Analyst receives read plus asset audit. Moderator, Customer
  Support, Financial Reviewer, Economy Manager, and Blockchain Operator receive no asset mutation.

These mappings are intentionally conservative. Any future change requires a reviewed migration,
version invalidation for affected administrators, tests, and an audit record; changing only this
document or a frontend navigation map has no authorization effect.

The stable internal key `economy.adjust_stardust` remains temporarily unchanged for migration and
authorization compatibility. Its product-facing currency is DUST; the legacy identifier must not be
displayed as currency copy and will require a separately versioned permission migration if renamed.
