# Phase 9A.1 economy security review

The browser can submit bounded filters, draft fields, an offer/quantity, expected immutable version
and price, optimistic state versions, and idempotency/request IDs. It cannot select an authoritative
price, balance, registry operation, reward, correction result, active version, or risk action. API
authorization precedes narrow database RPC authorization; module visibility never grants a
permission.

Economy tables retain forced RLS and no browser policies. Public, anonymous, authenticated, and the
trusted server role have no broad direct table mutation. Only named functions are executable; Phase
9A.1 revokes the older direct publish transition functions from the trusted API and exposes the
replacement lifecycle that requires exact revision, validation, independent approval, and explicit
scheduling/publication. Functions are truthfully volatile where they read or write changing state,
use `SECURITY DEFINER`, and set an empty search path.

Purchases recheck current policy, active shop/version, canonical price and item, player state,
limits, cooldown, DUST, and inventory under locks. DUST debit, inventory grant, ledger, and receipt
commit together. Duplicate idempotency returns the original receipt; it cannot duplicate debit or
item. Disabling a shop changes canonical availability so new purchases fail closed while the last
published catalog, receipts, and history remain available for safe read-only presentation. Every
ledger write acquires a compatible player-identity key-share lock before the DUST account. Shop
transactions keep the player and moderation state stable with shared row locks and use a
transaction-scoped per-player advisory lock to serialize buys and sales. This preserves daily-limit,
balance, and inventory decisions while remaining compatible with reward and correction paths that
already hold the account lock. Real multi-session PostgreSQL coverage exercises final-balance,
final-slot, reward, correction, shop-disable, policy-pause, publication, reconciliation, and review
races without deadlock or partial settlement.

Reconciliation records evidence and never updates a balance. Risk signals never suspend. A
correction is a reviewed delta—not a target balance—and preserves creator/reviewer separation,
second review for high values, nonnegative result, terminal immutability, and exactly-once ledger
settlement. Simulations are pure synthetic calculations; persisted aggregate output records
`playerBalancesMutated: false` and has no account mutation path.

Public output excludes wallet-private linkage, credentials, staff notes, raw anti-abuse thresholds,
database errors, internal shop versions, and internal correlation/reference UUIDs. Player history
uses safe DUST/SHOP/CORR public receipts and server-derived friendly labels. No route requests an
on-chain transaction, token approval, transfer, private key, or seed phrase.

The remaining evidence must be collected after owner-authorized hosted deployment: hosted lint,
pgTAP, RLS, signed-in browser roles, and real acceptance. Until then, the feature status is
local-only pending hosted validation.
