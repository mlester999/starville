# Incident, security event, and service outage runbook

Phase 13C does not select an incident-management provider. Until the owner approves one, use an
access-controlled, timestamped external record. The absence of an in-product incident table must not
lead to sensitive evidence being placed in announcements, Git, or general chat.

## Severity

| Severity | Definition                                                                                         | Initial response target | Default leadership                              |
| -------- | -------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| SEV-1    | active compromise, irreversible-data risk, widespread unavailability, or economy integrity failure | immediate               | incident commander + security/production owners |
| SEV-2    | major feature unavailable, serious abuse, bounded data inconsistency, or high-risk degradation     | 15 minutes              | incident commander + affected owner             |
| SEV-3    | limited degradation or operational defect with safe workaround                                     | 1 hour                  | service owner                                   |
| SEV-4    | minor defect/request without current player or security impact                                     | next business cycle     | backlog owner                                   |

Targets are planning values until owners approve staffing and paging. Never claim an SLA without
that approval.

## Common response

1. Open the incident record; assign incident commander, operations lead, communications lead, and
   affected technical owners. Record detection time, exact environment, known symptoms, and evidence
   sources.
2. Classify severity and blast radius. Preserve logs, revisions, deployment/migration IDs, request
   IDs, worker leases, and provider event data. Do not collect more player data than needed.
3. Contain with the narrowest safe action: enable maintenance, block admission, stop a worker,
   revoke sessions/credentials, suspend a target, disable a live configuration, restore V1 assets,
   or roll back an artifact.
4. Establish an update cadence. Public messages contain confirmed player impact and safe next-update
   timing, never root-cause speculation or secrets.
5. Diagnose from health/readiness, provider status, database locks/limits, logs/metrics, audit
   records, recent deployments/migrations, and invariant/reconciliation results.
6. Recover through the service-specific runbook. Validate health and representative player journeys
   before removing maintenance.
7. Monitor, close with owner approval, rotate exposed credentials, and produce a blameless
   postmortem with actions, owners, and dates.

## Security incidents

For exposed credentials, revoke/rotate first where safe, invalidate affected sessions, restrict
provider access, preserve access/audit logs, and search for misuse. A service-role key is never put
in browser code, screenshots, tickets, or chat. For administrator compromise, revoke sessions,
suspend authorization, review role/audit changes, and use two-owner recovery. For wallet/token
incidents, Starville never requests seed phrases or signs transactions; contain Reown/RPC origins
and server token verification independently.

For suspected RLS/authorization bypass, enable maintenance if exposure is ongoing, preserve
queries/request IDs, revoke access, compare policies/grants/functions to the approved
manifest/commit, and test in isolation. Do not “investigate” with broad production SELECTs or export
player tables.

## Service outages

- Supabase/database: fail closed on authoritative mutations; stop dependent workers; check provider
  status, connection limits, locks, and backup state. Never switch to a different project
  implicitly.
- Auth: block admission/mutations requiring identity; existing sessions must follow revalidation
  policy. Do not bypass auth for continuity.
- API: keep Game in a recoverable unavailable state; roll back immutable artifact/configuration
  after target verification.
- Realtime: prevent false presence/activity; reconnect with backoff and server admission; gameplay
  settlement remains API/database authoritative.
- Worker: stop new claims, allow lease expiry, inspect idempotency/effect receipts, then restart one
  approved artifact.
- Reown/RPC: wallet sign-in fails safely; never weaken signature, nonce, network, mint, or token
  checks.
- Storage/assets: use validated bundled V1 fallback; reject untrusted/external URLs.
- DNS/TLS/provider: keep alternate links out of announcements until ownership and certificates are
  verified.

## Evidence and communications

Every timeline entry has UTC time, actor, evidence link, decision, result, and next check. Redact
player identity and secret-bearing headers/URLs. Legal/privacy notification, status-page use, and
external disclosure require the relevant owners; the runbook does not invent those obligations.
