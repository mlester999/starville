# Phase 9B-A Treasury Controls and Depletion Simulation

> **Architecture-only status:** Phase 9B-A does not enable token claims, create a signer, submit a
> transaction, publish configuration, alter hosted state, or add a database migration. Every policy
> and calculation in this document is a reviewable design or local fixture specification. The
> default and only current claim state is disabled.

## Purpose

This document specifies the prospective policy, reserve, cap, epoch, amount, Token-2022,
confirmation, and depletion controls that would be required before a later implementation phase
could move treasury assets. It does not approve a claim architecture or authorize Phase 9B-B.

The candidate architecture remains the signed-authorization on-chain program with a
multisig-controlled treasury described in the Phase 9B-A ADR. Owner, security, treasury, and legal
approval are still required.

## Control principles

- The server is authoritative for eligibility and policy evaluation.
- The on-chain program is authoritative for authorization consumption and transfer constraints in
  the recommended candidate.
- A wallet signature proves control of an address; it does not prove eligibility or authorize an
  arbitrary amount.
- The browser never chooses an authoritative mint, network, treasury, recipient, amount, epoch,
  policy version, or expiration.
- Published policy versions are immutable. Corrections require a new version with a later effective
  time.
- Closed registries replace arbitrary strings, expressions, scripts, and untyped JSON.
- Authorization reserves are accounted for before signing so outstanding authorizations cannot
  silently overcommit the treasury.
- Token balance and SOL fee reserve are independent safety constraints.
- DUST remains an off-chain game currency and is never treated as the future $STAR token.
- Fail closed when policy, balance, mint, extension, RPC, or confirmation evidence is missing or
  contradictory.

## Typed, versioned claim policy

A future policy object must be a typed record validated at its administrative API boundary,
persistence boundary, worker boundary, and signer boundary. Phase 9B-A does not create this object
in the database and does not publish a policy.

| Field                              | Required type and closed values                               | Required rule                                                       |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Policy version                     | Positive integer                                              | Monotonically increasing and immutable after publication            |
| Effective time                     | UTC instant                                                   | Must be later than publication review; never retroactive            |
| Feature enabled                    | Boolean                                                       | Defaults to false; requires approved activation procedure           |
| Maintenance mode                   | Boolean                                                       | When true, no new authorization may be issued                       |
| Emergency pause                    | Boolean                                                       | When true, signing and submission stop immediately                  |
| Network                            | Closed Solana network enum                                    | Exact approved cluster; never browser supplied                      |
| Mint                               | Valid Solana public key                                       | Exact reviewed mint for the selected network                        |
| Token program                      | Closed classic SPL Token or Token-2022 enum                   | Must equal the live mint account owner                              |
| Mint decimals                      | Integer in an approved range                                  | Must equal live mint metadata at activation and monitoring time     |
| Treasury public address            | Valid Solana public key                                       | Public identifier only; no secret material                          |
| Claim architecture                 | Closed architecture enum                                      | Must equal the owner-approved ADR selection                         |
| Signer mode                        | Closed signer-mode enum                                       | Disabled, authorization-only, or another separately approved mode   |
| Minimum claim amount               | Unsigned base-unit integer                                    | At least one base unit and no greater than maximum                  |
| Maximum claim amount               | Unsigned base-unit integer                                    | Bounded by risk and treasury review                                 |
| Per-player daily cap               | Unsigned base-unit integer                                    | Evaluated in a declared UTC window                                  |
| Per-player weekly cap              | Unsigned base-unit integer                                    | Evaluated in a declared UTC window                                  |
| Per-player monthly cap             | Unsigned base-unit integer                                    | Evaluated in a declared UTC window                                  |
| Per-wallet daily cap               | Unsigned base-unit integer                                    | Applies across linked players and wallet changes                    |
| Per-source cap                     | Typed map from closed eligibility source to amount            | No unknown source is eligible                                       |
| Per-activity cap                   | Typed map from approved activity definition/version to amount | Unversioned activity identifiers are rejected                       |
| Per-campaign cap                   | Unsigned base-unit integer per approved campaign              | Campaign identity and version are immutable                         |
| Global daily cap                   | Unsigned base-unit integer                                    | Includes issued and pending reservations                            |
| Global weekly cap                  | Unsigned base-unit integer                                    | Includes issued and pending reservations                            |
| Epoch cap                          | Unsigned base-unit integer                                    | Applies to the named immutable epoch                                |
| Minimum token reserve              | Unsigned base-unit integer                                    | Must remain after all committed outflow                             |
| Minimum SOL fee reserve            | Unsigned lamport integer                                      | Must remain after conservative fee exposure                         |
| Pending-claim reserve              | Unsigned base-unit integer                                    | Tracks outstanding authorization and pending-transfer exposure      |
| Pending authorization reserve mode | Closed enum                                                   | Full face value is the required initial mode                        |
| Authorization lifetime             | Positive bounded duration                                     | Short, fixed maximum; no client-selected expiry                     |
| Confirmation policy                | Closed enum plus numeric thresholds                           | Defines commitment, finality, timeout, and ambiguity behavior       |
| Retry policy                       | Typed bounded attempts and backoff                            | Same intent never becomes a second authorization or receipt         |
| Compliance review threshold        | Unsigned base-unit integer                                    | Crossing threshold quarantines for review; it does not auto-approve |
| High-risk review threshold         | Unsigned base-unit integer                                    | Crossing the threshold quarantines for reviewed risk handling       |

### Policy schema exclusions

The policy must not contain:

- a private key, seed phrase, key-encryption key, session token, service-role credential, RPC
  credential, or multisig recovery secret;
- arbitrary executable expressions, JavaScript, SQL fragments, template code, or remote URLs used as
  rules;
- open-ended JSON used to bypass typed validation;
- a mint, network, treasury, recipient, amount, decimals, or expiry supplied by the browser;
- floating-point token amounts; or
- mutable fields on a published version.

Drafts may be edited only by authorized administrators with separation of duties. Publication and
activation are distinct reviewed actions. A disabled policy remains disabled unless an approved
future activation procedure satisfies every Phase 9B-B gate.

## Canonical amount representation

All token values use unsigned integer base units. Human-readable decimal strings are presentation
only and are parsed with an exact decimal library against the reviewed mint decimals. Floating-point
arithmetic is prohibited.

An amount record carries:

- token mint;
- network;
- mint decimals;
- integer base units;
- amount model and version;
- eligibility source and source receipt;
- policy version;
- epoch, when applicable; and
- calculation evidence digest.

The signer boundary recalculates or verifies the canonical digest and rejects disagreement. Display
rounding can never change the authoritative base-unit amount.

## Closed amount-model registry

Only these prospective amount models may be considered:

| Model                      | Description                                                         | Required bounds                                                       |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Fixed receipt              | An approved receipt type maps to a fixed base-unit amount           | Versioned receipt definition, per-receipt cap, all aggregate caps     |
| Tier table                 | A closed, versioned tier maps to a fixed amount                     | Tier provenance, no client-selected tier, all aggregate caps          |
| Bounded proportional       | A validated server-side metric maps through a fixed integer formula | Input minimum/maximum, coefficient version, output floor/ceiling      |
| Epoch share                | An immutable epoch pool is divided by accepted weighted receipts    | Closed epoch, deterministic weights, deterministic remainder handling |
| Reviewed manual correction | A dual-approved exception references a prior error                  | Reason code, evidence, maximum correction, separation of duties       |

Excluded models include arbitrary JavaScript or SQL formulas, free-form administrator expressions,
client-reported scores, floating-point percentages, token-price-based or guaranteed-value formulas,
random amounts selected after eligibility, DUST conversion formulas, wallet-holding reward
multipliers, and pay-to-win reward multipliers.

## DUST and $STAR separation

DUST remains:

- an off-chain, server-authoritative ordinary game currency;
- non-withdrawable and not directly transferable between players;
- non-convertible to $STAR or SOL; and
- governed by the Phase 9A ledger, source, sink, shop, and correction boundaries.

$STAR remains:

- a Solana token currently read only for access eligibility;
- in the player's wallet during current access verification;
- neither automatically spent nor automatically transferred;
- unable to multiply DUST rewards or provide stronger gameplay tools; and
- without any active claim, payout, withdrawal, deposit, burn, stake, swap, bridge, marketplace, or
  auction feature.

A DUST balance, source receipt amount, shop spend, item inventory, or connected-wallet token holding
can never directly calculate token eligibility. An approved economy reward receipt is a possible
future source category only if its separately reviewed immutable semantics say so; it is not a DUST
conversion.

## Layered caps

Every prospective authorization must satisfy all applicable constraints, not merely the smallest
visible cap:

1. minimum and maximum per claim;
2. maximum per eligibility receipt;
3. per-player daily, weekly, and monthly caps;
4. per-wallet daily cap across all player links;
5. per-source cap;
6. per-activity-definition-and-version cap;
7. per-campaign cap, if the source belongs to a reviewed campaign;
8. epoch cap;
9. global daily and weekly caps;
10. available token balance after reserve;
11. available SOL fee balance after reserve; and
12. compliance and risk review thresholds.

The future database transaction that reserves an authorization must lock the policy counter set in a
canonical order, re-evaluate every cap, write the authorization reservation, and advance counters
atomically. A concurrent request that observes exhausted capacity fails closed. Redis, browser
state, and eventually consistent analytics are not authoritative cap stores.

Cap windows use explicit UTC boundaries and record the resolved window start and end on each
reservation. Wallet changes do not reset player caps, and relinking the same wallet to another
account does not reset wallet caps. Rejected and expired attempts do not consume settled caps, but
issued authorizations reserve capacity until a deterministic release transition occurs.

## Epoch model

A future epoch is an immutable distribution envelope with:

- epoch identifier and version;
- bounded human-readable name;
- source registry version;
- closed source categories;
- network, mint, and decimals;
- start and end UTC instants;
- eligibility cutoff, claim start, and claim expiration instants;
- maximum allocation in base units;
- eligibility count;
- currently authorized, confirmed, and cancelled amounts in base units;
- deterministically calculated remaining allocation;
- amount model and version;
- eligibility snapshot or receipt cutoff;
- policy version;
- treasury and authorization-public-key versions;
- geographic and compliance policy versions;
- status; and
- creation, review, approval, and closure audit references.

The closed architecture/mock epoch status registry is:

- draft;
- calculating;
- review;
- approved;
- active;
- paused;
- completed;
- expired; and
- cancelled.

The closed mock transition graph, matching the package export `CLAIM_EPOCH_TRANSITIONS`, is:

| From          | Allowed destinations                          |
| ------------- | --------------------------------------------- |
| `draft`       | `calculating`, `cancelled`                    |
| `calculating` | `review`, `draft`, `cancelled`                |
| `review`      | `approved`, `calculating`, `cancelled`        |
| `approved`    | `active`, `cancelled`                         |
| `active`      | `paused`, `completed`, `expired`, `cancelled` |
| `paused`      | `active`, `completed`, `expired`, `cancelled` |
| `completed`   | None; terminal                                |
| `expired`     | None; terminal                                |
| `cancelled`   | None; terminal                                |

These are design and fixture concepts only; Phase 9B-A does not persist, publish, activate, or
transition a hosted epoch. In Phase 9B-A material, even the word active describes only a synthetic
state-machine fixture and never implies that a production epoch or token claim is enabled.

An epoch pool cannot be enlarged after opening. A replacement epoch must use a new identifier and
version. Deterministic remainder handling must be specified before approval; unallocated dust
remains treasury inventory and is not silently awarded.

## Reserve accounting

### Snapshot semantics

Let:

- B_token be the observed treasury token-account balance at a specific finalized slot;
- R_token be the minimum token reserve;
- A_live be the face value of issued, unexpired, unconsumed authorizations;
- T_pending be submitted transfers not yet proven final or failed;
- C_after_snapshot be finalized outgoing transfers that occurred after the balance observation;
- E_external be a conservative allowance for externally initiated treasury outflow after the
  snapshot;
- S_token be a configured token safety buffer.

Then:

AvailableAuthorizationToken = max(0, B_token - R_token - A_live - T_pending - C_after_snapshot -
E_external - S_token)

Finalized outgoing transfers already reflected in B_token must not be subtracted a second time. The
reconciliation cursor records the balance slot and the last included finalized transfer so
C_after_snapshot has unambiguous semantics.

Let:

- B_sol be the observed SOL balance at the same or a newer finalized slot;
- R_sol be the minimum SOL fee reserve;
- F_pending be conservative maximum fees for submitted ambiguous transactions;
- F_auth be conservative fee exposure for all newly issued authorizations that can cause
  treasury-paid transactions;
- F_ops be an operational safety allowance; and
- S_sol be a SOL safety buffer.

Then:

AvailableFeeLamports = max(0, B_sol - R_sol - F_pending - F_auth - F_ops - S_sol)

A claim may be authorized only when both the token and fee equations remain non-negative after
adding its full conservative exposure.

### Reservation lifecycle

- Issuing an authorization increases A_live by its full face value and advances applicable cap
  reservations.
- Submission moves the same exposure from A_live to T_pending without increasing total exposure.
- Final confirmation removes T_pending and advances settled counters; the later balance snapshot
  incorporates the transfer.
- Deterministic expiry of an unused authorization releases A_live only after the on-chain
  consumption state and submission records are checked.
- A proven failed transaction releases T_pending only when the same authorization is known
  unconsumed and no ambiguous signature remains.
- An ambiguous confirmation retains its reservation. Timeout is not proof of failure.
- A replaced or retried transaction reuses the same intent and authorization identity. It does not
  create another reserve.
- Manual reserve release requires dual approval, evidence, and a reconciliation record.

## Treasury public-address and signer separation

The treasury policy stores public addresses and key-version identifiers only. Secret authorization
material, treasury signing material, multisig recovery material, and RPC credentials must remain
outside the application database and logs in separately controlled secret-management or signing
systems.

The recommended candidate separates:

- treasury authority, controlled by an approved multisig;
- authorization key, permitted only to attest bounded claim payloads;
- program upgrade authority, separately governed or removed after review;
- deployment authority;
- administrative policy approval;
- worker execution; and
- reconciliation review.

No single application administrator should be able to change policy, sign an authorization, move
treasury assets, and approve reconciliation.

## Token-2022 compatibility review

The current wallet-access path reads holdings and does not transfer tokens. A future claim transfer
has materially different compatibility requirements. Before any activation, security and treasury
reviewers must inspect the live mint, mint authority, freeze authority, program owner, and every
Token-2022 extension directly on the approved network.

| Mint or account property                | Required review and fail-closed behavior                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Decimals                                | Must exactly match policy and amount encoding; mismatch pauses                                                         |
| Transfer fee configuration              | Model gross, net, withheld amounts, authorities, cap, and reconciliation; unsupported configuration rejects activation |
| Withheld transfer fees                  | Define collection authority and accounting; unexplained withheld balance quarantines reconciliation                    |
| Transfer hook                           | Review program, accounts, availability, upgrade authority, and security; unapproved hook rejects                       |
| Permanent delegate                      | Review the delegate's powers and governance; unknown or mutable delegate rejects                                       |
| Confidential transfer                   | Explicit compatibility design required; unsupported confidential state rejects                                         |
| Default account state                   | Frozen-by-default behavior and thaw authority must be understood; unsupported state rejects                            |
| Frozen mint or token account            | No authorization or submission; incident and dispute path required                                                     |
| Non-transferable extension              | Incompatible with treasury distribution unless a separately approved design proves otherwise                           |
| Interest-bearing configuration          | Reconciliation and user display semantics require review; unsupported configuration rejects                            |
| Required transfer memo                  | Transaction builder must produce the exact reviewed memo without sensitive data                                        |
| Metadata pointer and metadata authority | Informational only unless separately approved; never treated as proof of mint identity                                 |
| Mint close authority                    | Governance and treasury risk require explicit acceptance                                                               |
| CPI guard and account-level extensions  | Destination and treasury token-account compatibility must be verified                                                  |
| Token-account ownership                 | Destination must be controlled by the authorized recipient under the selected architecture                             |
| Associated token account behavior       | Derivation must use the correct token program; creation payer, rent, races, and idempotency require tests              |
| Destination account existence           | Creation behavior must be deterministic and cannot redirect to a browser-selected account                              |
| Extra account metas                     | All hook-required accounts must be resolved from reviewed sources and verified                                         |

An extension appearing, changing authority, or changing configuration after approval triggers an
automatic pause. RPC responses must be cross-checked against at least one independent provider or a
trusted indexed source according to the confirmation policy.

## Confirmation, retry, and ambiguity

A future confirmation policy must define:

- accepted preflight commitment;
- required final confirmation commitment;
- blockhash validity checks;
- transaction lifetime;
- primary and independent RPC providers;
- signature status polling intervals;
- maximum bounded retry attempts;
- retry classification;
- durable intent and authorization identity;
- ambiguous timeout handling;
- chain-reorganization observation depth;
- reconciliation cursor; and
- conditions for reserve release.

Never interpret a network error or timeout as a failed transfer. Before retrying, query the original
signature and authorization-consumption state through independent evidence. A retry must use the
same canonical intent and must be impossible to settle twice. Conflicting RPC answers pause the
affected claim and, at a configured threshold, the entire claim system.

## Treasury depletion simulation

Phase 9B-A may run deterministic local simulations only. Fixtures must be plainly labeled synthetic
and must not be described as hosted or production balances.

### Required fixture inputs

- synthetic finalized slot and observation time;
- synthetic token balance and SOL balance;
- token and SOL reserves;
- token and SOL safety buffers;
- authorization and pending-transfer inventories;
- external-outflow allowance;
- claim amount distribution by source;
- user and wallet population;
- concurrency and burst profile;
- fee model and token-account creation rate;
- expiration, failure, ambiguity, and retry rates;
- cap and epoch configuration;
- Token-2022 fee or hook assumptions, when tested; and
- simulation seed and model version.

### Required scenarios

- nominal traffic;
- maximum permitted single claims;
- global-cap burst at a UTC boundary;
- wallet fan-out and player fan-in;
- all live authorizations submitted concurrently;
- high token-account creation;
- transfer-fee maximum;
- RPC timeout with ambiguous transactions;
- retry storm;
- treasury external outflow after snapshot;
- token reserve boundary;
- SOL fee reserve boundary;
- paused system with existing pending transactions;
- expired authorization cleanup; and
- configuration mismatch that must fail closed.

### Required report fields

- fixture label, seed, and model version;
- policy and epoch versions;
- initial and ending balances;
- days until the minimum token reserve under the fixture schedule;
- days until the minimum SOL fee reserve under the fixture schedule;
- maximum safe daily mock authorization while preserving every reserve and cap;
- pending authorization exposure;
- worst-case pending liability at full face value;
- estimated fee runway;
- first emergency-pause trigger and simulated trigger time;
- safety-buffer recommendation with assumptions;
- minimum observed token and SOL headroom;
- issued, rejected, expired, submitted, confirmed, failed, ambiguous, and quarantined counts;
- reserved and settled amount by cap window;
- fees and account-creation rent;
- Token-2022 gross, net, and withheld amounts;
- first exhausted constraint;
- invariant violations;
- maximum concurrent reservations;
- reconciliation delta;
- assumptions and limitations; and
- reviewer decisions required.

These are synthetic sensitivity outputs, not a financial forecast, balance attestation, funding
promise, or recommendation to distribute tokens.

### Required invariants

- no accepted authorization exceeds any individual or aggregate cap;
- token headroom never falls below the minimum reserve;
- SOL headroom never falls below the fee reserve;
- the same eligibility receipt never reserves twice;
- the same authorization never settles twice;
- ambiguity retains its reserve;
- retry does not increase total authorized exposure;
- wallet change cannot reset player caps;
- DUST values never enter token calculations; and
- a policy, mint, network, decimals, or extension mismatch produces zero new authorizations.

Simulation success is evidence about the fixture and model only. It does not prove production
safety, approve funding, or authorize activation.

## Monitoring and reconciliation controls

At minimum, a future system must measure:

- observed balances with slot and provider;
- reserve headroom and time-to-depletion;
- live, pending, ambiguous, expired, and quarantined exposure;
- issued and settled amount by player, wallet, source, activity, epoch, day, week, and policy;
- duplicate receipt and authorization attempts;
- authorization age and expiration backlog;
- transaction latency, failure, ambiguity, and reorganization;
- independent RPC disagreement;
- mint, decimals, program-owner, authority, and extension drift;
- token gross, net, fee, and withheld reconciliation;
- SOL fees and account-creation rent;
- unmatched database, program, and transaction records; and
- administrator, signer, and policy-change audit events.

Alerts are required before reserves or caps are exhausted, not only afterward. Emergency pause, key
compromise, wrong configuration, reconciliation mismatch, and RPC disagreement alerts route to named
on-call owners described in the incident runbook.

## Phase 9B-A decisions still required

- Owner approval of the selected architecture.
- Security approval of signer separation, authorization payload, program controls, and threat
  treatment.
- Treasury approval of reserves, multisig, caps, epochs, fee payer, and depletion assumptions.
- Legal approval of distribution eligibility, jurisdictions, disclosures, and compliance controls.
- Product approval of eligibility sources, amount models, wallet-change experience, and dispute
  rules.
- Operations approval of confirmation, RPC, pause, recovery, rotation, and reconciliation
  procedures.

Until every applicable decision and the Phase 9B-B entry gate is satisfied, claims remain disabled
and there is no signer, transaction, hosted mutation, published policy, or migration.
