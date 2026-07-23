# Token-gate verification

## Authority and supported chain

The Starville API makes the final token-access decision. The landing, game client, wallet provider,
browser storage, query parameters, screenshots, and client-submitted balances cannot grant access.

Phase 3 supports `solana:devnet` and `solana:mainnet-beta`, with SPL Token and Token-2022. The
active mint, program, decimals, raw requirement, display requirement, commitment, recheck interval,
session TTL, and configuration version come from a validated `token_gate_configs` row. An absent,
disabled, invalid, or unconfigured row fails closed.

## Verification algorithm

For each initial verification or session recheck, the server-owned Solana adapter performs these
checks:

1. Parse the wallet and mint as canonical Solana public keys. Noncanonical base58 values fail.
2. Call `getGenesisHash` and require the immutable genesis hash for the configured Devnet or Mainnet
   cluster. A mismatched RPC cannot be used accidentally.
3. Call `getAccountInfo` for the exact mint with base64 encoding and the configured `confirmed` or
   `finalized` commitment.
4. Select SPL Token or Token-2022 from the account owner, decode the raw account with that program's
   mint layout, and require an existing, funded, non-executable, initialized mint. Read decimals
   from this decoded account, not from the browser or an environment guess.
5. Call `getTokenAccountsByOwner` for the exact wallet with the exact mint filter and the validated
   mint slot as `minContextSlot`; reject a response context below it.
6. De-duplicate returned accounts by account public key.
7. Count an account only when all conditions hold:
   - it has nonzero lamports and therefore is not a closed account;
   - parsed type is a token account;
   - parsed owner equals the verified wallet;
   - parsed mint equals the configured mint;
   - account program equals the validated mint program;
   - parsed decimals equal the validated mint decimals; and
   - state is `initialized` or `frozen`.
8. Sum each accepted `tokenAmount.amount` using `bigint`.
9. Compare the sum to the configuration's positive raw integer requirement.
10. Persist the observed raw balance, required raw balance, actual balance-observation slot,
    configuration version, and decision through a trusted database function. Rechecks reject a slot
    below the session's prior observation.

The RPC client defaults to a 5,000 ms timeout and at most two attempts. Configuration permits
500–15,000 ms and one to three attempts. Retries are bounded; provider messages and private RPC URL
details are not returned to the browser.

## Frozen-account policy

Starville Phase 3 counts both initialized and frozen token accounts. A frozen account still records
tokens owned by the wallet, and this gate proves holdings rather than immediate transferability.
Frozen balances must pass the same wallet, mint, token-program, decimals, nonzero-lamports, and
de-duplication checks as initialized balances.

This policy is intentional and test-covered. Changing it changes eligibility semantics and requires
a reviewed migration/configuration policy, tests, player messaging, and explicit owner approval. Do
not change it silently in an RPC adapter.

Uninitialized, unknown-state, closed/zero-lamport, mismatched-owner, mismatched-mint,
mismatched-program, or mismatched-decimals accounts are excluded.

## Exact amount handling

Neither thresholds nor balances use JavaScript floating point. The database stores up to 78-digit
raw integers. The API converts an administrator-entered display amount to raw units only after it
has validated the mint decimals. A value with more fractional precision than the mint supports is
rejected.

Example for a six-decimal mint:

```text
display requirement: 10000
raw requirement:     10000000000
```

The comparison is `observedRaw >= requiredRaw`. A wallet one raw unit below is denied. Display
formatting happens only after the decision.

## Decision semantics

| Condition                                                | Result                                                 |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Valid ownership signature and balance at/above threshold | Create a short-lived access session                    |
| No token account, zero balance, or sum below threshold   | `insufficient_balance`; do not create a session        |
| RPC timeout, HTTP/provider failure, malformed response   | `RPC_UNAVAILABLE`; do not display a zero balance       |
| Wrong genesis hash                                       | Temporary verification failure; no session             |
| Missing mint or unsupported program                      | Configuration/RPC verification unavailable; no session |
| Mint program or decimals differ from validated config    | Gate unavailable; no session                           |
| Gate disabled/unconfigured/config changed                | Gate unavailable or session revoked; fail closed       |

An RPC failure is never mapped to insufficient balance. Public errors intentionally collapse most
provider/configuration detail so an external response cannot leak RPC internals. Operators use
redacted structured logs and request IDs for diagnosis.

## Session rechecks

`GET /api/v1/token-access/me` validates expiry, status, and current configuration version. If the
stored recheck time is due, it performs a fresh RPC balance check before returning `granted`.
`POST /api/v1/token-access/recheck` forces the same check subject to the durable interval limit.
Both paths must atomically claim the wallet/session before calling RPC, so concurrent requests do
not amplify provider work.

- A balance below the stored requirement changes the session to `insufficient_balance` and clears
  the cookie.
- An RPC error revokes the session administratively and clears the cookie. It is reported as a
  temporary verification failure, not as a zero balance.
- A mint/program/decimals mismatch revokes trust and fails closed.
- A checked-slot regression revokes trust and returns a temporary RPC failure.
- An administrator configuration update increments the version and marks all active sessions for
  that configuration `configuration_changed`.

## Configuration validation

Mint metadata is cached for 60 seconds per mint and commitment so player checks do not repeat an
immutable mint read unnecessarily. An administrator with `token_gate.configure` can ask the API to
force a fresh validation of a proposed mint. The browser submits only network and mint address. The
API uses its private RPC, returns the verified program, decimals, and slot, and rate-limits
requests. Saving a configuration performs validation again, converts the threshold exactly, checks
the expected version, and writes an audited update.

In production, `GAME_TOKEN_MINT_ADDRESS` and `GAME_TOKEN_GATE_AMOUNT=10000` pin the expected
identity and display threshold. The database row must match the on-chain-derived program, decimals,
and exact raw threshold or the gate fails closed. Browser-supplied metadata cannot override them.

The environment variable `SOLANA_RPC_URL` is server-only. A provider key embedded in it is secret.
No admin form, public configuration response, browser bundle, error, or event may contain it.

## Current live limitation

The production owner supplies the approved Pump.fun mint CA through `GAME_TOKEN_MINT_ADDRESS`.
Program and decimals are deliberately absent from owner configuration and are derived by the server.
Live eligible approval still requires an owner-controlled wallet holding the configured threshold;
automated tests do not substitute for that wallet-controlled proof.

## External validation checklist

For each owner-approved live-validation mint and network:

1. Confirm the mint address and business owner through a second channel.
2. Validate Devnet genesis, mint existence, token program, initialized state, decimals, and a recent
   slot through the administrator validation action.
3. Confirm the display threshold converts to the intended raw amount.
4. Save through the audited admin action and confirm the configuration version increments.
5. Verify a wallet at exactly the raw threshold is granted.
6. Verify one raw unit below, zero balance, and no token account are denied with an accurate
   observed balance.
7. Verify balances spread across associated, non-associated, and frozen accounts aggregate as
   documented.
8. Verify wrong-network RPC, timeout, malformed response, and provider outage show a temporary error
   and never an insufficient result.
9. Reduce a granted wallet below threshold and confirm the next recheck revokes the session.
10. Change the configuration and confirm existing sessions become invalid.

Record the environment, request IDs, configuration version, tested wallet categories, and results;
never record private wallet material or RPC credentials.
