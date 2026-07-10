# Phase 1 trust boundaries

## Security posture

All browser, network, and job input is untrusted. Phase 1 establishes explicit boundaries without
pretending later authentication or authorization features exist. The administrator portal is a shell
only: there is no signup, login bypass, `isAdmin` flag, protected dashboard data, or client-side
role decision.

## Boundary matrix

| Boundary                   | May receive                                                 | Must never receive or decide                                              |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Landing browser            | Public URLs, Supabase URL and anonymous key                 | Service-role key, database URL, private RPC URL, token eligibility        |
| Game browser               | Public URLs, anonymous Supabase configuration, render state | Private credentials, authoritative gameplay/economy decisions             |
| Admin browser              | Public URLs, anonymous Supabase configuration               | Service-role key, trusted admin role, authorization decisions             |
| API                        | Validated server config and future authenticated requests   | Browser-asserted authorization, wallet eligibility, currency results      |
| Real-time server           | Validated origin/capacity config and raw connections        | Unverified player sessions or client-authoritative movement               |
| Worker                     | Validated job/retry config and future server-owned jobs     | Browser input, production credentials in logs, non-idempotent reward work |
| Supabase anonymous client  | URL and anonymous key                                       | Service-role operations or RLS bypass                                     |
| Supabase privileged client | Explicit server-only URL and service-role key               | Browser import path or implicit process-wide construction                 |

## Environment ownership

Only variables deliberately prefixed for public bundling may enter frontend applications. The
anonymous Supabase key is public by design but will be safe only when every exposed table has
correct RLS. `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DATABASE_URL`, credential-bearing RPC URLs,
wallet keys, and future treasury material are server-only. The Supabase package provides separate
browser and server entry points so a privileged helper cannot be imported accidentally from a
browser entry.

The repository ignores common environment files, credentials, certificates, private keys, and local
Supabase state while explicitly retaining `.env.example`. Placeholder values are non-production and
must never be copied into a hosted environment as working credentials.

## Service boundaries

The API assigns or propagates a request ID, returns a consistent error envelope, and restricts CORS
to validated origins. Health responses contain status, service name, version, and timing only—never
configuration values or secrets.

The real-time server checks the handshake origin and enforces a configured connection ceiling before
creating a connection record. Phase 1 room abstractions carry no trusted player identity and do not
store fake sessions. Later access sessions must be verified server-side before joining authenticated
rooms.

The worker accepts no public network jobs. Its health listener exposes process state only. Future
jobs must be idempotent, retry-safe, observable, and protected from duplicate execution.

## Logging boundary

Structured logs include timestamp, service, environment, severity, and optional request ID.
Redaction covers password/secret/token/key/seed/service-role fields, authorization and cookie
headers, database URLs, and credential-bearing RPC URLs. Errors are serialized without dumping
arbitrary request or environment objects. Application code must pass focused fields rather than
logging `process.env`.

## Supabase and RLS plan

No Phase 1 table exists, so there is no pretend RLS migration. For every future exposed table, the
same reviewed migration must:

1. enable Row Level Security;
2. revoke unsafe default privileges where appropriate;
3. add least-privilege policies based on `auth.uid()` and trusted database records;
4. prohibit roles sourced from user-editable metadata;
5. test anonymous, owner, other-user, non-admin, suspended-admin, and privileged-server cases as
   applicable.

The service-role key may bypass RLS and is restricted to protected server processes. Normal
application queries should prefer the caller's authenticated context so policies remain effective.

## Future wallet and blockchain boundary

Wallet connection, challenges, signatures, Solana RPC reads, token-gate decisions, and reward claims
are not implemented in Phase 1. When authorized, ownership challenges must be single-use and
verified by the API; balance and eligibility decisions must use raw integer amounts on the server.
RPC failure must remain distinct from insufficient balance. Treasury signing must be isolated from
normal services.

## Operational rules

- Tests use mocks or local processes and never connect to hosted Supabase or Solana infrastructure.
- Remote Supabase linking, resets, pushes, and migrations require explicit project-owner approval.
- Production secrets must come from the selected deployment platform's secret manager.
- Administrator registration remains disabled; Phase 2 must use trusted invitations/manual account
  creation plus backend checks and RLS.
- CORS and WebSocket origins are allowlists, not authentication mechanisms.
