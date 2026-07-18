# Phase 11C shop operations

The existing protected Economy → Shops → General Store route is the operations workspace.
Permissions remain granular: catalog read/edit/publish, stock read/manage, transaction read, receipt
read, reconciliation manage, and live-ops manage.

Operators can inspect canonical placement and artwork readiness, active and historical catalog
versions, versioned entries, prices, stock and restock policy, player limits, live-ops controls,
recent transactions, owner-sensitive receipts, reconciliation queue state, and audit evidence.
Tables and forms have mobile fallbacks; no raw JSON editor or destructive catalog deletion is
exposed.

To change a catalog locally, create a successor from the expected active version, edit the draft
with explicit expected revisions and a reason, validate, submit for review, approve with a different
administrator, and publish only in an explicitly authorized environment. Validation checks item
eligibility, positive bounded prices, stock/restock consistency, limits, active DUST registries, and
direct arbitrage.

Manual restock requires the expected stock revision, a bounded quantity, a reason, and
`economy.stock.manage`. Live-ops can independently pause access, buying, selling, stock decrement,
restock, sale issuance, tutorial objectives, or tutorial rewards. These controls do not delete
evidence or alter historical receipts.

Reconciliation is evidence-only. Request a transaction-specific check, inspect the queue/result, and
escalate mismatches to manual review. There is no Repair All action and workers make zero automatic
balance corrections.

No Phase 11C owner-acceptance step in this document is marked passed. Hosted validation, migration
push, catalog publication, stock mutation, and player transactions require separate authorization.
