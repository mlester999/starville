# Player support runbook

Starville does not include a production support ticket provider in Phase 13C. The product owner must
select one in Phase 13D with identity, retention, access, export, and escalation controls. Until
then, support-queue capability is `missing`; the Admin Portal remains a bounded player lookup and
intervention tool, not a case-management system.

## Player lookup

1. Require an external case/change identifier and a minimum necessary search term.
2. Use `/players` with `players.read`; keep pagination and rate limits intact.
3. Confirm the target using non-secret profile details. Do not ask for seed phrases, private keys,
   access tokens, passwords, or full wallet challenge messages.
4. Record only the Admin player ID needed for the case. Do not paste wallets, emails, IP addresses,
   moderation evidence, or session material into general chat.

## Suspend and restore

Suspension is for policy enforcement or containment, not support convenience. Verify target,
evidence, scope, duration, reason, and `players.suspend`. Use AAL2 and the current state/revision.
Confirm active access is denied and related sessions are revoked when policy requires it.
Restoration is a separate decision: verify the issue is resolved, record reviewer approval, use the
protected restore action, and confirm audit history remains intact.

## Session revocation

For suspected account compromise, revoke player access sessions with `players.sessions.revoke`,
AAL2, target confirmation, and a case/incident reason. Revocation is irreversible; the player
authenticates again. If an administrator may be compromised, use the security-incident runbook and
revoke admin sessions/credentials through the dedicated controls.

## Rename intervention

Use a forced rename for policy-invalid display names or a direct administrative rename only when
policy permits. Capture the reason and previous/new safe names, use the expected state, and verify
map entry remains blocked while rename is required. Never change an immutable identity or wallet
association as a rename shortcut.

## Inventory and DUST cases

Inspect before changing. DUST corrections require separation of duties and an immutable ledger
settlement. Inventory uses typed domain-specific grant/revoke actions; there is no unrestricted
inventory editor. Follow the economy correction runbook and reference the case ID in every reason.
An inverse correction is a new audited action, not deletion of the original.

## Privacy and closure

Evidence should use internal IDs, bounded timestamps, request IDs, and redacted screenshots. Apply
the future support provider's retention policy and least-privilege groups. At closure, record the
outcome, mutations, reviewer, player communication, follow-up, and whether monitoring or an incident
is required.
