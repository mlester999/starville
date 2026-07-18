# Cooperative Activity Operations Runbook

## Routes and permissions

The Activities operations area provides catalog, instances, rewards, audit, editor/preview, and
settings views. Navigation is only a convenience; every server action separately checks its narrow
permission and trusted origin.

- `cooperative_activities.read`: safe catalog and instance/reward lookup.
- `cooperative_activities.edit`: structured draft creation and editing.
- `cooperative_activities.validate`: closed-schema validation.
- `cooperative_activities.review`: review transitions.
- `cooperative_activities.publish`: exact reviewed publication.
- `cooperative_activities.preview`: nonpersistent staff simulation.
- `cooperative_activities.audit.read`: bounded audit.
- `cooperative_activities.settings.read` / `.edit`: reviewed live settings.

Super Admin and Game Administrator receive the full lifecycle. Content Manager can read, edit,
validate, and preview but cannot publish. Live Operations Manager can read settings but cannot
mutate them without the edit permission. Moderator, Customer Support, and Read-only Analyst receive
only the justified safe read. Blockchain Operator has no activity or reward mutation authority.

## Routine operations

Use catalog filters to inspect lifecycle and active version. Use instances to search by public
instance ID or activity key and inspect roster, objective, connection state, safe result, and
bounded audit. Rewards are immutable receipt views; there is no grant, edit, force-complete,
inventory, or DUST control.

Settings can disable new entries and decide whether active instances finish. Public queue always
remains disabled. Before disabling, inspect active/waiting counts and announcements. Maintenance
gates must never be bypassed.

## Editor and preview

The editor exposes only the closed fields and registries. Published rows are immutable. Preview is
clearly marked, uses an exact draft version, writes no completion/cooldown/receipt, and settles no
reward. Preview never publishes automatically.

## Incident checks

For unexpected progress, inspect public instance ID, activity version, objective, revision, request
category, and audit result. For settlement questions, compare the unique completion and participant
receipt with canonical DUST/inventory history. Do not edit the receipt. For a stuck reconnect,
verify server session validity and deadline, then let the bounded cleanup job reconcile. Never
delete active state or protected history manually.

All lists use page sizes 10, 50, or 100. Logs must not include tokens, signatures, auth headers,
email, full inventory, secrets, or unbounded payloads.
