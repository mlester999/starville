# Phase 8D-B Cooperative Trust Boundaries

The browser is untrusted. It may request a catalog, ready response, entry, interaction, leave, or
resume using strict public identifiers. It cannot author membership, location, progress, timers,
contribution, completion, eligibility, cooldowns, rewards, or receipts.

The realtime server authenticates the session, prevents replaced connections, supplies the
connection's observed position, applies per-operation rate limits, and scopes delivery to the locked
roster. It has no direct table privileges and uses only service-role RPC execution. Activity players
remain absent from public movement delivery; party chat retains its existing membership and block
checks.

PostgreSQL is the durable authority. Every activity table uses forced RLS and has direct `PUBLIC`,
`anon`, `authenticated`, and `service_role` table privileges revoked. SECURITY DEFINER routines use
an empty search path, validate bounded input, lock rows in deterministic order, enforce
revisions/idempotency/rates, and return only safe projections. Published versions, completions,
reward rows, receipts, and audit are immutable.

Reward settlement reuses canonical off-chain DUST and inventory functions. It never accepts client
amounts or item IDs, never transfers $STAR/SOL/NFTs, and cannot route activity temporary items
through gifts/trades. A full inventory produces a protected claim bound to one immutable receipt.

Suspension, session/token-access loss, party removal, block reconciliation, and maintenance are
revalidated at the trusted boundary. Removed participants cannot interact or settle. Disconnect is
not authority: reconnect requires a fresh valid session before exact state is restored.

Safe logs may contain public instance/activity/party/player identifiers, objective and operation
categories, rejection categories, duration/latency, and request ID. They must not contain session
tokens, wallet signatures, authorization headers, service keys, private credentials, email, private
inventory, raw reward internals, or unbounded payloads.
