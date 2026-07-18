# Phase 8A realtime trust boundary

| Boundary           | Trusted for                                                                                         | Never trusted for                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Game browser       | input intent, local prediction, requested gait and channel                                          | identity, eligibility, capacity, collision, canonical facing/state, other players, persistence authority |
| API                | HTTP-only session validation and one-use ticket issuance                                            | live membership after handoff                                                                            |
| Realtime server    | admission, membership, movement, derived facing/state, trailing idle, same-channel fan-out, cleanup | wallet signing or token-RPC verification                                                                 |
| PostgreSQL RPCs    | ticket consumption, capacity claims, lifecycle summaries, admin authorization                       | frame transport or browser mutation                                                                      |
| Published manifest | immutable bounds, collision, and version identity                                                   | drafts or client geometry                                                                                |

Tickets are random, expire after 30 seconds, are consumed once, live only in browser memory, and are
stored as keyed hashes. `REALTIME_TICKET_SECRET` is server-only and must be distinct in deployed
environments. Production requires an explicit secret.

All realtime tables force RLS and revoke direct access from `anon`, `authenticated`, and
`service_role`; the service role receives execute only on named functions. Administrator visibility
requires `realtime.read` and returns aggregate channel/session data only.

Origins are exact. Messages are strict, bounded, versioned, and rate limited. Logs contain only safe
connection/request/world/channel context—not tickets, cookies, wallet addresses, keys, or bodies.

Browser-supplied facing is only a format-valid hint, and browser-supplied movement state only asks
for a bounded gait envelope. The realtime server derives the public facing and animation state from
accepted movement. A client-authored same-position follow-up becomes idle without changing the last
authoritative facing; no browser can directly publish a false remote animation state.
