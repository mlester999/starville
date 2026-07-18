# Phase 10B hosted readiness and owner acceptance

Status: local implementation complete; hosted migrations and signed-in owner acceptance pending.

No content or platform configuration was published by this local completion work.

## Observed hosted state

The 2026-07-16 read-only migration inspection found the hosted Starville Development project applied
through `20260716110000_phase10b_cosmetic_schema.sql`. The schema migration is present. The original
`20260716111000_phase10b_cosmetic_functions.sql` attempt failed at the absent hosted
`avatar_content_versions.public_name` column and did not enter migration history.

Read-only catalog queries confirmed:

- the hosted Phase 10A definition table lacks the newer `category` and `content_layer` fields;
- the hosted Phase 10A version table has no `public_name` and owns no public cosmetic display name;
- hosted avatar definitions, avatar versions, ownership, loadouts and cosmetic reward receipts are
  empty;
- Phase 10B functions and their triggers are absent, consistent with transactional rollback;
- the hosted avatar settings row uses the earlier creator/editor fields;
- no destructive repair, reset, migration-history edit, or hosted write is required.

## Pending forward migration order

| Order | Migration                                                    | Purpose                                                                           | Existing hosted data effect                                                                    | Publishes content/configuration? |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| 1     | `20260716110500_phase10b_avatar_contract_reconciliation.sql` | Add/backfill Phase 10A definition category/layer and current settings fields      | Backfills only existing definitions/settings; hosted definition rows were observed empty       | No                               |
| 2     | `20260716110700_phase10b_avatar_outfit_mutation_repair.sql`  | Install canonical avatar create/update RPCs and safe accessory UUID parsing       | Function replacement only                                                                      | No                               |
| 3     | `20260716111000_phase10b_cosmetic_functions.sql`             | Player/admin Wardrobe, loadout, emote, collection and entitlement authority       | Idempotently bootstraps starter cosmetic state for existing players when content permits       | No                               |
| 4     | `20260716112000_phase10b_cosmetic_platform_modules.sql`      | Validate future drafts with Wardrobe/emote/collection modules and false-only shop | Alters validation function/constraint/trigger; active platform configuration remains untouched | No                               |
| 5     | `20260716113000_world_asset_version_upload_recovery.sql`     | Unrelated forward fix for failed replacement asset processing                     | Function replacement only until invoked                                                        | No                               |

Do not edit, delete, repair, or reapply the already-hosted `20260716110000` schema migration. Do not
mark the failed `111000` attempt as applied; it is legitimately pending because its transaction
rolled back.

## Exact next manual command

After the owner reviews the diff and confirms the target remains Starville Development, the next
manual command is:

```bash
pnpm db:migrations:push
```

The command is intentionally not run by this local completion task. It is write-gated and must be
performed by the owner. Never use `db reset`, history repair, destructive SQL, or an ad hoc hosted
column change.

After the push, run in order:

```bash
pnpm db:migrations:list
pnpm db:lint:hosted
pnpm db:test:hosted
pnpm rls:test:hosted
```

If any pending migration fails, stop. Preserve its exact error and transaction state, use read-only
catalog inspection, and prepare a new forward migration. Do not mutate an applied migration.

## Local gates before owner push

Run and retain results for:

```bash
pnpm env:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
pnpm db:test:local:world
pnpm economy:load:test
pnpm realtime:load:test
pnpm avatar:renderer:load:test
```

The database gate builds a fresh isolated PostgreSQL/Supabase-compatible stack, applies the full
chain, queries real catalog/privilege metadata, executes actual RPCs, races competing mutations,
parses a SQL Wardrobe response with the shared TypeScript contract, and rolls its fixtures back.

## Signed-in owner acceptance

Hosted automation is necessary but not sufficient. Record environment, release/migration IDs,
tester, date, browser/device, administrator role, result and evidence location for each group.

### Player Wardrobe and outfits

1. Load an existing and a new player; verify starter bootstrap is exact-once.
2. Search/filter ownership and distinguish owned, equipped, unavailable and revoked states without
   relying on color alone.
3. Save, rename, apply and delete each of five slots; refresh and reconnect to prove persistence.
4. Race two stale tabs and confirm one coherent winner with a friendly conflict.
5. Revoke an equipped test cosmetic through the reviewed admin path and verify a valid fallback,
   preserved position, no duplicate remote entity, no DUST/inventory change, and an immutable
   receipt.

### Emotes and collections

1. Configure up to eight unique owned emotes and confirm unowned/disabled keys fail closed.
2. Activate an emote with two players in one channel and a third in another; verify bounded same-
   channel broadcast only.
3. Refresh/reconnect and verify no stale emote resumes incorrectly.
4. Complete and concurrently claim a controlled active collection; verify exactly one cosmetic
   reward, one reward receipt, no DUST/token reward, and a conflict for changed request intent.

### Administrator authorization

1. Exercise overview, catalog, collections, emotes, grants, revocations, review, audit, settings and
   shop preview with the intended narrow roles.
2. Directly visit every prohibited route with a moderator, read-only analyst, support role and
   normal player; backend authorization must deny it regardless of navigation visibility.
3. Confirm no public admin registration and no wallet-derived admin authority.
4. Confirm the shop has no offers, Buy control, purchase endpoint, wallet prompt or enable path.

### Responsive and accessibility matrix

Test the Wardrobe, quick emote wheel and cosmetic admin area at 360×800, 390×844, 768×1024,
820×1180, 1024×768, 1280×800, 1440×900 and 1920×1080. At representative mobile, tablet and desktop
sizes repeat at 90%, 110% and 120% UI scale with Reduced Motion and Increased Text Contrast.

Confirm no page-level horizontal overflow, visible previews, reachable actions, scrollable category
controls, semantic headings/tables/forms, visible focus, Escape close and focus restoration, touch
targets, text labels for selected/state/color information, associated errors, bounded live-region
announcements, no focus trap leak, no motion-only meaning, and usable loading/empty/error states.

### Regression

Verify Phase 10A creator/edit/realtime appearance, world travel, movement, DUST/inventory/shop,
social features, administrator authentication/RBAC, wallet gating, and disabled token-claim
architecture. A partial or local-only pass remains pending; it is never recorded as hosted or owner
acceptance.
