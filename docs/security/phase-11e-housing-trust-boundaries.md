# Phase 11E housing trust boundaries

The browser submits intent, a bounded placement draft, expected revisions, and idempotency. It does
not choose ownership, home identity, item settlement, DUST cost, upgrade eligibility, capacity, zone
policy, collision, quest progress, or a successful realtime event.

The API reuses wallet-gated player authorization, strict Zod contracts, trusted-origin mutation
checks, safe error mapping, disabled response caching, request IDs, and service-role-only RPCs.
Administrator routes independently require granular permission; sensitive corrections require AAL2
inside PostgreSQL and a different reviewing administrator. Structured logs are bounded to IDs,
operation/result categories, counts, revisions, and duration. Authorization headers, cookies, wallet
signatures, credentials, raw preview grants, storage URLs, and full layout payloads are never
logged.

PostgreSQL owns all settlement. SECURITY DEFINER functions have an empty `search_path`, fully
qualified objects, bounded inputs, row/advisory locks, durable rate limits, expected revisions, and
append-only receipts. The placement validator is correctly `STABLE` because it reads current home,
zone, inventory, farming, workstation, live configuration, and definition rows; it is never declared
immutable. Mutation routines are `VOLATILE`.

Forced RLS protects homes, layouts, furniture instances, storage, upgrade ownership, correction,
reconciliation, audit, and telemetry tables. Anonymous/authenticated table writes and direct DUST
balance changes are revoked. Players can only reach narrow owner-authorized API paths; another home
or revision returns an owner-safe denial/not-found category. Administrators receive only data
allowed by furniture, home-inspection, reconciliation, correction, live-ops, or telemetry
permissions. Customer Support has bounded inspection but no mutation. Analysts receive aggregate
telemetry only.

Exact-once safety combines canonical source keys, unique constraints, locked projections, request
hashes, idempotency receipts, immutable revision snapshots, append-only inventory/storage/DUST/
upgrade transactions, and original-response replay. Inventory, storage, layout, and home changes
share one database transaction. A failed validation, stale version, capacity error, or exception
rolls everything back.

Game Test contains no persistent gateway. Private realtime tickets/sessions are owner-bound and
housing events are emitted only after authoritative commits; no public-world or cross-home leakage
is permitted. The worker can expire sessions, summarize telemetry, repair only a safe storage
capacity projection, or route evidence to manual review. It cannot manufacture furniture, move
items, change DUST, upgrade a home, rewrite layout history, or settle preview data.

Housing grants no `$STAR` authority, token claim, NFT land/furniture, paid slot, marketplace,
property trade/rental, social visit, or deployment capability.
