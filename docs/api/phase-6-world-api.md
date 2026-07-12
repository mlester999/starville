# Phase 6 world API

All responses use the existing `{ success, data, requestId }` or safe error envelope. Routes disable
shared caching; immutable manifest responses add a checksum ETag and private revalidation policy.

## Player routes

Prefix: `/api/v1/token-access/player/world`

| Method and path             | Input                                                        | Result                                                                                        |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `GET /current`              | existing HttpOnly access session                             | Active published map/version/manifest and authoritative player state                          |
| `GET /maps/:mapId/manifest` | allowlisted map ID and access session                        | Active immutable publication without player/admin metadata                                    |
| `POST /transition`          | `exitId`, `expectedGameStateVersion`, `expectedMapVersionId` | Server-resolved destination publication, spawn, transition metadata, and updated player state |

Every route also checks active Phase 5 entry state. Suspended and rename-required players are
denied. The transition body is strict and rejects destination map, draft ID, spawn, coordinates,
wallet, or unknown fields. Transition mutations require an allowed Origin and a 2 KiB body limit.

## Administrator routes

Prefix: `/api/v1/admin`

| Route group                                        | Permission        |
| -------------------------------------------------- | ----------------- |
| `GET /worlds`, `GET /worlds/:mapId`                | `maps.read`       |
| Draft load/create/save/validate and version derive | `maps.edit`       |
| Version preview                                    | `maps.preview`    |
| Draft publication                                  | `maps.publish`    |
| Map/global world audit                             | `maps.audit_read` |
| `GET /world-assets`                                | `assets.read`     |

Directory and catalog reads use bounded server pagination/search. Mutations use strict JSON, exact
Origin, bounded bodies, request IDs, durable per-operation limits, optimistic versions/checksums,
and safe errors. Save accepts only canonical data shape; PostgreSQL attaches semantic validation.
Publication and derivation require safe reasons and confirmations.

## Safe errors

The API distinguishes invalid request (400), missing profile/draft/map (404), permission (401/403),
rename/version/state conflicts (409), invalid transition or publication validation (422), durable
rate limit (429), and unavailable/invalid published content (503). Raw database and validation stack
details never enter the response. A request ID is retained for support correlation.

## Rates and sizes

Defaults are configuration-driven: manifest max 256 KiB, manifest/admin reads 180/120 per minute,
transitions 30 per minute plus a one-second database cooldown, draft saves 30, validation 20,
derivation 10, and publication 5. Environment validation bounds every override.
