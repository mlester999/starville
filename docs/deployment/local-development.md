# Local development

## Prerequisites

- Node.js 22 or later
- pnpm 11 (the exact package-manager version is declared in `package.json`)
- Docker only when running the local Supabase stack

Install dependencies with `pnpm install`. Copy `.env.example` to `.env.local` only when local values
need to differ from the safe defaults.

Run every application with `pnpm dev`, or use `pnpm dev:landing`, `pnpm dev:game`, `pnpm dev:admin`,
`pnpm dev:api`, `pnpm dev:realtime`, or `pnpm dev:worker`. The six default ports are 3000–3002 and
4000–4002, so the processes do not compete for a listener.

Before handing off a change, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm clean` to remove generated application output and Turbo metadata. It deliberately leaves
the dependency installation intact.

`pnpm build` explicitly uses `NODE_ENV=production`; development commands retain the documented local
default. Exported deployment variables still take precedence for all other configuration.

## Local Supabase

Start the local stack with `pnpm supabase:start`, inspect it with `pnpm supabase:status`, and stop
it with `pnpm supabase:stop`. The commands pin the CLI version and use `infrastructure/supabase` as
the work directory. Docker is required; production credentials are not.

Do not link a hosted project or run remote database changes from this checkout without explicit
approval. Phase 1 has no schema migration or seed data.
