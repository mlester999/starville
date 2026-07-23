# Token balance verification

The API, not the browser or wallet UI, determines token eligibility through the server-owned
`SOLANA_RPC_URL`. The active mint, program, decimals, exact raw threshold, commitment, and version
come from a validated database row. Symbol and display amount never grant access.

For each initial verification and recheck, `@starville/solana`:

1. validates canonical wallet and mint public keys;
2. requires the configured endpoint to report the known Solana Devnet genesis hash;
3. loads the exact mint bytes with `getAccountInfo` and base64 encoding;
4. selects SPL Token or Token-2022 from the account owner and decodes the bytes with that program's
   mint layout;
5. requires a funded, non-executable, initialized mint and obtains decimals from the decoded
   account;
6. calls `getTokenAccountsByOwner` using the exact mint filter and the mint observation as
   `minContextSlot`;
7. de-duplicates account public keys;
8. includes associated and non-associated accounts only when wallet, mint, program, decimals, state,
   and non-closed status all match; and
9. sums `tokenAmount.amount` as `bigint` and compares it with the stored raw integer threshold.

Initialized and frozen accounts are counted because a frozen account still holds tokens owned by the
wallet. Closed, uninitialized, malformed, wrong-wallet, wrong-program, wrong-decimals, and
different-mint accounts are excluded or cause the response to be rejected. A same-symbol token at a
different mint never counts.

Verified immutable mint metadata is cached for 60 seconds per mint and commitment. Balance reads
still occur for each required verification. The protected administrator validation action forces a
fresh read, so operators can safely refresh metadata without a transaction.

RPC calls use the configured `confirmed` or `finalized` commitment, explicit timeout, at most three
attempts (two by default), safe response schemas, and exact slots. A response below the requested
minimum context or below a session's prior checked slot fails closed. Network mismatch, nonexistent
mint, unsupported program, malformed response, timeout, rate limit, or provider failure all fail
closed. An RPC error is not converted to a zero balance.

Display thresholds are converted to raw units only after verified decimals are known. Exactly 10,000
qualifies for the production 10,000-token requirement; one raw unit less does not. Arithmetic beyond
`Number.MAX_SAFE_INTEGER` remains exact.

See [token-gate verification](../security/token-gate-verification.md) for threat controls and
[Solana development](../deployment/solana-development.md) for configuration and live checks.
