# Phase 13D commissioning and owner acceptance

Phase 13D is the first phase permitted to perform an owner-approved production connection. This
checklist is a sequence of independent gates, not a blanket authorization. Stop after any failed
step.

## Required owners

- Production owner: provider, domains, commissioning window, launch/admission decision.
- Database owner: Supabase target, backups, migration ledger, clean chain, restore rehearsal.
- Security owner: secret delivery, headers/CSP/CORS, RLS/grants, scan, incident contacts.
- Wallet integration owner: Reown production project, origins, mainnet RPC/mint.
- Product owner: gameplay, responsive, world, asset, visual, audio, and copy acceptance.
- Operations owner: live-operations permissions, paging, maintenance, announcements,
  support/moderation coverage.
- Economy owner: DUST/inventory invariants, correction reviewers, reconciliation readiness.

One person may hold multiple roles only when the correction or publication workflow does not require
separation of duties.

## Exact commissioning sequence

1. Freeze the approved branch and commit; record a clean or fully inventoried tree and artifact
   hashes.
2. Complete the evidence bundle. Every item must be `present` or `accepted`; no missing blocker may
   remain.
3. Supply exact production domains, deployment provider, Supabase project ref, Reown project, Solana
   network/RPC/mint, and secret owners through approved secret channels.
4. Validate the candidate configuration offline with all write/bootstrap gates false. Independently
   compare URL host, configured project ref, database host, and approved production ref.
5. Confirm provider backup retention, point-in-time recovery availability, restoration permissions,
   recovery objectives, and a fresh recoverable point.
6. Rehearse the exact 85-entry manifest from empty state in `starville-dev`. Compare names, order,
   hashes, lint, extensions, RLS/FORCE RLS, grants, function ownership/search paths, and database
   tests.
7. Run the production migration dry-run against the verified target. A second owner reviews the plan
   and exact commit. Enable only the narrow migration gate for the single approved command; disable
   it immediately afterward.
8. Validate schema invariants before reference publication. Do not insert player, wallet, inventory,
   DUST, moderation, support, or synthetic account data.
9. Bootstrap the first production administrator only through the existing CLI after the Auth user
   exists, the email is approved, AAL2 is enrolled, roles are reviewed, the bootstrap phrase is
   typed, and the target is reverified. Disable the bootstrap gate immediately and preserve audit
   evidence.
10. Deploy server artifacts with public admission closed. Verify health/readiness, CORS, security
    headers, source-map absence, secret-boundary scan, log redaction, worker lease behavior, and
    Realtime admission.
11. Deploy Admin, Game, and Landing. Complete responsive/keyboard/reduced-motion, wallet, auth,
    token gate, onboarding, gameplay, reconnect, maintenance, and bundled-fallback smoke tests.
12. Through protected Admin workflows, select the accepted production world and asset versions. V1
    remains the fallback. Do not activate V2 or V3 without recorded owner acceptance.
13. Run read-only economy, inventory, player, content, RLS, grants, reconciliation, and
    observability checks. Run one explicitly approved synthetic operational rehearsal only if the
    owner has provided an isolated account and cleanup/evidence plan.
14. Rehearse maintenance, announcement deactivation, service rollback, world rollback, asset
    restore, worker stop, and incident escalation. Rehearse database restore only in an isolated
    project.
15. Collect sign-offs. The production owner decides whether to open admission. Remove maintenance
    last and monitor the agreed launch window.

## Abort conditions

Abort on target ambiguity, manifest drift, unavailable backup, incomplete restore access, unexpected
grants/policies, missing AAL2, unknown provider origin, public source map, secret-shaped output,
reconciliation mismatch, owner rejection, or material smoke-test failure. Keep admission closed,
disable all gates, preserve logs and artifacts, and follow the appropriate rollback/incident
runbook.

## Production administrator recovery

Recovery never creates public admin registration or promotes a player automatically. Verify two
authorized owners, the exact target, the Auth identity, AAL2, role scope, and incident/change
identifiers. Use the documented recovery CLI with its narrow gate and typed confirmation, then
disable the gate and review the immutable audit event. Revoke sessions and credentials if compromise
is suspected.
