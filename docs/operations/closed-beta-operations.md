# Closed-beta operations

Closed beta uses `starville-dev` and remains separate from production. It is not a shortcut around
Phase 13B hosted validation or Phase 13C/13D gates.

## Admission and support

Maintain an owner-approved tester list outside source code. Testers authenticate through the normal
wallet, Supabase, token-gate, player bootstrap, onboarding, and server-authoritative gameplay flows.
Do not use production wallets, production credentials, or production player data. Communicate known
limitations, reset policy, support channel, privacy expectations, maintenance windows, and how to
report abuse/security issues.

Support and moderation use the same protected Admin workflows, permissions, AAL2, reason,
revision/idempotency, and audits planned for production. A beta label does not authorize direct SQL,
broad exports, shared administrator accounts, or disabled RLS.

## Operating cadence

Before a session, verify hosted migration parity, RLS/grants, API/Reatime/Worker health, Reown dev
project, devnet RPC/mint policy, current world/assets, V1 fallback, maintenance/announcements,
reconciliation queues, capacity, and rollback artifact. During the session, observe safe aggregate
health, reports, queue age, reconnects, errors, and economy invariants. Afterward, close
announcements, reconcile queues, triage issues, preserve evidence, revoke unnecessary access, and
record reset/retention decisions.

Use maintenance for unsafe builds or data state. Use announcements for confirmed tester-facing
information. Roll back an application/world/asset through versioned controls. Do not reset hosted
data unless the beta owner has approved exact tables, preservation/export requirements, and a
recoverable plan; Phase 13C performs no hosted reset.

## Promotion boundary

Beta evidence may support production acceptance but cannot be copied as proof of production domains,
secrets, backup, restore, mainnet/Reown configuration, or provider health. Production must use
separate projects, refs, URLs, credentials, storage, telemetry, and owner sign-offs. Before
promotion, classify every beta-only flag, account, test record, URL, secret, wallet network, and
candidate asset so none leaks into production.

Animal Care remains disabled and unreleased in beta and production. No future animal systems or
unrelated project scope are part of this runbook.
