# Phase 11E housing design and local tuning

Phase 11E turns owned furniture into a durable customization loop without giving furniture stat
buffs or paid capacity bypasses. Farming, cooking, crafting, the General Store, quests, and bounded
rewards can supply canonical furniture items; housing decides only whether an owned item can be
placed safely.

## Starter experience

The starter home retains the real outdoor private plot, eight farming tiles, Cooking Hearth,
Crafting Workbench, entrance/exit, eight weighted furniture capacity, and sixteen private storage
slots. Willow Chair is the tutorial placeable and uses existing crafted/item/asset references. Five
additional canonical furniture definitions exercise table, rug, lighting, utility, and plant policy;
development art stays labeled as a marker.

`Home Sweet Home` guides home entry, Decoration Mode, Willow Chair placement, Save Layout, deposit,
withdrawal, history inspection, and authoritative home interaction. Its bounded achievement/title/
badge/decoration/DUST foundations reuse Phase 11D exact-once reward settlement. No reward is
automatically equipped and no large repeatable DUST source is introduced.

## Capacity and Tier 2 candidate

Capacity is visible and deterministic: each definition has a weight, each zone has a local count,
and the home has a weighted maximum. Starter Tier 1 is 8 furniture / 16 storage. The local Cozy Tier
2 candidate is 12 furniture / 24 storage, costs 250 DUST, requires Player Level 3, and unlocks one
outdoor path-edge zone. Indoor-room and additional-farm-tile values are foundations only. The
candidate is intentionally unpublished and needs owner acceptance and gameplay evidence before any
hosted activation.

## Interaction design

The housing workspace keeps the actual outdoor scene/grid visible beside an owned-furniture palette.
Search and recent/indoor/outdoor filters do not invent inventory. A selected-placement inspector
states coordinates, rotation, and zone; server validation states invalidity in text. Place, move,
rotate, pack up, undo, and redo update a local draft. Save is explicit. Discard and Exit Mode expose
the unsaved-change decision. History inspection is read-only and restoration starts a reviewed local
draft.

Storage uses explicit Store/Withdraw controls rather than drag-and-drop. Upgrades show cost,
capacity, requirements, permanence, and a confirmation step. The tutorial status and authoritative
objective counts remain readable without relying on color.

The layout collapses to one column at tablet width and full-width controls on phones. Housing uses
native keyboard controls, visible focus, status/alert live regions, text alternatives to the grid,
44-pixel interaction targets, 200-percent-zoom-compatible flow layout, no horizontal page overflow,
and reduced-motion rules. Full visual owner acceptance at the requested viewport matrix remains
pending.

Performance is bounded by 200 placements, 50 local undo/redo snapshots, paginated 20-row history,
stable definition projections, no pointer-movement writes, focused grid updates, bounded JSON, and
one authoritative workspace rehydrate after a mutation or conflict. No full private layout is sent
to broad telemetry.
