# Reown AppKit

## Purpose and version

The landing uses `@reown/appkit@1.8.22` and `@reown/appkit-adapter-solana@1.8.22`. Reown supplies
wallet discovery, browser/mobile/QR connection where supported, connection state, and the Solana
`signMessage` provider. It is not the token-gate or session authority.

## Initialization

`apps/landing/src/lib/reown.ts` initializes AppKit only after the component mounts in a browser. A
module-level configuration key makes React Strict Mode initialization idempotent and rejects a
second, different configuration. Wallet hooks render only after initialization, avoiding SSR
`window` access and duplicate instances.

The configuration contains:

- `SolanaAdapter` only;
- `solanaDevnet` as the sole allowed/default network;
- Starville name, description, canonical landing URL, and original mark;
- `allowUnsupportedChain: false`; and
- email, social login, analytics, on-ramp, swaps, send, and receive disabled.

EVM networks and transaction features are not enabled. OKX-compatible and mobile/QR availability is
whatever the installed AppKit version and selected wallet support; this must be confirmed in the
live owner test rather than inferred from the package.

## Environment ownership

`NEXT_PUBLIC_REOWN_PROJECT_ID` is browser-safe and belongs only to the landing profile. Register the
exact `NEXT_PUBLIC_LANDING_URL` origin in the Reown project. The Reown ID must never be reused as
the token-cookie secret, and the private `SOLANA_RPC_URL` must never be supplied to AppKit or any
browser bundle.

For an existing ignored environment that still uses `REOWN_PROJECT_ID`, run
`pnpm env:phase3:prepare`. The command copies the value to the explicit browser-safe name without
printing it.

## Runtime behavior

The access dialog tracks connection, account, network, modal, and message-signing capability.
Changing the account or network aborts the in-flight request and revokes browser access. A missing
`signMessage` capability produces an unsupported-wallet state. Rejected signing creates no session.
After signing, the address and network are checked again before the signature is submitted.

Reown connection state is never persisted as Starville authority. The server-controlled protocol is
documented in [wallet authentication](wallet-authentication.md).

## Live validation still required

The owner must validate supported desktop and mobile/QR wallets, OKX-compatible Solana connection,
signature rejection, readable challenge text, account/network changes, and disconnect against the
approved deployed origin. Those checks are awaiting a real mint, hosted migrations, test wallets,
and explicit hosted-operation approval.
