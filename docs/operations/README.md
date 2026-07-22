# Starville operations handbook

This is the canonical operator entry point for the Phase 13C production-preparation candidate.
Runbooks describe safe execution and recovery, but do not authorize a hosted change. Production
commissioning begins only in Phase 13D after the named owner has supplied and approved the target,
credentials, domain, provider, and evidence.

## Before any operation

1. Confirm the incident, release, or support case identifier and responsible owner.
2. Confirm the exact environment and reject any mismatch. `starville-dev` and `starville-prod` must
   use different Supabase project refs, domains, secrets, wallets, and provider projects.
3. Keep remote-write, hosted-test, and admin-bootstrap safety gates false during inspection and
   configuration validation.
4. Use least privilege and AAL2. Never share credentials, token contents, wallet challenge material,
   player private data, or database URLs in evidence.
5. Record the reason, expected revision/idempotency key, before state, result, and rollback
   decision.
6. Stop on stale revisions, unexpected row counts, target mismatch, incomplete backup evidence, or
   missing owner approval.

## Runbook index

- [Environment and deployment preparation](environment-and-deployment.md)
- [Phase 13D commissioning](phase-13d-commissioning.md)
- [Phase 13D owner command checkpoints](../deployment/phase-13d-owner-commands.md)
- [Maintenance and announcements](live-operations.md)
- [World and asset publication](world-and-assets.md)
- [Closed-beta operations](closed-beta-operations.md)
- [Player support](player-support.md)
- [Moderation](moderation.md)
- [Economy corrections and reconciliation](economy-corrections-and-reconciliation.md)
- [Incidents, security events, and outages](incidents-and-outages.md)
- [Backup, restore, and rollback](backup-restore-and-rollback.md)
- [Observability, health, and readiness](observability-and-health.md)
- [Governance, approvals, and evidence](release-governance-and-evidence.md)

## Status language

Operators use only `ready`, `ready with limitations`, `missing`, or `blocked` for capabilities.
Releases use local-candidate, hosted-validation-pending, owner-acceptance-pending,
commissioning-pending, or accepted. “Production-ready,” “live,” “healthy,” and “complete” require
direct evidence for the exact production artifact and environment.

The Admin Portal page `/operations/release-live-ops` summarizes the repository-backed matrix. It is
read-only and cannot replace this handbook, provider evidence, or owner judgment.

The Phase 13D page `/operations/production-release-candidate` keeps local, production, owner,
browser/device, accessibility, visual, and audio evidence distinct and currently reports Stage A
blocked and Phase 14 NO-GO.
