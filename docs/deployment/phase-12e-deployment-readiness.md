# Phase 12E deployment-readiness checklist

Status: **PREPARED, NOT APPROVED, NOT EXECUTED**.

This is an owner-controlled checklist for a future reviewed deployment. It is not a deployment
instruction to run now, it does not approve V2 activation or world publication, and every decision
item is intentionally unchecked.

## Current blockers

- The shared working tree contains preserved, uncommitted Phase 12C/12D/hotfix/pgTAP/12E work.
- Hosted lint, pgTAP, RLS, and service validation are not recorded as passed.
- The Phase 12E owner-acceptance checklist is not started.
- V2 is still a `production_candidate`; V1 remains the published/unpinned default.
- Current procedural audio is `development_safe`; owner listening and any production-audio
  replacement remain pending.
- Production monitoring ownership and a reviewed deployment record do not exist for this candidate.

## Source-control gate

- [ ] Reconcile every changed and untracked path against the intended Phase 12E file list.
- [ ] Review the complete diff for unrelated or user-owned changes.
- [ ] Confirm `git diff --check` passes.
- [ ] Create and review a deliberate commit only after owner approval.
- [ ] Confirm the deployment revision exactly matches the reviewed commit.
- [ ] Confirm the deployment worktree is clean.

The current dirty worktree is local evidence, not a deployable source-control state. Phase 12E did
not commit or push it.

## Database and hosted gates

- [ ] Verify the intended Supabase environment and project reference.
- [ ] Review the complete migration list.
- [ ] Run the approved migration dry run.
- [ ] Confirm Phase 12E itself needs no new migration.
- [ ] Review the three preserved, unpushed Phase 12 repair/composition/registry migrations.
- [ ] Run hosted database lint through the protected command.
- [ ] Run the repaired hosted pgTAP suite and attach the exact TAP result.
- [ ] Run hosted RLS validation for anonymous, player, administrator, and service boundaries.
- [ ] Confirm no bootstrap, maintenance, activation, publication, or migration-push flag is enabled
      unintentionally.

No hosted database command in this section was run by Phase 12E.

## Build and security gates

- [ ] Run `pnpm env:check` against the intended deployment environment.
- [ ] Run `pnpm assets:check` against the reviewed V1 and V2 manifests.
- [ ] Run `pnpm audio:validate` and review the zero-byte procedural catalog provenance.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- [ ] Run `pnpm build` and start the built API/realtime bundles in an isolated smoke environment.
- [ ] Run `pnpm security:scan` and review browser output for server-only values.
- [ ] Review dependency, container/runtime, CSP, CORS, cookie, and rate-limit configuration.

## Application and service gates

- [ ] Deploy Landing, Game Client, Admin Portal, API, realtime, and worker only from the reviewed
      revision.
- [ ] Confirm Landing and Game Client public routes return the expected release.
- [ ] Confirm the Admin Portal login route works and protected readiness routes fail closed.
- [ ] Confirm API `/health` and `/ready` are healthy.
- [ ] Confirm realtime `/health` and `/ready` are healthy with expected connection limits.
- [ ] Confirm worker `/health` and `/ready` are healthy and every registered job has an explicit
      maintenance policy.
- [ ] Confirm wrong-environment, missing-migration, persistence, realtime, asset-registry, and
      world-manifest failures are safe and sanitized.

## Signed-in acceptance gate

- [ ] Complete every item in `phase-12e-owner-acceptance.md` against the exact reviewed revision.
- [ ] Complete the integrated 23-step protected Game Test scenario.
- [ ] Complete the required viewport, keyboard, screen-reader, physical touch, 200-percent browser
      zoom, Reduced Motion, and forced/increased-contrast review.
- [ ] Complete a real 30-minute session with world transitions, reconnects, and repeated modal use.
- [ ] Record desktop/mobile frame time, memory, listeners, timers, textures, asset requests, and
      fallback counts.
- [ ] Confirm normal play still resolves V1 and has no public candidate override.

## V2 decision gate

- [ ] Review exact V1/V2 affected keys, media, checksums, classifications, fallbacks, anchors,
      scale, collision parity, world previews, and immutable pins.
- [ ] Record an explicit **keep V1** or **approve a separate V2 activation change** decision.
- [ ] If activation is later approved, require the narrow permission, AAL2, reason, expected
      revision, idempotency key, preview, immutable audit record, and runtime verification.
- [ ] Keep world publication a separate protected decision from asset activation.

This checklist does not contain an activation control and Phase 12E did not activate V2.

## Rollback and maintenance gate

- [ ] Name the rollback owner, incident lead, database reviewer, and service owners.
- [ ] Confirm the forward-only V1 reactivation/repinning procedure.
- [ ] Confirm immutable asset/world history and audit records remain preserved.
- [ ] Confirm rollback preserves inventory, DUST, progression, housing, social, and visit state.
- [ ] Complete the remaining integrated maintenance drill, including existing websocket closure,
      true-to-false resume, and database settlement/inventory/DUST invariants.
- [ ] Confirm one clean reconnect after maintenance and no duplicated presence, listener,
      settlement, or audio loop.

## Monitoring and release decision

- [ ] Confirm sanitized logs and request correlation for access, world entry, gameplay, economy,
      progression, housing, home visits, recovery, and candidate/fallback events.
- [ ] Confirm service health, error rate, latency, reconnect, asset failure, worker lag, and
      database monitoring ownership.
- [ ] Confirm Game Test and development diagnostics do not enter production analytics.
- [ ] Define rollback thresholds and the post-release observation window.
- [ ] Record **APPROVE**, **APPROVE WITH LIMITATIONS**, or **REJECT** with reviewer, time, revision,
      evidence, and reason.

Until all applicable gates are reviewed, the truthful deployment state remains **not approved and
not executed**.
