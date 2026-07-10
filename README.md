# STARVILLE

Starville is a premium 2D isometric cozy multiplayer life-simulation game platform. This repository
contains the public website, player client, administrator portal, authoritative API, dedicated
real-time service, background worker, shared packages, and Supabase infrastructure.

The repository is currently limited to **Phase 1 of 9: Monorepo Foundation**. It establishes working
application and security boundaries without implementing later product features or presenting fake
production data.

## Requirements

- Node.js 22 or later
- pnpm 11.9.0 (declared through the `packageManager` field)
- Docker Desktop or a compatible Docker daemon only for local Supabase

The Supabase CLI is invoked at a pinned version through `pnpm dlx`; a global installation is
optional.

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
framework correctness. Run `pnpm env:check` to validate all six Phase 1 process configurations.
Never place a Supabase service-role key, database password, private RPC credential, wallet key, or
seed phrase in a public-prefixed variable.

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

## Local Supabase development

Docker must be running before these commands:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:stop
```

The local project lives in `infrastructure/supabase`. Phase 1 intentionally contains no product
tables, storage buckets, remote project link, or seed data. A schema should be introduced only when
an approved phase has a real persistence requirement. Every future exposed table must enable Row
Level Security and include policy tests in the same change.

Database types are generated from the local Supabase schema using the documented command in
`packages/database/README.md`; generated types are never a substitute for reviewed migrations.

Never run a destructive reset, link, push, or migration against an unknown hosted project. Remote
database changes require explicit owner approval.

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
  supabase/             Local CLI configuration and migrations
docs/                   Product specification and focused architecture records
```

Packages proposed by the master specification but not needed yet—authentication, admin
authorization, wallet, Solana, economy, map engine, game core, analytics, and shared UI—are omitted
instead of being filled with placeholders. See `docs/architecture/phase-1-foundation.md` for the
rationale.

## Phase 1 application behavior

- The landing application presents a small accessible Starville foundation screen and development
  readiness state. It is not the final fullscreen marketing artwork.
- The game client keeps React UI separate from Phaser and starts only a plain bootstrap scene. It
  has no map, player, movement, farming, or token gate.
- The admin portal presents a standalone branded foundation screen. It has no registration, login,
  authorization logic, metrics, charts, or player records.
- The API establishes versioned routing, health/readiness, request IDs, configured CORS, centralized
  errors, structured logs, and graceful shutdown.
- The real-time service establishes health, origin/capacity checks, connection lifecycle, and an
  empty room abstraction without gameplay synchronization or trusted player sessions.
- The worker establishes health, lifecycle, retry policy, and a safe development no-op job without
  crop, reward, schedule, or blockchain work.

## Security foundation

- Browser code can import only explicitly public environment values and the Supabase anonymous
  client factory.
- The service-role client is exposed only through a server entry point and requires explicit
  validated credentials.
- Logs redact credentials, authorization values, private-key material, database URLs, and secret RPC
  URLs.
- CORS and WebSocket origins are validated allowlists.
- Tests do not call Supabase, Solana, or any production infrastructure.
- No public administrator registration or fake authentication bypass exists.
- The parent directory may contain other game projects; Starville does not import their code, names,
  assets, maps, or branding.

Read [the Phase 1 trust boundaries](docs/security/phase-1-trust-boundaries.md) before adding an
external integration.

## Intentionally not implemented

The following are **not started by design** in Phase 1:

- administrator authentication, roles, permissions, protected routes, and RLS policies;
- Reown AppKit, wallet signatures, Solana RPC checks, token gating, and access sessions;
- final landing-page artwork or marketing design;
- isometric maps, player characters, movement, farming, cooking, crafting, housing, or map editing;
- marketplace, STARDUST economy, Constellation Points, rewards, claims, or treasury operations;
- social presence, multiplayer gameplay state, friends, chat, visits, trading, or community systems;
- production deployment and monitoring-provider configuration.

Those features belong to later phases and must not be inferred from the existence of configuration
boundaries or placeholder future variables.

## Architecture references

- [Phase 1 architecture](docs/architecture/phase-1-foundation.md)
- [Trust boundaries](docs/security/phase-1-trust-boundaries.md)
- [Local development](docs/deployment/local-development.md)
- [Environment ownership](docs/deployment/environment-variables.md)
- [Supabase local foundation](infrastructure/supabase/README.md)
- [Master specification](docs/STARVILLE_MASTER_SPEC.md)
