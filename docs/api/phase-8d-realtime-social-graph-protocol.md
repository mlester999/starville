# Phase 8D-A realtime social graph protocol

All messages use protocol version `1` on the authenticated Phase 8A WebSocket. Client messages carry
intent only. The server derives actor identity, membership, leader status, world/channel state,
block state, moderation state, capacity, and revisions.

Client message families:

- `friends.list.request`, `friends.request.send`, `friends.request.accept`,
  `friends.request.decline`, `friends.request.cancel`, and `friends.remove`;
- `party.create`, `party.invite.send`, `party.invite.accept`, `party.invite.decline`,
  `party.invite.cancel`, `party.leave`, `party.kick`, `party.promote`, and `party.disband`;
- `party.snapshot.request`, `party.ready_check.start`, and `party.ready_check.respond`;
- existing `chat.send` accepts the private `party` scope. The compatibility-only
  `chat.history.request` accepts the scope but never replays persisted party messages to players.

Every mutation has a bounded client request ID. Party mutations also carry the last observed
positive revision. The client never supplies a sender, leader, role, member list, party ID for chat,
world, channel, wallet, balance, or moderation outcome.

Server messages include `social_graph.bootstrap`, `friends.snapshot`, `friends.request.received`,
`friends.relationship.updated`, `party.snapshot`, `party.invitation.received`,
`party.invitation.updated`, party membership/leader/ready events, `party.disbanded`,
`social.notification`, and `social.error`. Clients keep the highest revision for a party and request
a new snapshot after stale-state errors. Duplicate request IDs replay the original database result.

Safe graph errors are allowlisted: unavailable/blocked player, friendship/request changes, party or
invitation changes, capacity, leadership, rate limit, maintenance, access change, and persistence
unavailability. Internal SQL, private profile IDs, wallet data, and block reasons are never sent.

Administrator HTTP routes are read-only except controlled settings:

- `GET /api/v1/admin/social-graph`
- `GET /api/v1/admin/social-graph/parties/:partyId`
- `GET /api/v1/admin/social-graph/audit`
- `GET|PATCH /api/v1/admin/social-graph/settings`

Queries use reviewed 10/50/100 page sizes. Settings mutations require exact-origin protection,
`social_graph.settings.edit`, an expected version, bounded fields, and an audit request ID.
