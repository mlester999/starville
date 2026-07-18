# Phase 9A economy trust boundaries

Browsers hold presentation state only. They may propose an offer ID, quantity, expected published
version/price, optimistic state versions, request ID, and idempotency key. They cannot choose an
item definition, authoritative price, balance, reward, correction result, risk decision, or target
balance. Current token access, player moderation, maintenance, proximity, and inventory authority
are rechecked server-side for mutations.

The API validates cookie/session and Origin, parses closed schemas, and calls narrow service-role
RPCs. It never exposes the Supabase service-role key. PostgreSQL tables force RLS, have no browser
policies, and revoke direct access from public, anon, authenticated, and service role. Service role
can execute only named RPCs with `search_path=''` and truthful volatility.

Ledger rows, purchase receipts, simulation artifacts, published policy/shop/utility versions, and
offers attached to published shops are immutable. Deferrable consistency constraints require the
account and ledger to balance at transaction commit. Reconciliation creates evidence and risk
signals but cannot rewrite balances. Heuristics cannot suspend players. Corrections require narrow
permissions, independent review, bounded deltas, and audit.

Logs may contain a safe receipt, public player ID, operation key, signed DUST amount, outcome,
request ID, and duration. They must not contain authorization headers, access tokens, signatures,
private keys, seed phrases, service-role credentials, database URLs, staff notes, raw anti-abuse
thresholds, complete private inventories, or private wallet/account linkage.

Incident response: pause new rewards or spending through a reviewed policy version, preserve reads
and evidence, run bounded reconciliation, investigate safe receipt/request IDs, create a correction
only for a verified cause, and require the configured reviewers. Never delete history or manually
rewrite a balance. Escalate suspected credential exposure under the existing secret-rotation
runbook; do not place sensitive evidence in general logs.
