# Phase 8A realtime deployment runbook

No hosted command is run automatically.

1. Set a distinct, server-only `REALTIME_TICKET_SECRET` (at least 32 random characters) on the API
   and realtime server.
2. Configure exact `REALTIME_ALLOWED_ORIGINS`; production uses WSS.
3. Review `20260715100000_realtime_presence_foundation.sql`.
4. With owner approval, run `pnpm db:verify-target`, `pnpm db:migrations:dry-run`, then
   `pnpm db:migrations:push`.
5. Under existing hosted-test safety gates, run `pnpm db:lint:hosted`, `pnpm db:test:hosted`, and
   `pnpm rls:test:hosted`.
6. Deploy API/realtime before the game client and admin portal, then verify `/ready`.

Corrections are forward-only. Do not delete an applied migration or reset a hosted project.
