# Phase 8C social trust, safety, and settlement

## Trust boundaries

The browser selects a public presence and submits intent. The realtime service authenticates the
connection, rate-limits actions independently by public presence/action, checks current in-memory
proximity, and checkpoints both positions. PostgreSQL remains final authority and repeats all
security/economy checks from protected state. A client cannot author a receipt or completed state.

Supabase social settings, requests, offers, reservations, receipts, audit entries, and idempotency
records have RLS enabled and forced, no browser policies, and revoked direct access. Only narrowly
named service-role RPCs execute the operations. Admin RPCs repeat trusted administrator session,
assurance, status, and exact-permission checks. No broad table grant was added.

## Atomicity and concurrency

Gift acceptance and trade settlement run in one transaction. Locks are acquired in deterministic
profile/item order. The settlement rechecks current revision, both confirmations, block/moderation,
world/channel/proximity, reservations, ownership, item policy, and recipient capacity. An error
rolls back every mutation. A unique receipt per interaction plus protected idempotency response
prevents replay duplication.

The local PostgreSQL fixture launches two independent `psql` confirmation processes for the same
trade. One confirmation observes `confirmed`, the other completes; the final state has one receipt,
the exact expected quantities, no negative inventory, and no reservations. This is real PostgreSQL
concurrency evidence, not a mocked unit test.

## Safety integration

Phase 8B mute affects chat visibility. Block additionally invalidates active pair interactions,
releases reservations, and denies future inspect/gift/trade work without notifying the target of who
blocked them. Suspension, token-access revocation, maintenance, world/channel transition, or session
loss cannot be bypassed through social messages.

Rate limits are separate for inspect, new requests, responses, offer edits, confirmations, and
cancellations. Payloads, histories, page sizes, offers, quantities, audit results, and worker
batches are bounded. General logs record operation category and request ID, not item evidence, chat
text, wallet data, access/auth tokens, or private identity.

## Retention and cleanup

Pending requests and reconnect deadlines expire through a worker-only bounded RPC. Cleanup releases
reservations before terminal state and is safe to retry. Receipts and audit evidence default to a
180-day operational retention target; deletion/anonymization requires a later reviewed forward-only
migration. Completed evidence is append-only during Phase 8C.
