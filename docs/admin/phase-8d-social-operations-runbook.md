# Phase 8D-A social operations runbook

Use `/operations/social/friends` for aggregate friendship/request health,
`/operations/social/parties` for paginated party lifecycle summaries,
`/operations/social/parties/[partyId]` for bounded member/invitation/audit detail, and
`/operations/social/audit` for immutable lifecycle events.

The pages intentionally provide no add-friend, invite, promote, kick, disband, message-reading, or
force-membership controls. Investigate using public party IDs, safe display names, revisions,
connection state, world/channel labels, and bounded audit events. Use the existing player-suspension
workflow only when evidence and policy justify enforcement; realtime reconciliation then removes the
player and invalidates pending social requests.

Access requires `social_graph.read`; detail/audit requires `social_graph.audit.read`. Controlled
settings reads and edits require their separate permissions. Read-only Analyst cannot see audit or
settings. Game Administrator owns settings; Super Admin inherits the catalog. Module disablement
hides the navigation and leaves direct routes permission/module protected.

When investigating a stale party, check the current revision, leader reconnect deadline, active
member count, pending invitations, and cleanup health. Do not query tables from a browser role or
grant broad access. If cleanup fails, retain the data, capture the worker request ID and safe error,
repair the service-role RPC path, and rerun only after local validation.
