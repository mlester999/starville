# Phase 9A economy operations

The `/economy` area now uses dedicated overview, ledger, source, sink, shop, policy, reconciliation,
risk, correction, simulation, and audit routes. It shows real aggregate DUST metrics, closed
registries, bounded searches, immutable history, and isolated planning output. It deliberately has
no “Set Balance” action and no bulk unrestricted export.

Permissions are narrow: economy/game administrators hold reviewed operational permissions; financial
reviewers may audit, review corrections, and simulate; live operations may read and review risk;
content managers may edit shops but cannot publish; customer support may read and request a
correction but cannot approve; moderators may read risk only; the Read-only Analyst has only
`economy.read` and `economy.audit.read`. The Blockchain Operator receives no DUST, shop, or
publication authority. UI visibility never replaces API and database authorization.

Policy and shop workflows use structured draft fields and exact revision checks. Their reviewed
sequence is draft → validate → submit for review → independent approval → schedule or explicit
publication. A creator cannot approve their own version. Published versions cannot be edited. A
scheduled version stays inactive until its approved effective time; validation, preview, and
approval never publish by themselves.

For a mismatch, record the run ID and safe player/receipt identifiers, inspect the bounded ledger,
and determine the operational cause. Do not edit account or ledger rows. If verified, create a
signed correction with a 20–1,000 character explanation. The system calculates before/after.
Reviewers reject drift, unsafe negative results, duplicate requests, and insufficient separation of
duties.

Risk signals are investigative prompts. Acknowledge, investigate, dismiss, confirm, or resolve the
signal with the narrow review permission. Never suspend a player solely from a heuristic score. Use
existing moderation authority only after independent evidence and policy review.

Emergency sequence: confirm the affected source/sink; create and validate a policy or shop version;
obtain independent review; explicitly publish; verify reads and receipts remain; run reconciliation;
communicate player-safe maintenance language. Roll back through another reviewed version, never by
editing published evidence.
