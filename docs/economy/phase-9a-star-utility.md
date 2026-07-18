# Phase 9A `$STAR` role and utility boundary

The current `$STAR` role is unchanged: a non-custodial, read-only Solana Mainnet wallet eligibility
check for Starville access. The configured mint remains environment-driven and is never hardcoded.
The configured display threshold is 1,000 STAR unless an owner explicitly changes the existing token
gate through its reviewed operation. Verification signs a message and reads token accounts; it does
not request a token approval or transfer.

The versioned utility framework records product policy only. The active definition permits verified
village access. Cosmetic entitlement signals are future design. DUST reward multipliers are
explicitly rejected. Every definition requires `requiresTransaction=false`, `transfersValue=false`,
`changesDustRewards=false`, `changesGameplayPower=false`, and `custodyRequired=false`.

Future non-financial eligibility may include cosmetics, badges, events, community voting, early
access, or creator programs after separate review. Core gameplay may not become pay-to-win. Wallet
balances are revalidated only through the existing server authority and are never exposed to other
players.

Phase 9B may later design treasury, signing, claim intent, limits, monitoring, custody policy, or
claim receipts. Phase 9A implements none of those and creates no private-key, signing, transfer,
burn, stake, claim, withdrawal, deposit, payout, or DUST/token conversion path.
