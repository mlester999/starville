# Phase 9B-A Token Claim and Treasury Threat Model

> **Architecture-only status:** Token claims are disabled. Phase 9B-A creates no signer, private
> key, transaction, on-chain deployment, hosted write, published configuration, or database
> migration. Controls below are prospective requirements for review; they do not claim
> implementation or approval.

## Scope and method

This threat model covers the prospective journey from gameplay eligibility through wallet binding,
policy evaluation, authorization, transaction execution, confirmation, and reconciliation. It
evaluates the signed-authorization on-chain-program candidate and a multisig-controlled treasury,
but the architecture remains pending owner, security, treasury, and legal approval.

Assets include player identity and eligibility, wallet bindings, policy and epoch integrity,
authorization keys, treasury authority and assets, SOL fee reserves, database records, audit
evidence, privacy, service availability, and player trust.

### Rating scale

- **Likelihood — Low:** Requires unusual access, multiple prerequisites, or a rare external event.
- **Likelihood — Medium:** Plausible for a motivated attacker or foreseeable operational failure.
- **Likelihood — High:** Common attack path, exposed boundary, or likely error without the listed
  controls.
- **Impact — Low:** Localized, reversible inconvenience with no asset loss or material disclosure.
- **Impact — Medium:** Limited asset, integrity, availability, privacy, or support harm.
- **Impact — High:** Treasury loss, broad unauthorized distribution, durable integrity failure,
  sensitive exposure, or severe legal/reputational harm.
- **Impact — Critical:** Systemic or unrecoverable treasury/control compromise, potentially
  requiring full shutdown and external response.

Likelihood ratings assume the prevention controls are implemented correctly in a future phase.
Residual risk is the risk that remains after those controls. “Owner decision required” identifies a
decision that cannot be delegated to code.

## Player and wallet threats

### PW-01 — Stolen wallet

- **Threat description:** An attacker controls a player's wallet keys and uses the wallet to
  authenticate or receive a legitimate player's prospective token reward.
- **Affected assets:** Player reward entitlement, wallet binding, treasury assets, dispute evidence,
  and player trust.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Require fresh domain-separated wallet proof, secure account recovery,
  server-authoritative eligibility, wallet-change cooldown, pending-claim quarantine, and no
  assumption that wallet possession alone proves eligibility.
- **Detection:** Alert on wallet changes followed by claims, new geography or device, concurrent
  sessions, unusual recipient history, and player reports.
- **Response:** Pause affected records, preserve authentication and wallet-proof evidence, block new
  authorizations, verify ownership through the approved recovery process, and follow the dispute
  runbook.
- **Residual risk:** A valid wallet signature cannot distinguish the rightful owner from a thief who
  holds the key; recovery errors can harm either party.
- **Owner decision required:** Approve the wallet-change cooldown, recovery evidence standard, loss
  allocation, and whether already finalized transfers can receive compensating treatment.

### PW-02 — Compromised browser

- **Threat description:** Malware or a hostile extension alters the UI, steals session material,
  changes displayed claim details, or prompts unintended signatures.
- **Affected assets:** Session, wallet proof, recipient intent, privacy, claim availability, and
  player trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Keep eligibility, amount, mint, network, recipient derivation, and policy
  server-authoritative; use Content Security Policy, dependency controls, secure cookies, short
  sessions, explicit wallet message contents, and on-chain verification.
- **Detection:** Client-integrity telemetry without sensitive values, anomalous session use, payload
  mismatch rejection, unusual wallet-change patterns, and support reports.
- **Response:** Revoke sessions, quarantine pending claims, invalidate unconsumed authorizations
  when supported, investigate deployment integrity, and warn affected users through trusted
  channels.
- **Residual risk:** The application cannot fully secure an already compromised endpoint, and a user
  may approve a malicious wallet prompt.
- **Owner decision required:** Approve supported-browser policy, user warnings, compensation
  posture, and endpoint-risk thresholds.

### PW-03 — Phishing

- **Threat description:** A fake message or site persuades a player to reveal credentials, connect a
  wallet, or sign an attacker-controlled message.
- **Affected assets:** Wallet control, account session, eligibility, reputation, and support
  capacity.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Publish canonical domains, use unambiguous domain-separated messages with purpose
  and expiry, never request seed phrases, provide anti-phishing education, and minimize privileged
  signatures.
- **Detection:** Brand and domain monitoring, reports, unusual proof domains or payloads, and
  elevated account recovery.
- **Response:** Publish verified warnings, request takedown, revoke affected sessions, pause
  disputed records, preserve reports, and coordinate legal/security response.
- **Residual risk:** Attackers can copy branding and users may sign despite warnings.
- **Owner decision required:** Approve official communication channels, domain-monitoring scope, and
  compensation policy.

### PW-04 — Fake Starville domain

- **Threat description:** An attacker operates a visually similar domain that imitates Starville and
  captures authentication or wallet signatures.
- **Affected assets:** Brand, wallet control, credentials, player privacy, and trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Restrict wallet proof to exact configured origins and domains, use TLS and HSTS,
  publish canonical links, reserve defensive domains where proportionate, and never accept a proof
  signed for another origin.
- **Detection:** Certificate-transparency and domain monitoring, community reports, referrer
  anomalies, and rejected proof-domain metrics.
- **Response:** Initiate takedown, notify players on trusted properties, revoke exposed sessions,
  quarantine affected claims, and retain evidence.
- **Residual risk:** Lookalike domains and social accounts can remain available long enough to harm
  users.
- **Owner decision required:** Approve monitoring vendor or process, defensive registrations,
  notification threshold, and legal escalation.

### PW-05 — Stolen session

- **Threat description:** An attacker obtains an authenticated application session and attempts to
  bind a wallet, request an authorization, or inspect private player data.
- **Affected assets:** Account identity, wallet binding, eligibility, private profile data, and
  treasury exposure.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Secure HTTP-only cookies, session rotation, bounded lifetime, CSRF protection,
  fresh wallet proof for sensitive actions, revocation checks, and risk-based reauthentication.
- **Detection:** Token reuse from conflicting locations, simultaneous sessions, unusual sensitive
  actions, failed fresh-proof challenges, and revocation anomalies.
- **Response:** Revoke all affected sessions, block sensitive transitions, quarantine pending claim
  records, notify the player, and investigate theft path.
- **Residual risk:** A stolen session used from the victim's device or network can resemble
  legitimate behavior.
- **Owner decision required:** Approve session lifetime, concurrent-session policy, reauthentication
  triggers, and player notification rules.

### PW-06 — Duplicate sessions

- **Threat description:** Multiple valid sessions race the same eligibility or wallet operation,
  intentionally or accidentally creating duplicate requests and confusing state.
- **Affected assets:** Exactly-once integrity, caps, player state, authorization reserve, and
  support evidence.
- **Likelihood:** High.
- **Impact:** Medium.
- **Prevention:** Use deterministic receipt and authorization identities, database uniqueness,
  serializable reservation logic, idempotency keys bound to account and action, and realtime
  invalidation.
- **Detection:** Duplicate-key conflicts, same receipt across sessions, concurrent wallet-change
  attempts, and idempotency mismatch metrics.
- **Response:** Preserve the single canonical result, reject divergent duplicates, reconcile
  reservations, revoke suspicious sessions, and investigate systematic abuse.
- **Residual risk:** Legitimate multi-device use can create false positives and poor user
  experience.
- **Owner decision required:** Approve concurrent-session limits and when duplicate behavior becomes
  a risk incident.

### PW-07 — Replayed wallet signature

- **Threat description:** A previously valid wallet signature is reused to authenticate or authorize
  a different session, request, recipient, or time.
- **Affected assets:** Authentication integrity, wallet binding, authorization integrity, and
  treasury assets.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Use server-issued single-use nonce, exact domain and origin, purpose,
  player/session binding, network, issued-at and expiry; atomically consume nonce and reject
  arbitrary signed messages.
- **Detection:** Nonce reuse, expired proof, domain/purpose mismatch, identical signatures across
  sessions, and replay-rejection alerts.
- **Response:** Reject the request, revoke related sessions if malicious, quarantine linked pending
  records, retain the signed payload, and investigate nonce-store integrity.
- **Residual risk:** A compromised server or database could issue or mark nonces incorrectly.
- **Owner decision required:** Approve proof lifetime, nonce retention, and the response threshold
  for repeated replay attempts.

### PW-08 — Wallet-address substitution

- **Threat description:** A client, proxy, compromised service, or administrator replaces the proven
  wallet address with an attacker-controlled recipient.
- **Affected assets:** Recipient correctness, treasury funds, wallet binding, and audit integrity.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Bind the wallet public key into the signed proof, player link, eligibility
  snapshot, authorization payload, destination derivation, database constraints, and on-chain
  verification; never accept a free-form destination token account.
- **Detection:** Recompute payload digest at every boundary, compare linked wallet and token-account
  owner, alert on mismatch, and reconcile authorization recipient to chain.
- **Response:** Stop signing and submission, emergency-pause if systemic, quarantine affected
  claims, preserve all payload versions, and begin wrong-recipient incident response.
- **Residual risk:** A legitimately linked but stolen wallet still passes cryptographic binding.
- **Owner decision required:** Approve whether recipient is fixed at eligibility, authorization, or
  claim time and define exceptional recovery rules.

### PW-09 — Wallet change during pending claim

- **Threat description:** A player changes the linked wallet while an authorization or transaction
  for the prior wallet is pending, creating ambiguity or an opportunity to claim twice.
- **Affected assets:** Recipient correctness, exactly-once state, cap accounting, dispute evidence,
  and treasury reserve.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Freeze wallet identity per authorization, block or quarantine wallet changes while
  exposure is live, retain historical links, and prohibit reissuance merely because the link
  changed.
- **Detection:** Wallet-link mutation with live authorization or pending transaction, conflicting
  recipient requests, and repeated change patterns.
- **Response:** Quarantine the record, retain reserve, resolve the existing
  authorization/transaction first, then apply the approved wallet-change procedure.
- **Residual risk:** Long confirmation ambiguity can delay a legitimate wallet recovery.
- **Owner decision required:** Approve cooldown, cancellation feasibility, expiration duration, and
  which wallet receives unresolved entitlements.

### PW-10 — Malicious browser payload

- **Threat description:** The browser submits altered eligibility identifiers, policy versions,
  epochs, amounts, recipients, mints, networks, or timestamps.
- **Affected assets:** Policy integrity, eligibility, treasury funds, caps, and audit trail.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Treat client data as an untrusted request only; derive authoritative fields
  server-side from closed registries and persisted receipts, validate schemas strictly, and verify
  the canonical payload on-chain.
- **Detection:** Schema rejection metrics, client/server digest disagreement, unknown-field
  attempts, and impossible state transitions.
- **Response:** Reject without reservation, rate-limit or suspend abusive actors, inspect related
  sessions, and patch any boundary that accepted client authority.
- **Residual risk:** A compromised authoritative service can still construct a malicious payload.
- **Owner decision required:** Approve abuse thresholds, suspension process, and evidence retention.

### PW-11 — Forged claim amount

- **Threat description:** An attacker increases the requested token amount or substitutes a
  different amount after eligibility evaluation.
- **Affected assets:** Treasury tokens, caps, reserves, policy integrity, and fairness.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Compute integer base-unit amount server-side from an approved model, bind it to
  receipt/policy/epoch in the authorization digest, apply caps atomically, and enforce the exact
  amount on-chain.
- **Detection:** Recalculation mismatch, amount outside model or cap, digest mismatch, unusual
  amount distribution, and treasury reconciliation delta.
- **Response:** Reject and quarantine, pause if a signer emitted an invalid amount, revoke or rotate
  authorization authority as appropriate, and reconcile all affected versions.
- **Residual risk:** A flawed approved amount model can consistently issue wrong but internally
  valid amounts.
- **Owner decision required:** Approve amount models, limits, validation sampling, and correction
  policy.

### PW-12 — Forged recipient

- **Threat description:** An attacker supplies a token account or owner different from the wallet
  proven and approved for the entitlement.
- **Affected assets:** Treasury funds, recipient integrity, disputes, and player trust.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Derive the associated token account or approved destination from the bound wallet
  and correct token program, include owner and destination in the authorization, and verify both
  on-chain.
- **Detection:** Destination derivation mismatch, token-account owner mismatch, client-supplied
  destination attempts, and post-chain recipient reconciliation.
- **Response:** Reject before signing, halt submission if detected later, emergency-pause on
  systemic mismatch, and use the wrong-recipient runbook.
- **Residual risk:** Correct delivery to a stolen but validly bound wallet remains possible.
- **Owner decision required:** Approve supported destination-account forms and whether
  non-associated accounts are ever allowed.

### PW-13 — Forged mint

- **Threat description:** An attacker substitutes another mint to receive a different asset, bypass
  extension rules, or make accounting misleading.
- **Affected assets:** Treasury assets, token identity, policy, transaction validity, and
  reconciliation.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Configure a single reviewed mint per immutable policy/epoch, derive it
  server-side, bind it into authorization, verify program owner and extensions, and enforce it
  on-chain.
- **Detection:** Mint mismatch at API, signer, transaction builder, program, RPC inspection, and
  reconciliation; alert on any drift.
- **Response:** Reject or halt, emergency-pause if configuration or signed data is wrong, preserve
  evidence, and execute the wrong-mint runbook.
- **Residual risk:** Governance compromise of the approved mint or policy can make an incorrect mint
  appear internally valid.
- **Owner decision required:** Approve canonical mint, authority posture, extension acceptance, and
  mint-change governance.

### PW-14 — Wrong network

- **Threat description:** A wallet, server, signer, transaction builder, or RPC endpoint operates on
  a cluster other than the approved network.
- **Affected assets:** Token identity, treasury funds, availability, audit evidence, and player
  expectations.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Use a closed network enum, bind network and genesis identity into configuration
  and authorization domain, validate RPC genesis hash, and prohibit browser override.
- **Detection:** Startup and continuous genesis checks, cross-provider network comparison,
  mint/account absence, and network mismatch rejections.
- **Response:** Fail closed, stop authorization and submission, preserve configuration evidence,
  correct through an unpublished reviewed version, and follow the wrong-network runbook.
- **Residual risk:** Similar addresses across clusters can confuse humans even when software rejects
  them.
- **Owner decision required:** Approve the production network, test-network labeling, and activation
  verification ceremony.

## Gameplay and eligibility threats

### GE-01 — Forged activity completion

- **Threat description:** A player or compromised service claims that an eligible game activity
  completed when the authoritative activity state did not satisfy its rules.
- **Affected assets:** Eligibility integrity, treasury funds, economy integrity, fairness, and audit
  evidence.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Accept only closed, versioned eligibility sources backed by authoritative server
  events and immutable activity receipts; verify participant, outcome, time, and definition version.
- **Detection:** Compare receipts with activity state and telemetry, flag impossible timing or
  outcomes, and monitor source-specific completion anomalies.
- **Response:** Reject or quarantine the eligibility, suspend the affected source if systemic,
  preserve game evidence, correct invalid receipts through separation of duties, and investigate the
  producer.
- **Residual risk:** A flawed activity rule or compromised authoritative producer can create
  syntactically valid forged completions.
- **Owner decision required:** Approve eligible activity definitions, evidence retention,
  false-positive handling, and source-disable authority.

### GE-02 — Duplicate activity receipt

- **Threat description:** The same activity result is emitted or consumed more than once, creating
  multiple prospective rewards.
- **Affected assets:** Exactly-once integrity, treasury reserves, caps, reconciliation, and
  fairness.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Give every source receipt a deterministic globally unique identity, enforce
  uniqueness at the database and authorization layers, and make producer retries idempotent.
- **Detection:** Uniqueness conflicts, repeated source digest, same participants/outcome/time under
  different identifiers, and duplicate-attempt metrics.
- **Response:** Preserve one canonical receipt, reject duplicates, release any provably duplicate
  reservation, audit the producer, and reconcile downstream records.
- **Residual risk:** Semantically duplicate events with deliberately different identifiers may evade
  simple uniqueness.
- **Owner decision required:** Approve semantic duplicate rules, retention duration, and remediation
  for historical duplicates.

### GE-03 — Manipulated contribution

- **Threat description:** A player inflates a contribution score, weight, duration, or resource
  input used by an amount model.
- **Affected assets:** Amount fairness, treasury funds, activity integrity, caps, and player trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Calculate contributions server-side from validated bounded events, cap inputs and
  outputs, use integer deterministic models, and version calculation evidence.
- **Detection:** Distribution outliers, impossible rates, cross-checks against ledger and activity
  receipts, collusion signals, and model-digest mismatch.
- **Response:** Quarantine affected eligibility, pause the source or model, recompute from
  authoritative evidence, reverse only through approved correction controls, and investigate
  exploitation.
- **Residual risk:** Coordinated behavior can look legitimate within individual limits, and bad
  model assumptions can reward undesirable play.
- **Owner decision required:** Approve contribution metrics, bounds, anti-collusion posture, and
  correction/appeal policy.

### GE-04 — Repeated reward request

- **Threat description:** A player repeatedly submits a valid-looking request for the same
  entitlement to exploit races, retries, or inconsistent services.
- **Affected assets:** Exactly-once state, treasury reserves, service availability, and audit logs.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Derive deterministic claim identity from eligibility receipt and policy, use
  idempotency keys, uniqueness constraints, canonical lock order, atomic reservation, and on-chain
  one-time consumption.
- **Detection:** Repeated request rate, duplicate identity conflicts, concurrent reservation
  attempts, and same receipt from multiple sessions or wallets.
- **Response:** Return the canonical existing result, rate-limit abusive repetition, quarantine
  divergent payloads, and reconcile any inconsistent reservations.
- **Residual risk:** High-volume repeats can still create denial-of-service pressure even when no
  duplicate funds move.
- **Owner decision required:** Approve rate limits, suspension thresholds, and how much status
  detail duplicate callers receive.

### GE-05 — Replayed eligibility receipt

- **Threat description:** A valid receipt from an earlier policy, epoch, wallet, player, or
  environment is presented again for a new authorization.
- **Affected assets:** Eligibility, epoch and policy integrity, treasury funds, and caps.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Bind receipt identity to player, source/version, environment, activity occurrence,
  policy/epoch rules, and one canonical claim; enforce consumed uniqueness permanently.
- **Detection:** Previously consumed or expired receipt, environment mismatch, changed digest, and
  replay attempts after wallet change.
- **Response:** Reject, quarantine on divergent bindings, preserve both payloads, and investigate
  producer or data-migration errors.
- **Residual risk:** Incorrect migration or receipt canonicalization can make a replay appear novel.
- **Owner decision required:** Approve receipt lifetime, cross-epoch reuse rule, and permanent
  retention or digest-retention requirements.

### GE-06 — Modified economy receipt

- **Threat description:** An attacker changes a Phase 9A economy receipt, ledger reference, source
  key, amount, actor, or audit field to manufacture eligibility.
- **Affected assets:** Economy ledger integrity, token eligibility, treasury funds, reconciliation,
  and audit evidence.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Treat published economy receipts as immutable, verify server-generated identifiers
  and digests, use database authorization and RLS, restrict service roles, and never trust a browser
  copy.
- **Detection:** Receipt digest mismatch, missing ledger double-entry evidence, invalid source
  registry/version, mutation audit, and reconciliation discrepancies.
- **Response:** Stop the affected source, quarantine dependent claim records, preserve database and
  access logs, restore integrity through controlled correction, and assess credential compromise.
- **Residual risk:** A privileged database compromise could alter a receipt and related evidence
  together.
- **Owner decision required:** Approve which economy receipt types can ever become token eligibility
  and the independent evidence required.

### GE-07 — Administrative correction abuse

- **Threat description:** An administrator creates or modifies a correction to grant themselves or
  an associate token eligibility or a larger amount.
- **Affected assets:** Treasury, correction integrity, administrator trust, fairness, and audit
  evidence.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Separate request, review, approval, and execution; require closed reason codes,
  bounded amounts, immutable evidence, no self-approval, multisig for exceptional thresholds, and
  independent reconciliation.
- **Detection:** Administrator-linked wallets, unusual correction volume or value, same-person role
  overlap, after-hours changes, and correction-to-claim correlation.
- **Response:** Emergency-pause affected paths, revoke administrator access, quarantine unconsumed
  corrections, preserve audit evidence, rotate credentials if necessary, and conduct independent
  review.
- **Residual risk:** Multiple colluding authorized administrators can satisfy formal separation
  controls.
- **Owner decision required:** Approve correction roles, monetary thresholds, conflict-of-interest
  policy, and whether manual corrections may create token eligibility at all.

### GE-08 — Multi-account farming

- **Threat description:** One person controls many player accounts to multiply rewards that are
  intended to be limited per person.
- **Affected assets:** Fairness, treasury capacity, caps, community integrity, privacy, and
  compliance posture.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Use per-player and per-wallet caps, source-specific anti-farming rules, cooldowns,
  risk review, bounded campaign pools, and privacy-reviewed linkage signals.
- **Detection:** Shared wallets, devices, networks, behavior, funding patterns, synchronized play,
  and graph-based clusters with human review.
- **Response:** Quarantine related claims, preserve minimal evidence, apply published enforcement
  and appeal rules, and tune source limits without retroactive secret criteria.
- **Residual risk:** Sybil resistance is imperfect without invasive identity checks, which create
  privacy and access costs.
- **Owner decision required:** Define whether limits target account, wallet, household, or person;
  approve data use, evidence threshold, and appeal rights.

### GE-09 — Wallet rotation farming

- **Threat description:** A player repeatedly links new wallets to evade per-wallet caps, cooldowns,
  risk history, or prior enforcement.
- **Affected assets:** Caps, wallet-link integrity, treasury funds, and abuse controls.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Keep per-player caps authoritative, retain historical wallet links, apply
  wallet-change cooldown, carry risk state across links, and prevent pending-claim reset.
- **Detection:** Frequent wallet changes, wallets shared across accounts, cap activity immediately
  before and after changes, and recurring device/session signals.
- **Response:** Quarantine new claims, freeze wallet changes when appropriate, review the account
  cluster, and apply documented appeal/enforcement procedures.
- **Residual risk:** Legitimate wallet loss or migration can resemble farming, while sophisticated
  farmers can vary other signals.
- **Owner decision required:** Approve link-history retention, cooldown, maximum change frequency,
  and legitimate recovery exception.

### GE-10 — Party collusion

- **Threat description:** Players coordinate parties or cooperative outcomes to manufacture or
  concentrate reward eligibility without meaningful play.
- **Affected assets:** Activity integrity, amount fairness, treasury pool, and community trust.
- **Likelihood:** Medium.
- **Impact:** Medium.
- **Prevention:** Design source rules with minimum participation and diversity, cap repeated
  pairings, validate server-side outcomes, use epoch pools, and avoid client-reported contribution.
- **Detection:** Repeated closed groups, circular benefit patterns, implausible success rates,
  synchronized accounts, and contribution concentration.
- **Response:** Quarantine suspicious receipts, suspend the affected source if necessary,
  investigate clusters, and revise future versioned rules with transparent enforcement.
- **Residual risk:** Legitimate friends often play together, so aggressive controls can penalize
  normal social play.
- **Owner decision required:** Approve collusion definition, acceptable repeat-party behavior,
  review threshold, and disclosure to players.

### GE-11 — Repeated reconnect exploitation

- **Threat description:** A player disconnects and reconnects to trigger duplicate completion,
  participation, timeout, or reward events.
- **Affected assets:** Activity receipts, eligibility, realtime integrity, treasury exposure, and
  availability.
- **Likelihood:** High.
- **Impact:** Medium.
- **Prevention:** Make realtime lifecycle events idempotent, anchor activity outcome in durable
  server state, use reconnect grace windows, and create at most one receipt per
  activity/player/result.
- **Detection:** Reconnect bursts near settlement, duplicate lifecycle events, repeated grace-window
  edges, and receipt/event-count mismatch.
- **Response:** Reject duplicate receipts, quarantine exploit patterns, fix producer idempotency,
  reconcile affected activities, and apply rate limits.
- **Residual risk:** Network instability can produce behavior indistinguishable from deliberate
  reconnecting.
- **Owner decision required:** Approve grace periods, false-positive treatment, and whether unstable
  sessions remain eligible.

### GE-12 — Reward-cap bypass

- **Threat description:** A player bypasses one or more per-claim, player, wallet, source, activity,
  epoch, or global limits through concurrency, time-boundary manipulation, alternate identifiers, or
  inconsistent services.
- **Affected assets:** Treasury reserve, policy integrity, fairness, and availability.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Evaluate every cap atomically in one authoritative transaction, use explicit UTC
  windows and canonical identities, reserve outstanding authorizations, and fail closed on missing
  counters.
- **Detection:** Recompute cap ledgers, alert on negative headroom or boundary bursts, compare
  player/wallet graphs, and run invariant checks.
- **Response:** Emergency-pause if any cap was exceeded, retain reservations, quarantine affected
  records, repair counters through audited correction, and review all claims in the window.
- **Residual risk:** A flawed cap definition can be enforced perfectly yet fail the intended
  business limit.
- **Owner decision required:** Approve all cap values, identity scope, time-window semantics, and
  emergency threshold.

## Application and infrastructure threats

### AI-01 — Compromised API

- **Threat description:** An attacker controls an API process or its deployment and forges
  eligibility, policy results, recipients, amounts, or authorization requests.
- **Affected assets:** Eligibility, policy, authorization key access, treasury exposure, private
  data, and availability.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Apply least privilege, isolate claim evaluation from signing, verify persisted
  receipts and policy independently at signer/program boundaries, use workload identity, hardened
  deployment, and no general treasury key.
- **Detection:** Signed-build and runtime attestation where available, audit-log anomalies, signer
  rejections, unexpected policy digests, endpoint behavior changes, and reconciliation alerts.
- **Response:** Emergency-pause, isolate the service, revoke workload credentials and sessions,
  preserve images/logs, rotate affected keys, validate database and authorization history, and
  redeploy a reviewed build.
- **Residual risk:** A sophisticated compromise may remain within expected traffic and produce
  policy-valid malicious requests.
- **Owner decision required:** Approve service isolation, on-call authority to pause, recovery
  point, and acceptable independent signer checks.

### AI-02 — Compromised realtime server

- **Threat description:** A realtime process fabricates participation, completion, disconnect,
  presence, or social events that feed eligibility.
- **Affected assets:** Activity evidence, eligibility, fairness, availability, and player privacy.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Do not make transient realtime messages direct token authority; settle activities
  through durable server state and receipts, restrict service permissions, sign or authenticate
  internal events, and make retries idempotent.
- **Detection:** Realtime-to-durable-state mismatch, impossible event sequences, producer identity
  changes, source volume spikes, and reconciliation with activity records.
- **Response:** Disable the affected eligibility source, quarantine dependent receipts, isolate the
  server, rotate credentials, rebuild durable activity state where possible, and audit claims.
- **Residual risk:** If the compromised server is also the sole producer of durable evidence,
  detection may depend on behavioral analytics.
- **Owner decision required:** Approve which realtime events may contribute to eligibility and the
  independent corroboration required.

### AI-03 — Compromised worker

- **Threat description:** A background worker advances states, reserves capacity, retries
  transactions, or reconciles records maliciously or incorrectly.
- **Affected assets:** Claim state, exactly-once guarantees, reserves, treasury, and audit evidence.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Give workers narrowly scoped transition permissions, enforce transitions and
  uniqueness in the database, require signer-side payload verification, cap batches, use immutable
  deployment artifacts, and prohibit treasury secrets.
- **Detection:** Invalid transition attempts, unusual batch size or rate, repeated retries, worker
  identity drift, reserve mismatch, and audit gaps.
- **Response:** Stop the worker, retain ambiguous reserves, revoke its identity, inspect queues and
  transitions, reconcile every affected intent, and deploy a reviewed artifact.
- **Residual risk:** A worker acting within broad authorized bounds can create widespread harmful
  but valid-looking operations.
- **Owner decision required:** Approve worker permissions, batch limits, retry authority, and manual
  recovery roles.

### AI-04 — Compromised database service account

- **Threat description:** An attacker uses a privileged database identity to read sensitive data or
  alter eligibility, policy, caps, wallet links, reservations, or audits.
- **Affected assets:** Database integrity and confidentiality, eligibility, treasury exposure,
  player privacy, and evidence.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Use distinct least-privilege roles, RLS plus grants, short-lived credentials where
  possible, immutable/audited records, no signer secrets in database, protected backups, and
  independent signer/program validation.
- **Detection:** Database audit logs, unexpected role or grant changes, direct writes outside
  procedures, digest/reconciliation mismatch, unusual export volume, and credential-use anomalies.
- **Response:** Emergency-pause, revoke and rotate the identity, isolate database access, preserve
  logs and snapshots, assess exfiltration, restore verified integrity, and notify under the exposure
  runbook.
- **Residual risk:** A highly privileged actor may alter data and some local audit evidence
  together.
- **Owner decision required:** Approve role matrix, credential lifetime, independent audit
  destination, and breach-notification standard.

### AI-05 — Compromised administrator

- **Threat description:** An attacker obtains an administrator account or an authorized
  administrator acts maliciously to change policy, eligibility, wallet links, pause state, or
  corrections.
- **Affected assets:** Administrative control, treasury, policy, player data, audit evidence, and
  trust.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Enforce phishing-resistant MFA, no public admin registration, backend
  authorization and RLS, separation of duties, dual approval, bounded typed changes, fresh
  reauthentication, and immutable audit.
- **Detection:** New devices, role escalation, unusual policy/correction activity, self-benefiting
  wallet links, disabled controls, and approval-role overlap.
- **Response:** Suspend the account, emergency-pause affected systems, revoke sessions, preserve
  audit evidence, rotate exposed credentials, reverse only unpublished configuration, and
  independently review actions.
- **Residual risk:** Authorized collusion or subtle malicious choices within approved ranges may
  evade technical controls.
- **Owner decision required:** Approve administrator roles, dual-control thresholds, emergency
  suspension authority, and insider-risk process.

### AI-06 — Permission escalation

- **Threat description:** A user, service, or administrator obtains a more privileged database, API,
  cloud, or signing role than intended.
- **Affected assets:** All claim and treasury controls, credentials, private data, and auditability.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Deny by default, maintain a reviewed role matrix, enforce RLS and backend
  authorization, separate environments, use just-in-time access, test negative permissions, and
  review grants continuously.
- **Detection:** Role/grant changes, denied-action probes, privilege graph drift, unexpected token
  scopes, and sensitive operation by an unapproved identity.
- **Response:** Revoke elevated access, pause affected operations, identify the escalation path,
  rotate credentials, inspect all actions during exposure, and repair policy/configuration.
- **Residual risk:** Configuration complexity and inherited cloud privileges can obscure effective
  access.
- **Owner decision required:** Approve privileged-access model, emergency access, review frequency,
  and evidence retention.

### AI-07 — Leaked service-role credential

- **Threat description:** A Supabase service-role or equivalent privileged credential appears in
  source, client bundles, logs, support artifacts, or an attacker-controlled environment.
- **Affected assets:** Database data, RLS bypass, player privacy, eligibility, wallet links, and
  claim integrity.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Never expose service-role credentials to the browser, use secret management and
  scoped server environments, scan source and artifacts, redact logs, limit credential reach, and
  prefer narrower workload identities.
- **Detection:** Secret scanning, credential-use anomaly, unexpected geographic/IP access,
  RLS-bypass operations, and repository or artifact monitoring.
- **Response:** Treat as compromise, revoke and rotate immediately, emergency-pause, inspect access
  logs and mutations, assess disclosure obligations, and redeploy clean workloads.
- **Residual risk:** Copies can persist in caches, logs, or forks after rotation, and historical
  misuse may be hard to attribute.
- **Owner decision required:** Approve rotation SLA, breach-notification threshold, and replacement
  architecture for broad credentials.

### AI-08 — Insecure logs

- **Threat description:** Logs expose sessions, wallet proof messages/signatures, authorization
  payloads, personal data, credentials, dispute evidence, or internal security decisions.
- **Affected assets:** Privacy, authentication, authorization integrity, credentials, compliance
  posture, and trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Use structured allowlisted logging, redact secrets and sensitive payloads, hash or
  truncate identifiers where appropriate, control access, encrypt transport/storage, and set bounded
  retention.
- **Detection:** Automated sensitive-data scanning, log-schema review, unusual access/export, and
  canary values in nonproduction.
- **Response:** Stop exposure, restrict and preserve relevant logs, rotate affected credentials,
  assess affected users and jurisdictions, delete only under approved evidence/retention procedure,
  and notify as required.
- **Residual risk:** Operational debugging pressure can reintroduce excessive logging, and
  identifiers can be sensitive even without direct secrets.
- **Owner decision required:** Approve data classification, retention, access roles, redaction
  standard, and notification process.

### AI-09 — Malicious deployment

- **Threat description:** A tampered or unauthorized build changes claim logic, captures secrets,
  redirects recipients, weakens controls, or submits transactions.
- **Affected assets:** Application integrity, signer credentials, treasury, player sessions,
  privacy, and audit evidence.
- **Likelihood:** Low.
- **Impact:** Critical.
- **Prevention:** Protect source and CI, require reviewed changes, signed immutable artifacts,
  separation between build and deploy, environment protection, reproducible provenance, and
  activation disabled by independent policy.
- **Detection:** Artifact signature or digest mismatch, unexpected deployment identity/time, runtime
  behavior drift, CSP/build asset changes, and signer or policy rejection.
- **Response:** Emergency-pause, roll back to a verified artifact, revoke deployment and workload
  credentials, preserve provenance, assess secret access, and audit all activity since deployment.
- **Residual risk:** A compromised trusted build pipeline can produce correctly signed malicious
  artifacts.
- **Owner decision required:** Approve deployment approvers, provenance standard, rollback
  authority, and production activation separation.

### AI-10 — Supply-chain compromise

- **Threat description:** A dependency, package registry, build tool, wallet adapter, RPC library,
  or transitive package introduces malicious behavior or vulnerable code.
- **Affected assets:** Browser sessions, wallet interactions, server integrity, credentials,
  treasury, and availability.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Pin lockfiles and runtime versions, minimize dependencies, review high-risk
  packages, verify provenance and integrity, scan continuously, sandbox build steps, and restrict
  install scripts and outbound access.
- **Detection:** Dependency and artifact scanning, lockfile drift, publisher/provenance alerts,
  unexpected network or filesystem behavior, and reproducible-build mismatch.
- **Response:** Freeze deployments, identify affected artifacts and environments, emergency-pause if
  claim paths are exposed, rotate credentials, replace the dependency, and notify impacted users as
  required.
- **Residual risk:** Novel compromise may evade scanners and remain dormant until a specific
  trigger.
- **Owner decision required:** Approve dependency risk policy, accepted registries, emergency patch
  process, and software-bill-of-materials retention.

### AI-11 — Incorrect environment configuration

- **Threat description:** Production uses development values or mismatched network, mint, decimals,
  policy, treasury, feature flag, signer mode, RPC, or secret scope.
- **Affected assets:** Treasury, token identity, availability, player trust, and audit integrity.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Use typed closed configuration, environment-specific manifests, fail-closed
  startup validation, network genesis and live mint inspection, four-eyes publication, and disabled
  defaults.
- **Detection:** Startup/continuous invariants, configuration digest comparison, cross-service
  policy-version mismatch, synthetic probes, and wrong-network/mint alerts.
- **Response:** Stop authorization and submission, preserve the effective configuration, roll back
  only through the reviewed unpublished-config procedure, reconcile exposure, and rotate secrets if
  scopes crossed.
- **Residual risk:** Consistently wrong configuration can pass internal consistency checks unless
  compared with independently approved values.
- **Owner decision required:** Approve canonical environment manifest, change approval, validation
  ceremony, and who can declare production ready.

## Blockchain and treasury threats

### BT-01 — Treasury key compromise

- **Threat description:** An attacker obtains enough treasury authority material to transfer,
  delegate, freeze, close, or otherwise control treasury assets.
- **Affected assets:** Entire treasury, mint/account authorities, governance, SOL fees, and
  organizational trust.
- **Likelihood:** Low.
- **Impact:** Critical.
- **Prevention:** Use a reviewed multisig with hardware-backed geographically and organizationally
  separated participants, transaction simulation and human-readable review, least authority, no
  application-held treasury key, and tested rotation.
- **Detection:** Multisig policy alerts, unrecognized proposals/signatures, on-chain authority or
  balance monitoring, participant-device alerts, and independent treasury reconciliation.
- **Response:** Emergency-pause application claims, invoke multisig/key compromise procedure, move
  or freeze assets only under the approved emergency governance, rotate authorities, notify
  stakeholders, and preserve device/on-chain evidence.
- **Residual risk:** A threshold of compromised or colluding participants can still authorize a
  malicious transfer; recovery itself may expose assets.
- **Owner decision required:** Approve multisig provider, threshold, participants, recovery
  authority, hardware standard, emergency action, and loss/notification plan.

### BT-02 — Signer compromise

- **Threat description:** The prospective authorization-signing key or service is stolen and emits
  valid-looking authorizations for ineligible claims.
- **Affected assets:** Treasury exposure up to program and policy bounds, authorization integrity,
  caps, and trust.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Keep authorization authority distinct from treasury authority, use managed
  non-exportable keys, narrowly validate canonical payloads, enforce on-chain caps/expiry/nonce,
  rate-limit, and support rapid revocation/rotation.
- **Detection:** Signing volume or amount anomalies, policy/source mismatch, unknown workload
  identity, reserve divergence, authorization without database audit, and key-use telemetry.
- **Response:** Emergency-pause, revoke the authorization public key on-chain through approved
  governance, stop signer workloads, rotate credentials, inventory all authorizations, retain
  reserves for ambiguity, and reconcile consumption.
- **Residual risk:** Valid malicious authorizations consumed before revocation can move funds within
  program bounds.
- **Owner decision required:** Approve key custody, allowed signer scope, revocation authority,
  rotation overlap, and maximum loss envelope.

### BT-03 — Malicious signer

- **Threat description:** The signing service or an authorized operator deliberately signs altered
  recipients, amounts, mints, epochs, or fabricated eligibility.
- **Affected assets:** Authorization integrity, treasury, fairness, audit trail, and governance.
- **Likelihood:** Low.
- **Impact:** Critical.
- **Prevention:** Make signing non-discretionary over a canonical independently verified database
  record, require attested workload identity, enforce program-side payload bounds and one-time use,
  separate signer administration, and audit every key use.
- **Detection:** Compare signer request, persisted intent, policy digest, and consumed payload;
  alert on any signature lacking a matching immutable audit record.
- **Response:** Revoke authority, emergency-pause, preserve signer and database evidence, rotate key
  and operators, enumerate issued authorizations, and perform independent incident review.
- **Residual risk:** A malicious signer colluding with a compromised database or API can create
  mutually consistent evidence.
- **Owner decision required:** Approve independent verification boundary, operator access, audit
  destination, and whether multiple authorization signatures are required.

### BT-04 — Wrong mint

- **Threat description:** A transaction or authorization references a mint other than the approved
  $STAR mint for the selected network.
- **Affected assets:** Treasury inventory, token identity, player expectations, and reconciliation.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Pin mint in immutable policy and on-chain configuration, verify live account owner
  and authorities, bind it into authorization, prohibit client input, and use reviewed deployment
  manifests.
- **Detection:** Continuous mint/config comparison, transaction decode before signing, program
  rejection, cross-provider account inspection, and reconciliation mismatch.
- **Response:** Stop and emergency-pause, reject unconsumed authorizations, preserve effective
  configuration and transactions, use the wrong-mint runbook, and require fresh approval before
  recovery.
- **Residual risk:** A governance-approved but mistaken mint can pass all technical checks.
- **Owner decision required:** Approve canonical mint evidence, change governance, and wrong-asset
  remediation.

### BT-05 — Wrong decimals

- **Threat description:** An amount is encoded using decimals different from the live mint, causing
  orders-of-magnitude overpayment or underpayment.
- **Affected assets:** Treasury, player rewards, caps, accounting, and disputes.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Use integer base units, pin reviewed decimals, inspect live mint at startup and
  continuously, bind decimals and amount to policy/authorization, and reject conversions through
  floating point.
- **Detection:** Live-mint mismatch, amount distribution anomaly, preflight decoded amount
  comparison, and gross/net reconciliation.
- **Response:** Emergency-pause, quarantine all affected policy versions, retain reserves, enumerate
  signed/submitted payloads, correct only through a new reviewed policy, and address disputes.
- **Residual risk:** If both configured decimals and human review assumptions are wrong in the same
  way, detection may occur only from external observation.
- **Owner decision required:** Approve decimals evidence, display/rounding rules, and
  overpayment/underpayment remediation.

### BT-06 — Wrong destination token account

- **Threat description:** A transfer targets an account not controlled by the authorized recipient
  or not belonging to the approved mint/token program.
- **Affected assets:** Treasury funds, recipient correctness, player trust, and recovery options.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Deterministically derive or strictly validate destination from recipient wallet,
  mint, and correct token program; verify owner/mint/state, bind it in authorization, and enforce
  on-chain.
- **Detection:** Account-owner or mint mismatch, derivation mismatch, destination change between
  stages, preflight decode, and post-chain reconciliation.
- **Response:** Reject before submission; if systemic, emergency-pause and invoke wrong-recipient
  response; preserve transaction evidence and do not assume blockchain reversal is possible.
- **Residual risk:** A correctly derived account for a compromised wallet still delivers to the
  attacker, and finalized transfers generally cannot be reversed.
- **Owner decision required:** Approve destination derivation, associated-account creation payer,
  exceptional account support, and compensation posture.

### BT-07 — Token-2022 extension incompatibility

- **Threat description:** An unreviewed mint or token-account extension changes transfer rules,
  required accounts, authority, accounting, privacy, or availability.
- **Affected assets:** Transaction correctness, treasury, fees, reconciliation, availability, and
  compliance posture.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Inspect every live extension and authority, maintain a closed compatibility
  matrix, test exact transaction paths, pin program owner, fail closed on unknown/change, and
  re-review upgrades.
- **Detection:** Continuous mint/account extension fingerprint, simulation failure, unexpected extra
  accounts or program invocation, and gross/net mismatch.
- **Response:** Pause, reject affected operations, capture live account data through independent
  RPCs, assess the extension and authorities, and require security/treasury approval for a new
  version.
- **Residual risk:** Complex extension interactions or mutable external hook programs can behave
  unexpectedly after review.
- **Owner decision required:** Approve supported extensions, monitoring cadence, mutable-authority
  tolerance, and reapproval threshold.

### BT-08 — Frozen account

- **Threat description:** The treasury or recipient token account is frozen, or the mint default
  state causes a newly created account to be frozen.
- **Affected assets:** Availability, SOL fees/rent, player expectations, pending reserves, and
  disputes.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Inspect treasury and destination account state before authorization/submission,
  review freeze/default-state authority, simulate creation, and fail closed.
- **Detection:** Account-state polling, transaction simulation/error classification,
  freeze-authority changes, and increased pending/failed records.
- **Response:** Stop new authorizations for affected paths, retain ambiguous reserves, do not
  repeatedly retry, contact the approved authority through governance, and inform affected players.
- **Residual risk:** An external freeze authority may act after preflight and before execution.
- **Owner decision required:** Approve whether any external freeze authority is acceptable and
  define support/compensation for frozen recipients.

### BT-09 — Transfer-fee extension

- **Threat description:** Token-2022 transfer fees cause the recipient to receive less than the
  authorized gross amount or create withheld balances that are misaccounted.
- **Affected assets:** Player reward amount, treasury accounting, caps, withheld fees, disclosures,
  and reconciliation.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Read current fee configuration and epoch, define gross-versus-net promise,
  calculate maximum fee using integer rules, bind reviewed semantics into policy, and reconcile
  withheld amounts.
- **Detection:** Decode mint fee parameters, compare expected and actual recipient delta, track
  withheld balances, and alert on parameter/authority changes.
- **Response:** Pause on unexplained mismatch, quarantine affected reconciliations, preserve
  transfer and mint snapshots, correct disclosures/configuration through review, and resolve
  disputes.
- **Residual risk:** Fee configuration may change at an epoch boundary between planning and
  execution if authority remains mutable.
- **Owner decision required:** Approve whether claims promise gross or net amount, who bears fees,
  fee-authority governance, and disclosure.

### BT-10 — Transfer-hook extension

- **Threat description:** A transfer hook rejects claims, requires unsafe extra accounts, leaks
  data, changes behavior, or invokes a compromised/upgradable program.
- **Affected assets:** Treasury transaction authority, availability, privacy, fees, and transaction
  correctness.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Review hook code, program ID, upgrade authority, extra-account-meta list, and data
  handling; allowlist exact configuration, simulate, minimize account privileges, and reject drift.
- **Detection:** Hook program/config fingerprint changes, unexpected instruction/accounts,
  simulation divergence, hook-specific errors, and fee/compute anomalies.
- **Response:** Emergency-pause affected transfers, do not bypass the hook, inspect program/config
  through independent providers, notify governance, and require a new security approval.
- **Residual risk:** An approved upgradable hook can become malicious after review, and even
  immutable hooks may contain latent defects.
- **Owner decision required:** Approve hook compatibility, upgrade-authority posture, acceptable
  data disclosure, and dependency ownership risk.

### BT-11 — Non-transferable token

- **Threat description:** The configured token is non-transferable or otherwise unsuitable for
  treasury distribution, making the claim design impossible or misleading.
- **Affected assets:** Availability, user expectations, legal disclosures, SOL fees, and product
  integrity.
- **Likelihood:** Low.
- **Impact:** High.
- **Prevention:** Inspect non-transferable and related extensions before architecture approval,
  treat incompatibility as a hard gate, and verify the actual mint rather than metadata.
- **Detection:** Mint extension inspection, simulation rejection, program checks, and
  deployment-manifest validation.
- **Response:** Keep claims disabled, reject the mint/configuration, correct public statements, and
  return to owner/legal/product architecture review.
- **Residual risk:** Token behavior or legal meaning may still differ from user assumptions even
  when technically transferable.
- **Owner decision required:** Confirm the intended token utility and whether non-transferability is
  compatible with the product; otherwise select a different approved design.

### BT-12 — Insufficient SOL fees

- **Threat description:** The fee payer lacks enough SOL for transaction fees, priority fees,
  compute, or associated token-account rent.
- **Affected assets:** Claim availability, pending reserves, operational continuity, and player
  trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Maintain a separately approved minimum SOL reserve and safety buffer, reserve
  conservative fee exposure, monitor rent/fee changes, cap account creation, and test depletion.
- **Detection:** SOL headroom alert, simulation estimate increase, insufficient-funds error, pending
  backlog, and abnormal fee burn.
- **Response:** Pause new authorizations before reserve breach, stop futile retries, fund only
  through approved treasury governance, reconcile pending transactions, and communicate maintenance.
- **Residual risk:** Sudden congestion or fee-market changes can exceed conservative estimates.
- **Owner decision required:** Approve fee payer, minimum reserve, funding authority, priority-fee
  policy, and low-SOL pause threshold.

### BT-13 — Treasury reserve depletion

- **Threat description:** Authorized, pending, confirmed, externally initiated, or incorrectly
  accounted outflows reduce token inventory below the protected reserve.
- **Affected assets:** Treasury solvency, existing commitments, availability, fairness, and
  organizational obligations.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Reserve full authorization face value, apply layered caps atomically, include
  external-outflow allowance and safety buffer, monitor finalized balances, and run worst-case
  simulations.
- **Detection:** Headroom and time-to-depletion alerts, reservation reconciliation, external
  transfer detection, negative-availability invariant, and cap anomalies.
- **Response:** Emergency-pause new authorization, retain existing exposure accounting, reconcile
  every commitment, notify treasury, fund or reduce future capacity only through approved
  governance, and address affected users.
- **Residual risk:** External treasury movement or stale balance evidence can invalidate an
  apparently safe reserve calculation.
- **Owner decision required:** Approve minimum reserve, safety buffer, funding source, commitment
  priority, and behavior when obligations exceed inventory.

### BT-14 — Stale blockhash

- **Threat description:** A transaction uses an expired recent blockhash, fails after signing, or is
  rebuilt in a way that accidentally duplicates intent.
- **Affected assets:** Availability, exactly-once behavior, signer operations, fees, pending
  reserve, and user experience.
- **Likelihood:** High.
- **Impact:** Medium.
- **Prevention:** Build near submission, track last valid block height, use bounded queues, separate
  canonical intent from transaction instance, and make retries verify authorization consumption
  first.
- **Detection:** Blockhash-not-found/expired errors, queue age, last-valid-height checks, and
  repeated transaction instances for one intent.
- **Response:** Classify failure without releasing reserve prematurely, query
  authorization/signature state, rebuild only the same idempotent intent when safe, and halt if
  ambiguity remains.
- **Residual risk:** Network partitions can obscure whether an earlier transaction landed before its
  status became unavailable.
- **Owner decision required:** Approve transaction lifetime, queue bounds, durable-nonce posture if
  considered, and retry timeout.

### BT-15 — RPC provider compromise

- **Threat description:** An RPC provider lies about account state, blockhash, simulation, signature
  status, transaction data, or network identity.
- **Affected assets:** Mint verification, balance/reserve accounting, transaction correctness,
  confirmation, availability, and privacy.
- **Likelihood:** Medium.
- **Impact:** Critical.
- **Prevention:** Validate genesis, use TLS/authentication, minimize sensitive queries, compare
  security-critical reads with an independent provider, verify cryptographic/account invariants, and
  never let one RPC define final business state.
- **Detection:** Cross-provider disagreement, impossible slot/account changes, signature proof
  mismatch, latency/error anomaly, and independent index/reconciliation checks.
- **Response:** Remove the provider from service, pause affected claims, preserve conflicting
  responses and slots, switch to reviewed providers, rotate credentials, and revalidate all
  uncertain state.
- **Residual risk:** Multiple providers may share infrastructure or upstream data and fail or
  collude together.
- **Owner decision required:** Approve provider diversity, quorum policy, privacy posture, failover
  authority, and acceptable cost.

### BT-16 — RPC provider disagreement

- **Threat description:** Independent RPC providers return materially different balances, account
  configuration, blockhash/slot, or transaction status.
- **Affected assets:** Availability, reserve accuracy, confirmation, mint/extension integrity, and
  dispute evidence.
- **Likelihood:** Medium.
- **Impact:** High.
- **Prevention:** Define comparable commitment and slot semantics, use bounded staleness, require
  quorum for critical reads, retain observations, and fail closed rather than selecting the
  favorable answer.
- **Detection:** Automated response/slot/config comparison and provider-health alerts.
- **Response:** Quarantine affected claims, pause at the configured threshold, retain reserves,
  query additional independent evidence, identify lag versus corruption, and resume only after
  convergence criteria.
- **Residual risk:** Honest temporary disagreement is normal, so strict handling can reduce
  availability.
- **Owner decision required:** Approve quorum, staleness tolerance, pause threshold, and which
  independent evidence resolves disagreement.

### BT-17 — Duplicate transaction submission

- **Threat description:** Workers, retries, users, or failover systems submit the same intent more
  than once and potentially transfer twice.
- **Affected assets:** Treasury, exactly-once guarantees, fees, reserve accounting, and player
  trust.
- **Likelihood:** High.
- **Impact:** Critical.
- **Prevention:** Use one deterministic claim/authorization identity, on-chain one-time nonce
  consumption, database uniqueness, canonical intent locking, and retry logic that never creates a
  new entitlement.
- **Detection:** Multiple transaction signatures for one authorization, program
  duplicate-consumption rejection, idempotency conflicts, and reconciliation of intent-to-signature
  cardinality.
- **Response:** Stop retries, retain ambiguity reserve, inspect all signatures and on-chain
  consumption, emergency-pause if double settlement is possible, and correct accounting through
  audited procedure.
- **Residual risk:** A flawed on-chain replay guard or alternative authorization identity could
  permit two valid transfers.
- **Owner decision required:** Approve the on-chain exactly-once primitive, retry ownership, and
  remedy for confirmed duplicate payment.

### BT-18 — Transaction confirmation ambiguity

- **Threat description:** Submission returns a timeout or error while the transaction may have
  landed, leaving the system unable to classify it safely.
- **Affected assets:** Exactly-once state, pending reserve, availability, user experience, and
  reconciliation.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Persist signature before/with submission state, use deterministic intent, poll
  multiple providers, inspect authorization consumption, define finality and timeout, and never
  equate timeout with failure.
- **Detection:** Submission without definitive status, provider disagreement, aged pending record,
  database/program mismatch, and unknown signature history.
- **Response:** Quarantine, retain full reserve, suppress duplicate authorization, query independent
  evidence through the ambiguity runbook, and escalate aged cases for reconciliation.
- **Residual risk:** Evidence can remain unavailable during prolonged outages, delaying both user
  resolution and reserve release.
- **Owner decision required:** Approve ambiguity timeout, user messaging, manual review authority,
  and maximum reserve lock duration.

### BT-19 — Chain reorganization

- **Threat description:** A transaction observed at a weaker commitment is later removed or its
  surrounding state changes during a Solana fork.
- **Affected assets:** Confirmation correctness, database state, reserve release, player balance,
  and reconciliation.
- **Likelihood:** Low.
- **Impact:** High.
- **Prevention:** Distinguish processed, confirmed, and finalized; settle business state and release
  reserves only at approved commitment; retain slot/block evidence and monitor reorganizations.
- **Detection:** Signature/account disappearance or changed slot across providers, commitment
  regression, fork notifications, and reconciliation mismatch.
- **Response:** Reopen the record to ambiguity under a controlled transition, retain or restore
  reserve, stop duplicate payment, requery final state, and pause if reorganization exceeds policy.
- **Residual risk:** Waiting for stronger finality increases latency but cannot eliminate all chain
  risk.
- **Owner decision required:** Approve finality level, reorganization depth threshold, user-visible
  status, and settlement timing.

### BT-20 — Partial outage

- **Threat description:** Some combination of API, database, signer, worker, RPC, program, wallet
  adapter, or network remains available while another dependency fails, producing unsafe partial
  progress.
- **Affected assets:** State consistency, exactly-once behavior, availability, reserves, audit
  evidence, and player trust.
- **Likelihood:** High.
- **Impact:** High.
- **Prevention:** Design explicit durable handoff states, idempotent recovery, transactional
  outbox/inbox patterns where applicable, dependency health gates, bounded queues, circuit breakers,
  and fail-closed signing.
- **Detection:** Cross-component health and lag, missing handoff audit, aged state, queue imbalance,
  reservation mismatch, and synthetic end-to-end probes that do not move funds.
- **Response:** Stop new work at the safest boundary, preserve in-flight state and reserves, avoid
  blind retries, recover components in documented order, reconcile every partial intent, and
  communicate degraded status.
- **Residual risk:** Conservative handling preserves safety at the cost of availability and can
  create a large manual reconciliation backlog.
- **Owner decision required:** Approve dependency service levels, degradation modes, recovery order,
  maximum backlog, and emergency staffing.

## Cross-cutting approval requirement

No prevention item in this model is considered implemented merely because it is documented or
represented in a mock package. Before any future token-claim activation, each threat requires:

1. a named accountable owner;
2. linked implementation and test evidence;
3. an accepted residual-risk decision;
4. verified monitoring and response ownership; and
5. owner, security, treasury, and legal approval where applicable.

Until then, claims remain disabled and no signer, transaction, hosted mutation, published
configuration, or migration exists as part of Phase 9B-A.
