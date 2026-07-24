# Phase 13E-A Supabase Realtime trust boundary

The browser has two independent credentials:

1. a non-anonymous, wallet-bound Supabase player JWT, used by Realtime RLS as `auth.uid()`; and
2. the existing HttpOnly wallet-access cookie, verified by the API and never exposed to Realtime.

When no player Auth session exists, the trusted-origin API validates the wallet cookie and playable
profile, asks Supabase Auth Admin to generate a one-use magic-link token for a deterministic
internal player identity, and binds that non-anonymous Auth UID to the exact wallet-owned profile
through a service-role-only RPC. The browser verifies the token hash with Supabase Auth and receives
its own signed player session. The service-role key and internal email never enter browser
configuration.

For channel authorization, the API verifies both credentials, hashes the wallet cookie, and calls a
separate service-role-only RPC. The RPC rejects anonymous and wallet-unbound Auth users, requires an
active and unexpired wallet session, enforces moderation and maintenance state, requires the current
published world version, and checks that the requested channel is enabled and below capacity. It
creates a short-lived membership scoped to one environment, Auth identity, profile, wallet session,
map, version, and channel.

The Realtime policy re-evaluates the membership and wallet/moderation/world conditions. It never
accepts a topic supplied merely because it is well formed. Player topics require self identity;
party topics require active membership; home topics require ownership or current
invitation/admission.

Broadcast and Presence payloads are untrusted presentation data. Strict schema, size, topic,
identity, sequence, timestamp, and frequency checks reduce abuse, but they do not convert a browser
frame into authority. No inventory, currency, reward, entitlement, collision-sensitive result,
moderation decision, or durable gameplay outcome may be derived solely from these payloads.

Secrets remain server-only. The browser receives only the Supabase URL/anonymous or publishable key,
a one-use player sign-in token hash, its own Auth session, safe public presence fields, exact topic,
channel summaries, and membership expiry. Its own Auth session may expose the deterministic,
non-delivery player address, which contains only the already-public presence UUID. Service-role
keys, wallet addresses, cookie hashes, internal profile IDs, moderation reasons, and internal health
URLs are never returned. The database binding, not client-editable Auth metadata, is the
authorization source of truth.

Production remains `custom/custom`. Supabase mode is a foundation state and forces API readiness to
503 until later parity and commissioning approval.
