# Phase 1 service endpoints

The API exposes only foundation endpoints:

- `GET /health` — liveness of the API process;
- `GET /ready` — readiness of the API process;
- `GET /api/v1/status` — versioned foundation status.

Unknown routes and application errors use the shared API error envelope and include a request ID.
Responses never include environment values, Supabase credentials, or internal stack traces.

The real-time service exposes its own health endpoint and WebSocket upgrade boundary. The worker
exposes a health listener on its separately configured port. Neither service implements game
sessions, movement, chat, crops, rewards, or scheduled game work in Phase 1.
