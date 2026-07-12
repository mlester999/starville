# Phase 4 protected player API

## Authentication boundary

All Phase 4 routes are nested under `/api/v1/token-access/player`. They reuse the existing opaque
access-session cookie without broadening its path. Every handler resolves the session through the
Phase 3 server service, rechecks expiry/configuration/revocation rules, and derives the wallet
address from that result. Browser-supplied wallet addresses are never authorization input and are
rejected by strict profile schemas.

| Method and route                            | Purpose                                                  |
| ------------------------------------------- | -------------------------------------------------------- |
| `GET /api/v1/token-access/player/profile`   | Load the current session wallet's profile or `null`      |
| `POST /api/v1/token-access/player/profile`  | Idempotently create the current wallet's minimal profile |
| `PATCH /api/v1/token-access/player/profile` | Update the current wallet's name or cosmetic preset      |
| `GET /api/v1/token-access/player/state`     | Load the validated resume projection of the profile      |
| `PUT /api/v1/token-access/player/state`     | Save one validated safe resume point                     |

Mutations require an exact configured Origin and JSON for POST, PATCH, and PUT. Bodies are limited
to 4096 bytes. Responses use the established success/error envelope and request ID. Raw Supabase,
SQL, session, or cookie details are never returned.

## Validation and abuse controls

- Names normalize with NFKC, trim/collapse whitespace, contain 3–20 supported visible characters,
  and reject markup/control characters.
- Appearance is one of `moss`, `marigold`, `moonberry`, or `river`; it is cosmetic only.
- State uses the allowlisted `lantern-square` map, finite coordinates, eight known directions, safe
  bounds, and server-owned collision data.
- Database functions enforce fixed-window per-wallet limits: six profile mutations and thirty state
  writes per minute by current API configuration.
- Creation uses a unique wallet constraint plus `ON CONFLICT DO NOTHING`, then returns the same
  record. It never overwrites an existing character through duplicate create.
- There is no player-by-ID, player-by-wallet, search, friends, presence, chat, or public profile
  API.

The service-role client receives only execute grants on reviewed security-definer functions. It has
no direct table privileges, and browsers never receive the service-role credential.
