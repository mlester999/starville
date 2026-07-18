# Phase 9A.1 economy administration workflows

The protected Economy area has one route per operational job: overview, ledger, sources, sinks,
shops, shop detail/editor, policies, reconciliation, risk review, corrections, simulations, and
audit. Navigation visibility is permission-aware; the API and narrow PostgreSQL functions remain
authoritative when a route is opened directly.

## Dashboard and registries

The overview reports real account, distribution, creation, destruction, issue, active-version, shop,
and latest-simulation data. “Unavailable” means the source has not been recorded; it must never be
replaced with invented data. The source and sink pages show the stable closed registries, lifecycle,
limits, cooldown, beginner protection, owning module, revision, and active pointer. Registry keys
and canonical operation keys retain their format and now have an explicit 3–80 character boundary at
both TypeScript/API and database layers.

The ledger accepts bounded player, public receipt, operation, direction, registry, date, and amount
filters with 10/50/100 row pages. Rows are completed immutable evidence. Never expose wallet-private
data, correlation internals, or a direct ledger mutation action.

## Policy lifecycle

1. Create a structured draft from the current published base.
2. Review bounded switches, starter grant, protection, correction thresholds, purchase rate,
   retention, risk threshold, effective time, and notes outside raw JSON.
3. Validate. Validation records named checks and never publishes.
4. Submit the exact revision for review.
5. A different authorized administrator explicitly approves it.
6. Either schedule a future activation or use the separately confirmed Publish action now.
7. Confirm the active pointer changed only at explicit publication or the approved effective time.

Stale revisions are rejected. A scheduled policy is inactive. Published policies are immutable.
Controlled rollback may reactivate an exact historical published version with publish permission and
explicit confirmation; it changes only the active pointer and audit trail, never the version.

## Shop lifecycle and preview

Create a draft from the exact active shop version, edit only approved offer fields, and validate
ordinary-item eligibility, active content, positive bounded prices, quantities, daily limits,
cooldowns, inventory compatibility, and effective time. Then submit, independently approve, and
schedule or explicitly publish. A disable is also a reviewed new version; it preserves receipts and
history.

Controlled rollback can likewise reactivate a historical published shop and its exact reviewed
offers without editing that version. Preview renders the exact draft at phone, tablet, and desktop
sizes with insufficient-DUST, inventory-full, limit, and unavailable states. Preview never calls
purchase settlement, grants an item, debits DUST, creates a receipt/ledger row, changes counters,
leaks a draft publicly, or publishes.

## Reconciliation, risk, and corrections

Reconciliation may be bounded global or single-player. It compares the stored account with the
append-only ledger, records balanced/mismatch evidence and duration, and always reports
`autoCorrected: false`. There is no Repair All action. Create a correction only after a specific
verified mismatch.

Risk signals are explainable investigation prompts. Acknowledge/investigate/resolve/dismiss changes
review state only; it cannot automatically suspend a player. Keep raw thresholds and private staff
notes out of player-facing output.

Corrections are bounded signed deltas with player, reason, explanation, related evidence, and a
request ID. There is no Set Balance operation. The creator cannot approve; high-value requests need
two different reviewers; Customer Support cannot approve; a debit cannot make DUST negative; a retry
cannot settle twice; settled rows and receipts are immutable.

## Simulation, audit, and incidents

Simulation mode clearly states that it changes no player balance or published configuration. Run the
four candidates with a deterministic seed and compare supply, ratio, daily change, distribution,
participation, affordability, cap reach, concentration, and suspicious contribution. The current
conservative recommendation is Candidate D and remains unpublished.

Audit filters only append-only economy events: draft/edit/validation/review/approval/scheduling/
publication, disable, gates, correction, reconciliation, risk, and simulation. During an incident,
preserve evidence; use a reviewed policy/shop gate for new settlement; reconcile; investigate safe
receipt IDs; correct only a verified delta with required reviewers; and restore through another
reviewed version. Never edit an account, ledger row, or completed receipt directly.
