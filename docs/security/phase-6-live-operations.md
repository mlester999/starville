# Phase 6 Live Operations Security Boundary

Public players receive only the effective maintenance display fields and currently active
announcements. They never receive administrator identity, internal reasons, database errors, session
data, or draft announcements. When trusted configuration cannot be loaded, the API emits a fixed
nonblank maintenance fallback and blocks playable-world bootstrap.

Administrators authenticate through the existing Supabase-backed administrator session. The API
checks `live_operations.read`, `live_operations.manage`, `announcements.read`, or
`announcements.manage` for the exact operation. Browser mutations additionally require an allowed
origin. Moderator, customer-support, blockchain-operator, and ordinary player identities have no
live-operations mutation grant.

The three database tables force RLS and grant no table access to anon, authenticated, or
service-role clients. Only explicit SECURITY DEFINER RPC signatures are granted to the service role.
Those RPCs re-run verified administrator permission checks and write bounded append-only audit
records. Audit updates and deletes are rejected by a trigger. Secrets and infrastructure diagnostics
are excluded from every public contract and audit state snapshot.

Maintenance does not change token sessions, wallet identity, player profiles, moderation, saved
position, world content, or future economy values. Saving the latest valid player state remains
allowed while new profile/world entry is blocked.
