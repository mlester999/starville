# Phase 7.5B platform configuration API

`GET /api/v1/platform-configuration/:platformKey` returns only the active safe presentation with a
revision ETag and bounded public cache. It never returns drafts, intake paths, secrets, or
infrastructure settings. The database RPC is service-role-only: the API converts approved immutable
delivery paths to validated public asset URLs, strips the paths, and then returns the browser-safe
envelope.

Administrator routes provide the directory, exact preview, draft creation/update, validation, review
submission/approval, publication, and rollback under `/api/v1/admin/platform-configuration`. They
require verified Supabase identity, a trusted active administrator session, exact permission,
approved mutation origin, bounded bodies, request IDs, and shared validation. Preview is
no-store/noindex. Mutations are atomically rate-limited per administrator. Publication invalidates
the runtime cache.
