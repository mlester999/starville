# Phase 9B-A Legal, Compliance, and Phase 9B-B Gate

> **Architecture-only status:** Token claims are disabled. Phase 9B-A creates no signer, key,
> transaction, program deployment, hosted write, published configuration, or database migration.
> Nothing in this document is legal advice, a legal conclusion, an approval to distribute tokens, or
> an approval to enter Phase 9B-B.

## Required legal posture

Qualified counsel with the relevant jurisdictional and digital-asset expertise must review the
proposed token reward and treasury model before implementation or public commitment. Product,
engineering, treasury, and security cannot resolve legal questions by technical design alone.
Qualified legal review is required before token payouts.

Every item below is unresolved until counsel records:

- jurisdictions and facts reviewed;
- assumptions and exclusions;
- applicable launch conditions or prohibitions;
- required product, policy, disclosure, data, and operational controls;
- owner and due date;
- document/version reviewed;
- date and review-expiry or change triggers; and
- written disposition: approved, conditionally approved, prohibited, or further analysis required.

Silence, an informal chat, a prior project opinion, or a test-network exercise is not approval.

## Formal unresolved legal and compliance checklist

| Area                          | Questions counsel and owners must resolve                                                                                                                                                   | Minimum evidence before implementation                                                                          | Phase 9B-A status                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Jurisdiction                  | Which operator, treasury, development, player, token, and transaction jurisdictions apply? Which laws apply across borders?                                                                 | Entity/factual map, target geography, counsel memorandum, change triggers                                       | Unresolved; qualified counsel required                     |
| Token reward characterization | Is the reward, authorization, receipt, or promotional description a security, virtual asset, stored value, prize, loyalty reward, compensation, taxable benefit, or another regulated item? | Final token rights/utility, distribution design, marketing language, economics, counsel analysis                | Unresolved; qualified counsel required                     |
| Consumer disclosures          | What must users know about eligibility, non-guarantee, value, fees, finality, expiry, wallet risk, outages, reserves, pauses, and disputes?                                                 | Plain-language disclosure set mapped to UI/API/support and versioned acceptance                                 | Unresolved; qualified counsel required                     |
| Sanctions                     | What screening is required for people, wallets, locations, entities, and treasury counterparties? How are false positives and updates handled?                                              | Screening scope/provider/process, lists/jurisdictions, refresh cadence, hold/review/appeal evidence             | Unresolved; qualified counsel required                     |
| Age restrictions              | What minimum age, parental consent, age assurance, and minor-data controls apply in each supported region?                                                                                  | Age policy, assurance method, parental process where lawful, data-minimization review                           | Unresolved; qualified counsel required                     |
| Tax                           | What reporting, withholding, valuation, basis, form, record, and recipient-information obligations apply to operator and players?                                                           | Tax counsel/accounting analysis, value source/time, thresholds, records, player notices                         | Unresolved; qualified tax counsel required                 |
| Contest and promotion         | Could eligibility activities be contests, sweepstakes, gambling, lotteries, or promotions? Are skill/chance, consideration, rules, registration, bonding, or alternative entry relevant?    | Activity-by-activity classification, official rules, geographic restrictions, product controls                  | Unresolved; qualified counsel required                     |
| Custody                       | Does any wallet, fee payer, authorization, recovery, or support flow create custody, control, fiduciary duty, or safeguarding obligations?                                                  | Key/control map, selected architecture, wallet-change/recovery rules, provider terms                            | Unresolved; qualified counsel required                     |
| Money transmission            | Could funding, authorization, transfer, fee payment, routing, or redemption constitute money/value transmission or another licensed activity?                                               | End-to-end funds/control flow, entities/providers, supported geographies, counsel analysis                      | Unresolved; qualified counsel required                     |
| Privacy                       | What personal data, wallet linkage, risk signals, device/network data, sanctions evidence, disputes, and on-chain identifiers may be collected and used?                                    | Data inventory/flow, purpose and lawful basis, minimization, notices/consent, DPIA or equivalent where required | Unresolved; privacy counsel/officer required               |
| Disputes                      | What process, timing, evidence, appeal, arbitration/court, governing law, support, and remedy rules apply, especially when chain transfers are final?                                       | Published dispute policy, service levels, role separation, evidence/retention, remedy authority                 | Unresolved; qualified counsel required                     |
| Terms                         | What eligibility, suspension, wallet-control, authorization-expiry, non-transferability/finality, tax, fees, modifications, termination, and liability terms are enforceable?               | Versioned terms, acceptance evidence, change-notice plan, jurisdiction variants                                 | Unresolved; qualified counsel required                     |
| Risk disclosure               | Which market, technical, wallet, phishing, Token-2022, program, RPC, fee, reserve, pause, regulatory, tax, and irreversibility risks must be disclosed?                                     | Reviewed risk statement aligned to actual architecture and token configuration                                  | Unresolved; qualified counsel required                     |
| Geographic restrictions       | Which countries/regions must be allowed, reviewed, or blocked? What location evidence is lawful and proportionate? How are travel, VPN, and appeals handled?                                | Closed geography policy, evidence sources, privacy review, fail-closed behavior, appeal process                 | Unresolved; qualified counsel required                     |
| Retention                     | How long must eligibility, wallet proof, authorization, transaction, tax, sanctions, dispute, audit, security, and treasury records be kept or deleted?                                     | Record-class schedule, legal holds, deletion/anonymization, backup/log treatment, ownership                     | Unresolved; legal/privacy approval required                |
| Treasury governance           | What entity owns assets and liabilities? Who may fund, pause, sign, rotate, recover, reconcile, write off, compensate, or communicate?                                                      | Board/owner authority, multisig charter, role matrix, accounting, insurance and incident decisions              | Unresolved; owner, treasury, and counsel approval required |

## Additional legal-design dependencies

The legal review must use the selected architecture and actual product facts, including:

- whether users claim directly on-chain or a service submits on their behalf;
- who pays network fees and associated token-account rent;
- whether an authorization has value before consumption;
- the exact $STAR mint, network, authorities, Token-2022 extensions, transfer fees, hooks, and
  transferability;
- whether DUST or gameplay activity has any promised conversion or exchange relationship to $STAR;
- eligibility source registry, amount models, caps, epochs, reserves, expiration, pause, and
  correction rules;
- wallet proof, wallet change, stolen-wallet, and duplicate-account treatment;
- sanctions/risk review and human appeal;
- transaction finality, ambiguity, failure, and chain reorganization;
- data visibility on a public blockchain;
- funding source, treasury ownership, multisig governance, and signer separation;
- marketing, roadmap, documentation, support, and community statements; and
- intended countries, age groups, and rollout method.

If any material fact changes, the legal disposition must be reopened. Approval of a generic “token
claim” concept does not cover a different architecture, mint extension, geography, amount model, or
custody/control flow.

## Geographic and sanctions control design requirements

Without deciding the legal result, any future design must support:

- a closed, versioned region policy with effective time;
- server-side enforcement independent of browser display;
- trusted-time and evidence rules;
- minimal, proportionate location data;
- sanctions and geographic review states distinct from automatic ineligibility;
- fail-closed behavior when a legally required decision cannot be made;
- documented false-positive and appeal process;
- policy-version binding on eligibility and authorization;
- no disclosure of sensitive screening logic to an attacker;
- auditable administrator decisions with separation of duties;
- retention/deletion and data-subject processes; and
- emergency policy pause without silent retroactive edits.

These capabilities do not prove that a chosen location or sanctions policy is lawful or sufficient.

## Communications restrictions

Until legal and owner approval:

- do not promise that gameplay, DUST, activity, purchase, contribution, or account status earns
  $STAR;
- do not state that a claim date, amount, value, liquidity, eligibility, or region is guaranteed;
- do not imply an investment return or price expectation;
- do not describe mock authorization or simulation as a live claim;
- do not publish a mint, treasury, program, signer, policy, epoch, or activation configuration as
  approved;
- do not ask players for seed phrases, private keys, sensitive sanctions details, or unnecessary
  identity data; and
- do not use “legal,” “compliant,” “approved,” or “safe” without scoped written authority.

Public copy must align with actual disabled status and be reviewed when the architecture and legal
posture are known.

## Required owner decisions from Phase 9B-A

| Decision                                                              | Required approvers                                    | Current disposition                               |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Select, reject, or request revision of claim architecture candidate C | Owner, security, treasury, legal                      | Open; candidate C is recommended, not approved    |
| Treasury custody and multisig model                                   | Owner, treasury, security, legal as applicable        | Open                                              |
| Authorization signer custody, scope, and revocation                   | Owner, security, treasury                             | Open                                              |
| Program and upgrade-authority posture                                 | Owner, security, treasury                             | Open                                              |
| Eligibility source registry and amount models                         | Owner, product, economy, security, legal              | Open                                              |
| Caps, reserves, epochs, and funding                                   | Owner, treasury, risk, product                        | Open                                              |
| Wallet change, stolen-wallet, recipient, and exactly-once policy      | Owner, security, product, support, legal              | Open                                              |
| Token-2022 extension and fee treatment                                | Owner, security, treasury, product, legal             | Open                                              |
| Geographic, sanctions, age, tax, privacy, and terms posture           | Owner and qualified counsel                           | Open                                              |
| Pause, incident, dispute, reconciliation, and compensation authority  | Owner, security, treasury, operations, support, legal | Open                                              |
| Phase 9B-B entry                                                      | Owner after every gate item has evidence              | Not recommended by Phase 9B-A documentation alone |

## Phase 9B-B entry gate

Phase 9B-B must not start merely because architecture documents and a disabled package exist. The
owner must review one evidence packet showing every criterion below is satisfied.

### A. Prior-phase hosted readiness

- [ ] All Phase 9A and Phase 9A.1 hosted migrations are applied to the intended hosted project, with
      identifiers and timestamps recorded.
- [ ] Hosted database lint, pgTAP, and RLS checks pass on the exact intended hosted schema.
- [ ] Signed owner evidence covers shop purchase, duplicate request, inventory-full behavior,
      reconciliation, correction, and correction separation of duties.
- [ ] Prior Candidate D has been explicitly reviewed and selected or rejected, with rationale and
      owner signature.
- [ ] Every remaining Phase 8 item is closed or tracked with owner, priority, risk, and target
      phase; none silently blocks token claims.

Historical or local reports may support this evidence but do not replace current, scoped hosted
proof. Phase 9B-A performs no hosted write and this document does not assert those boxes are
checked.

### B. Phase 9B-A architecture approval

- [ ] The complete Phase 9B-A packet has been owner-reviewed, with comments and dispositions
      recorded.
- [ ] One claim model is selected; alternatives are accepted or rejected against the ADR criteria.
- [ ] One treasury custody/funding/multisig model is selected.
- [ ] Formal legal/compliance review is underway with named qualified counsel, scope, facts, owner,
      and target dates.
- [ ] The complete threat model is approved by security, treasury, product, operations, legal as
      applicable, and the owner; every critical/high treatment has evidence or accepted residual
      risk.
- [ ] Emergency-pause authority, trigger set, mechanism, verification, communications, and recovery
      are approved and tabletop tested.
- [ ] The signer boundary, custody, key versioning, revocation, rotation, overlap, old-authorization
      expiry, workload identity, and audit model are approved.
- [ ] No unresolved critical security, treasury, legal, data-integrity, prerequisite, or operational
      issue remains.

### C. Implementation-ready specification

- [ ] Eligibility sources, receipts, source versions, amount models, caps, epochs, reserves,
      wallet-change, quarantine, disputes, and monitoring are closed and owner-approved.
- [ ] The canonical authorization serialization, domain separator, on-chain exactly-once primitive,
      program constraints, Token-2022 compatibility, confirmation policy, and retry/ambiguity
      semantics are security reviewed.
- [ ] Database schema proposal, RLS/grants, immutable fields, uniqueness, lock order, reservations,
      audit, reconciliation, correction, and retention are reviewed without applying a migration.
- [ ] Treasury depletion and fee simulations pass approved synthetic scenarios with no invariant
      failure, and treasury accepts assumptions and maximum loss envelope.
- [ ] Incident, key rotation, signer rotation, treasury rotation, RPC, dispute, and sensitive-data
      table-tops are complete with owned corrective actions.
- [ ] Test and deployment plans include local PostgreSQL migration execution, pgTAP/RLS, adversarial
      unit/integration tests, program audit strategy, staged rollout, observability, and
      rollback/forward-recovery.

## Evidence packet format

Each checked item must link to:

- evidence identifier and immutable digest;
- environment/network/project scope;
- command, review, or ceremony date;
- actor and independent reviewer;
- exact artifact/configuration versions;
- pass/fail result and limitations;
- open findings with severity/owner/due date; and
- owner acceptance.

Screenshots alone are insufficient for machine-verifiable checks. Sensitive outputs must be redacted
without removing the facts needed for review.

## Stop conditions

Phase 9B-B is not recommended if:

- counsel has not begun scoped review;
- the architecture, treasury, signer, pause, exactly-once, or Token-2022 model is undecided;
- any critical issue is open or a high issue lacks an accepted treatment;
- prior-phase hosted readiness evidence is stale, incomplete, or for the wrong project;
- a required owner/treasury/security/legal decision is missing;
- a proposal would put treasury signing material in the application, browser, repository, database,
  or logs;
- a configuration would enable claims by default;
- test fixtures are being represented as production facts; or
- entry would require a hosted write, key generation, program deployment, transfer, or migration
  under Phase 9B-A authority.

The correct Phase 9B-A exit is an owner-reviewed decision packet and a disabled, testable
architecture foundation. It is not a live token claim.
