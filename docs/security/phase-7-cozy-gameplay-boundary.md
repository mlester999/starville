# Phase 7 cozy-gameplay security boundary

All player routes remain below `/api/v1/token-access/player`, within the existing narrow HttpOnly
access-cookie path. The API derives the wallet from a valid access session, verifies the Phase 5
suspension/rename boundary, and checks maintenance before normal gameplay bootstrap or mutation.

The browser sends only bounded intent: stable slugs/IDs, quantity, expected state version, and an
idempotency key. It never sends prices, balances, recipe outputs, crop readiness, yields, or
ownership facts. Strict Zod contracts reject extra fields. Safe public errors contain an approved
code and request ID, never a database message, stack trace, service key, or internal idempotency
record.

Every gameplay table enables and forces RLS. Direct privileges are revoked from `PUBLIC`, `anon`,
`authenticated`, and `service_role`. The API service role may execute only narrow reviewed
functions; those functions have an empty search path, revoke `PUBLIC` execution, validate every
argument, and recheck the player inside the transaction.

Value operations use row locks, constraints, append-only history, payload fingerprints, unique
idempotency records, optimistic versions, bounded reads, and server timestamps. A repeated key with
the same payload replays its safe result. Reusing the key for different input is rejected. Logs
avoid wallet secrets, full inventory contents, internal fingerprints, and administrator-only
metadata.

Administrator visibility is separately authorized by `economy.read`, `inventories.read`,
`items.read`, and `cozy_gameplay.read`. It is bounded and read-only. Phase 7 provides no DUST or
inventory adjustment capability and adds no broad table grant.
