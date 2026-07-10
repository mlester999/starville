# Environment-variable ownership

The canonical template is the root `.env.example`. It is safe to commit because every credential is
a non-working placeholder.

## Browser-safe and required in Phase 1

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_GAME_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Only these explicitly public values may be mapped into frontend configuration. The anonymous key
does not grant privileged access and depends on correct future RLS.

## Server-only and required in Phase 1

- `NODE_ENV`, `LOG_LEVEL`
- `API_HOST`, `API_PORT`
- `REALTIME_HOST`, `REALTIME_PORT`
- `WORKER_HOST`, `WORKER_HEALTH_PORT`
- `CORS_ALLOWED_ORIGINS`, `REALTIME_ALLOWED_ORIGINS`
- `REALTIME_MAX_CONNECTIONS`
- `WORKER_CONCURRENCY`, `WORKER_MAX_ATTEMPTS`, `WORKER_RETRY_BASE_DELAY_MS`

Frontend ports are process controls and not bundled values: `LANDING_PORT`, `GAME_CLIENT_PORT`, and
`ADMIN_PORT`.

## Server-only and conditional

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DATABASE_URL` are validated only when privileged Supabase
or database tooling is explicitly constructed. They are not required for a clean Phase 1 build and
must never use a public prefix.

## Reserved, not implemented

`REOWN_PROJECT_ID`, `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `GAME_TOKEN_MINT_ADDRESS`,
`GAME_TOKEN_SYMBOL`, and `GAME_TOKEN_GATE_AMOUNT` document Phase 3 setup only. Their presence does
not mean wallet, signature, RPC, token-gate, or reward behavior exists.

## Precedence

Root commands load `.env.example`, then optional `.env`, then optional `.env.local`, then exported
shell variables. Never edit `.env.example` with real values. CI and production should export all
required values directly and may invoke workspace package commands without the local fallback
runner.

The build command intentionally applies `NODE_ENV=production` after those sources. No other
environment value is overridden by the command runner.
