# Phase 9B-A Token Claim Incident Response

> **Architecture-only status:** Token claims are disabled. Phase 9B-A creates no signer, key,
> transaction, on-chain deployment, hosted write, published configuration, or database migration.
> These are prospective runbooks and tabletop procedures. They do not authorize touching a live
> treasury or hosted environment.

## Purpose and activation rule

These runbooks define the minimum response expected if a future approved claim system exists. During
Phase 9B-A, any exercise uses synthetic fixtures only. If an alert occurs now, responders first
confirm that the claim feature remains disabled and investigate the adjacent wallet-access,
identity, administration, deployment, or infrastructure boundary without pretending a token
transaction exists.

An incident commander may invoke a future emergency pause under the pre-approved authority matrix.
Pausing does not authorize a transfer, key rotation, rollback, deletion, or public statement. Those
actions follow their own approval paths.

## Roles

| Role                | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| Incident commander  | Owns severity, containment, timeline, decisions, and handoffs                 |
| Security lead       | Investigates compromise, evidence, credentials, and attacker path             |
| Treasury lead       | Protects reserves and multisig governance; validates on-chain evidence        |
| Application lead    | Protects API, worker, database, deployment, and claim state                   |
| Reconciliation lead | Establishes intent, authorization, transaction, program, and balance truth    |
| Legal/privacy lead  | Directs privilege, sanctions, notification, retention, and regulator analysis |
| Communications lead | Produces approved internal and external messages                              |
| Support lead        | Handles player reports without promising reversals or compensation            |

No person should investigate and approve their own sensitive action. Suspected insiders are removed
from the response channel and access path.

## Severity guide

- **SEV-0:** Confirmed or credible imminent treasury-authority compromise, systemic unauthorized
  transfer, or loss of governance. Immediate executive, security, treasury, and legal response.
- **SEV-1:** Authorization-key compromise, wrong mint/network/recipient at scale, duplicate
  settlement, reserve breach, systemic eligibility forgery, or sensitive-data breach.
- **SEV-2:** Contained configuration error, reconciliation mismatch, RPC disagreement/outage,
  dispute surge, or suspected attack without confirmed asset movement.
- **SEV-3:** Localized rejected attempt, synthetic test alert, or operational defect with no live
  exposure.

## Common response sequence

1. Record reporter, detection time, trusted UTC time, affected environment, and initial facts.
2. Assign incident identifier, commander, severity, and private communication channel.
3. Confirm whether claims are disabled, mock-only, or future live; never assume a dashboard label is
   authoritative.
4. Contain at the narrowest safe boundary, escalating to emergency pause when integrity is
   uncertain.
5. Preserve immutable evidence before changing systems. Do not paste secrets, full wallet proofs,
   personal data, or sensitive payloads into chat.
6. Maintain a decision log with actor, time, evidence, approval, and expected effect.
7. Reconcile database intent, authorization, transaction signatures, on-chain program consumption,
   token/SOL balances, and independent RPC observations.
8. Eradicate the cause, rotate only affected credentials under the rotation runbook, and deploy only
   reviewed artifacts/configuration.
9. Recover gradually with synthetic/read-only checks first. No future claim activation without
   explicit incident exit approval.
10. Complete user/legal communications, loss and privacy assessment, corrective actions, and a
    blameless post-incident review.

## Evidence minimum

Preserve exact configuration and artifact digests, policy/epoch/key versions, database audit and
transition records, workload identity, authorization payload/digest, transaction bytes and
signatures if any, program/account state at identified slots, multisig proposals/signatures, RPC
provider responses with commitment and slot, balance/reserve snapshots, administrator actions,
deployment provenance, authentication/session events, alerts, support reports, and decision
timeline.

Export to an access-controlled evidence store. Apply legal hold where directed. Hash evidence,
record custody, and minimize personal data.

## Runbooks

### IR-01 — Suspected treasury signer compromise

- **Detection:** Unrecognized multisig proposal or signature, treasury-authority change, unexplained
  transfer, participant-device alert, or treasury reconciliation delta.
- **Containment:** Declare SEV-0/SEV-1, emergency-pause all claim authorization/submission, isolate
  suspected participant access, and alert unaffected multisig participants through an out-of-band
  channel.
- **Evidence:** Preserve multisig policy, proposals, participant/signing-device logs, authority
  history, token/SOL transactions, account snapshots, and all related configuration.
- **Eradication:** Follow approved multisig recovery to remove compromised participants or rotate
  treasury authority; never improvise a single-key rescue or disclose recovery secrets in incident
  systems.
- **Recovery:** Independently verify authorities and balances on the approved network, reconcile
  every outflow, restore governance quorum, and require a new treasury/security approval before any
  claim path resumes.
- **Communications:** Treasury and legal approve internal, insurer, partner, user, and regulator
  notices; do not claim reversibility.
- **Closure:** Document loss/exposure, root cause, participant/control changes, outstanding
  disputes, and owner acceptance of residual risk.

### IR-02 — Suspected authorization-key compromise

- **Detection:** Signature without matching immutable intent, abnormal volume/value/source, signer
  identity drift, authorization-policy mismatch, or key-use alert.
- **Containment:** Emergency-pause signing and submission, disable signer workload access, retain
  all authorization reserves, and request approved on-chain revocation through treasury governance
  if a future key is active.
- **Evidence:** Preserve key-version metadata, public key, signer audit, workload logs, requests,
  canonical payloads/digests, issued expiries, and on-chain consumption state; never export secret
  key material.
- **Eradication:** Revoke the old authority, rebuild signer environment, rotate workload
  credentials, and provision a new authorization key only under the key-rotation runbook.
- **Recovery:** Enumerate every authorization issued during exposure, classify
  consumed/unconsumed/ambiguous/expired, reconcile reserves, and test new public-key allowlisting
  with synthetic vectors.
- **Communications:** Coordinate security, treasury, legal, and support messaging for affected
  claimants.
- **Closure:** Record maximum loss envelope, verified revocation slot, old-authorization
  disposition, and approval of the replacement boundary.

### IR-03 — Administrator compromise

- **Detection:** Suspicious login, role change, policy/correction action, audit disablement, wallet
  self-dealing, or administrator report.
- **Containment:** Suspend the identity and sessions, block privilege changes, emergency-pause
  affected claim paths, preserve state, and remove the person from incident approvals.
- **Evidence:** Preserve authentication, MFA, session, device, admin API, database, approval,
  deployment, and linked-wallet activity.
- **Eradication:** Reset identity through the approved recovery path, rotate exposed credentials,
  reverse only unpublished configuration, repair grants, and review all actions in the exposure
  window.
- **Recovery:** Revalidate roles and separation of duties, independently approve safe drafts,
  reconcile affected eligibility/corrections, and require fresh administrator attestation.
- **Communications:** Notify legal/privacy and affected personnel or users according to the evidence
  and jurisdiction.
- **Closure:** Document access path, affected records, conflicts of interest, enforcement, and
  controls added.

### IR-04 — Duplicate claim incident

- **Detection:** Two claim identities or confirmed transfers for one receipt, multiple consumed
  authorizations, cap mismatch, or user/support report.
- **Containment:** Pause the affected source and, if systemic, all claims; stop retries; retain
  ambiguous reserves; and lock affected records against correction.
- **Evidence:** Preserve receipt, eligibility, intent, idempotency keys/digests, revisions,
  sessions, authorizations, all transaction signatures, program receipts, and balance deltas.
- **Eradication:** Correct the race, uniqueness, identity, or replay defect; add regression tests;
  and repair counters only by audited correction.
- **Recovery:** Establish the canonical settlement, reconcile duplicates and fees, restore invariant
  checks, and resume only after the maximum duplicate scope is bounded.
- **Communications:** Support uses approved language; treasury/legal decide recovery or compensating
  treatment without representing that finalized transfers can be reversed.
- **Closure:** Record financial impact, affected users, invariant proof, and reviewer sign-off.

### IR-05 — Wrong recipient configuration

- **Detection:** Recipient/owner/associated-account derivation mismatch, authorization versus chain
  mismatch, or payment to an unexpected account.
- **Containment:** Emergency-pause before further signing/submission, quarantine affected claims,
  and do not redirect or reissue while outcome is ambiguous.
- **Evidence:** Preserve wallet proof and link history, recipient derivation inputs,
  token-program/mint, configuration version, authorization, transaction, account owner/state, and
  slots.
- **Eradication:** Fix derivation or mapping in an unpublished reviewed version; do not mutate an
  existing authorization or confirmed receipt.
- **Recovery:** Validate exact vectors for existing/missing associated accounts, Token-2022
  behavior, and wallet changes; reconcile each affected claim.
- **Communications:** Notify security, treasury, legal, and affected players; avoid promises of
  chain reversal or compensation until approved.
- **Closure:** Record root cause, recipient scope, asset impact, tests, and explicit owner
  acceptance.

### IR-06 — Wrong mint configuration

- **Detection:** Policy, transaction, program, treasury account, or live mint inspection disagrees
  on mint or token program.
- **Containment:** Emergency-pause, reject all new authorizations, quarantine affected versions, and
  secure all effective configuration snapshots.
- **Evidence:** Preserve approved manifest, publication history, live account/program data from
  independent providers, authorizations, transactions, and reconciliations.
- **Eradication:** Replace only through a new typed reviewed policy/configuration; verify mint
  owner, authorities, decimals, and every extension.
- **Recovery:** Rehearse startup/continuous checks, reconcile any wrong-asset transfer, and obtain
  owner/security/treasury/legal approval before resumption.
- **Communications:** Correct player-facing token identity promptly under legal guidance.
- **Closure:** Document how the wrong mint entered, who approved it, exposure, and prevention
  evidence.

### IR-07 — Wrong network configuration

- **Detection:** Genesis hash, RPC endpoint, policy network, wallet network, mint/account presence,
  or transaction explorer disagrees.
- **Containment:** Fail closed, emergency-pause signing/submission, preserve environment and
  endpoint configuration, and stop automatic failover.
- **Evidence:** Capture genesis responses from independent providers, configured network,
  mint/treasury accounts, build/config digests, transactions, and operator actions.
- **Eradication:** Correct through a reviewed unpublished configuration, pin the approved genesis
  identity, and remove ambiguous endpoint aliases.
- **Recovery:** Run cross-service genesis/mint/treasury validation and explicitly label test
  fixtures; require activation ceremony approval.
- **Communications:** Notify security/treasury and affected users if any expectation or asset was
  involved.
- **Closure:** Record exposure across networks, asset impact, and validation proof.

### IR-08 — Token reserve depletion

- **Detection:** Token headroom at/below alert or minimum reserve, faster-than-modeled depletion,
  unexplained external outflow, or negative reservation invariant.
- **Containment:** Emergency-pause new authorization, retain existing exposure, stop reserve
  releases lacking definitive evidence, and notify treasury.
- **Evidence:** Preserve finalized balance/slot, all reservations/pending/confirmed outflows,
  external transfers, caps, policy/epoch, and simulation assumptions.
- **Eradication:** Resolve accounting defect or unauthorized outflow; funding or cap changes require
  separate approved treasury actions and cannot be improvised.
- **Recovery:** Reconcile all commitments, rerun worst-case simulation, demonstrate reserve
  headroom, and obtain treasury/security approval.
- **Communications:** Provide accurate maintenance and entitlement status without promising unfunded
  rewards.
- **Closure:** Document depletion cause, obligations, funding decisions, control changes, and
  remaining exposure.

### IR-09 — SOL fee depletion

- **Detection:** SOL headroom near/below reserve, insufficient-funds errors, unexpected priority
  fees/rent, or high token-account creation.
- **Containment:** Pause new authorizations and submissions that would consume fees, stop blind
  retry, retain pending classifications, and notify treasury.
- **Evidence:** Preserve SOL balances/slots, fee estimates and actuals, rent/account creation, retry
  history, transaction simulations, and policy thresholds.
- **Eradication:** Correct fee/rent estimation or retry defect; replenishment follows approved
  treasury governance.
- **Recovery:** Reconcile pending signatures, verify the minimum SOL reserve and worst-case fee
  exposure, then resume gradually only with approval.
- **Communications:** Announce maintenance/degraded service without encouraging repeated requests.
- **Closure:** Record burn variance, funding action, updated model, and alert proof.

### IR-10 — RPC outage

- **Detection:** Provider errors, timeouts, stale slots, failed health probes, or inability to
  obtain required quorum.
- **Containment:** Circuit-break the provider, pause security-critical authorization/submission if
  safe evidence is unavailable, retain ambiguity reserves, and avoid uncontrolled failover.
- **Evidence:** Preserve endpoint/provider, request type, timing, slots, errors, dependency status,
  transaction signatures, and failover decisions.
- **Eradication:** Work with provider or replace through the approved provider registry and
  credentials; do not weaken commitment or validation to regain availability.
- **Recovery:** Verify genesis and account state, compare providers, reconcile transactions
  submitted around the outage, and drain backlog with bounded rates.
- **Communications:** Publish service status and retry guidance without exposing provider
  credentials or sensitive payloads.
- **Closure:** Record duration, affected states, provider SLA, backlog resolution, and architecture
  action.

### IR-11 — RPC disagreement

- **Detection:** Independent providers disagree beyond policy on genesis, slot, mint/extensions,
  balance, account state, blockhash, signature status, or transaction.
- **Containment:** Quarantine affected claims, pause at the configured threshold, retain reserves,
  and do not choose the answer that permits movement.
- **Evidence:** Preserve raw bounded responses, provider/commitment/slot/time, request digest, local
  configuration, and later convergence evidence.
- **Eradication:** Identify lag, configuration mismatch, chain fork, or provider compromise; remove
  unhealthy providers and rotate credentials if implicated.
- **Recovery:** Resolve through approved quorum/independent evidence, reconcile all affected
  records, and prove provider diversity and health.
- **Communications:** Inform security/treasury and users when delays affect claims; avoid asserting
  finality before evidence converges.
- **Closure:** Record resolution rule, provider findings, false-positive impact, and policy
  adjustment.

### IR-12 — Claim database mismatch

- **Detection:** Database intent/state/amount/recipient/signature disagrees with signer log, program
  consumption, transaction, token balance, or cap/reserve ledger.
- **Containment:** Stop affected transition workers and signing, quarantine the record/range, retain
  reserve, and prevent manual edits.
- **Evidence:** Preserve row revisions and audit, source receipt, authorization, transaction/program
  data, snapshots/backups, service identities, and reconciliation cursor.
- **Eradication:** Identify application defect, partial outage, unauthorized write, or stale read;
  restore by append-only audited correction, never silent mutation.
- **Recovery:** Reconcile from immutable evidence in a documented authority order, rerun invariants,
  and independently approve the result.
- **Communications:** Escalate to security/privacy if unauthorized access is possible and keep
  affected users informed of delay.
- **Closure:** Record authoritative outcome, data correction, scope query, test, and reviewer
  sign-off.

### IR-13 — Replay attack

- **Detection:** Reused wallet nonce/signature, receipt identity, authorization nonce, claim
  identity, or transaction intent; repeated program rejection.
- **Containment:** Reject requests, rate-limit attacker, quarantine affected identities, pause if
  replay guard may have failed, and retain reservations for ambiguous chain state.
- **Evidence:** Preserve canonical payload/digest, signature, nonce issue/consume times, session,
  source receipt, program receipt, transaction signatures, and requester metadata under privacy
  controls.
- **Eradication:** Repair nonce/uniqueness/domain/expiry enforcement, rotate a compromised
  authorization key, and invalidate exposed sessions.
- **Recovery:** Test replay across sessions, wallets, environments, epochs, and concurrency; verify
  no duplicate settlement and reconcile counters.
- **Communications:** Notify affected users and legal/security when credentials or material loss are
  implicated.
- **Closure:** Record replay vector, accepted/rejected count, financial impact, and invariant proof.

### IR-14 — Eligibility forgery

- **Detection:** Eligibility lacks authoritative source evidence, receipt digest/ledger mismatch,
  impossible activity, producer anomaly, or administrator correction abuse.
- **Containment:** Disable the source, quarantine its unconsumed eligibility/authorizations,
  preserve records, and pause globally if source scope is unknown.
- **Evidence:** Preserve source definition/version, producer identity, activity/economy records,
  receipt/digest, corrections, approvals, wallet/player links, and downstream claims.
- **Eradication:** Revoke compromised producer/admin access, fix validation, invalidate only through
  controlled transitions, and independently audit the source.
- **Recovery:** Recompute eligibility from trusted evidence where possible, reconcile settled
  exposure, test source invariants, and require owner/security approval.
- **Communications:** Coordinate fair player notice and appeal with legal/product; distinguish
  invalid eligibility from user wrongdoing.
- **Closure:** Record forged volume/value, actor/path, source decision, disputes, and prevention
  evidence.

### IR-15 — Emergency pause

- **Detection:** Any approved critical trigger: key compromise, wrong configuration, duplicate
  settlement, reserve breach, systemic mismatch, or control-plane uncertainty.
- **Containment:** An authorized responder activates the future fail-closed pause through the
  pre-reviewed path, verifies effect independently, stops signing/submission/workers as scoped, and
  retains in-flight evidence/reserves.
- **Evidence:** Preserve trigger, actor, approval or emergency authority, exact time, policy/config
  versions, components stopped, pre/post metrics, and in-flight inventory.
- **Eradication:** Resolve the originating incident; pause is containment, not a fix.
- **Recovery:** Reconcile all in-flight states, prove controls and monitoring, use staged re-enable
  with dual approval, and never allow a time-based automatic unpause.
- **Communications:** Announce maintenance and recovery status through trusted channels; restrict
  sensitive incident facts.
- **Closure:** Confirm every component honored pause, no prohibited operation continued, owner
  accepted recovery, and tests cover the trigger.

### IR-16 — Dispute surge

- **Detection:** Dispute count/rate/value, repeated issue category, support backlog, social reports,
  or concentration by policy/source/wallet crosses threshold.
- **Containment:** Increase review capacity, pause the affected source/policy if systemic, preserve
  records, and prevent support staff from making uncontrolled eligibility or compensation changes.
- **Evidence:** Sample complete claim evidence, categorize allegations, track timing/version/cohort,
  retain communications under privacy policy, and measure settled exposure.
- **Eradication:** Fix product, policy, eligibility, transaction, disclosure, or support defect;
  corrections require separation of duties.
- **Recovery:** Resolve cases consistently under published rules, audit a sample, reduce backlog,
  and validate that new cases return to baseline.
- **Communications:** Use a coordinated status/FAQ, meet response commitments, and obtain legal
  approval for compensation or admission.
- **Closure:** Record root categories, fairness review, outcome distribution, policy changes, and
  remaining appeals.

### IR-17 — Sensitive-data exposure

- **Detection:** Secret scan, log/storage finding, public artifact, unauthorized export/access, user
  report, or credential-use anomaly.
- **Containment:** Restrict access and distribution, preserve evidence, revoke exposed
  sessions/credentials, pause affected services, and involve legal/privacy immediately.
- **Evidence:** Identify exact fields, people, systems, copies, accessors, times, jurisdictions,
  encryption, and retention; do not create additional unsafe copies.
- **Eradication:** Remove exposure through approved procedures, fix logging/access/build path,
  rotate secrets, and validate downstream caches/forks/backups.
- **Recovery:** Restore minimum necessary access, scan clean artifacts and logs, monitor misuse, and
  support affected users.
- **Communications:** Legal/privacy determine notification content and deadlines; messages state
  known facts and protective steps without exposing more data.
- **Closure:** Record data classes, affected count, regulatory decisions, deletion/retention
  evidence, and controls.

### IR-18 — Rollback unpublished configuration

- **Detection:** A draft or staged configuration fails validation, review, simulation, or
  consistency checks before publication.
- **Containment:** Keep feature disabled, block publication/activation, snapshot the rejected draft
  and evidence, and prevent its reuse under the same version.
- **Evidence:** Preserve draft/version, diff, author/reviewers, validation output, simulation,
  environment target, and rejection decision; no secret fields belong in the artifact.
- **Eradication:** Mark the draft rejected/cancelled in the future control system and create a new
  version for any correction; never mutate a published version or execute ad hoc hosted edits.
- **Recovery:** Revalidate the last approved disabled configuration, run synthetic checks, and
  resume drafting only through normal separation of duties.
- **Communications:** Notify internal reviewers; public notice is unnecessary unless the unpublished
  error exposed data or affected another live system.
- **Closure:** Record why safeguards caught the error, ensure caches/staging no longer select it,
  and capture preventive test changes.

## Tabletop and evidence expectations

Before Phase 9B-B can be recommended, owner, security, treasury, legal, application, reconciliation,
support, and communications representatives must tabletop at least the key-compromise, wrong
configuration, duplicate/ambiguity, reserve-depletion, RPC, eligibility-forgery, emergency-pause,
and sensitive-data scenarios. Each exercise must record:

- participants and roles;
- synthetic scenario and assumptions;
- detection and decision timeline;
- pause/revocation/rotation approvals;
- evidence gathered without secrets;
- reconciliation result;
- communications draft;
- gaps, owner, and due date; and
- explicit pass, conditional pass, or fail.

A tabletop cannot generate keys, publish configuration, touch a hosted environment, submit a
transaction, or move funds as part of Phase 9B-A.
