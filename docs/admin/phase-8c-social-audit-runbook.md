# Phase 8C social interaction audit runbook

Use **Operations → Social interactions** to review bounded gift/trade summaries. Filter by type,
status, interaction ID, or public display name. The list requires `social_interactions.read`;
opening immutable receipt and audit evidence requires `social_interactions.audit.read`.

The detail view shows public participants, lifecycle state, exact trade revision when applicable,
receipt item direction/quantity, and bounded audit action/result history. It intentionally excludes
wallets, email, IP, auth/access sessions, token balances, private inventory snapshots, and report
identity. There is no completed-trade edit, rollback, retry, item grant, or manual settlement
button.

If a player reports a missing item:

1. Record the interaction/request ID supplied through the supported process; do not ask for seed
   phrases, private keys, access tokens, or wallet signatures.
2. Confirm terminal status and whether one immutable receipt exists.
3. Review audit order, revision, participant public IDs, and item direction.
4. Correlate the safe request ID with API/realtime logs. Never paste full credentials or RPC URLs.
5. Use existing player moderation workflows for suspension/rename concerns. Do not alter social
   tables or inventory manually.
6. Escalate a confirmed settlement invariant failure to an owner/database operator. Keep maintenance
   decisions within the existing live-operations procedure.

Read-only analysts receive only permission keys ending in `.read`. Moderators and support roles may
view the deliberately mapped summaries/evidence but cannot grant items, mutate offers, confirm a
trade, or rewrite a receipt. Permission changes require the normal forward-only catalog process.
