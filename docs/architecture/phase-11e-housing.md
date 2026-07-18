# Phase 11E housing architecture

Phase 11E extends the canonical Phase 11A personal home into an owner-only, server-authoritative
housing system. It does not create a second home, inventory, DUST account, quest engine, World Asset
catalog, or authorization framework.

## Terms and lifecycle

- **Furniture Item** is an owned canonical inventory item eligible for placement.
- **Furniture Instance** is that item placed inside a saved home layout.
- **Layout Revision** is an immutable snapshot of the saved home arrangement.
- **Decoration Mode** is unsaved local editing until Save Layout.
- **Home Upgrade** is a permanent server-authoritative increase in housing capability.
- **Game Test Housing** is temporary preview state only.

The supported lifecycle is:

Own Furniture → Enter Home → Open Decoration Mode → Preview Placement → Save Layout → Store Items →
Upgrade Home → Unlock More Space → Continue Decorating

## Canonical home and spaces

`player_homes` remains the one-home-per-player authority and pins the existing home-template
identity. Phase 11E adds home tier, furniture/storage capacities, configuration revision, and the
current optimistic state version to that row. Existing private-home entry and return transitions
remain authoritative; normal housing writes require the player to be inside the matching personal
home.

The repository currently renders a real outdoor private plot, farm tiles, workstation anchors,
spawn, and exit. Outdoor grid decoration is therefore supported. The template has disabled
`indoor_floor` and `indoor_wall` zone foundations, but there is no genuine indoor scene or wall
renderer. No flattened or invented room is presented as complete. Indoor decoration remains a known
future expansion.

Zones pin bounded coordinates, allowed categories, collision and snap policy, rotations, local
capacity, required tier, and configuration revision. Starter outdoor ground is available at Tier 1;
one path-edge zone unlocks at Tier 2. Entrance clearance, farm tiles, workstations, locked zones,
bounds, rotations, movement-blocking footprints, per-zone capacity, and whole-home weighted capacity
are checked by PostgreSQL. Depth uses logical layer and canonical isometric foot/depth anchors.
Arbitrary player scale is unsupported.

## Placeables and ownership settlement

`cozy_furniture_definitions` remains the canonical item-to-furniture binding. Phase 11E adds
description, category, allowed zones, anchors, capacity weight, indoor/outdoor eligibility,
wall-mount foundation, interaction type, storage slots, release state, and bounded metadata. The
initial catalog reuses Willow Chair, Hearth Table, Moonwoven Rug, Lantern Floor Lamp, Meadow Shelf,
and Round-leaf Planter. Development-marker or missing art is labeled truthfully and never treated as
an approved asset.

The palette is derived from authoritative inventory and placement counts. The client cannot choose
ownership, definition, asset readiness, capacity, or settlement quantity. A successful layout save
atomically consumes inventory for new instances, updates retained instances, returns removed items
to inventory, creates the immutable snapshot, advances the active head, writes evidence, and emits
private owner events. If returned items cannot fit safely, the entire transaction fails and the
furniture remains placed. Replays return the original receipt and do not consume, create, or return
an item twice.

## Decoration Mode and saved layouts

Opening Decoration Mode creates a bounded authoritative session at the current layout revision.
Place, move, rotate, remove, undo, and redo then operate only on a local typed draft. Pointer or
grid selection never writes to PostgreSQL. The UI shows selected coordinates, rotation, zone,
capacity, validation messages, and an unsaved-change decision. It blocks other housing tools while a
draft is dirty and adds a browser navigation warning.

Validation and Save Layout send strict UUIDs, bounded coordinates, the complete bounded placement
set, expected home/inventory/storage/layout-head revisions, an idempotency key, and an optional
restoration-source revision. The database reselects every definition and owned item and validates
the complete layout. Stale heads fail with a stable conflict; the client replaces its stale
projection with the latest workspace rather than overwriting it.

Every save creates `home_layout_revisions` plus immutable placement snapshots. The active head is a
small mutable pointer; parent and restoration-source references remain in history. Change summaries
are bounded and contain counts/names rather than arbitrary payloads. History is paginated.
Inspecting a revision is owner-scoped and records the trusted tutorial event. “Restore as New Layout
Draft” maps still-active instances and currently available owned inventory into a new local draft,
omits unavailable definitions/items/zones for explicit review, then requires normal validation and
Save Layout. It never edits or silently repoints the historical revision.

## Private storage and upgrades

Each home has one owner-only starter storage container, optimistic state version, capacity, and
stack projection. Deposit and withdrawal lock the home, inventory, storage, and affected stacks in
one transaction; use canonical inventory helpers; append a transfer receipt; and return an exact
idempotent replay. Permanent tools and special items are closed to storage. Storage-full,
inventory-full, insufficient quantity, cross-owner, stale-state, and paused operations fail without
partial movement.

Home upgrades use immutable definitions and versions plus an active pointer. The local Tier 1 → Cozy
Tier 2 candidate costs 250 DUST, requires Player Level 3, raises furniture capacity from 8 to 12 and
storage from 16 to 24, and unlocks one outdoor edge zone. It is explicitly local, development-safe,
and not owner-approved or hosted. Purchase eligibility and cost are selected by PostgreSQL. One
transaction appends the canonical versioned `home_upgrade` DUST sink, updates the balance
projection, home tier/capacities and storage projection, records ownership/evidence, advances
trusted objectives, and emits owner events. There is no normal downgrade. A correction cannot reduce
capacity below usage or rewrite old layouts.

## Progression, reconnect, and private realtime

The `Home Sweet Home` progression chapter uses the canonical Phase 11D quest, achievement, title,
badge, pending-reward, and exact-once event systems. Trusted events cover home entry, Decoration
Mode entry, saved Willow Chair placement, layout save, storage deposit/withdrawal, revision inspect,
and upgrade completion. Client-only previews never advance objectives. One-time tutorial furniture
and reward safety are delegated to canonical pending inventory reward settlement; no repeated
interaction can mint a duplicate.

Private-home events add layout saved, furniture placed/moved/removed, storage changed, home
upgraded, capacity changed, and progression keys to the existing owner-only cursor. Events are
server-authored and never enter Lantern Square presence. On entry, focus recovery, or reconnect, the
client replaces stale home, layout, storage, inventory, upgrade, tutorial, capacity, live-ops, and
server-time state. Unsaved drafts intentionally do not survive a hard reconnect.

## Game Test, fixtures, and simulations

Game Test imports a static housing fixture into memory. Layout saves, storage transfers, and Tier 2
upgrades return local projections with `persisted: false`; no persistent mutation endpoint exists.
It cannot consume/grant furniture, change inventory/storage/DUST/tier/layout/quests/achievements/
titles/badges, or emit public telemetry.

The rollback-only PostgreSQL fixture covers provisioning, ownership, valid/invalid placement,
collision, atomic saves/removals, replay, conflicts, cross-owner access, history, restoration
references, storage in both directions, capacity, upgrade settlement, DUST, immutable rows, admin
review, worker reconciliation, RLS, grants, and routine volatility. The deterministic TypeScript
simulation covers capacity, DUST affordability, replay counts, and Game Test persistence exclusion.

## Troubleshooting and limitations

- `HOUSING_CONFLICT`: another authorized session changed an expected revision; rehydrate and begin a
  new draft.
- `HOUSING_LAYOUT_INVALID`: inspect the per-placement server issues; the client preview is not
  authoritative.
- `HOUSING_FURNITURE_RETURN_BLOCKED`: free inventory or storage space before removal.
- `HOUSING_STORAGE_FULL` / `INVENTORY_FULL`: free capacity on the destination side.
- `INSUFFICIENT_DUST` or unmet requirements: the server-selected upgrade is not currently eligible.
- `HOUSING_DISABLED`: the corresponding bounded live-ops switch is paused.

Known limitations are the honest outdoor-only renderer, disabled indoor/wall foundations, no social
visits until Phase 11F, no shared/co-owned storage or decoration, no terrain/building editor, no
furniture marketplace, no property trading/rental, no NFT land/furniture, and no `$STAR` housing.
