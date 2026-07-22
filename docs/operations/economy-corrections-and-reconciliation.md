# Economy corrections and reconciliation runbook

Starville DUST is off-chain and server-authoritative. Inventory, rewards, costs, capacities, shops,
crafting, farming, housing, progression, gifts, and trades settle through typed database functions.
Administrators never edit balances or inventory rows directly.

## Inspection

Start with `/economy`, the immutable DUST ledger, source/sink registries, shop/policy versions,
player inventory views, and reconciliation results. Record exact player/content IDs, ledger/effect
receipt references, UTC window, expected invariant, observed mismatch, and source case/incident.
Treat cached UI totals as hints; database invariants and ledger sums are authoritative.

Stop and escalate if the issue is widespread, actively exploitable, associated with a
migration/deploy, or cannot be bounded to known receipts.

## DUST correction

1. The requester with correction-create permission records a bounded signed delta, player,
   source/sink classification, case ID, detailed reason, and supporting evidence. The tool rejects
   out-of-range amounts and duplicate idempotency context.
2. A different authorized reviewer evaluates entitlement, calculation, target, policy, and blast
   radius. Self-approval is prohibited.
3. The reviewer approves or rejects through `review_admin_economy_correction` with AAL2 and the
   current state. Database locks and constraints make settlement exactly once.
4. Verify the immutable correction request, review, DUST ledger entry, balance, request ID, and
   audit event.

A correction is not edited or deleted. Recovery is a separately justified equal-and-opposite request
with independent review. Never “fix” DUST by changing a stored balance without a ledger entry.

## Inventory correction

There is intentionally no universal inventory editor. Determine the typed domain—cosmetics, shop
item, crafting/farming output, housing item, progression reward, gift, or trade—and use its
protected grant/revoke/reconciliation action. Verify ownership, stack/capacity, equipment/use
references, catalog version, effect receipt, and duplication risk. If no safe typed action exists,
mark the capability blocked for that case and implement/review one in a future authorized phase; do
not issue direct SQL.

An inverse typed mutation is the recovery action. Preserve the initial action, reason, and audit
record.

## Reconciliation

1. Select the correct queue: crafting, shop, progression, housing, home visit, or other supported
   domain.
2. Submit the bounded request using the source entity and expected result. The worker claims jobs
   with a lease; duplicate delivery must converge on the same effect receipt.
3. Observe queued/claimed/completed/failed state, attempts, lease owner/expiry, mismatch category,
   and result. Do not run multiple manual retries while a lease is active.
4. For a safe retry, wait for expiry or use the supported retry transition. For a genuine
   entitlement mismatch, create a separate reviewed correction.
5. Re-run read-only invariants and close the case with queue/result/receipt references.

Stop workers during suspected systemic corruption or unsafe deploys. Restart only after the incident
commander approves the artifact/configuration and stale leases can recover safely.

## Evidence and privacy

Evidence contains internal IDs, amounts/item keys, before/after invariant calculations,
receipt/request IDs, roles, timestamps, and owner decisions. It excludes credentials, raw auth
tokens, full wallet/email, IP addresses, and unrelated player history. Economy monitoring and
thresholds must be configured and accepted in Phase 13D; Phase 13C does not claim live production
telemetry.
