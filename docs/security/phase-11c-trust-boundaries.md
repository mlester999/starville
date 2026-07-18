# Phase 11C shop trust boundaries

The browser is untrusted. It may submit an interaction ID, catalog entry ID, direction, quantity,
observed revisions, observed price, and idempotency key. It cannot choose the authoritative price,
sell value, DUST delta, resulting stock, remaining limit, inventory result, tutorial objective, or
reward.

All Phase 11C authority tables enable and force RLS, have no permissive policies, and revoke direct
access from `public`, `anon`, `authenticated`, and `service_role`. Only narrow `SECURITY DEFINER`
RPCs with an empty `search_path` are executable by `service_role`. The API never returns or logs
service credentials.

Player RPCs recheck suspension, rename state, bootstrap, world revision, private-home state,
distance, maintenance, shop/live-ops availability, catalog and entry revisions, item eligibility,
account binding, stock, daily limits, global source cap, DUST state, inventory state, capacity,
cooldown, rate limit, and idempotency. Settlement is atomic and cannot leave DUST, inventory, stock,
limits, transaction evidence, or receipts partially applied.

Owner receipt reads join through the authenticated wallet's player profile. Missing and cross-owner
receipts return the same safe not-found result. Event reads include only the current owner's private
events plus `public_stock`; another player cannot receive a transaction, balance, inventory,
receipt, or support reference. Operations events remain administrator-only.

Catalog mutations require explicit permissions and expected revisions. Publication requires review
separation, validation, and a reviewed version. Live-ops and manual restock changes require reasons
and append audit evidence. Reconciliation detects mismatches and queues manual review; it never
silently rewrites a DUST balance or inventory.

The Game Test fixture is a separate in-memory component. It contains no call to `requestPlayerApi`,
`transactGeneralStore`, or the persistent `/transactions` route. Reloading or closing the preview
destroys all fixture state.
