# Phase 11E housing preflight audit

This audit was completed before Phase 11E implementation. It records the repository state that the
housing work must extend and the compatibility decisions that follow from it.

1. **Existing housing model.** `player_homes` is the one-home-per-player authority. It pins a
   `cozy_home_templates` row, public return destination, private-home lifecycle, current position,
   and optimistic state version. Phase 11E must extend this row rather than provision a second home.
2. **Existing home-layout model.** `player_home_furniture` is the current mutable placement
   projection. It has server-generated placement IDs, home and definition references, integer grid
   coordinates, four bounded rotations, and state versions. There is no active-layout head or
   immutable layout-revision history.
3. **Existing decoration mode.** The Game Client exposes a development grid that immediately calls
   place/move/rotate/remove RPCs. It has no local edit draft, preview-only settlement boundary,
   undo/redo, whole-layout validation, or atomic Save Layout transaction.
4. **Existing furniture definitions.** `cozy_furniture_definitions` links canonical inventory items
   to footprints, rotations, blocking behavior, asset references/readiness, and content versions.
   World Asset reference integration already exists. Category, zone, anchor, capacity-weight,
   indoor/outdoor, release, and safe-metadata policy are missing.
5. **Existing placeable-item policy.** Canonical item metadata identifies furniture through
   `kind=furniture` and `furnitureSlug`. Non-furniture categories are closed by default. Existing
   item binding, stack, sell, and gift policies remain authoritative.
6. **Existing storage model.** No private home-storage container or storage stack model exists.
   Inventory capacity and stack settlement exist and must be reused rather than mirrored.
7. **Existing transfer model.** `private.cozy_add_item` and `private.cozy_consume_item` provide
   locked, append-only inventory settlement. There is no inventory/storage atomic transfer receipt
   or storage revision authority.
8. **Existing home-upgrade model.** Phase 11D exposes only a `home_upgrade_foundation` progression
   unlock type. There are no versioned upgrade definitions, active pins, player transactions, tier
   transitions, or capacity projections.
9. **Existing DUST upgrade sink.** The canonical append-only `player_dust_ledger`, account state,
   and `private.cozy_apply_dust_delta` exist. `home_upgrade` is not yet an allowed reason/reference
   or versioned economy sink.
10. **Existing layout revision model.** None exists. Phase 11E needs an immutable revision table,
    placement snapshots, one active head per home, parent/restoration references, and append-only
    evidence.
11. **Existing private-home realtime behavior.** One-use owner tickets and owner-bound sessions poll
    `cozy_private_plot_events` and rehydrate the whole authoritative private-home view. The channel
    already prevents public-world and cross-home leakage; housing events can reuse it.
12. **Existing administration.** Admin gameplay pages show furniture and player placement counts,
    but no dedicated Housing workspace, successor configuration, storage/upgrades/layout history,
    reconciliation, or correction workflow exists.
13. **Components to reuse.** Reuse `player_homes`, `player_home_furniture`, canonical items and
    inventory helpers, DUST ledger/account helpers, Phase 11D quest/achievement/title/badge systems,
    admin RBAC/session/AAL2 conventions, the private-home event channel, worker job conventions,
    World Asset pins, and the real isometric placement/depth coordinate system.
14. **Components missing.** Add decoration zones, layout heads/revisions/snapshots, storage,
    transfer receipts, upgrade versions/transactions, housing tutorial content, live-ops,
    telemetry/audit/reconciliation records, typed contracts/simulations/fixtures, and bounded player
    and admin APIs.
15. **Security risks.** Primary risks are cross-home selection, client-authored ownership/cost or
    validity, partial inventory settlement, replay duplication, stale-head overwrite, blocked
    entrances, direct table access, Game Test persistence, private-layout telemetry leakage, and
    unsafe administrative downgrades. Narrow service-role RPCs, empty search paths, forced RLS,
    locks, expected revisions, and immutable evidence must fail closed.
16. **Migration plan.** Use the next forward-only timestamps after Phase 11D: a schema/content
    migration, player-functions migration, then admin/worker integration migration. Applied
    migrations are not edited.
17. **Compatibility decision and risks.** The production runtime is an outdoor private-home plot
    derived from the canonical home manifest. The legacy template name mentions an interior, but no
    genuine interior scene/transition renderer exists. Phase 11E therefore supports outdoor
    decoration completely and stores a disabled `indoor_floor`/`indoor_wall` foundation. It must not
    fake an indoor renderer. Existing farm tiles, workstations, return paths, inventory, DUST,
    progression, realtime authorization, RLS, and Game Test isolation remain intact.
