# Phase 13D owner command checkpoints

These commands are prepared for an authorized owner; Codex did not run them. Stage A is currently
blocked, so **none of the production blocks is approved for execution yet**. Use one exact reviewed
commit and provider-injected environment values. Never paste secrets into command arguments, logs,
chat, issue trackers, or tracked files.

Set `PHASE13D_EVIDENCE_DIR` to an owner-controlled absolute directory outside the repository with
mode `0700`. Every `tee` target below contains masked or reviewed command output, not credentials.
Stop on the first unexpected line, nonzero exit, target mismatch, migration drift, authorization
failure, missing backup, or owner rejection.

## 1. Production target verification

Purpose: prove the local Supabase link, URL, database URL, Reown identity, mainnet token identity,
manifest version, and closed safety gates all describe `starville-prod`. Risk: a wrong link could
direct every later command at the wrong project.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm exec supabase --workdir infrastructure link --project-ref "${SUPABASE_PROJECT_REF:?set approved production project ref}"
pnpm production:verify-target | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/01-target.txt"
```

Expected: masked identity lines ending `PRODUCTION TARGET VERIFIED`; all three gates are `false`.
Stop on any mismatch or missing owner value. Rollback: none; this is local/read-only verification.
The link command changes only the canonical local CLI target and does not mutate database contents.
Evidence: `01-target.txt`, exact commit, linked-project review, and two-owner target approval.

## 2. Migration inspection

Purpose: capture the remote ledger without applying anything and require a clean initial production
state. Risk: an unknown remote migration means the target is not the expected clean project.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm db:migrations:list | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/02-migrations-before.txt"
pnpm db:migrations:dry-run | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/02-migration-dry-run.txt"
pnpm production:migrations:compare -- --input "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/02-migrations-before.txt" --expect empty
```

Expected: target verified, 85 local rows, zero remote rows, no unknown migration, and an 85-file
dry-run. Stop if production is not clean or the plan differs from the frozen manifest. Rollback:
none. Evidence: list, dry-run, manifest SHA-256, reviewer, and approval time.

## 3. Migration push

Purpose: apply the exact reviewed 85-migration chain. Risk: forward database mutation. The prefix
sets approval for this process only; it does not persist the gate.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
SUPABASE_REMOTE_WRITES_APPROVED=true pnpm db:migrations:push | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/03-migration-push.txt"
```

Expected: every planned migration applies once with no reset, edit, unknown migration, or pending
file. Stop after any failure; preserve output and do not rerun blindly. Rollback limitation: contain
the release, diagnose retry safety, then use a forward repair migration or provider restore. Never
edit an applied migration. Evidence: owner approval, target evidence, push output, timestamps.

## 4. Gate reset

Purpose: prove the ephemeral mutation approval did not persist. Risk: an enabled gate is an
immediate commissioning stop.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/04-gates-closed.txt"
```

Expected: remote-write, hosted-test, and bootstrap gates all `false`. Stop if any is true. Rollback:
remove the value from the provider/runtime, restart affected private service, and verify again.
Evidence: `04-gates-closed.txt` and provider configuration review.

## 5. Migration reinspection

Purpose: require exact post-push parity. Risk: pending or unknown remote state invalidates every
later checkpoint.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm db:migrations:list | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/05-migrations-after.txt"
pnpm production:migrations:compare -- --input "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/05-migrations-after.txt" --expect exact
```

Expected: 85 local and 85 remote timestamps in frozen order. Stop on pending, duplicate, or unknown
state. Rollback limitation: forward repair or isolated provider restore only. Evidence: comparison
output and migration ledger screenshot/export.

## 6. Database lint

Purpose: run the reviewed public/private schema lint. Risk: read-only inspection may reveal a
production defect that blocks release.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm db:lint:hosted | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/06-database-lint.txt"
```

Expected: zero warnings and errors. Stop on every warning unless a named owner records a reviewed
exception. Rollback: none. Evidence: full safe lint output and accepted-exception record if any.

## 7. pgTAP

Purpose: run the fixed transaction-wrapped database suite. Risk: approved temporary test activity;
the script requires explicit hosted-test approval and rolls SQL suites back.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/07-pgtap.txt"
pnpm production:verify-target
```

Expected: every reviewed suite reports `status=ok`, then all gates are false. Stop on a failed plan,
cleanup failure, or target mismatch. Rollback: preserve evidence and verify no fixture remains
before any retry. Evidence: TAP totals, suite names, cleanup result, target/commit.

## 8. RLS and authorization

Purpose: validate RLS, FORCE RLS, roles, grants, AAL2, protected publication, service-role boundary,
and fixture cleanup. Risk: temporary owner-approved Auth/database fixtures.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/08-rls.txt"
pnpm production:verify-target
```

Expected: all authorization scenarios pass, cleanup completes, and gates return false. Stop on any
RLS, grant, cross-player, non-admin, AAL2, or cleanup failure; that result is NO-GO. Rollback: close
services, preserve logs, remove only documented fixture identities through the reviewed cleanup
path. Evidence: safe test summary and cleanup identifiers stored privately.

## 9. Reference seed preview

Purpose: review the exact catalog allowlist before treating migration-installed references as
production. Risk: none; this reads tracked manifests only.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:audit
jq '{status,policy,sources}' infrastructure/deployment/manifests/production-reference-seeds.v1.json | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/09-seed-preview.json"
jq '{status,globalRestrictions,catalogs}' infrastructure/deployment/manifests/production-reference-catalogs.v1.json | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/09-catalog-preview.json"
```

Expected: production execution false; no player/admin/wallet/dev/QA data; V2/V3 excluded; Animal
Care false. Stop on manifest/hash drift. Rollback: none. Evidence: both reviewed JSON outputs and
owner decision.

## 10. Reference seed execution

Purpose: identify the only authorized installation event. Risk: repeating or inventing an ad hoc
seed could create unversioned production data.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
test -s "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/03-migration-push.txt"
pnpm production:audit
```

Expected: success confirms only that the reviewed B3 evidence exists and local manifests are valid.
There is deliberately **no standalone production seed mutation command**: the frozen migration chain
installs all eligible references. Do not rerun migrations or paste seed SQL. Stop if an owner
expects additional rows; create a reviewed forward migration instead. Rollback: forward catalog
version or provider restore. Evidence: B3 output plus exact expected-key verification in block 11.

## 11. Seed verification

Purpose: use the reviewed hosted database suite to verify required catalogs, no prohibited player
state, idempotency, and constraints after installation. Risk: the same bounded test-fixture risk as
block 7.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/11-seed-verification.txt"
pnpm production:verify-target
```

Expected: required catalog assertions pass, no duplicate/prohibited record is reported, cleanup
passes, Animal Care stays disabled, and gates are false. Stop on count/key drift. Rollback: forward
repair or restore. Evidence: suite output plus owner-reviewed catalog query/export without PII.

## 12. Super Admin bootstrap

Purpose: create the first production Super Admin from an existing owner-approved Auth UUID. Risk:
highest-privilege one-time mutation. The Auth user must already be email-verified with a verified
TOTP factor; never place credentials in this command.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm admin:bootstrap -- --dry-run --user-id="${PHASE13D_ADMIN_USER_ID:?set approved Auth UUID}" --display-name="${PHASE13D_ADMIN_DISPLAY_NAME:?set approved display name}" --project-ref="${SUPABASE_PROJECT_REF:?set approved production project ref}" --require-mfa=true
SUPABASE_REMOTE_WRITES_APPROVED=true ADMIN_BOOTSTRAP_ENABLED=true pnpm admin:bootstrap -- --apply --confirm-production --user-id="${PHASE13D_ADMIN_USER_ID:?set approved Auth UUID}" --display-name="${PHASE13D_ADMIN_DISPLAY_NAME:?set approved display name}" --project-ref="${SUPABASE_PROJECT_REF:?set approved production project ref}" --require-mfa=true | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/12-admin-bootstrap.txt"
```

Expected: preview allowed, apply reports only operation and `super_admin`, with no secret or full
identity echoed. Stop on target, TOTP, existing-super-admin, or expected-state refusal. Rollback: do
not delete audit history; disable/recover through the approved administrator incident procedure.
Evidence: masked output, Auth/AAL2 proof stored privately, role record, audit request ID.

## 13. Bootstrap shutdown

Purpose: prove one-time bootstrap cannot remain active or run twice. Risk: leaving either gate true
is NO-GO.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/13-bootstrap-shutdown.txt"
pnpm admin:bootstrap -- --dry-run --user-id="${PHASE13D_ADMIN_USER_ID:?set approved Auth UUID}" --display-name="${PHASE13D_ADMIN_DISPLAY_NAME:?set approved display name}" --project-ref="${SUPABASE_PROJECT_REF:?set approved production project ref}" --require-mfa=true
```

Expected: all gates false and second preview refused because an active Super Admin exists. Also
owner-tests unauthenticated/wrong identity rejection through the reviewed procedure. Stop if preview
allows a second creation. Rollback: disable provider bootstrap variables and affected private
service immediately. Evidence: output, provider setting review, audit record.

## 14. Health checks

Purpose: verify private production processes are alive without opening player access. Risk: using a
public/unprotected endpoint before authorization.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
curl --fail --silent --show-error "${NEXT_PUBLIC_API_URL:?set approved API URL}/health" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/14-api-health.json"
curl --fail --silent --show-error "${REALTIME_HEALTH_URL:?set approved private Realtime health URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/14-realtime-health.json"
curl --fail --silent --show-error "${WORKER_HEALTH_URL:?set approved private Worker health URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/14-worker-health.json"
```

Expected: bounded, redacted healthy responses with correlation/build identity and no credentials,
paths, SQL, PII, or chat. Stop on public exposure or identity mismatch. Rollback: keep admission
closed and roll back the affected service artifact. Evidence: responses and provider deployment IDs.

## 15. Readiness checks

Purpose: verify dependencies, migration compatibility, catalogs, RPC, and worker lease. Risk:
mistaking liveness for readiness.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
curl --fail --silent --show-error "${NEXT_PUBLIC_API_URL:?set approved API URL}/ready" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/15-api-ready.json"
curl --fail --silent --show-error "${REALTIME_HEALTH_URL:?set approved private Realtime ready URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/15-realtime-ready.json"
curl --fail --silent --show-error "${WORKER_HEALTH_URL:?set approved private Worker ready URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/15-worker-ready.json"
```

Expected: every dependency ready and target/build identity aligned. Stop on `unknown`, stale,
misconfigured RPC/catalog, or mixed environment. Rollback: maintain the access lock and roll back or
repair the affected dependency. Evidence: responses, timestamps, monitor screenshots.

## 16. Private release-candidate service validation

Purpose: confirm Landing, Game, and Admin return reviewed production builds behind provider
protection. Risk: accidental public exposure.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
curl --fail --silent --show-error --head "${NEXT_PUBLIC_LANDING_URL:?set approved Landing URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/16-landing-headers.txt"
curl --fail --silent --show-error --head "${NEXT_PUBLIC_GAME_URL:?set approved Game URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/16-game-headers.txt"
curl --fail --silent --show-error --head "${NEXT_PUBLIC_ADMIN_URL:?set approved Admin URL}" | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/16-admin-headers.txt"
```

Expected: exact TLS hosts, reviewed CSP/CORS/cookies, provider protection or server-side
maintenance, no debug/source maps, and no public admin signup. Stop if public admission is possible.
Rollback: restore provider protection/maintenance or roll back the deployment. Evidence: headers and
private browser session record.

## 17. World publication

Purpose: publish only the product-owner-approved immutable revision through the protected Admin
workflow. Risk: production content mutation. This block is unavailable until the commissioning
manifest contains the signed revision ID.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm production:audit
```

Expected today: `STAGE A BLOCKED`. Stop and do not publish. After Stage A is reissued as ready, the
owner uses Admin `/worlds`, verifies exact revision/Game Test/AAL2/expected revision, and confirms
one audited publish action. No direct SQL is allowed. Rollback: publish the reviewed prior immutable
revision. Evidence: revision IDs, validation, actor, reason, request/audit IDs.

## 18. Asset activation

Purpose: retain bundled V1 or activate only individually accepted overrides. Risk: visual,
collision, anchor, provenance, and runtime breakage.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm assets:validate
pnpm audio:validate
```

Expected: manifests and audio validate; today the product owner selection is pending. Stop and do
not activate. Once accepted, use Admin `/world-assets/review` with AAL2 and expected revision for
each stable key. Never bulk-activate uploads. Rollback: protected bundled-default restore or
accepted prior version. Evidence: keys, versions, hashes, provenance/license, actor, audit IDs,
Game/Composer validation.

## 19. QA cleanup

Purpose: classify production RC data without erasing required audit evidence. Risk: irreversible
data loss or ledger corruption.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:verify-target
pnpm production:audit
```

Expected today: Stage A blocked and Stage D not started. Stop; no cleanup command is authorized.
After Stage C, the database/economy/security owners produce a private record-by-record
retain/anonymize/ reset/archive/delete decision and use existing audited domain workflows. Never
delete ledgers, commissioning audit, or moderation evidence directly. Rollback: restore only from an
approved isolated recovery point where applicable. Evidence: inventory, approvals, before/after
reconciliation, and audit IDs.

## 20. Release freeze

Purpose: bind every accepted input to one immutable release. Risk: freezing incomplete or mismatched
evidence.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:audit
jq . infrastructure/deployment/manifests/release-freeze.v1.json | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/20-release-freeze.json"
git diff --check
```

Expected today: `frozen=false`. Stop. After Stages A–D and rollback evidence, the release manager
updates the manifest through reviewed repository work, reruns every affected gate, and the owner
creates the exact commit. Codex does not stage or commit. Rollback: reopen the freeze and reevaluate
GO/NO-GO. Evidence: signed manifest, commit, dependency lock, artifacts, approvals.

## 21. Final evidence capture

Purpose: assemble safe final evidence without converting missing gates into passes. Risk: leaking
secrets/PII or issuing GO from local output.

```sh
cd -- '/Users/marklesteracak/Documents/Marky Files/Programming/starville'
pnpm production:audit | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/21-stage-status.txt"
pnpm release:validate | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/21-local-release-validation.txt"
pnpm security:scan | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/21-security-scan.txt"
git diff --check | tee "${PHASE13D_EVIDENCE_DIR:?set an owner-controlled evidence directory}/21-diff-check.txt"
```

Expected today: Stage A blocked, production false, Phase 14 NO-GO. Stop if output contains a secret,
PII, raw SQL/stack, private chat, or unexplained pass. Rollback: quarantine/redact the evidence and
rotate any exposed credential. Evidence: the complete bundle with repository, local, production,
owner, browser, device, accessibility, visual, and audio classes kept distinct.
