# Phase 6 world trust boundary

## Player browser

The game browser holds no service-role key, database URL, private RPC URL, administrator credential,
or storage credential. It can request only published world data after the existing HttpOnly
token-access session and moderation checks. A transition request contains an exit identifier and
optimistic source versions; destination map, version, spawn, coordinates, and facing are never
client-authoritative. Local storage contains Settings only, not authoritative map content or access.

## Administrator browser and Next.js portal

The portal requires the Phase 2 Supabase administrator session and exact permission on every page
and server action. It edits structured fields rather than executable or raw JSON content. Mutation
requests use same-origin server actions, bounded bodies, UUID request IDs, explicit confirmation,
reasons where required, and optimistic versions. UI visibility is convenience only; Fastify and
PostgreSQL repeat authorization.

Validated draft preview is a separate administrator-only boundary. It has a visible `DRAFT PREVIEW`
label, local movement/collision only, no player persistence, no reward/economy calls, and inert
exits. Normal player endpoints accept no version ID and cannot enumerate drafts or validation
metadata.

## API

The API owns the Supabase service-role client and exposes it nowhere else. Player identity comes
only from the HMAC-resolved access session. Administrator identity comes only from a verified bearer
and active database-backed admin session. Exact Origin checks protect cookie/session mutations;
schemas, body limits, request IDs, durable database limits, safe error envelopes, and redacted
structured logs apply to every world route.

The API revalidates published manifests before returning them and validates draft structure before
persistence. It never logs manifest binary data, cookies, bearer tokens, wallet signatures, service
keys, database URLs, or private RPC credentials.

## PostgreSQL and RLS

World tables are default-deny with RLS enabled and no anon/authenticated policies. Direct
service-role table access is also revoked. Narrow trusted functions use `SECURITY DEFINER`, empty
`search_path`, strict inputs, bounded pagination, optimistic guards, and exact Phase 2 permission
assertions.

Publication and transition validate again below the API. Publication is atomic; historical versions
are immutable; audit is append-only. The player never chooses destination data. Stale checkpoint
versions cannot overwrite a transition or administrator reset. Reset resolves the active reviewed
Lantern Square publication and named default spawn in the database.

## Content and asset data

Manifest schemas accept only bounded primitives and reviewed enum values. Safe text rejects markup,
control characters, handler-like strings, and script/data URL forms. Assets use stable keys and an
approval catalog, never arbitrary URLs or filesystem paths. Only approved assets may validate for
publication. Historical references use restrict semantics and cannot be silently deleted.

Phase 6 registers repository-procedural records with `application/x-starville-procedural`, null
raster dimensions/file size, a deterministic content hash, and repository paths. It does not pretend
those records are uploaded images.

## Storage

No Supabase world-asset bucket or browser upload is enabled. A future upload boundary must perform
server-side PNG/WebP/AVIF magic-byte and MIME checks, maximum 5 MiB/4096×4096 limits, decode and
safe re-encode, metadata removal, hashing, duplicate detection, immutable generated paths, approval,
and reference-aware cleanup before UI upload controls may be enabled.

## Unchanged external boundaries

Reown, Solana RPC, the temporary Mainnet token, and token balances remain Phase 3 boundaries. Phase
6 sends no blockchain transaction and does not change the mint, authorities, accounts, balances, or
token configuration. Realtime and worker services receive no draft manifests or player authority.

## Permission matrix

| Role                                               | Phase 6 access                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Super Administrator                                | read, edit, preview, publish, audit, asset read                                 |
| Game Administrator                                 | read, edit, preview, audit, asset read; no publish                              |
| World Designer                                     | read, edit, preview, publish, audit, asset read/upload permission catalog entry |
| Live Operations Manager                            | read, audit, asset visibility; no content mutation                              |
| Moderator / Customer Support / Blockchain Operator | no world-management permission by default                                       |
| Read-only Analyst                                  | `maps.read` through the reviewed read-only mapping; no edit/preview/publish     |

`assets.upload` remains a reserved permission without an implemented Phase 6 upload endpoint.
