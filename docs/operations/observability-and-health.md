# Observability, health, and readiness runbook

## Signal model

Health answers whether a process can respond. Readiness answers whether it can safely serve its
assigned role. Neither implies that gameplay, economy, wallet, or hosted configuration is accepted.
Production monitor destinations and thresholds require Phase 13D owner configuration.

Minimum service signals:

- Landing/Admin/Game: deployment availability, error rate, response latency, security headers,
  CSP/CORS violations, browser exceptions, asset failures, and source-map absence.
- API: process health, database/Supabase dependency readiness, request rate/latency/error, auth
  denials, rate limiting, idempotency conflicts, and redacted structured logs.
- Realtime: admission readiness, active/stale server-admitted sessions, channel capacity,
  reconnects, heartbeat cleanup, maintenance impact, and safe disconnect reasons. Never infer
  “online players” from stored profiles.
- Worker: instance readiness, claim count, lease age/expiry, attempts, completion/failure, queue
  depth/oldest age, reconciliation mismatches, and graceful shutdown.
- Database: connection saturation, locks/long queries, CPU/storage, backup/PITR state, migration
  drift, policy/grant anomalies, function errors, and ledger/inventory invariants.
- Wallet/token gate: Reown provider failure, challenge issuance/expiry/replay,
  signature/network/mint rejection, RPC latency/failure, token rechecks, and fail-closed admission.
  Never log signatures, nonces, tokens, or full wallet identifiers.

## Probe rules

Public `/health` is shallow, bounded, credential-free, non-cacheable, and reveals no
topology/secrets. Readiness may check required dependencies with strict timeouts and safe status
names. It must not mutate data, run expensive table scans, expose connection details, or mark a
service ready when its authoritative dependency is unavailable.

Deployment providers use health/readiness for rollout decisions. Application dashboards consume
bounded server-produced summaries. A missing signal is `unknown`, not healthy and not zero.

## Alert preparation

For each alert, Phase 13D records query, threshold, duration, severity, owner/on-call destination,
runbook link, deduplication, maintenance suppression, test evidence, and recovery condition. Start
with symptoms: admission failure, sustained 5xx, database saturation, queue age, reconciliation
mismatch, auth/token verification failure, and backup failure. Avoid high-cardinality labels
containing player/admin/wallet/request secrets.

Test alerts against `starville-dev` and a non-paging destination first. Acknowledgement is not
resolution. Track detection, acknowledgement, containment, recovery, and close times in the incident
record.

## Release and launch checks

Before opening admission, verify all services ready, exact artifact revisions, exact
domains/origins, TLS, production target match, maintenance behavior, logs/metrics flow, paging test,
database backup, migration ledger, worker leases, Realtime admission, auth/wallet/token flows,
current world/assets, and a representative server-authoritative gameplay journey. Observe a defined
post-launch window with owners present.

If telemetry is unavailable or redaction is unverified, keep admission closed. Do not enable debug
logging or public source maps in production as a workaround.
