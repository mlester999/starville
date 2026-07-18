# Phase 9B-A Key, Authority, and Credential Rotation

> **Architecture-only status:** Phase 9B-A does not generate, import, store, rotate, revoke, or use
> a live key or credential. It does not deploy a program, publish configuration, write hosted state,
> submit a transaction, or add a migration. This document is a prospective ceremony and tabletop
> specification.

## Purpose

Rotation must preserve safety, exactly-once behavior, treasury governance, authorization expiry,
evidence, and service continuity without creating a period in which an unknown old key or an
unreviewed new key can authorize value.

Covered material:

- claim authorization key;
- treasury authority;
- multisig participants and recovery;
- RPC credentials;
- prospective program upgrade authority; and
- related workload identities and allowlists.

Wallet keys owned by players are not Starville custody and are handled through the wallet-change and
dispute policy, not this runbook.

## Mandatory principles

- Authorization authority and treasury authority are separate.
- Application configuration stores public keys, authority identifiers, and versions only.
- Private keys, seed phrases, recovery shares, hardware-wallet PINs, key-encryption keys, and RPC
  secrets never enter source, database records, logs, tickets, chat, screenshots, or this document.
- New material is generated and held by the approved custody system, preferably non-exportable where
  supported.
- Rotation is versioned, reviewed, time-bounded, auditable, and reversible only through another
  approved forward change.
- Published policy/configuration is immutable. A new key or authority requires a new version.
- Emergency pause precedes a compromise rotation when the old authority may be hostile.
- Old authorization validity is explicit; “rotation complete” never means old signed payloads
  vanished.
- Every ceremony uses trusted UTC time, the approved Solana network and genesis identity, and
  independent public-address verification.
- No single person generates, approves, publishes, activates, and reconciles a sensitive rotation.

## Roles and separation

| Role                                  | Allowed responsibility                                              | Prohibited combination                     |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Rotation coordinator                  | Schedule, checklist, decision log, evidence package                 | Cannot alone approve or activate           |
| Security approver                     | Custody design, compromise scope, public-key verification           | Cannot be sole key custodian and verifier  |
| Treasury approver                     | Treasury/multisig authority and reserve protection                  | Cannot alone alter claim policy            |
| Key custodian or managed signer owner | Generate/hold material and attest public identity                   | Cannot receive arbitrary payload authority |
| Application operator                  | Stage typed public configuration                                    | Cannot access private material             |
| On-chain operator                     | Propose approved authority/program changes                          | Cannot self-approve multisig proposal      |
| Reconciliation reviewer               | Verify pre/post state and old exposure                              | Cannot execute the same change             |
| Legal/privacy representative          | Direct incident/retention/notification when compromise is suspected | Does not receive secret material           |

The final role matrix, named backups, multisig threshold, and emergency quorum remain owner
decisions.

## Evidence record

Every future rotation record must contain:

- rotation identifier and type;
- normal, scheduled, or emergency reason code;
- environment, network, and verified genesis hash;
- old and new public identifier and version;
- custody-system attestation reference without secret content;
- proposed activation and retirement instants;
- overlap and old-authorization-expiry treatment;
- policy/program/multisig proposal versions;
- requester, reviewers, approvers, executor, and reconciler;
- preflight and postflight check results;
- on-chain transaction/proposal signatures when applicable;
- affected services and restart/reload evidence;
- outstanding authorization/reservation inventory;
- rollback or further-forward recovery decision;
- incident identifier when compromise is suspected; and
- closure and residual-risk acceptance.

Evidence is immutable, access controlled, retained under legal policy, and independently exported.
It must not contain secrets.

## Common normal-rotation ceremony

1. Confirm Phase 9B-B or later authority, change window, named roles, and absence of an open
   incident.
2. Keep claims disabled or enter approved maintenance/pause before changing trust anchors.
3. Inventory current public identifiers, policy/program allowlists, outstanding authorizations,
   pending transactions, reserves, and monitoring.
4. Generate new material inside the approved custody system. Record only its attested public
   identity and key version.
5. Verify the public identity out of band by at least two independent approvers.
6. Stage a new typed, immutable, unpublished configuration/policy version with an explicit effective
   time.
7. Test known-good and known-bad synthetic vectors, including old/new key, wrong network/mint,
   expiry, replay, and pause behavior. No Phase 9B-A test is live.
8. For on-chain authority changes, create and decode the exact proposal, simulate where supported,
   compare network/program/accounts, and collect the approved threshold.
9. Activate in the defined order for the specific credential. Record each boundary and independently
   verify it.
10. Observe overlap or hard cutover according to policy. Do not issue new work under the old key
    after its issue cutoff.
11. Revoke/disable old material after its explicit safe condition, then prove rejection.
12. Reconcile old outstanding work, new operations, reserves, monitoring, and audit.
13. Exit maintenance only with security/treasury/application/reconciliation approval.
14. Close after all old material is retired or a time-bounded exception is accepted.

## Claim authorization-key rotation

### Required design

The recommended candidate program should use a versioned allowlist or authority configuration that
supports safe rotation without giving the authorization key treasury custody. The exact mechanism
requires program security review.

A future authorization record binds:

- authorization public-key version;
- payload and domain version;
- issue and expiry time;
- immutable claim/eligibility identity;
- network, mint, recipient, amount, policy, epoch, and nonce; and
- consumption state.

### Normal rotation

1. Pause new issuance or set an explicit old-key issue cutoff.
2. Snapshot all old-key authorizations as unconsumed, pending, consumed, expired, cancelled, or
   ambiguous.
3. Provision the new key in the approved signer; verify its public key independently.
4. Add the new public key/version to program and signer allowlists through approved governance while
   old consumption behavior remains explicit.
5. Switch new authorization issuance to the new version at the effective time.
6. Reject any old-key authorization with an issue time after the cutoff, even if cryptographically
   valid.
7. Continue to reserve the full face value of every still-valid old authorization.
8. Retire the old public key only when all old authorizations are consumed, deterministically
   expired/cancelled, or deliberately invalidated under the approved player/dispute plan.
9. Disable and destroy or archive old secret material according to custody policy; record
   attestation, not secret bytes.
10. Prove that the old key cannot issue or authorize new claims and that valid new test vectors
    behave as designed.

### Overlap rule

Overlap is for consuming bounded pre-cutoff authorizations, not for issuing from two keys
indefinitely. The overlap maximum equals the approved authorization lifetime plus bounded
reconciliation delay. If the on-chain design cannot distinguish issue cutoff or key version safely,
use a hard pause and wait for old authorizations to expire before activating the new key.

### Old authorization expiry

- Expiry uses on-chain trusted time/slot semantics defined by the program, not browser time.
- Database expiry alone does not invalidate a still-valid signed on-chain payload.
- Reserve remains until consumption is disproven and expiry is definitive.
- An expired old authorization is never silently re-signed. Re-evaluation under the new policy/key
  creates a controlled successor that preserves exactly-once identity.
- A disputed or ambiguous authorization remains quarantined until reconciliation, even after
  wall-clock expiry.

### Emergency compromise rotation

1. Emergency-pause issuance and submission.
2. Stop and isolate signer workloads; revoke workload credentials.
3. Through unaffected approved governance, remove/revoke the compromised public key as quickly as
   the selected program permits.
4. Inventory every payload signed in the exposure window, including those lacking normal application
   audit.
5. Retain reserves and classify consumption through independent providers.
6. Provision a replacement only in a clean custody/workload environment with new identities.
7. Do not honor old authorizations merely to preserve UX; apply the approved re-evaluation and
   dispute plan.
8. Resume only after incident, revocation, reconciliation, monitoring, and owner/security/treasury
   approval.

## Treasury-authority rotation

Treasury rotation moves governance, not ordinary claim traffic. It is a SEV-0-sensitive ceremony.

### Normal procedure

1. Pause claim issuance/submission and inventory all treasury token accounts, SOL fee accounts,
   authorities, delegates, extensions, pending multisig proposals, and outstanding authorizations.
2. Create the new approved multisig or authority under the reviewed participant/threshold/recovery
   policy.
3. Independently verify every program, mint, token-account, fee-payer, and authority address on the
   approved network.
4. Construct narrowly scoped authority-change transactions; decode every instruction and account,
   simulate, and prohibit unrelated transfers.
5. Collect multisig approvals out of band, enforcing conflict and hardware-device review.
6. Execute in the approved dependency order so assets never become single-key controlled or
   ownerless.
7. Verify finalized authority and delegate state through independent RPC providers.
8. Update typed public configuration using a new version and reconcile balance/reservations.
9. Remove obsolete delegates/authorities and close stale governance proposals only through approved
   actions.
10. Resume after security, treasury, application, and reconciliation sign-off.

### Compromise handling

If the old authority may be hostile, follow IR-01. Do not announce transaction details before
containment, do not ask a suspected participant to approve recovery, and do not move assets to an
unreviewed personal wallet.

## Multisig participant rotation

Participant rotation is required for scheduled tenure changes, device loss/replacement, role
departure, threshold change, or suspected compromise.

1. Confirm current threshold remains achievable using unaffected participants.
2. Pause sensitive treasury actions and cancel or quarantine unrelated pending proposals.
3. Validate the incoming participant's organizational role, conflict status, hardware custody,
   backup, geography, and secure communication path.
4. Verify the participant public key twice through independent channels; never exchange seed phrases
   or recovery shares.
5. Create a proposal containing only the reviewed participant/threshold change.
6. Every approver decodes the complete proposal on a trusted display.
7. Execute and verify finalized multisig membership/threshold independently.
8. Remove departing access to provider consoles, alerting, documentation, and recovery processes.
9. Test quorum with a harmless read-only or synthetic ceremony; Phase 9B-A does not submit any
   transaction.
10. Update the owner-approved succession and emergency contact record.

Threshold changes require a separate risk decision; they are not an incidental side effect of
participant replacement.

## RPC credential rotation

RPC credentials do not authorize treasury transfers, but leakage can expose traffic, enable denial
of service, incur cost, or support false operational assumptions.

### Normal procedure

1. Inventory provider, endpoints, allowed origins/IPs, quotas, environments, services, and current
   secret versions without revealing values.
2. Create a new credential with minimum scopes and environment restrictions in the secret
   manager/provider.
3. Stage it to one canary service while claims remain disabled or paused.
4. Verify genesis identity, provider health, rate limits, account reads, commitment behavior, and
   independent-provider comparison.
5. Roll out by bounded service group and monitor errors, quota, latency, and disagreement.
6. Revoke the old credential, prove rejected use, and scan for stale references.
7. Reconcile usage/cost and close evidence.

### Emergency leakage

Revoke or restrict the credential immediately according to provider capability, switch only to a
pre-approved endpoint, inspect access/usage, rotate any coupled secret, and apply the sensitive-data
incident runbook. Never weaken network/mint/genesis validation to accelerate failover.

## Program upgrade-authority rotation

The future claim-program upgrade posture must be an explicit security/owner/treasury decision:
controlled multisig, timelocked governance if appropriate, or verified immutability after audit.
Phase 9B-A deploys no program and has no upgrade authority.

If an upgrade authority exists:

1. Pause claims and inventory program ID, program-data account, current authority, deployed binary
   hash, audit version, and pending proposals.
2. Establish the new approved authority under multisig and hardware-custody controls.
3. Construct only the exact authority-change instruction and decode all accounts/network.
4. Collect approved threshold after reviewers compare the public key and program ID independently.
5. Execute and verify finalized program-data authority through multiple RPC providers.
6. Prove the former authority can no longer upgrade.
7. Update public configuration/evidence and monitoring for authority drift.
8. Resume only after security and treasury approve the verified state.

Setting authority to none is irreversible and requires a separate owner/security/treasury decision,
completed audit, verified build reproducibility, incident recovery analysis, and legal/operational
acceptance.

## Revocation semantics

Revocation must be defined per material:

| Material             | Revocation proof                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Authorization key    | Program/config no longer accepts new or old-key payloads according to explicit cutoff/version policy; signer access disabled |
| Treasury authority   | Finalized on-chain account/multisig state names only the new approved authority and removes obsolete delegates               |
| Multisig participant | Finalized membership excludes participant and provider/device access is removed                                              |
| RPC credential       | Provider rejects old credential and no deployed service references it                                                        |
| Upgrade authority    | Finalized program-data state names new authority or none, and old authority fails a safe verification                        |
| Workload identity    | Identity provider rejects token issuance/use and services use a new scoped version                                           |

Deleting a local secret copy is not revocation. Configuration changes without boundary verification
are not revocation.

## Rotation validation

Every future rotation must test:

- correct new public key accepted only in the intended environment;
- old key rejected after the defined cutoff/revocation;
- pre-cutoff old authorization handling;
- expired, replayed, wrong-domain, wrong-network, wrong-mint, wrong-recipient, and altered-amount
  rejection;
- pause behavior;
- reserve and cap preservation during overlap;
- RPC quorum and genesis;
- monitoring for old-key use and authority drift;
- audit completeness; and
- incident recovery if activation fails partway.

Tests use synthetic fixtures unless a later, separately approved deployment phase authorizes
otherwise.

## Phase 9B-B rotation gate

Before recommending implementation, reviewers must approve:

- custody providers and non-exportability posture;
- public-key and domain-version scheme;
- program support for versioned allowlist/revocation;
- overlap maximum and old-authorization treatment;
- multisig threshold, participants, succession, and emergency quorum;
- treasury and upgrade-authority posture;
- RPC provider/credential diversity;
- workload identities and least privilege;
- evidence, retention, and privacy rules;
- normal and emergency tabletop results; and
- named owners for rotation, reconciliation, communication, and residual risk.

Until that gate is met, there is no live key to rotate and no authority or configuration is changed.
