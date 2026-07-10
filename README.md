# STARVILLE

Starville is a premium 2D isometric cozy multiplayer life-simulation game platform. This repository
contains the public website, player client, administrator portal, authoritative API, dedicated
real-time service, background worker, shared packages, and Supabase infrastructure.

The active implementation scope is **Phase 2 of 9: Administrator Authorization Foundation**. Phase 1
established the monorepo and six application boundaries; Phase 2 adds Supabase administrator
identity, database-backed roles and permissions, trusted administrator sessions, protected admin
routes and API access, MFA-aware authorization, password recovery, audit records, and hosted RLS
validation. It does not implement Phase 3 wallet or token access or the Phase 5 operations portal.

## Requirements

- Node.js 22 or later
- pnpm 11.9.0 (declared through the `packageManager` field)
- Access to the approved hosted Starville Development Supabase project for Phase 2 database and Auth
  integration validation

Docker is not required for the selected Phase 2 hosted-development workflow. The repository's
installed Supabase CLI is used for hosted commands; a global installation is optional.

## Installation

```bash
pnpm install
```

pnpm links internal dependencies through the workspace and creates one shared lockfile. Do not
install application dependencies with npm or Yarn.

## Environment setup

The committed `.env.example` contains non-working, development-safe placeholders and documents
whether each value is browser-safe, server-only, required now, conditional, or reserved for a later
phase.

For local overrides:

```bash
cp .env.example .env.local
```

Edit only `.env.local`; it is ignored by Git. Root commands load values in this order:

1. `.env.example`;
2. optional `.env`;
3. optional `.env.local`;
4. variables already exported by the shell.

Later entries override earlier entries; `pnpm build` then forces only `NODE_ENV=production` for
framework correctness. Run `pnpm env:check` to validate the application and Phase 2 server
configuration. Never place a Supabase service-role or modern secret key, database password, private
RPC credential, wallet key, or seed phrase in a public-prefixed variable.

Development package scripts load the root files through explicit service profiles. Turbo remains in
strict environment mode and never broadcasts the root environment to every task. This means the
standard all-service command and direct filtered commands use the same root configuration without
app-local secret copies:

```bash
pnpm dev
pnpm --filter @starville/api dev
pnpm --filter @starville/admin-portal dev
```

Landing and game processes receive browser-safe values only. The admin Next.js process additionally
owns its server-only recovery signing secret for server routes; that value is not public-prefixed
and is checked against compiled browser output by `pnpm security:scan`. The API alone receives the
Supabase service-role key. No normal application profile receives the database URL or remote
migration, hosted-test, or bootstrap approvals.

Phase 2 hosted operations additionally require explicitly configured server-only gates:

```dotenv
SUPABASE_ENVIRONMENT=development
SUPABASE_PROJECT_REF=<development-project-ref>
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_SESSION_TTL_MINUTES=60
ADMIN_BOOTSTRAP_ENABLED=false
ADMIN_REQUIRE_MFA_BY_DEFAULT=false
ADMIN_RECOVERY_COOKIE_SECRET=<at-least-32-random-characters>
```

The root template contains placeholders only. Preserve existing real values in the ignored
`.env.local`, never print them, and never enable bootstrap permanently. See
[the environment ownership guide](docs/deployment/environment-variables.md) for the authoritative
variable boundary.

## Running applications

Start every application together:

```bash
pnpm dev
```

Start one application:

```bash
pnpm dev:landing
pnpm dev:game
pnpm dev:admin
pnpm dev:api
pnpm dev:realtime
pnpm dev:worker
```

| Application       | Package                      | Default URL             |
| ----------------- | ---------------------------- | ----------------------- |
| Public landing    | `@starville/landing`         | `http://localhost:3000` |
| Game client       | `@starville/game-client`     | `http://localhost:3001` |
| Admin portal      | `@starville/admin-portal`    | `http://localhost:3002` |
| API               | `@starville/api`             | `http://localhost:4000` |
| Real-time service | `@starville/realtime-server` | `http://localhost:4001` |
| Worker health     | `@starville/worker`          | `http://localhost:4002` |

Each port can be overridden by the corresponding variable in `.env.example`. The API provides
`/health`, `/ready`, and `/api/v1/status`. Service health responses intentionally exclude secrets.
The package-level `dev` scripts resolve root environment files by repository location rather than
the current working directory, so filtered pnpm commands work from the monorepo root.

## Quality commands

```bash
pnpm format          # format supported source and documentation
pnpm format:check    # verify formatting without changing files
pnpm lint            # run shared ESLint policy across workspaces
pnpm typecheck       # run strict TypeScript checks
pnpm test            # run deterministic Vitest suites
pnpm build           # build all six deployable applications
pnpm clean           # remove generated build/cache output
```

Turborepo orders dependency tasks, labels each workspace's output, and caches deterministic results.
Development processes and cleaning are never cached. The build command forces the framework-standard
`NODE_ENV=production` while using the documented safe placeholder URLs when no deployment
environment has been supplied.

## Hosted Supabase development

Phase 2 uses only the dedicated hosted Starville Development project. The canonical CLI project is
`infrastructure/supabase`, so every raw remote command must use `--workdir infrastructure` and
`--linked`. Do not use Docker or local Supabase for the selected Phase 2 workflow.

Safe read and preview sequence:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Only after the exact development environment, project ref, Supabase URL hostname, canonical CLI
link, and write approval all match:

```bash
pnpm db:migrations:push
pnpm db:migrations:list
pnpm db:lint:hosted
pnpm db:test:hosted
pnpm rls:test:hosted
```

Hosted tests use unique test-owned identities and exact-ID cleanup. They never reset the database,
truncate tables, delete unknown Auth users, or use service role as the identity under RLS. This
README does not assert that a migration push or hosted test has passed; the actual command results
must be reported by the Phase 2 validation run.

See [the hosted development runbook](docs/deployment/hosted-supabase-development.md) for target
verification, raw CLI command forms, hosted Auth redirects, fixture safety, and prohibited
operations. The first Super Administrator is created or an exactly matched invited record is
activated only through the dry-run-first [bootstrap runbook](docs/admin/admin-bootstrap.md); apply
requires the exact project reference, explicit development confirmation, and both write gates.

## Repository structure

```text
apps/
  landing/             Next.js public foundation
  game-client/         React/Vite client and isolated Phaser boundary
  admin-portal/        Next.js administrator-only application shell
  api/                  Fastify HTTP foundation
  realtime-server/     Dedicated connection/room foundation
  worker/               Background-job lifecycle foundation
packages/
  config/               Browser/server environment boundaries
  admin-auth/           Typed administrator roles, permissions, and authorization decisions
  database/             Migration and type-generation conventions
  design-tokens/        Shared visual primitives
  eslint-config/        Shared lint policy
  logger/               Structured logging and secret redaction
  shared-types/         Minimal foundation contracts
  shared-validation/    Reusable runtime schemas
  supabase/             Safe anonymous and privileged client factories
  testing/              Shared deterministic test helpers
  typescript-config/    Strict compiler presets
infrastructure/
  docker/               Future container boundary
  deployment/           Future provider boundary
  monitoring/           Future observability boundary
  supabase/             Canonical CLI configuration, migrations, and database/RLS tests
docs/                   Product specification and focused architecture records
```

Wallet, Solana, economy, map-engine, game-core, analytics, and shared UI packages remain omitted
until their approved phases require real implementation. See
`docs/architecture/phase-1-foundation.md` for the foundation rationale.

## Phase 2 administrator behavior

- The landing application presents a small accessible Starville foundation screen and development
  readiness state. It is not the final fullscreen marketing artwork.
- The game client keeps React UI separate from Phaser and starts only a plain bootstrap scene. It
  has no map, player, movement, farming, or token gate.
- The admin portal supports email/password login, callback and recovery flows, server-side protected
  routing, unauthorized/session-expired states, verified TOTP challenge for MFA-required sessions,
  and a minimal authenticated overview. There is no public administrator registration or MFA
  enrollment screen.
- The API retains its health/readiness and versioned status routes and adds protected current-admin
  context at `GET /api/v1/admin/me` with verified identity, trusted session, and permission checks.
- The real-time service establishes health, origin/capacity checks, connection lifecycle, and an
  empty room abstraction without gameplay synchronization or administrator identity.
- The worker establishes health, lifecycle, retry policy, and a safe development no-op job without
  crop, reward, schedule, or blockchain work.

Administrator access requires a verified Supabase Auth identity plus an active trusted `admin_users`
record, valid role, required permission, non-revoked trusted session, matching session and
permission versions, and sufficient verified MFA assurance. A normal Auth user, player account,
wallet, token balance, or client-supplied role never grants access.

Trusted administrator sessions are limited to 60 minutes. Password recovery requires both verified
`recovery` authentication-method evidence and a signed, ten-minute HttpOnly marker bound to the same
Auth user and session. An authoritative `auth.users` password-change trigger increments the trusted
session version, revokes every pending/active administrator session for that user, and records the
audit event.

The 12-role, 40-permission initial catalog and exact conservative mappings are documented in
[roles and permissions](docs/admin/roles-and-permissions.md). Administrator-management UI remains
deferred to Phase 5.

## Security foundation

- Browser code can import only explicitly public environment values and anonymous/publishable
  Supabase clients; privileged and server-only administrator modules use separate entry points.
- The service-role client is exposed only through a server entry point and requires explicit
  validated credentials.
- Logs redact credentials, authorization values, private-key material, database URLs, and secret RPC
  URLs.
- CORS and WebSocket origins are validated allowlists.
- Normal unit tests remain deterministic and offline. Hosted database and RLS suites are separate,
  opt-in, target-verified commands that may contact only Starville Development.
- No public administrator registration, metadata-based role, or fake authentication/MFA bypass
  exists.
- The parent directory may contain other game projects; Starville does not import their code, names,
  assets, maps, or branding.

Read [the Phase 1 trust boundaries](docs/security/phase-1-trust-boundaries.md) before adding an
external integration.

## Intentionally not implemented in Phase 2

The following are **not started by design** in Phase 2:

- Reown AppKit, wallet signatures, Solana RPC checks, token gating, and access sessions;
- final landing-page artwork or marketing design;
- isometric maps, player characters, movement, farming, cooking, crafting, housing, or map editing;
- marketplace, STARDUST economy, Constellation Points, rewards, claims, or treasury operations;
- social presence, multiplayer gameplay state, friends, chat, visits, trading, or community systems;
- administrator invitation/management UI, role editing, permission editing, session-listing UI,
  audit-log browser, player administration, and live-operations dashboards;
- production Supabase setup, production deployment, and monitoring-provider configuration.

The administrator permission catalog reserves stable keys for future systems but does not mean that
their pages, APIs, or business operations have been implemented.

## Architecture references

- [Phase 1 architecture](docs/architecture/phase-1-foundation.md)
- [Trust boundaries](docs/security/phase-1-trust-boundaries.md)
- [Phase 2 administrator authentication](docs/admin/phase-2-admin-authentication.md)
- [First Super Administrator bootstrap](docs/admin/admin-bootstrap.md)
- [Roles and permissions](docs/admin/roles-and-permissions.md)
- [Administrator authorization security](docs/security/admin-authorization.md)
- [Administrator session revocation](docs/security/admin-session-revocation.md)
- [Administrator RLS policies](docs/security/rls-admin-policies.md)
- [Hosted test safety](docs/security/hosted-supabase-test-safety.md)
- [Hosted Supabase development](docs/deployment/hosted-supabase-development.md)
- [Environment ownership](docs/deployment/environment-variables.md)
- [Master specification](docs/STARVILLE_MASTER_SPEC.md)
