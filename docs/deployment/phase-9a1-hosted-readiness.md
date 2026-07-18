# Phase 9A.1 hosted readiness and acceptance

Status: local-only pending owner-authorized hosted deployment. No hosted write, configuration
publication, economy policy publication, shop publication, app deployment, commit, or push was
performed during Phase 9A.1 implementation.

## Migration set

Deploy in this forward-only order after owner approval:

1. `20260716090000_phase9a_economy_schema.sql`
2. `20260716091000_phase9a_economy_functions.sql`
3. `20260716092000_phase9a1_economy_admin_readiness.sql`

The third migration adds named 3–80 key constraints, explicit policy/shop approval and scheduling
metadata, reviewed lifecycle RPCs, scheduled activation, permission-scoped admin read models,
filtered ledger reads, safe player shop/history presentation metadata, and a compatible
player/account settlement lock order verified by multi-session PostgreSQL races. It does not rewrite
the two Phase 9A migrations or alter ledger/receipt authority.

## Owner-gated commands

Run local checks first, then inspect the target. Do not set the approval variables casually.

```sh
pnpm env:check
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run

SUPABASE_REMOTE_WRITES_APPROVED=true pnpm db:migrations:push

pnpm db:migrations:list
pnpm db:lint:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted
RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
pnpm env:check
```

Before the push, expected gates remain `remoteWritesApproved: false`, `hostedTestsApproved: false`,
and `bootstrapEnabled: false`. The hosted runners must fail clearly when migrations are missing or
owner gates are absent; they must not print secrets or bypass real authentication.

Hosted success requires zero lint warnings/warning-extra/errors, pgTAP green, RLS green, and the
three migrations present. Local success is not hosted success.

## Signed-in player acceptance

Record Player A’s DUST; open the published Village Supply Shop; buy one ordinary item; verify one
debit, one item, one safe receipt, refresh persistence, and idempotent retry. Then verify
insufficient DUST, full inventory, daily limit, cooldown, stale offer, closed shop, and session
refresh messages. Confirm DUST history shows friendly starter, Moonpetal, purchase, refund, and
correction labels with safe public receipts and no internal IDs.

## Signed-in administrator acceptance

Walk the overview and ledger filters; inspect source/sink registries; create and edit a shop draft;
validate, preview, submit, independently approve, schedule, and confirm no early activation. Repeat
for policy and confirm active configuration stays unchanged until explicit publication/effective
time. Run single/global reconciliation; verify no rewrite; review a risk signal without suspension;
exercise low/high correction separation of duties and retry; replay a deterministic simulation;
confirm real balances did not change. Verify Read-only Analyst, Customer Support, Content Manager,
Game Administrator, and Super Admin behavior and the absence of Set Balance.

## Phase 9B entry criteria

Phase 9B remains blocked until hosted migrations/lint/pgTAP/RLS and signed-in acceptance are green;
the owner accepts or rejects the unpublished candidate; no high-risk mismatch is unresolved;
remaining Phase 8 acceptance stays tracked; treasury security and legal/compliance reviews are
planned; and public status documentation matches reality. Phase 9B/9C, Play-to-Earn, token rewards,
claims, deposits, withdrawals, conversion, staking, burns, marketplaces, auctions, swaps, bridging,
or treasury signing are not part of this phase.
