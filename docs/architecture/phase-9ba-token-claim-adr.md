# ADR: future Starville token-claim architecture

- **Status:** Proposed architecture draft
- **Phase:** 9B-A
- **Decision authority:** Owner, security, treasury governance, and qualified legal reviewers
- **Implementation status:** Disabled; not approved; no signer; no transaction path
- **Database status:** Conceptual only; no Phase 9B-A migration

> **TOKEN CLAIMS DISABLED. PHASE 9B-A ARCHITECTURE MODE. NO ON-CHAIN TRANSFERS ARE ACTIVE. NO
> TREASURY SIGNER IS CONNECTED. NO PLAYER CLAIM ACTION EXISTS.**

## Context

Starville currently uses a Solana token only for server-authoritative access eligibility. DUST is an
off-chain game currency, and no token reward, claim, withdrawal, deposit, burn, stake, swap, bridge,
marketplace, treasury, or payout system is active.

A future claim prototype would introduce materially different risks: custody, recipient and amount
binding, replay, exactly-once settlement, confirmation ambiguity, reserve protection, geographic
restrictions, and incident containment. The application server must never become a general treasury
signer merely because it already verifies wallets or calculates off-chain game outcomes.

This ADR compares five possible future models. It selects none for implementation in Phase 9B-A.

## Non-negotiable design constraints

Any future model must preserve these boundaries:

- gameplay creates immutable off-chain source receipts, not token transfers;
- approved eligibility is server-authoritative and cannot originate in the browser;
- recipient, mint, network, amount, policy, source, nonce, and expiry are immutable after
  authorization;
- one source receipt can produce at most one eligibility, one eligibility at most one authoritative
  claim, and one authorization at most one settlement;
- application, realtime, and ordinary worker services cannot hold final treasury signing power;
- treasury and fee reserves, layered caps, emergency pause, and bounded epochs are enforced before
  authorization and again at settlement where possible;
- no private key, seed phrase, raw secret-key array, or production signer is accepted by the normal
  application configuration model;
- DUST does not convert to `$STAR` or SOL and token holdings do not multiply DUST rewards; and
- legal, geographic, sanctions, tax, consumer, privacy, custody, and treasury-governance gates must
  be resolved before any payout test.

## Models considered

### A. Backend-controlled hot-wallet transfers

The API or worker stores or can reach a treasury private key and directly constructs, signs, and
submits token transfers for approved claims.

### B. Multisig-controlled treasury with backend-created transactions

The backend creates unsigned recipient transactions or proposals, but a reviewed multisig controls
treasury execution. Signers inspect and approve individual or batched proposals.

### C. Dedicated on-chain claim program using signed authorizations

An isolated authorization service signs short-lived canonical claim authorizations with a rotatable
authorization key. A dedicated Solana program validates the authorization, recipient, mint, network,
amount, policy, epoch, nonce, expiry, and replay state. A reviewed multisig governs the treasury,
program configuration, bounded claim-vault funding, pause, and authority rotation. Application
services never hold the final treasury key.

### D. Epoch-based Merkle distributor

An approved epoch produces a Merkle root of recipient allocations. A distributor program verifies
each player's proof and one-time claim bitmap/state. A multisig publishes roots and funds bounded
epoch vaults.

### E. Third-party custodial payout service

Starville submits approved payout instructions to a provider that holds or controls distribution
funds and executes transfers under its own custody, compliance, and operational model.

## Criterion-by-criterion comparison

| Criterion                     | A. Backend hot wallet                                                           | B. Multisig + backend transaction                                                     | C. Signed-authorization claim program                                                                                                     | D. Merkle distributor                                                                                                     | E. Custodial provider                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Custody risk                  | Starville application custody; highest direct exposure                          | Treasury custody distributed among multisig signers                                   | Multisig controls treasury and bounded vault funding; program controls only reviewed claim inventory                                      | Multisig controls treasury and epoch vaults                                                                               | Custody transferred partly or fully to provider; counterparty risk replaces local custody risk                             |
| Hot-wallet compromise         | A hot key can drain within its on-chain authority and available balance         | No single application hot key should control treasury                                 | Authorization-key compromise can forge bounded claims but should not control treasury; caps, expiry, pause, and vault limits contain loss | Root-publisher compromise can publish a malicious bounded epoch; multisig and review contain it                           | Provider credential compromise may submit fraudulent payouts; provider custody compromise can affect held funds            |
| Private-key exposure          | Key is reachable from normal service runtime or signer dependency               | Treasury keys remain with multisig participants, not backend                          | Authorization key belongs to an isolated service; treasury keys remain in multisig; application sees neither                              | Root approval/treasury keys remain in multisig                                                                            | Provider owns treasury keys; Starville holds API credentials with payout authority                                         |
| Application-server compromise | Can directly sign and send until stopped                                        | Can create malicious proposals but cannot execute without signer approval             | Can request/prepare malicious intents but cannot produce valid authorization or bypass on-chain checks                                    | Can propose malicious leaves/root data but cannot publish without approved root authority                                 | Can submit malicious provider requests within credential/provider limits                                                   |
| Replay resistance             | Must be implemented entirely off-chain plus transaction-idempotency logic       | Proposal IDs and database state help, but resubmission/confirmation ambiguity remains | Program records nonce/claim consumption and rejects reused or expired authorizations                                                      | Distributor bitmap/account records each leaf as claimed                                                                   | Depends on provider idempotency and reconciliation contract                                                                |
| Exactly-once settlement       | Difficult across DB and chain; duplicate submission must be reconciled          | Better review but still requires proposal/transaction/result reconciliation           | Strongest: database uniqueness plus canonical authorization plus on-chain consumed nonce/claim state                                      | Strong per leaf if index/root/bitmap design is correct                                                                    | Depends on provider guarantees, idempotency retention, and dispute process                                                 |
| Recipient binding             | Transaction instruction binds recipient, but compromised backend can choose it  | Signers must inspect recipient in each proposal                                       | Authorization and program both bind recipient; browser cannot redirect after authorization                                                | Recipient is committed in the leaf/proof                                                                                  | Provider request binds recipient, subject to provider API integrity                                                        |
| Amount binding                | Transaction binds amount, but backend controls it                               | Proposal binds amount; multisig review detects changes                                | Canonical authorization and program bind base-unit amount                                                                                 | Leaf commits exact base-unit amount                                                                                       | Provider request binds amount, subject to provider behavior                                                                |
| Mint binding                  | Backend must validate and construct the correct token instruction               | Proposal and signer policy must inspect exact mint/program                            | Policy, authorization, program configuration, and vault bind exact mint/program                                                           | Root domain and distributor configuration bind exact mint                                                                 | Provider integration must enforce asset/mint identifiers correctly                                                         |
| Network binding               | RPC/environment checks only; wrong deployment can send on wrong cluster         | Proposal creation and multisig deployment must agree                                  | Domain separator, authorization, program ID, genesis/deployment configuration, and policy bind network                                    | Root domain, distributor program, and deployment bind network                                                             | Provider environment/account mapping must prevent network confusion                                                        |
| Authorization expiry          | Off-chain approval expiry can race with already-built transactions              | Proposal expiry depends on multisig capabilities and signer process                   | Program rejects expired authorization using reviewed clock/slot semantics                                                                 | Epoch claim expiry is natural, but individual leaf expiry is less flexible                                                | Provider request expiry depends on API capabilities                                                                        |
| Auditability                  | Application logs plus chain transaction; key use may be opaque                  | Proposal, signer approvals, execution, and chain receipt are visible                  | Eligibility, intent, canonical authorization digest, program event/state, and chain receipt form a strong trail                           | Epoch manifest/root/proof/index and chain receipt are auditable                                                           | Provider logs and reports are required in addition to chain data; independent visibility may be limited                    |
| Transaction cost              | One transfer per claim; application pays fees                                   | One transfer/proposal execution per claim or batch                                    | One program claim per player plus program/state/account costs                                                                             | Efficient proof verification per claim; root publication amortized                                                        | Provider pricing and transaction fees apply                                                                                |
| Scalability                   | Operationally simple at low volume but signer and RPC become bottlenecks        | Human approval does not scale per claim; batching adds review complexity              | Authorization generation and player-submitted claims scale horizontally within caps                                                       | Best for large fixed epochs; compact root publication                                                                     | Provider may scale operationally, subject to quotas and commercial limits                                                  |
| Token-account creation        | Backend must safely create/validate destination ATA and fund rent/fees          | Proposal must include reviewed ATA creation when needed                               | Program can enforce canonical destination expectations; fee payer/account-creation policy must be explicit                                | Distributor can enforce canonical destination expectations; same funding question remains                                 | Provider determines account-creation support and fees                                                                      |
| Token-2022 compatibility      | Backend must understand every relevant extension before transfer                | Transaction builder and signers must understand extensions                            | Program and policy can allowlist compatible extension sets; incompatible mints fail closed                                                | Distributor program must explicitly support the mint's extensions                                                         | Depends on provider asset support; unsupported extensions may be hidden behind provider abstraction                        |
| Multisig compatibility        | Optional but undermined if hot wallet still owns spend authority                | Native design strength                                                                | Multisig governs treasury/vault funding, program settings, pause, upgrade, and rotations                                                  | Multisig publishes roots, funds epochs, pauses, and rotates authority                                                     | Provider account may support multisig approval externally, but integration varies                                          |
| Operational burden            | High secret handling, fee funding, nonce/blockhash, retries, and monitoring     | High proposal preparation, signer coordination, batching, and delayed recovery        | High initial program/security work; bounded repeatable operations after review                                                            | High epoch calculation/root governance; efficient routine claims                                                          | Lower chain operations but high vendor, legal, reconciliation, and contract management                                     |
| Signer rotation               | Hot-key rotation is urgent and operationally dangerous                          | Multisig participant rotation is explicit but may be slow                             | Separate authorization-key rotation with overlap/expiry; multisig participant rotation remains independent                                | Root-publisher/multisig rotation; old roots remain governed by distributor state                                          | Provider credential rotation plus provider custody controls                                                                |
| Treasury rotation             | Requires moving funds/changing hot authority with outage risk                   | Multisig treasury rotation is governed and reviewable                                 | Multisig can rotate treasury or claim vault under program controls without changing application authority                                 | New distributor/epoch vault can be funded under a rotated multisig                                                        | Provider account/funding-rail migration may be contractually and operationally complex                                     |
| Emergency pause               | Application flag can be bypassed by a compromised signer                        | Multisig can stop approvals, but already-approved transactions may remain executable  | On-chain pause plus off-chain authorization pause plus bounded vault/reserve controls                                                     | Distributor pause/root cancellation if program supports it; published proofs otherwise persist                            | Provider API pause/account suspension depends on vendor responsiveness                                                     |
| Dispute handling              | Manual holds and compensating transfers; difficult after final transfer         | Proposal can be held before approval; post-transfer remedies remain manual            | Intent quarantine and authorization expiry support pre-settlement review; immutable confirmed receipt supports later dispute evidence     | Before root publication disputes are manageable; after publication leaf cancellation is difficult without program support | Provider may offer case management, reversals only where chain/funding model permits                                       |
| Failed-transaction recovery   | Backend must distinguish build, submit, land, finalize, drop, and retry         | Signers and backend must reconcile proposals and chain state before retry             | Claim state and nonce remain authoritative; retry can reuse safe intent without allowing second program settlement                        | Unclaimed proof remains usable; failed transaction does not mark leaf claimed                                             | Provider status model and idempotency determine recovery                                                                   |
| Confirmation ambiguity        | Highest risk if RPC response is lost after submission                           | Still present; proposal execution and chain signature must be reconciled              | Program state/receipt is authoritative even when submit response is lost                                                                  | Claimed-leaf state is authoritative                                                                                       | Provider and chain status can disagree; reconciliation requires both sources                                               |
| Legal/compliance burden       | Starville directly operates custody and payouts; likely highest internal burden | Starville still operates payouts and treasury governance                              | Starville operates reward eligibility and a non-custodial claim system; legal review remains substantial                                  | Similar non-custodial distribution review, with epoch/public-allocation implications                                      | Provider may supply controls but does not eliminate Starville obligations; vendor/custody/data-transfer analysis increases |
| Geographic restrictions       | Must be enforced before backend sends                                           | Must be enforced before proposal creation/approval                                    | Enforce before eligibility/authorization; short expiry limits stale decisions                                                             | Must exclude or quarantine addresses before root publication; later removal is hard                                       | Provider screening may help but requires correct identity/data sharing and policy mapping                                  |
| Player experience             | Automatic but opaque; players may not understand custody or retries             | Slow and unpredictable if humans approve individual claims                            | Transparent authorization and wallet-submitted claim; requires transaction fee/account UX decisions                                       | Simple proof-based claim during an epoch; proof delivery and expiry need clear UX                                         | Familiar hosted payout flow but may require account/KYC steps and redirects                                                |
| Maintenance requirements      | Continuous key, RPC, fee, retry, and incident operations                        | Continuous multisig coordination and proposal tooling                                 | Program audits/upgrades, authorization service, indexer/reconciliation, caps, reserves, and rotations                                     | Epoch generation, root audit, proof hosting, distributor maintenance, and reconciliation                                  | Vendor integration, SLA, API/version changes, compliance operations, and exit planning                                     |

## Decision analysis

### Why A is rejected as the preferred direction

Model A collapses treasury signing into ordinary application infrastructure. An API, worker, secret,
deployment, dependency, or service-account compromise can become a direct spend path. Off-chain
idempotency cannot alone prove exactly-once settlement when submission responses are ambiguous. The
operational simplicity is not worth the custody and blast-radius increase.

### Why B is not sufficient as the primary scalable claim path

Model B materially improves treasury custody, but it either requires human review of every claim or
introduces batch proposals whose contents become difficult to inspect. It does not inherently give
the player a short-lived, replay-resistant authorization or provide on-chain per-claim consumption.
It remains useful as the treasury-governance layer and for exceptional manual recovery, not as the
preferred routine claim protocol.

### Why D remains a credible alternative

Model D is efficient for large, fixed, reviewed epochs and has strong per-leaf replay prevention. It
is less flexible for individual quarantine, wallet changes, late disqualification, per-authorization
expiry, and dispute intervention after a root is published. It may be reconsidered if future reward
volume is dominated by immutable seasonal batches and operational review shows the privacy/root
distribution model is acceptable.

### Why E is not selected by default

A provider can reduce direct blockchain operations and may offer screening and reporting, but it
introduces custody/counterparty concentration, contractual dependency, data-sharing, service
availability, geographic constraints, reconciliation opacity, and exit risk. Qualified legal and
treasury review may still choose it for a specific jurisdiction or operational model, but repository
evidence does not justify making it the default.

## Proposed future direction

**Recommend Model C for future review: a dedicated signed-authorization claim program governed and
funded through a reviewed multisig treasury.**

The preferred future topology is:

1. Server-authoritative gameplay produces an immutable source receipt.
2. Reviewed policy converts one eligible source receipt into one immutable eligibility record.
3. A player with a fresh wallet-bound session creates one claim intent.
4. Caps, epoch allocation, player/wallet/source limits, risk state, geographic/compliance state, and
   treasury reserves are checked atomically.
5. A future isolated authorization service signs a canonical short-lived payload. It cannot change
   recipient, mint, network, amount, policy, source digest, epoch, nonce, or expiry.
6. A dedicated claim program verifies the authorization and records claim/nonce consumption before
   transferring from a bounded claim vault.
7. A reviewed multisig—not the API—controls treasury funds, claim-vault funding, emergency pause,
   program settings, authority rotation, and upgrade governance.
8. Off-chain eligibility/intent/authorization records reconcile with immutable on-chain claim state
   and transaction receipts.

The authorization key must not be the treasury authority. A compromised authorization key is still
serious, so short expiry, per-player/wallet/source/epoch/global caps, minimum reserves, bounded
vault funding, on-chain replay protection, monitoring, and immediate pause/rotation are mandatory
defense in depth.

## Conditions before any implementation

The recommendation does not authorize a program, signer, treasury, migration, Devnet prototype, or
player action. Before implementation, reviewers must explicitly approve:

- the claim model and its alternative analysis;
- treasury ownership, multisig threshold, participants, recovery, and reserve policy;
- program authority, audit, upgrade/freeze posture, and emergency pause;
- authorization-key custody, isolation, rotation, overlap, and revocation;
- Token-2022 extension compatibility for the selected mint;
- fee payer, token-account creation, rent, compute, and congestion policy;
- canonical payload and deterministic serialization;
- database uniqueness, locking, immutable receipt, and reconciliation design;
- cap, epoch, quarantine, dispute, sanctions, geographic, privacy, retention, and monitoring policy;
- qualified legal conclusions and player disclosures; and
- all Phase 9B-B entry criteria.

## Decision statement

**Recommendation pending owner, security, treasury, and legal review.**

No recommendation in this ADR is approved. Phase 9B-A remains offline architecture work with no live
signer, treasury, claim button, transaction construction, RPC submission, database migration, or
token payout.
