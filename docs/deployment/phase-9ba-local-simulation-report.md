# Phase 9B-A Local Offline Simulation Report

> **OFFLINE SIMULATION**  
> **NO BLOCKCHAIN TRANSACTION WAS SENT**  
> Synthetic fixtures only. No RPC, wallet, signer, treasury, hosted database, or live balance was
> accessed. The depletion fixture is **not a financial forecast**.

## Scope

This report records the local Phase 9B-A architecture simulation run on 2026-07-15 with:

```text
pnpm token-claim:load:test
```

The command validates the two required safety banners, deterministic replay, disabled live
settlement, the 100/1,000/10,000 baseline sizes, all 20 closed scenarios, and the synthetic treasury
depletion fixture. Runtime duration and heap deltas are one local process sample; they are not a
performance guarantee. The package's fixture duration and memory fields remain deterministic model
values so same-seed reports can be compared exactly.

## Standard deterministic runs

| Fixture claims | Eligible outcomes: authorized mock / quarantined / expired / rejected | Deterministic fixture duration | Deterministic fixture memory | Measured local duration | Measured local heap delta | Replay digest                      |
| -------------: | --------------------------------------------------------------------: | -----------------------------: | ---------------------------: | ----------------------: | ------------------------: | ---------------------------------- |
|            100 |                                                        94 / 2 / 4 / 0 |                        1.25 ms |                     54,784 B |                0.192 ms |                +134,200 B | `DFE32B8124BB085F1862BF4EFC7BFDFA` |
|          1,000 |                                                     955 / 30 / 15 / 0 |                        12.5 ms |                    400,384 B |                0.808 ms |                +914,064 B | `884A524B055B35044A5731A224251A42` |
|         10,000 |                                                 9,522 / 300 / 178 / 0 |                         125 ms |                  3,856,384 B |                5.495 ms |                +260,560 B | `3870BC43E0F483A315E8CF9CABA074B6` |

Every report returned `deterministicReplayResult: true`, `networkAccessed: false`, and
`liveSettlementEnabled: false`.

## Closed scenario matrix

The matrix used 1,000 synthetic claims per scenario.

| Scenario                     | Authorized mock | Rejected | Primary exercised result                         |
| ---------------------------- | --------------: | -------: | ------------------------------------------------ |
| baseline                     |             944 |        0 | 34 quarantined; 22 expired                       |
| duplicate_claim_attempts     |           1,000 |        0 | 1,000 duplicate attempts prevented               |
| two_sessions_one_eligibility |           1,000 |        0 | 1,000 competing-session duplicates prevented     |
| expired_authorization        |             666 |        0 | 334 expired                                      |
| wallet_changed               |             750 |        0 | 250 quarantined                                  |
| wrong_mint                   |               0 |    1,000 | All failed closed before eligibility             |
| wrong_network                |               0 |    1,000 | All failed closed before eligibility             |
| player_cap_reached           |              50 |      950 | 950 cap rejections                               |
| wallet_cap_reached           |             100 |      900 | 900 cap rejections                               |
| global_cap_reached           |             800 |      200 | 200 cap rejections                               |
| epoch_allocation_reached     |             900 |      100 | 100 cap rejections                               |
| treasury_reserve_reached     |             500 |      500 | 500 token-reserve rejections                     |
| fee_reserve_reached          |             500 |      500 | 500 fee-reserve rejections                       |
| quarantine_spike             |             671 |        0 | 329 quarantined                                  |
| signer_unavailable           |               0 |    1,000 | All rejected; no signer fallback                 |
| rpc_outage_fixture           |               0 |    1,000 | 1,000 bounded fixture retries; no network access |
| rpc_disagreement_fixture     |               0 |    1,000 | 1,000 bounded fixture retries; no network access |
| replayed_authorization       |           1,000 |        0 | 1,000 replay attempts prevented                  |
| cancellation_race            |             500 |        0 | 1,000 races resolved; 500 expired                |
| dispute_race                 |             666 |        0 | 1,000 races resolved; 334 quarantined            |

Duplicate counts represent a canonical winner plus a rejected competing fixture attempt; they do not
represent two authorizations for one eligibility. The command fails if a wrong-mint or wrong-network
case authorizes anything, if a cap/reserve scenario does not reach its boundary, or if the
duplicate-attempt and duplicate-prevention counts differ.

## Synthetic treasury depletion result

The deterministic fixture reported:

- token-reserve runway: 12,145 fixture days;
- SOL-fee-reserve runway: 1,730 fixture days;
- maximum safe daily mock authorization: 3,250,000 base units;
- pending mock authorization exposure: 650,000 base units;
- worst-case pending fixture liability: 7,000,000 base units;
- estimated daily fixture outgoing amount: 308,750 base units;
- estimated daily fixture fee use: 5,200,000 lamports;
- safety-buffer recommendation: 250,000,000 base units; and
- emergency-pause trigger: false for this fixture.

These values describe one synthetic runway model only. They are not treasury facts, a funding
recommendation, a forecast, an approval, or evidence that a future claim system is safe to activate.

## Result and limitations

The local command passed its declared invariants. That result proves only that the current typed
offline model produced the expected deterministic fixture outcomes. It does not validate an on-chain
program, transaction construction, signer custody, real Token-2022 behavior, RPC confirmation, a
hosted schema, legal eligibility, treasury funding, or owner acceptance. Token claims remain
disabled, and Phase 9B-B remains gated.
