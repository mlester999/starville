# Phase 8D-B Realtime Activity Protocol

All messages use realtime protocol version 1, strict schemas, bounded UUID/request IDs, and reject
unknown fields. Identity, session, public presence, observed position, party membership, access, and
moderation state come from the authenticated server connection.

Client intent messages are `activity.catalog.request`, `activity.entry.prepare`,
`activity.entry.ready`, `activity.entry.enter`, `activity.instance.snapshot.request`,
`activity.interact`, `activity.leave`, and `activity.resume`. The public queue messages are
intentionally absent while private-party entry is the only supported mode.

Server messages are `activity.bootstrap`, `activity.catalog`, `activity.entry.updated`,
`activity.instance.created`, `activity.instance.snapshot`, `activity.objective.updated`,
`activity.participant.updated`, `activity.timer.updated`, `activity.paused`, `activity.completed`,
`activity.failed`, `activity.cancelled`, `activity.reward.receipt`, and `activity.error`.

`activity.interact` contains only a client request ID and
`{instanceId, expectedRevision, objectiveKey, objectKey}`. It cannot contain progress, contribution,
party members, position, reward, DUST, inventory, moderation, or internal database IDs. The realtime
server supplies the observed position and PostgreSQL returns the canonical refreshed snapshot.

Safe activity errors include unavailable, party/leader/revision/size/readiness errors, entry
conflict, objective changed, invalid object, out of range, not participant, expiry, cooldown, daily
limit, rate limit, maintenance, access changed, and persistence unavailable. Raw SQL or provider
errors are never forwarded.

Catalog, snapshot, prepare, ready, enter, interact, and leave each have independent connection-level
rate bounds. PostgreSQL additionally enforces durable entry and interaction limits plus idempotency.
Instance updates are sent only to the locked roster; public channel clients do not receive them.
