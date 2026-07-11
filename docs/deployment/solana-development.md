# Solana development configuration

Phase 3 supports the explicit `devnet` and `mainnet-beta` values. The API normalizes them to the
stable `solana:devnet` and `solana:mainnet-beta` identifiers used in challenges and database rows.
Each value is bound to its immutable genesis hash, so a mismatched RPC fails closed. Testnet and EVM
networks are not enabled.

## Environment ownership

- `SOLANA_RPC_URL` is API-only and may contain a provider credential. Never expose or log it.
- `SOLANA_COMMITMENT` is `confirmed` or `finalized`.
- `SOLANA_RPC_TIMEOUT_MS` is 500–15,000 ms.
- `SOLANA_RPC_MAX_ATTEMPTS` is 1–3.
- `GAME_TOKEN_MINT_ADDRESS`, `GAME_TOKEN_SYMBOL`, and `GAME_TOKEN_GATE_AMOUNT` are public
  identifiers/defaults, not authority.
- The versioned `token_gate_configs` row becomes authoritative only after protected server
  validation and an audited administrator update.

## Current status

The current Phase 3 environment uses a temporary Mainnet Pump.fun token for live validation. It is
not the official `$STAR` mint. The server confirmed that the configured address is an existing,
non-executable Token-2022 mint with six decimals, and the protected administrator path persisted its
validated metadata. The address remains environment/database-driven and must be replaced before
production launch.

## Safe validation order

1. Keep remote-write and hosted-test gates false.
2. Run `pnpm env:check`, `pnpm db:verify-target`, `pnpm db:migrations:list`, and
   `pnpm db:migrations:dry-run`.
3. Obtain explicit approval before applying only the two reviewed Phase 3 migrations.
4. Run hosted lint, pgTAP, and RLS tests under the separate hosted-test approval.
5. Sign in as an authorized token-gate administrator and validate the owner-confirmed mint through
   `/token-access`.
6. Independently compare program, decimals, and slot with the intended token design.
7. Save the exact display threshold; confirm its raw value after decimal conversion.
8. Test no-account, one-raw-unit-below, exact-threshold, and above-threshold wallets on the selected
   network.
9. Test standard SPL Token or Token-2022 according to the real mint owner program.
10. Restore all approval gates to false immediately after the approved operation.

Do not put an RPC URL, database URL, service key, seed phrase, private key, or wallet password in a
command argument, browser variable, screenshot, log, or support ticket. The complete deployment and
manual-wallet checklist is in [Phase 3 wallet operations](phase-3-wallet-operations.md).
