# Phase 11E housing operations

The Gameplay → Housing workspace provides bounded furniture/World Asset linkage, home-template and
zone inspection, immutable upgrade versions and successor workflow, storage policy, player-home and
layout inspection, reconciliation, dual-review corrections, live-ops controls, telemetry, and audit.

## Access

- Super Administrator: all housing permissions.
- Game Administrator: furniture, template, upgrade, and storage content inspection/management.
- Live Ops Manager: approved configuration inspection, availability controls, and telemetry.
- Customer Support: bounded private player-home/layout/storage inspection and escalation only.
- Read-only Analyst: aggregate telemetry only.
- Moderator and Blockchain Operator: no housing mutation by default.

The initial workspace uses the canonical Item and World Asset pages for item/asset changes rather
than duplicating them. Furniture rows expose item/asset pins, footprint, anchors, collision, zones,
rotations, owners, placements, lifecycle, and configuration revision. Home templates expose bounds,
spawn/exit, disabled indoor foundations, zones, home references, farming tiles, and workstations.
Active referenced definitions and immutable layouts cannot be deleted or raw-edited.

Upgrade administrators create a draft successor from an existing immutable version, provide only
allow-listed bounded overrides, validate zone/sink/tier/capacity references, run a non-mutating
impact simulation, and explicitly transition validated content. Activation changes the active
pointer; it does not migrate existing player transactions or rewrite layouts. The local Tier 2
candidate is not hosted or owner-approved.

Storage policy exposes starter/tier capacity, restricted categories, transfer rate, live-ops
availability, and capacity violations. Capacity below current usage is never applied. Phase 11E does
not provide a casual storage-item editor; referenced capacity changes flow through immutable upgrade
successors and live availability through the live-ops revision.

## Player support and corrections

Private inspection requires a wallet query and `housing.player_homes.inspect`. It returns home tier,
layout head/history, furniture/capacity, storage/capacity, upgrade settlement, quest projection,
recent saves, reconciliation, and correction evidence. It never grants support mutation authority.

Reconciliation requests are bounded, rate-limited evidence jobs. The worker automatically repairs
only a storage-container capacity projection when current usage fits the authoritative home
capacity. Invalid layouts, item settlement, DUST, upgrades, and quest authority go to manual review.

Corrections require `housing.corrections.manage`, AAL2, reason, expected state, bounded impact
preview, append-only audit, and an independent second administrator. Safe storage projection repair
can apply. Other correction kinds create a preserved-evidence manual plan; they do not casually
grant items, move furniture, debit/credit DUST, change tier, or edit an old revision.

## Live operations and incidents

Independent switches pause Decoration Mode starts, layout saves, storage deposits, storage
withdrawals, upgrades, tutorial grants, or rewards. Pausing does not hide or erase existing state.
For collision/configuration regressions, pause new saves, inspect affected references and
reconciliation evidence, create a successor configuration, validate/simulate it locally, and use a
reviewed correction only where necessary. For storage pressure, pause the affected direction only;
never lower capacity below usage. For replay anomalies, preserve receipts/audit and reconcile before
any compensation.

Game Test is not an operations shortcut. It is nonpersistent local preview data and never appears as
a player-home correction source or broad telemetry event.
