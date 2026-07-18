# Phase 8D-A social privacy and trust boundaries

The browser is untrusted. It may request a friend or party action using public presence IDs, but it
cannot assert identity, friendship, party membership, leader role, ready state, location, block
state, or authorization. The realtime server uses the authenticated session and service-role RPCs.
All graph tables have forced RLS, no browser policies, and no table grants to `anon`,
`authenticated`, `public`, or `service_role`.

Friend presence is allowlisted to public presence ID, display name, public level, appearance, coarse
online/reconnecting/offline state, optional world name/channel, coarse last-seen category, and party
relationship. Exact coordinates, wallet addresses, auth/session identifiers, IP addresses,
inventory, balances, block reasons, and private chat are excluded. Blocked pairs receive no
friend-only presence.

Party chat is not a global or direct-message channel. Persistence binds each message to the sender's
active party. Delivery is limited to currently active members and filtered by recipient mute/block
preferences. Leaving, kicking, disbanding, suspension, access loss, or block invalidation removes
future delivery and history access.

One active membership, one leader, capacity, invitation uniqueness, and ready-response uniqueness
are database constraints. Mutations use expected revisions, idempotency records, party-first lock
ordering, and a moderation-row lock for suspension/join serialization. Audit and replay records are
append-only; cleanup may delete only reviewed expired, non-protected rows under its explicit
transaction setting.

Administrators receive aggregate friendship metrics and bounded party/audit views only. No route can
force a friendship or membership. Permissions are independent; Read-only Analyst receives only
`social_graph.read`. Settings cannot grant roles or permissions. Existing suspension remains the
enforcement action.

Logs may include correlation ID, public request ID, operation, latency, party size, and safe status.
They must not include friend lists, full party chat, authorization/session tokens, wallet
signatures, service keys, database URLs, IP addresses, or private block reasons.
