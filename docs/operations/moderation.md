# Moderation runbook

## Chat reports

1. Open `/operations/chat` with report-read permission. Preserve the submitted report and protected
   message evidence; do not copy it to uncontrolled systems.
2. Evaluate context, applicable policy, prior bounded history, severity, and immediate safety. Do
   not infer guilt solely from report count.
3. With management permission and AAL2, submit the action through
   `admin_act_on_multiplayer_chat_report` using the current report state, a reason, and request
   identifier.
4. If suspension/session revocation is warranted, use the distinct player operation. Verify the
   action and immutable audit record.
5. Record appeal/escalation paths in the external case system. Never delete evidence to “undo” a
   decision.

## Social and home visits

Review gifts, trades, friendships, parties, visitor state, and guestbook entries through their
bounded views. Evidence exposure is minimized by relation and permission. Moderate a guestbook entry
or visitor through the typed server function, record the policy reason, and verify the result.
Reconciliation queues investigate settlement mismatches; they do not authorize an arbitrary transfer
or inventory edit.

For gifts or trades, distinguish pending, accepted, settled, canceled, expired, and reconciliation
states. Never manually replay a settlement. Use idempotency/effect receipts and the reconciliation
workflow before any reviewed correction.

## Escalation and recovery

Escalate credible threats, credential compromise, exploitation, widespread harassment, or
evidence-integrity failures to the incident commander and security owner. Contain with the narrowest
reversible action: maintenance, session revocation, suspension, chat restriction, or
feature-specific control. Restoration is a new audited decision after independent review; immutable
evidence and original actions remain.

Moderators must use AAL2, least privilege, rate-limited APIs, and case/incident identifiers. Do not
expose reporter identity, wallet/email, IP address, tokens, private home data, or moderation notes
to a player or public evidence bundle.
