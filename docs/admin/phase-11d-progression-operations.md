# Phase 11D progression operations

The protected `/game-content/progression` workspace separates inspection, configuration, player
support, corrections, reconciliation, live ops, and telemetry through granular permissions. A
customer-support role can inspect a selected player but cannot tune rules or apply a correction.
Sensitive changes require a verified administrator session and AAL2.

## Configuration workflow

1. Inspect the active version, player distribution, recent grants, and current audit evidence.
2. Run a non-mutating simulation and record the planning result.
3. Create an immutable draft successor with a written reason.
4. Validate the draft. Resolve blocking errors and review warnings.
5. Activate only the exact reviewed version and revision.
6. Confirm the prior version is superseded, the pointer changed, and `playersMigrated` is zero.

Skill, XP-rule, unlock, quest-chain, and achievement changes follow the same successor lifecycle. Do
not edit active or historical rows. Title/badge presentation may be changed with an optimistic
revision; disabling it clears active selection but preserves every ownership row.

## Player support

Open a player record and follow the progression inspection link. Review skills, Player Level, XP
history, quests, achievements, pending rewards, unlocks, corrections, and reconciliation evidence.
Never request a wallet seed phrase or expose private state to another player.

For a suspected projection mismatch, queue a bounded reconciliation. The worker may bootstrap a
missing projection, re-evaluate permanent unlock grants, or route a finding to investigation. It
never changes XP automatically. For invalid XP, create a correction preview with source evidence,
review the resulting level/unlock warning, then apply the exact expected revision. The result is a
compensating XP event; historical evidence is never rewritten.

Retry an inventory-blocked reward only after the owner has capacity. Retrying is exact-once and does
not recreate a settled reward.

## Live operations and incidents

Progression grants, each released skill, level rewards, quest rewards, achievement rewards, and
unlock grants can be paused independently. Maintenance is read-only to players: previously earned
history remains available. Multipliers are limited to 0.5–2.0 and need start/end timestamps.

During an incident, pause only the affected grant path, preserve the audit/request IDs, inspect
velocity and pending-reward telemetry, queue reconciliation, and escalate unexplained findings.
Never delete XP history, mass-set a level, revoke ordinary grandfathered unlocks, or run an
unreviewed repair-all command.

The maintenance worker processes at most 500 rows with locked, skip-locked batches. Confirm
`automaticXpCorrections` remains zero and investigate any manual-review count.
