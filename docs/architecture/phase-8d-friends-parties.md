# Phase 8D-A friends and parties architecture

Phase 8D-A adds a durable, server-authoritative social graph to the Phase 8A socket. PostgreSQL owns
friend requests, canonical friendships, party membership, leadership, invitations, ready checks,
notifications, idempotency, and audit. The realtime server authenticates intent, applies independent
rate limits, calls service-role-only RPCs, and publishes revisioned snapshots. Browsers cannot read
or mutate the underlying tables.

Friendships use one canonical ordered pair. Pending requests are unique per unordered pair, expire
after seven days by default, and are capped at 50 incoming and 25 outgoing requests. The default
friend limit is 100. A block, suspension, or access revocation invalidates pending requests without
creating or restoring a friendship.

Each player may have one active party. A party defaults to four members and may be configured only
within the reviewed two-to-eight bound. Partial unique indexes enforce one active membership and one
active leader. Every mutation locks the shared party, validates an expected revision, and returns a
fresh snapshot. Invitation acceptance locks moderation, party, and invitation state in a stable
order; this prevents over-capacity joins, suspension races, and cross-invitation deadlocks.

Leader disconnect starts a 60-second grace period. Reconnect within the grace restores online state
without duplicating membership. Cleanup deterministically promotes the earliest joined connected
member; when none is available the party becomes dormant and expires after 24 hours. Membership
changes invalidate active ready checks. The default ready window is 30 seconds.

Party chat reuses the Phase 8B message table and socket protocol with a server-bound party ID.
Active membership is checked at write, history, report, and delivery time. Party delivery may cross
world or channel boundaries, but mute/block filtering remains recipient-specific. Former members
cannot read future history or receive future messages.

The `social_graph` platform module hides player/admin UI when disabled; it never deletes durable
state or grants authorization. Maintenance and session-revalidation gates continue to be enforced by
the existing realtime admission boundary.
