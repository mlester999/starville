# Phase 9B-A disabled token-claim foundation

> **TOKEN CLAIMS DISABLED. PHASE 9B-A ARCHITECTURE MODE. NO ON-CHAIN TRANSFERS ARE ACTIVE. NO
> TREASURY SIGNER IS CONNECTED. NO PLAYER CLAIM ACTION EXISTS. NO DATABASE MIGRATION IS CREATED.**

## Scope

This document defines testable types, closed registries, state invariants, and future trust
boundaries for offline architecture and deterministic simulation. It does not define a live payout
API, persisted production schema, signer credential, treasury, blockhash, transaction, or
deployment.

All identifiers and examples in Phase 9B-A are fixture-only or conceptual. A mock authorization is
not a signed production authorization. An offline instruction plan is not a transaction.

## Future trust boundaries

### Game client

The future client may display safe public claim status and submit a claim-intent request under a
fresh verified session. It must not choose or modify reward amount, source receipt, treasury, mint,
network, policy, epoch, recipient after authorization, eligibility result, cap result, reserve
result, or authoritative state. It receives no treasury or authorization secret and cannot create a
claim record directly.

Phase 9B-A adds no player claim action.

### Player wallet

The wallet proves control of the intended recipient and may eventually sign a transparent claim
message or transaction. It remains non-custodial and never shares a seed phrase, recovery phrase,
private key, secret-key array, or password. Current access proof does not authorize a future claim;
future claim creation must require separately defined freshness and intent semantics.

### API

The future API validates the current player session, resolves the durable safe player ID, requires a
fresh verified wallet, reads immutable eligibility, applies closed policy and cap rules, and creates
one idempotent intent. It cannot invent eligibility, choose an unapproved amount, modify authorized
fields, sign treasury transactions, or directly settle a claim.

### Realtime server

The realtime server may produce bounded gameplay evidence only through reviewed server-authoritative
activity settlement. It has no treasury authority, cannot independently create token eligibility,
cannot authorize or submit a claim, and cannot sign anything.

### Worker

A future worker may advance bounded states, expire mock authorizations, reconcile receipts, and
retry idempotent tasks. It cannot invent source receipts, modify immutable eligibility, change
recipient/amount/mint/network, bypass caps or reserves, sign, or submit a transaction.

### Database

A future database design stores immutable source evidence, eligibility, intents, authorization
digests, cap/reserve reservations, state transitions, receipts, quarantine, disputes, and audit. It
enforces uniqueness and serializes allocation. It does not hold a treasury key or sign a claim.

Phase 9B-A creates no migration and persists none of these models.

### Authorization service

This is a possible future isolated service and is disabled in Phase 9B-A. It may eventually receive
only a fully validated canonical payload and authorize within a narrow versioned policy. It cannot
change recipient, mint, network, amount, source, epoch, policy, nonce, or expiry. Its authorization
key must be distinct from treasury authority and ordinary application credentials.

### Treasury signer and multisig

Neither exists or is connected in Phase 9B-A. The preferred future model keeps treasury funds under
a reviewed multisig. Application services never load the final treasury signing key. The multisig
would govern bounded claim-vault funding, reserve policy, pause, program settings, and rotations.

### Solana

Only a future reviewed claim program can become final settlement authority. It must verify the
canonical authorization, exact program/network/mint, recipient, amount, policy, epoch, nonce,
expiry, vault, pause state, caps available on chain, and replay state before transfer. Phase 9B-A
does not deploy or invoke such a program.

## Closed eligibility origin registry

Future token eligibility may originate only from one immutable, validated source receipt in this
closed registry:

| Source category                   | Required evidence                                                                                | Excluded shortcut                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `cooperative_activity_completion` | Immutable successful cooperative-activity completion receipt with exactly-once reward outcome    | Client progress, reconnect count, chat, party membership alone |
| `approved_economy_reward`         | Immutable approved economy reward receipt from a closed source registry                          | DUST balance, item inventory, shop spend, arbitrary ledger row |
| `approved_seasonal_event`         | Immutable approved event result under a published version and eligibility cutoff                 | Client leaderboard value or mutable event progress             |
| `approved_administrative_reward`  | Separately reviewed bounded reward receipt with reason category, separation of duties, and audit | Free-form amount entry or ordinary DUST correction             |

No token eligibility may derive directly from connected-wallet holdings, DUST, SOL, inventory,
friend/party/chat counts, arbitrary JSON, administrator free text, or a browser assertion.

## Conceptual immutable eligibility model

The architecture model uses these bounded fields:

| Field                                              | Rule                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `publicEligibilityId`                              | Deterministic mock ID from fixed domain/version, source category, receipt ID/digest, and safe player ID; policy is separately bound |
| `safePlayerId`                                     | Durable safe player ID resolved by trusted server state                                                                             |
| `verifiedRecipientWallet`                          | Canonical wallet freshly verified for this eligibility; immutable after approval                                                    |
| `sourceReceiptId`                                  | One immutable trusted source receipt; globally unique for eligibility creation                                                      |
| `sourceReceiptDigest`                              | Digest of the immutable canonical source evidence                                                                                   |
| `sourceCategory`                                   | Closed registry above                                                                                                               |
| `sourceKey`                                        | Closed source definition key with the shared 3–80 character boundary                                                                |
| `activityKey`                                      | Optional closed activity definition key with the shared 3–80 character boundary                                                     |
| `rewardCategory`                                   | Closed bounded policy category; never arbitrary executable logic                                                                    |
| `tokenMint`                                        | Exact canonical mint from the reviewed policy                                                                                       |
| `tokenProgram`                                     | Exact classic SPL Token or Token-2022 program type reviewed for the mint                                                            |
| `network`                                          | Exact supported network identifier and authorization domain                                                                         |
| `amountBaseUnits`                                  | Positive decimal-free integer string within receipt/policy/cap bounds                                                               |
| `decimals`                                         | Mint interpretation captured from reviewed policy; not browser input                                                                |
| `policyVersion`                                    | Immutable published policy identifier                                                                                               |
| `campaignId` / `epochId`                           | Bounded allocation domains that must match the policy                                                                               |
| `earliestClaimAt`                                  | Trusted timestamp no earlier than receipt finalization                                                                              |
| `expiresAt`                                        | Trusted bounded expiry after earliest claim time                                                                                    |
| `status` / `revision`                              | Closed eligibility status with expected-revision transitions; no arbitrary assignment                                               |
| `disqualificationState` / `disqualificationReason` | Closed controlled state and reason; never private notes in a public view                                                            |
| `reasonCategory` / `safeReasonSummary`             | Closed reason and bounded non-sensitive summary                                                                                     |
| `idempotencyKey`                                   | Deterministic operation key bound to the same semantic request                                                                      |
| `auditCorrelation`                                 | Safe bounded correlation reference, not a secret or authority                                                                       |
| `createdAt` / `statusUpdatedAt`                    | Trusted server/database times                                                                                                       |

Approval makes every value field immutable. Later operations may change only the closed status,
controlled disqualification/quarantine references, and append-only audit fields.

## Deterministic identifiers and digests

The package's mock public IDs use a fixed versioned domain and deterministic fixture serialization,
conceptually:

```text
publicEligibilityId = fixtureDigest(domain, sourceCategory, sourceReceiptId, sourceReceiptDigest, safePlayerId)
publicClaimId       = fixtureDigest(domain, publicEligibilityId)
```

The exact future persisted-ID encoding requires security review and may bind further immutable
version fields without changing an existing identity. Canonical fields must use fixed UTF-8
encoding, fixed field order, explicit length delimiters or an unambiguous canonical format,
base-unit decimal strings, canonical Solana addresses, and closed enum values. JSON property
insertion order, locale formatting, floats, and delimiter-ambiguous concatenation are not acceptable
authority.

The source receipt digest binds its immutable canonical content. It is not a digest of browser JSON.

## Claim-intent state machine

### Full future design vocabulary

A later implementation may need the conceptual states `draft`, `ineligible`, `eligible`,
`review_required`, `quarantined`, `authorized`, `queued`, `transaction_planned`,
`transaction_built`, `submitted`, `processed`, `confirmed`, `failed_retryable`, `failed_terminal`,
`expired`, `cancelled`, `disputed`, and `resolved`. This is design vocabulary only: it is not the
Phase 9B-A executable registry, it defines no future transition permission, and none of its live
transaction states is enabled.

### Closed Phase 9B-A registry

The package export `CLAIM_STATE_TRANSITIONS` is the executable closed registry. Its exact states
are:

`draft`, `ineligible`, `eligible_mock`, `review_required_mock`, `quarantined_mock`,
`authorized_mock`, `expired_mock`, and `cancelled_mock`.

Every state is an architecture/mock concept in Phase 9B-A, including `authorized_mock`: there is no
signer, valid token authorization, transaction builder, submission, on-chain claim, or treasury
movement. Transaction lifecycle terms such as queued, built, submitted, processed, and confirmed are
deliberately outside this registry and cannot be constructed by the Phase 9B-A package.

### Closed mock transition registry

| From                   | Allowed destination    | Architectural condition; enforced by the bounded authority workflow                               |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `draft`                | `eligible_mock`        | Source, player, wallet, amount, policy, time, and uniqueness fixture checks pass                  |
| `draft`                | `ineligible`           | Trusted source or policy fixture validation fails with a closed reason                            |
| `draft`                | `review_required_mock` | A closed review threshold is met                                                                  |
| `draft`                | `quarantined_mock`     | A closed high-confidence quarantine trigger is present                                            |
| `draft`                | `expired_mock`         | Trusted eligibility expiry wins before evaluation completes                                       |
| `draft`                | `cancelled_mock`       | Controlled cancellation wins before evaluation completes                                          |
| `eligible_mock`        | `review_required_mock` | New bounded review evidence appears before mock authorization                                     |
| `eligible_mock`        | `quarantined_mock`     | A closed quarantine trigger appears before mock authorization                                     |
| `eligible_mock`        | `authorized_mock`      | Expected revision, fresh wallet, caps, epoch, policy, and fixture reserves pass                   |
| `eligible_mock`        | `expired_mock`         | Trusted eligibility expiry passes                                                                 |
| `eligible_mock`        | `cancelled_mock`       | Player or system cancellation wins under expected revision                                        |
| `review_required_mock` | `eligible_mock`        | Authorized fixture reviewer clears review with audit and no disqualifier                          |
| `review_required_mock` | `ineligible`           | Authorized fixture reviewer records a closed ineligibility reason                                 |
| `review_required_mock` | `quarantined_mock`     | Review finds a quarantine trigger                                                                 |
| `review_required_mock` | `expired_mock`         | Expiry wins before review resolution                                                              |
| `review_required_mock` | `cancelled_mock`       | Controlled cancellation wins before review resolution                                             |
| `quarantined_mock`     | `eligible_mock`        | Independent fixture review clears all blocking triggers                                           |
| `quarantined_mock`     | `ineligible`           | Independent fixture review confirms disqualification                                              |
| `quarantined_mock`     | `expired_mock`         | Expiry wins while held                                                                            |
| `quarantined_mock`     | `cancelled_mock`       | Controlled cancellation wins while held                                                           |
| `authorized_mock`      | `quarantined_mock`     | A wallet, suspension, or integrity trigger blocks the mock authorization before any live boundary |
| `authorized_mock`      | `expired_mock`         | Mock authorization expires unused                                                                 |
| `authorized_mock`      | `cancelled_mock`       | Controlled cancellation wins before any future submission boundary                                |

`ineligible`, `expired_mock`, and `cancelled_mock` are terminal. No Phase 9B-A state can transition
to a transaction lifecycle or represent a live authorization.

The package transition function enforces the current expected revision, an allowed destination,
closed reason, trusted timestamp shape, and immutable authorization binding. A future persisted
transition must additionally require an actor category, canonical idempotency key, and append-only
audit record. Arbitrary status assignment is forbidden in both designs.

## Exactly-once guarantees

The future design must prove all of these invariants:

1. One source receipt creates at most one eligibility record.
2. One eligibility creates at most one authoritative claim intent.
3. Two browser sessions cannot create two active claims for one eligibility.
4. An idempotent retry returns the original semantic result and cannot reserve funds twice.
5. Amount, recipient, mint, network, policy, epoch, source digest, and treasury identifier cannot
   change after authorization.
6. Expired or cancelled authorization cannot be used.
7. A confirmed claim and its receipt cannot be edited or cancelled.
8. A wallet change cannot redirect an existing eligibility, intent, authorization, or confirmed
   receipt.
9. Duplicate transaction attempts cannot produce duplicate on-chain settlement.
10. Cap and reserve allocation cannot be exceeded by races.

### Future persistence controls

The future schema proposal—not a Phase 9B-A migration—must include:

- unique source-receipt identity on eligibility;
- unique authoritative claim identity on eligibility;
- unique canonical idempotency key plus stored request digest;
- unique authorization nonce and authorization digest;
- unique future on-chain claim/nonce receipt;
- expected revisions on mutable lifecycle rows;
- immutable columns/triggers for authorized and confirmed fields;
- row locks for eligibility and claim transitions;
- deterministic advisory-lock domains for player, wallet, epoch, and treasury allocation;
- serializable or equivalently safe cap/reserve reservation transactions;
- append-only transition, authorization, reconciliation, and administrator audit records; and
- explicit reservation release rules for expiry, cancellation, and terminal failure.

Lock ordering must be fixed and documented, for example: policy → epoch → treasury reserve → player
cap → wallet cap → source cap → eligibility → claim. All implementations and recovery jobs must use
the same order.

### Idempotency semantics

An idempotency key is valid only for one canonical request digest. Reusing it with a changed wallet,
recipient, amount, mint, network, policy, epoch, or source is a conflict, not a retry. Retrying a
completed operation returns the original public ID/state. Retrying an operation whose outcome is
ambiguous first reads authoritative state; it never assumes failure and allocates again.

## Canonical authorization payload

A future authorization is a versioned immutable payload with this exact conceptual field order:

1. `authorizationVersion`
2. `domainSeparator`
3. `claimPublicId`
4. `eligibilityPublicId`
5. `safePlayerId`
6. `recipientWallet`
7. `tokenMint`
8. `tokenProgram`
9. `network`
10. `amountBaseUnits`
11. `decimals`
12. `policyVersion`
13. `epochId`
14. `nonce`
15. `issuedAt`
16. `expiresAt`
17. `treasuryIdentifier`
18. `sourceReceiptDigest`

This list exactly matches the package export `CANONICAL_AUTHORIZATION_FIELDS`. The package's mock
canonical serialization writes one line per field as `<key.length>:<key>:<value.length>:<value>`,
with null encoded as `~`. The current mock schema requires normalized UTC ISO timestamps and
preserves those canonical strings in serialization. A future signed format must formally freeze and
test that representation. The domain separator must distinguish Starville, environment, chain, claim
program, payload version, and intended action. Serialization must be deterministic and independently
testable. The signature binds the complete payload, not selected fields. Unknown fields or versions
fail closed.

Recipient, mint, network, token program, amount, policy, epoch, nonce, treasury, source digest, and
expiry are immutable once the mock authorization is created. Phase 9B-A may hash and compare fixture
payloads but has no live key and produces no valid treasury or on-chain authorization signature.

## Disabled and mock signer boundaries

### Disabled signer

The disabled provider reports mode `disabled`, accepts no secret input, exposes no key material, and
rejects authorization signing and transaction submission deterministically. A signing attempt is a
security/architecture event, not a fallback to another provider.

### Mock signer

The mock provider uses only fixed, visibly fixture-only identifiers and deterministic local hashes.
It cannot create a valid live treasury or authorization signature, cannot submit, cannot call a
network, cannot read environment secrets, cannot load files, and cannot generate a Solana keypair.
Its output must contain `FIXTURE`, `MOCK`, or equivalent unambiguous labeling.

No production, environment, filesystem, browser, KMS, HSM, remote, private-key, keypair, or multisig
signer provider exists in Phase 9B-A.

## Offline instruction-planning boundary

An `OfflineTransactionPlan` or `ClaimInstructionPlan` is plain typed validation output containing
only:

- recipient, mint, network, token-program type, amount base units, and decimals;
- destination-account expectation;
- authorization and claim fixture IDs;
- fixture-only fee and compute estimates;
- the trusted mock claim state and normalized evaluation timestamp; and
- closed validation results.

It must not obtain a recent blockhash, create a live transaction object, serialize broadcast-ready
bytes, call Devnet/Mainnet/local RPC, simulate through RPC, sign, request wallet approval, submit,
or invoke any send/sign method. The implemented plan output carries the exact banners
`OFFLINE SIMULATION` and `NO BLOCKCHAIN TRANSACTION WAS SENT`.

## Wallet-change behavior

### Pending eligibility

Eligibility binds to the verified wallet used during creation. It does not follow a later wallet
link or browser account selection. A policy-approved change requires cancellation or expiry of the
old eligibility and complete re-evaluation against a freshly verified wallet, with source-receipt
uniqueness preventing two valid eligibilities.

### Pending intent or authorization

The browser cannot edit the recipient. Wallet disconnect does not redirect or cancel server state. A
different verified wallet creates a mismatch and invalidates an incompatible mock authorization;
fresh verification and controlled cancellation/re-evaluation are required. An already authorized
amount cannot move to the new wallet.

### Future confirmed claim

Recipient, authorization digest, on-chain receipt, and source association remain immutable. A later
wallet change affects only future eligibility and cannot rewrite history.

## Mock quarantine model

Closed triggers are:

- `duplicate_source_receipt`
- `ledger_mismatch`
- `suspended_player`
- `wallet_verification_conflict`
- `claim_above_review_threshold`
- `source_receipt_invalidated`
- `policy_mismatch`
- `wrong_mint`
- `wrong_network`
- `abnormal_velocity`
- `suspected_multi_account_farming`
- `treasury_reserve_conflict`

A quarantine decision records a safe public ID, claim/eligibility/player references, one or more
closed triggers, severity, trusted evidence references, actor category, expected revision, hold
time, review deadline, resolution, timestamps, and audit correlation. It never exposes private staff
notes publicly.

Quarantine is idempotent, bounded, reviewable, and visible only to authorized staff. Weak heuristics
such as velocity or suspected multi-account association can trigger review but cannot permanently
deny eligibility without corroborating evidence and an authorized decision. Expiry and reserve
release behavior remain deterministic while held.

## Future dispute model

Closed dispute states are `opened`, `acknowledged`, `investigating`, `resolved_eligible`,
`resolved_ineligible`, and `closed`.

The conceptual record includes a safe dispute ID, mock claim ID, safe player ID, closed reason
category, bounded player-visible summary, separate private staff notes, evidence references,
resolution category, opening/acknowledgement/resolution/closure timestamps, assigned role, expected
revision, and audit references.

Public/player views may expose status and approved summary only. They never expose staff notes,
internal risk signals, linked-account hypotheses, administrator identity, secret evidence URLs, or
anti-abuse thresholds. Resolution cannot silently edit authorized/confirmed values; it changes
eligibility for a future action or records a separate governed remedy.

## Monitoring design

Phase 9B-A connects no external monitoring. A future implementation must expose bounded aggregate
metrics without wallet addresses, secret payloads, private evidence, or provider credentials.

### Metrics

| Metric                                  | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `claim_intent_attempts_total`           | Volume by safe outcome and policy version                       |
| `claim_duplicate_attempts_total`        | Idempotent retries and conflicting duplicate requests           |
| `claim_eligibility_rejections_total`    | Closed rejection category                                       |
| `claim_wallet_mismatch_total`           | Player/session/recipient binding failures                       |
| `claim_wrong_mint_attempts_total`       | Mint-policy mismatches                                          |
| `claim_wrong_network_attempts_total`    | Network/domain mismatches                                       |
| `claim_quarantine_total`                | Opens, clears, confirms, and age buckets                        |
| `claim_authorizations_total`            | Mock now; future bounded authorization outcomes                 |
| `claim_authorization_expiry_total`      | Unused expiration and reservation release                       |
| `claim_cap_rejections_total`            | Layered cap category without exposing threshold values publicly |
| `claim_reserve_rejections_total`        | Token reserve, fee reserve, pending exposure, or safety buffer  |
| `claim_signer_disabled_attempts_total`  | Any call reaching the disabled signer boundary                  |
| `claim_disputes_total`                  | Opened and resolved by safe category                            |
| `claim_simulation_duration_seconds`     | Offline scenario runtime by size and seed label                 |
| `claim_fixture_fee_units_total`         | Fixture-only fee usage; never labeled real SOL spending         |
| `claim_replay_rejections_total`         | Duplicate authorization/nonce/receipt attempts                  |
| `claim_reconciliation_mismatches_total` | Off-chain versus future on-chain/provider disagreement          |

### Alerts

| Alert                      | Future trigger and response intent                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Treasury token reserve low | Available authorization amount approaches the approved reserve/safety boundary; pause new authorization |
| SOL fee reserve low        | Estimated fee runway crosses approved threshold; pause new submission, not eligibility review           |
| Duplicate spike            | Duplicate/conflicting idempotency or nonce attempts exceed baseline; investigate replay/automation      |
| Quarantine spike           | Quarantine rate or unresolved age exceeds policy; pause affected source/policy                          |
| Authorization spike        | Authorization velocity exceeds campaign/epoch expectation; pause and reconcile                          |
| Wrong-network spike        | Network/domain mismatch rate increases; verify deployment/RPC/configuration                             |
| RPC disagreement           | Independent providers return materially different slot/state; fail closed and investigate               |
| Signer unavailable         | Future isolated signer health fails; do not fall back to application signing                            |
| Database mismatch          | Cap/reserve/eligibility/intent or reconciliation invariants disagree; pause affected scope              |
| Audit failure              | Required immutable audit write or export verification fails; deny sensitive transition                  |

Alert acknowledgement, pause, investigation, decision, and restoration require durable operator
records. No alert automatically authorizes, denies permanently, or transfers funds.

## Phase boundary

Everything in this document remains architecture, fixture, mock, or offline simulation. It creates
no claim route, no player button, no database migration, no treasury, no key, no signer, no
blockhash, no transaction bytes, no RPC call, and no transfer.
