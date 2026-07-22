# Release governance, approvals, and evidence

## Change classes

- Routine reversible content: scheduled announcements and accepted version selection within approved
  policy.
- Elevated operations: maintenance, moderation, player/session intervention, world/asset
  publication, worker/reconciliation control.
- Financial/inventory integrity: DUST and typed inventory corrections with separation of duties.
- Security/identity: administrator roles, credentials, auth policy, RLS/grants/functions,
  Reown/RPC/mint configuration.
- Production commissioning: domains, provider, Supabase target, migrations, seed/reference
  selection, first administrator, admission, backup/restore.

The higher class governs when a change touches multiple categories. Emergencies may shorten
scheduling, not remove target verification, least privilege, audit, or post-event review.

## Approval rules

Every mutation names requester/operator, independent approver where required, exact target, intended
artifact/version, case/change/incident ID, reason, expected result, validation, rollback, and
observation window. AAL2 is required for protected mutations. DUST correction requester and reviewer
must differ. Production migration/restore, first-admin bootstrap, security-boundary changes, and
launch admission require two-owner review.

Owner acceptance is an explicit signed decision; passing automation cannot set it. A missing
decision stays missing. Acceptance applies only to the recorded commit/artifact, manifest hashes,
environment, and date.

## Evidence bundle

The bundle must contain:

- branch, approved commit, working-tree classification, artifacts and hashes;
- Phase 12E visual/audio and Phase 13A gameplay owner results;
- Phase 13B security, RLS, authorization, concurrency, multiplayer, load, and hosted results;
- production environment manifest validation without values;
- migration manifest and clean-chain/starville-dev ledger comparison;
- reference seed plan and proof that no player/test/secret data is included;
- domain/TLS/CORS/CSP/security-header and source-map checks;
- Reown/mainnet wallet and token-gate evidence;
- health/readiness/monitor/paging and log-redaction evidence;
- backup/PITR policy and isolated restore rehearsal;
- world/asset selection and fallback/rollback rehearsal;
- maintenance/announcement, service rollback, worker/reconciliation, support/moderation, and economy
  correction rehearsal;
- responsive, keyboard, reduced-motion, mobile safe-area, and representative gameplay checks;
- owner sign-offs, unresolved limitations, launch/abort decision, and post-launch observation
  record.

Evidence contains safe references, outputs, counts, timestamps, and redacted screenshots. It
excludes environment values, JWTs, cookies, access/refresh tokens, service-role keys, database URLs,
provider credentials, RPC credentials, private keys, signatures/nonces, full emails/wallets/IPs, raw
player exports, and private moderation/support content.

## Release states

1. Local candidate: repository validation complete; hosted and owner gates may remain.
2. Hosted validation pending/passed: exact `starville-dev` artifact evidence recorded.
3. Owner acceptance pending/accepted: named human decisions recorded.
4. Commissioning pending/in progress/aborted: production preparation is being applied under Phase
   13D.
5. Production accepted: exact production smoke/recovery/monitoring evidence and launch decision
   recorded.

No state may skip forward. “Locally ready” never means production configured. Any manifest drift,
credential exposure, target ambiguity, missing backup, unaccepted world/assets, or failed invariant
returns the release to blocked.

## Retention and review

The owner selects evidence and incident systems with access groups, retention, export,
deletion/legal-hold, and audit controls. Review privileged roles, production secrets,
domains/provider access, Reown/Supabase members, alerts, backups, runbooks, and restoration evidence
on a defined cadence. Remove leavers and obsolete credentials promptly.
