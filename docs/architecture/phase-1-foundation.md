# Phase 1 monorepo foundation

## Scope

This document records the architecture selected for Starville Phase 1. It intentionally stops before
administrator authorization, wallet connection, token gating, gameplay, multiplayer synchronization,
economy logic, map tooling, or blockchain rewards.

## Repository layout

```text
apps/
  landing/           Public Next.js application shell
  game-client/       React/Vite client with an isolated Phaser runtime boundary
  admin-portal/      Separate Next.js administrator application shell
  api/                Authoritative HTTP service boundary
  realtime-server/   Dedicated real-time connection boundary
  worker/             Background-job process boundary
packages/
  config/             Public/private environment parsing entry points
  database/           Migration and generated-type conventions
  design-tokens/      Shared brand primitives, not shared UI components
  eslint-config/      Shared lint policy
  logger/             Structured, redacting service logger
  shared-types/       Small cross-service foundation contracts
  shared-validation/  Reusable Zod schemas and parsing helpers
  supabase/           Anonymous/browser and privileged/server client boundaries
  testing/            Focused shared test utilities
  typescript-config/  Strict compiler presets
infrastructure/
  docker/             Future image boundary
  deployment/         Future provider manifests
  monitoring/         Future observability-provider configuration
  supabase/           Local Supabase CLI project and migration boundary
```

The repository uses pnpm workspaces for dependency linking and Turborepo for task ordering, caching,
and app filtering. Root task names are consistent: `dev`, `build`, `lint`, `typecheck`, `test`, and
`clean`. Formatting is applied once at the workspace root.

## Framework decisions

- **Landing and admin portal:** Next.js App Router provides production server rendering, accessible
  document metadata, and a natural future boundary for server-only routes. The two applications are
  separate deployments; sharing design tokens does not imply sharing authorization or UI components.
- **Game client:** React and Vite keep the surrounding interface independent from Phaser. Phaser is
  loaded behind `src/game`, so React does not become the simulation runtime and later game systems
  do not leak into UI state.
- **API:** Fastify provides request lifecycle hooks, schema-friendly modular routing, structured
  error handling, CORS, and graceful shutdown with much less Phase 1 framework surface than NestJS.
  Domain modules can be added later without changing the transport boundary.
- **Real-time service:** a separate Fastify/WebSocket process owns origin checks, capacity limits,
  and future room abstractions. It does not accept or persist player identity in Phase 1.
- **Worker:** a separate Node process owns job lifecycle, retry-policy configuration, health state,
  and shutdown. Its development no-op job validates the runner without simulating game work.
- **Validation and tests:** Zod supplies runtime configuration validation and Vitest covers behavior
  without external services.

## Dependency direction

Applications may depend on foundation packages. Foundation packages must not depend on applications.
`config` depends on shared validation/types, `supabase` consumes validated explicit configuration,
and services consume `config` and `logger`. Browser code imports only browser-safe package entry
points. There are no circular package dependencies.

Shared workspace packages expose TypeScript source to workspace consumers and type-check themselves;
application production builds produce deployment artifacts. This avoids publishing internal packages
or requiring a stale prebuild during local development while preserving strict compiler validation.

## Environment boundary

The root environment runner applies values in this order, from lowest to highest priority:

1. committed `.env.example` development placeholders;
2. uncommitted `.env`;
3. uncommitted `.env.local`;
4. variables already exported by the calling process.

Command-specific safety overrides are applied last. In Phase 1, only `pnpm build` uses one: it
forces the framework-standard `NODE_ENV=production` so a development template cannot put Next.js
into an unsupported build mode.

Public parsers receive explicitly mapped `NEXT_PUBLIC_*` values. They cannot return server-only
Supabase, database, RPC, or service credentials. Server parsers are exposed through a separate entry
point and validate only the variables required by that process. A clean build therefore needs no
hosted Supabase project, while a real deployment fails clearly when its process configuration is
invalid.

## Stable local ports

| Process          | Default | Override             |
| ---------------- | ------: | -------------------- |
| Landing          |    3000 | `LANDING_PORT`       |
| Game client      |    3001 | `GAME_CLIENT_PORT`   |
| Admin portal     |    3002 | `ADMIN_PORT`         |
| API              |    4000 | `API_PORT`           |
| Real-time server |    4001 | `REALTIME_PORT`      |
| Worker health    |    4002 | `WORKER_HEALTH_PORT` |

Separate defaults prevent collisions. Bind addresses, allowed origins, capacity, and worker retry
values are independently configurable.

## Supabase and database decision

Supabase is the required PostgreSQL, authentication, and storage platform. Phase 1 provides local
CLI configuration, safe client factories, migration/type-generation conventions, and access
planning. It does not create tables or buckets because no Phase 1 feature requires persisted data.
Inventing empty player, economy, reward, item, map, or administrator schema would violate phase
scope. The first future schema migration must enable RLS and add policy tests at the same time.

## Deferred packages

The master specification proposes `auth`, `admin-auth`, `wallet`, `solana`, `game-core`,
`game-config`, `map-engine`, `economy`, `ui`, and `analytics`. They are deliberately omitted: each
belongs to a later authorized phase and would contain only placeholders today. They should be
introduced when real code and tests establish their dependency boundary.

## Build and cache policy

Turborepo hashes source, workspace configuration, the documented environment template, and declared
runtime environment values. Next.js and service `dist` output are cached; development servers and
cleaning are never cached. Tests do not connect to Supabase, Solana, or any hosted system.
