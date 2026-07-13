# STARVILLE

Starville is a premium 2D isometric cozy multiplayer life-simulation game platform. This repository
contains the public website, player client, administrator portal, authoritative API, dedicated
real-time service, background worker, shared packages, and Supabase infrastructure.

The active implementation scope is **Phase 7.5A: World Asset Manager and Production Art Pipeline**.
Phases 4–7 remain intact. Phase 7.5A adds the local, permission-controlled foundation for PNG/WebP
intake, authoritative image validation, immutable derivatives and versions, review, activation,
asset previews, and safe draft-world visual replacement. It does not include final production
artwork or automatic asset/map publication. All new migrations remain local until an owner
explicitly approves hosted deployment. Phases 8 and 9 remain outside the current scope.

## Requirements

- Node.js 22 or later
- pnpm 11.9.0 (declared through the `packageManager` field)
- Access to the approved hosted Starville Development Supabase project for database/Auth integration
  validation after explicit operation approval
- A Reown project and owner-approved Solana Mainnet mint for live wallet acceptance (repository
  builds and deterministic tests do not require live wallet credentials)

Docker is not required for the selected hosted-development workflow. The repository's installed
Supabase CLI is used for hosted commands; a global installation is optional.

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
framework correctness. Run `pnpm env:check` to validate the application and Phase 3 server
configuration. Never place a Supabase service-role or modern secret key, database password, private
RPC credential, wallet key, or seed phrase in a public-prefixed variable.

For an existing ignored `.env.local`, the one-time Phase 3 preparation command copies a legacy
browser-safe Reown identifier to its explicit public name when needed and generates an independent
cookie secret without printing either value:

```bash
pnpm env:phase3:prepare
pnpm env:check
```

Development package scripts load the root files through explicit service profiles. Turbo remains in
strict environment mode and never broadcasts the root environment to every task. This means the
standard all-service command and direct filtered commands use the same root configuration without
app-local secret copies:

```bash
pnpm dev
pnpm --filter @starville/api dev
pnpm --filter @starville/admin-portal dev
```

Landing and game processes receive browser-safe values only. The landing receives the public Reown
project identifier; it never receives the Solana RPC URL or token-access cookie secret. The admin
Next.js process additionally owns its server-only recovery signing secret for server routes; that
value is not public-prefixed and is checked against compiled browser output by `pnpm security:scan`.
The API alone receives the Supabase service-role key, private Solana RPC, token-cookie secret, and
server-only real-time/worker readiness URLs used by the Phase 5 operations view. No normal
application profile receives the database URL or remote migration, hosted-test, or bootstrap
approvals.

Hosted operations and Phase 3 access additionally require explicitly owned values:

```dotenv
SUPABASE_ENVIRONMENT=development
SUPABASE_PROJECT_REF=<development-project-ref>
SUPABASE_REMOTE_WRITES_APPROVED=false
RUN_HOSTED_SUPABASE_TESTS=false
ADMIN_SESSION_TTL_MINUTES=60
ADMIN_BOOTSTRAP_ENABLED=false
ADMIN_REQUIRE_MFA_BY_DEFAULT=false
ADMIN_RECOVERY_COOKIE_SECRET=<at-least-32-random-characters>
NEXT_PUBLIC_REOWN_PROJECT_ID=<browser-safe-reown-project-id>
NEXT_PUBLIC_STARVILLE_X_URL=<optional-owner-approved-https-url>
NEXT_PUBLIC_STARVILLE_DISCORD_URL=<optional-owner-approved-https-url>
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=<server-only-rpc-url>
GAME_TOKEN_MINT_ADDRESS=<temporary-owner-approved-mainnet-mint>
TOKEN_ACCESS_COOKIE_SECRET=<independent-random-server-secret>
```

The root template contains placeholders only. Preserve existing real values in the ignored
`.env.local`, never print them, and never enable bootstrap permanently. See
[the environment ownership guide](docs/deployment/environment-variables.md) for the authoritative
variable boundary.

Phase 3 currently uses a temporary Mainnet validation token. It is not the official `$STAR` mint and
must be replaced through configuration before production launch. The mint address is never hardcoded
in application or migration source. Phase 6 does not modify that token configuration or send a
blockchain transaction.

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

Hosted development uses only the dedicated hosted Starville Development project. The canonical CLI
project is `infrastructure/supabase`, so every raw remote command must use
`--workdir infrastructure` and `--linked`. Do not use Docker or local Supabase for the selected
Phase 2 and Phase 3 workflow.

Safe read and preview sequence:

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Phase 6 migration repairs also have an isolated stock-PostgreSQL execution gate that never uses
hosted credentials:

```bash
pnpm db:test:local:world
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
README does not replace command evidence; every hosted result must be reported by the current
validation run. The current hosted migration state must be verified with `pnpm db:migrations:list`;
this repository does not infer deployment from local files. All four Phase 7 migrations are local
and pending owner-authorized deployment. Any hosted operation remains subject to the owner gates and
must be verified against the current migration list rather than assumed from this document.

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
  wallet-access/        Canonical challenges, public contracts, exact amounts, session hashing
  solana/               Server-only address, signature, mint, network, and balance verification
  game-core/            Renderer-agnostic map, movement, collision, depth, and player contracts
  game-content/         Five-map manifests, approved assets, and world-management contracts
  asset-management/     Asset profiles, lifecycle, configuration, and safe delivery contracts
  player-operations/    Strict moderation, directory, audit, and operations contracts
  cozy-gameplay/        Strict Phase 7 DUST, inventory, farm, shop, recipe, and home contracts
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

Analytics and shared UI packages remain omitted until their approved phases require real
implementation. Phase 7 economy contracts live in the focused `cozy-gameplay` package rather than a
speculative generic economy package. The Phase 6 visual editor lives in the administrator
application and reuses the canonical `game-core` and `game-content` contracts rather than creating a
duplicate editor package.

## Phase 4 behavior

- The landing is a responsive, accessible, non-pixel Starville hero with an original lantern-village
  asset and a 20-state wallet/access dialog. Reown is initialized client-side for only the
  configured Solana network; connection alone never grants access.
- The API generates a short-lived canonical message, verifies its exact Ed25519 signature, consumes
  the challenge atomically, validates the configured network genesis/mint/program/decimals, and sums
  all valid matching token accounts with `bigint`.
- Eligible wallets receive a short-lived opaque host-only HttpOnly cookie. PostgreSQL stores only an
  HMAC, configuration/balance snapshot, expiry, and revocation state. Account/network changes,
  explicit disconnect, expiry, insufficient recheck, and configuration changes fail closed.
- The game client asks the trusted `/me` endpoint before mounting Phaser and reconciles/rechecks the
  session on schedule and focus. It contains no wallet SDK or local access bypass. After a grant, it
  loads the session-owned player profile and mounts Phaser only after both checks succeed.
- `@starville/game-core` owns deterministic isometric projection, screen-relative eight-direction
  movement, collision, depth ordering, interaction selection, strict player contracts, and the
  validated Lantern Square manifest. It has no browser, wallet, database, or renderer dependency.
- Lantern Square is composed from manifest terrain, structures, objects, collision shapes, camera
  bounds, a safe spawn, and one data-driven notice interaction. The current visuals are original,
  antialiased procedural development art with explicit replacement boundaries; the world is not a
  flattened image and no third-party game art is included.
- The protected player API stays under `/api/v1/token-access/player`, so the original narrow cookie
  path does not need to broaden. Wallet ownership always comes from the HMAC-resolved HttpOnly
  access session. Profile/state writes use strict schemas, body limits, exact Origin checks, durable
  database rate limits, and reviewed service-role-only functions.
- Safe position is a resume convenience only. The API validates map ID, finite coordinates, bounds,
  and collision before persistence, and falls back to the configured spawn for invalid legacy state.
  It is never authority for rewards, anti-cheat, achievements, or multiplayer.
- The protected `/token-access` admin page separates `token_gate.read` from `token_gate.configure`,
  validates mint metadata through the server RPC, uses optimistic config versions, invalidates stale
  sessions, and writes administrator audit history.
- The Phase 2 login, MFA-aware authorization, recovery, session revocation, and role/permission
  controls remain intact. Player wallet access never grants administrator access.

The hosted development Mainnet row is validated against a temporary Token-2022 mint for Phase 3
testing. That mint is not the official `$STAR` token and must be replaced through the protected
configuration flow before production. Live eligible-wallet acceptance still requires an
owner-controlled wallet holding the configured threshold.

## Phase 5 behavior

- `/operations` shows stored profile/moderation counts, a precisely defined active-session count,
  token-access configuration, and bounded API/real-time/worker readiness. It never labels recent
  entry as “online,” invents trends, or makes per-player Solana RPC calls.
- `/players` uses server-side pagination, allowlisted sorting, normalized name-prefix or
  exact-wallet search, moderation/rename/map/recent-entry filters, and responsive semantic
  table/card views.
- `/players/[playerId]` shows identity, safe resume state, current moderation, access-session
  counts, and bounded player audit history according to the administrator's permissions.
- Suspend/restore, reviewed-spawn reset, required rename, and session revocation re-check the
  trusted administrator session and exact permission in both Fastify and PostgreSQL. Every mutation
  requires a reason, expected moderation version, request ID, durable rate limit, and append-only
  audit.
- Suspension and required rename revoke current Starville access sessions. Restoration creates no
  session and clears any session that raced with the suspended interval. Spawn reset accepts no
  browser coordinates and resolves Lantern Square's active published version and reviewed default
  spawn. Player state writes carry an optimistic game-state version so an in-flight stale save
  cannot overwrite the reset or a world transition.
- The player API checks moderation after token access and before profile/state bootstrap. Suspended
  players never mount the map; rename-required players receive only the protected replacement-name
  flow, whose successful write clears the requirement atomically. A mounted client reconciles its
  trusted session every 30 seconds and on focus/visibility, without claiming realtime presence.
- These controls are application restrictions only. They never transfer tokens or modify a wallet,
  token account, mint, authority, or balance.

## Phase 6 behavior

- `@starville/game-content` owns the reviewed asset catalog and five immutable seed manifests:
  Lantern Square, Moonpetal Meadow, Brooklight Crossing, Hearthfield Road, and Whisperpine Gate.
  Lantern Square has four visible active exits; each outer map has one return route and three
  visibly blocked, disabled route slots.
- The protected player world API loads only active published versions after the existing token
  session and moderation checks. Clients identify an exit and optimistic source versions only; the
  database resolves the destination map, published version, safe spawn, facing, and atomic player
  state update.
- The Phaser runtime keeps one game instance and one scene while unloading map-specific terrain,
  objects, markers, and collision graphics. A short accessible transition blocks input, applies the
  authoritative state, changes camera/collision/interactions, and re-arms exits only after the
  arrival spawn is clear. Failures restore the last safe source position.
- World maps, versions, assets, version references, audit events, and operation limits are
  default-deny RLS tables. Published/superseded history is immutable, world audit is append-only,
  and publication atomically supersedes the prior version and activates the validated replacement.
- `/worlds`, the structured editor, protected draft preview, version dialogs, `/world-assets`, and
  `/world-audit` use exact permissions, server pagination, optimistic edits, reasons, confirmations,
  trusted validation, and safe errors. Normal players cannot request draft IDs or administrator
  validation metadata.
- Phase 6 deliberately uses repository-owned procedural development art. Browser asset upload is
  withheld until trusted decode/re-encode, magic-byte validation, metadata removal, hashing, and
  immutable storage processing exist end to end.
- Players already inside a superseded map may finish using that loaded immutable version. They
  reconcile to the active publication at the next safe load or transition; objects from two versions
  are never mixed in one scene.

## Phase 7 behavior

- A valid, non-maintenance player bootstrap creates one integer DUST account, an append-only ledger,
  a 24-slot inventory, eight quickbar assignments, a permanent watering can, six private plots, one
  pinned starter home, and one starter chair. The 250 DUST grant and starter items are exactly-once.
- Item, crop, recipe, shop, offer, furniture, and home-template definitions are strict, versioned
  content. Browser requests never provide prices, balances, readiness timestamps, yields, recipe
  outputs, ownership decisions, or accepted furniture positions.
- Database transactions and row locks keep purchases, sales, planting, watering, harvesting,
  cooking, crafting, and furniture changes atomic and idempotent. Crop growth uses database time and
  deterministic configured yields.
- React owns the DUST HUD, persistent eight-slot quickbar, inventory, shop, recipe, farm, and
  private-home panels without recreating Phaser. Typed `E` interactions remain data-only world
  anchors; modal activity blocks movement and preserves keyboard focus rules.
- Phase 7 interaction anchors exist only in new local derived world drafts. Existing published world
  history remains unchanged, and normal players cannot load those draft interactions until an owner
  explicitly validates and publishes them.
- `/game-content` and player detail provide bounded, permission-protected, read-only Phase 7
  visibility. There is no administrator DUST or inventory adjustment endpoint.
- DUST is off-chain, non-transferable, non-withdrawable, unrelated to token-gate eligibility, and is
  never displayed as `$DUST`. Phase 7 adds no `$STAR` reward or blockchain gameplay mutation.

## Phase 7.5A behavior

- Authorized operators can manage raster production candidates through a versioned directory,
  upload/processing flow, configuration and isometric preview, review queue, approval, activation,
  deprecation, references, and append-only audit history. Upload and every lifecycle action are
  separately permission checked.
- The trusted API accepts one bounded PNG/WebP, inspects actual decoded content, rejects animation,
  malformed or excessive images, computes SHA-256, detects duplicates, strips metadata through
  re-encoding, and produces normalized WebP delivery, preview, and thumbnail variants. Private
  intake object identifiers are never exposed to browsers.
- Asset identities have immutable versions. Map-version references pin the exact visual version;
  activating a newer version cannot silently alter an existing published world. Public delivery
  contains sanitized immutable derivatives only.
- World Editor normally offers only active approved production versions. Development markers use an
  explicit filter. Draft-only replacement preserves object identity, position, interactions,
  destinations, and gameplay configuration, keeps collision by default, and synchronizes manifest
  references in one undoable operation.
- The game client can resolve version-pinned production delivery descriptors and falls back to the
  existing procedural marker for an individual load failure without changing collision, saving,
  travel, access, or server authority.

## Security foundation

- Browser code can import only explicitly public environment values and anonymous/publishable
  Supabase clients; privileged and server-only administrator modules use separate entry points.
- The service-role client is exposed only through a server entry point and requires explicit
  validated credentials.
- Logs redact credentials, authorization values, private-key material, database URLs, secret RPC
  URLs, wallet signatures/messages/nonces, and opaque session material.
- Credentialed CORS uses exact allowlists; cookie-authenticated mutations additionally require an
  exact Origin, with JSON enforced for POST, PATCH, and PUT bodies.
- Normal unit tests remain deterministic and offline. Hosted database and RLS suites are separate,
  opt-in, target-verified commands that may contact only Starville Development.
- No public administrator registration, metadata-based role, or fake authentication/MFA bypass
  exists.
- The parent directory may contain other game projects; Starville does not import their code, names,
  assets, maps, or branding.

Read [the Phase 1 trust boundaries](docs/security/phase-1-trust-boundaries.md) before adding an
external integration.

## Intentionally not implemented in Phase 7.5A

The following are **not started by design** in Phase 7.5A:

- equipment, quests, combat, animals, NPC schedules, player businesses, stamina, hunger, health, or
  durability;
- player marketplace, gifting, trading, Constellation Points, rewards, claims, or treasury
  operations;
- realtime player synchronization, chat, channels, friends, parties, guilds, trading, visits,
  leaderboards, or nearby-player interactions;
- final production artwork, automated art generation, automatic asset/map approval or publication,
  realtime collaborative editing, or arbitrary new map-identity creation;
- administrator invitation/management UI, role editing, permission editing, session-listing UI, or a
  global administrator audit browser;
- production Supabase setup, production deployment, and monitoring-provider configuration.

The administrator permission catalog reserves stable keys for future systems but does not mean that
their pages, APIs, or business operations have been implemented.

## Architecture references

- [Phase 1 architecture](docs/architecture/phase-1-foundation.md)
- [Trust boundaries](docs/security/phase-1-trust-boundaries.md)
- [Phase 2 administrator authentication](docs/admin/phase-2-admin-authentication.md)
- [Phase 3 token-access architecture](docs/architecture/phase-3-token-access.md)
- [Wallet authentication](docs/security/wallet-authentication.md)
- [Token-gate verification](docs/security/token-gate-verification.md)
- [Token-access sessions](docs/wallet/token-access-sessions.md)
- [Token Access administration](docs/admin/token-access-configuration.md)
- [Phase 3 wallet operations](docs/deployment/phase-3-wallet-operations.md)
- [Phase 4 vertical-slice architecture](docs/architecture/phase-4-game-vertical-slice.md)
- [Phase 4 player API](docs/api/phase-4-player-api.md)
- [Lantern Square map](docs/maps/lantern-square.md)
- [Phase 4 development art](docs/assets/phase-4-development-art.md)
- [Phase 4 player trust boundary](docs/security/phase-4-player-trust-boundary.md)
- [Phase 4 migration runbook](docs/deployment/phase-4-player-migration.md)
- [Phase 5 secure operations architecture](docs/architecture/phase-5-secure-admin-operations.md)
- [Phase 5 administrator operations](docs/admin/player-operations.md)
- [Phase 5 administrator API](docs/api/phase-5-admin-operations-api.md)
- [Phase 5 trust boundary](docs/security/phase-5-player-operations-trust-boundary.md)
- [Phase 5 migration runbook](docs/deployment/phase-5-player-operations-migration.md)
- [Phase 6 world-management architecture](docs/architecture/phase-6-world-management.md)
- [Phase 6 world graph](docs/maps/phase-6-world-graph.md)
- [Phase 6 administrator workflow](docs/admin/world-management.md)
- [Phase 6 player and administrator API](docs/api/phase-6-world-api.md)
- [Phase 6 trust boundary](docs/security/phase-6-world-trust-boundary.md)
- [Phase 6 migration runbook](docs/deployment/phase-6-world-migration.md)
- [Phase 6 asset boundary](docs/assets/phase-6-world-assets.md)
- [Phase 7 cozy architecture](docs/architecture/phase-7-cozy-gameplay.md)
- [Phase 7 DUST and inventory integrity](docs/economy/phase-7-dust-and-inventory.md)
- [Phase 7 gameplay loop](docs/game-design/phase-7-cozy-systems.md)
- [Phase 7 API](docs/api/phase-7-cozy-gameplay-api.md)
- [Phase 7 trust boundary](docs/security/phase-7-cozy-gameplay-boundary.md)
- [Phase 7 migration runbook](docs/deployment/phase-7-cozy-gameplay-migration.md)
- [Phase 7 manual acceptance](docs/deployment/phase-7-manual-qa.md)
- [Phase 7.5A asset architecture](docs/architecture/phase-7-5a-world-assets.md)
- [World Asset Manager guide and owner checklist](docs/assets/world-asset-manager.md)
- [Phase 7.5A World Asset API](docs/api/phase-7-5a-world-assets-api.md)
- [World asset storage security](docs/security/world-asset-storage.md)
- [World asset administrator runbook](docs/admin/world-asset-runbook.md)
- [Phase 7.5A deployment runbook](docs/deployment/phase-7-5a-world-assets.md)
- [First Super Administrator bootstrap](docs/admin/admin-bootstrap.md)
- [Roles and permissions](docs/admin/roles-and-permissions.md)
- [Administrator authorization security](docs/security/admin-authorization.md)
- [Administrator session revocation](docs/security/admin-session-revocation.md)
- [Administrator RLS policies](docs/security/rls-admin-policies.md)
- [Hosted test safety](docs/security/hosted-supabase-test-safety.md)
- [Hosted Supabase development](docs/deployment/hosted-supabase-development.md)
- [Environment ownership](docs/deployment/environment-variables.md)
- [Master specification](docs/STARVILLE_MASTER_SPEC.md)
