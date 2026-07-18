# Phase 11A farming operations

## Farming workspace

Open **Game content → Farming, personal plots, and starter quest**.

`farming.read` can inspect starter item policy, crop durations and snapshot revisions, active
planted-instance count, the pinned plot template and eight tile positions, starter quest objectives
and completion counts, live-operations state, and append-only audit history.

`farming.liveops` can pause or resume planting, harvesting, plot provisioning, starter quest grants,
and tutorial DUST settlement. Every update requires the current revision and a 12–500 character
reason. A maintenance explanation is optional and bounded. These controls do not delete or rewrite
existing crops.

`farming.content_manage` exposes four bounded workflows:

- edit canonical item policy while preserving UUID and slug; unsafe referenced category, metadata,
  disable, or stack-limit changes return a conflict;
- publish a crop configuration revision for future plantings while active instances retain their
  stored snapshot;
- create and activate a validated eight-tile plot-template successor for future provisioning;
- create an immutable starter-quest successor while accepted players retain their pinned version.

A quest reward change additionally requires `farming.reward_manage`. It creates a paired immutable
economy-source version compatible with every active pinned quest reward. The workspace never exposes
item deletion, direct inventory grants, player quest completion, or DUST balance adjustment. Every
operation uses expected versions, a bounded reason, one request ID, and append-only before/after
audit evidence.

Player detail exposes private farming state only to administrators with `players.read` and
`farming.player_read`. It includes plot lifecycle, private instance key, tile and crop projection,
quest status, last action, reconciliation count, and DUST receipt reference. It provides no direct
correction controls.

## Troubleshooting

- `FARMING_CONFIGURATION_CONFLICT`: reload; another administrator changed the revision.
- `FARMING_REFERENCE_CONFLICT`: preserve the referenced item/crop/quest link or publish a compatible
  successor.
- `FARMING_STACK_LIMIT_CONFLICT`: the requested item stack limit is below an existing owned stack.
- `PLOT_PROVISIONING_FAILED`: inspect reconciliation queue and provisioning events; do not manually
  insert a second home.
- `ECONOMY_SETTLEMENT_FAILED`: keep tutorial rewards paused if necessary and inspect the canonical
  DUST source, quest ledger reference, and reconciliation row.
- impossible crop state: run the bounded worker reconciliation; do not schedule a timer per crop.
- stale client state: reload the player projection and preserve the existing idempotency key only
  for the same request payload.

## Version and reference policy

Items and crops increment audited revisions in place because consumers pin immutable item UUIDs and
planted crop snapshots. Plot templates and quests create successor rows because player homes and
accepted quests pin those version UUIDs. Never modify historical quest/objective rows or repoint an
existing home. Never bypass the active-template pointer or the separate reward permission.
