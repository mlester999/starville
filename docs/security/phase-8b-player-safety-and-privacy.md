# Phase 8B player safety, reporting, and privacy

## Player controls

Mute hides a selected player's messages only for the muting player. Block also records a durable
future social-interaction boundary, but does not suspend either player or change gameplay presence.
Neither action notifies the target. Preferences are restored during authenticated reconnect.

A report attaches the exact server message by ID. The database derives reporter/reported profiles,
text, scope, world, channel, and timestamp from protected records; browsers cannot submit or edit
the evidence snapshot. Categories are Harassment, Hate or abusive language, Spam, Scam or suspicious
link, Impersonation, Sexual content, and Other. Reasons are bounded plain text.

## Privacy

Chat contracts expose only public presence IDs, safe display names, optional public levels, world
keys, channel IDs, server timestamps, and message IDs. They never expose email, wallet address, IP,
access/auth tokens, internal session IDs, token balance, administrator identity, or private player
profiles. General logs exclude message text and report evidence.

Reporter identity is visible only through the protected report workflow. Read-only analysts receive
`multiplayer_chat.read`, not reports or audit evidence. Customer Support and Live Operations can
read reviewed reports but cannot mutate moderation. Database tables force RLS and define no browser
policies.

## Retention

- Player-visible messages: 24 hours by default, configurable from 1–168 hours.
- Reconnect history: at most 50 messages per scope, configurable from 10–100.
- Moderation policy target: 180 days, configurable from 30–730 days.
- Open or under-review reports preserve their linked message regardless of visible expiry.
- The worker deletes expired, unreported message rows in batches of at most 10,000 and expires stale
  chat mutes through a service-role-only RPC.

Resolved moderation retention is a reviewed operational policy; Phase 8B does not silently delete
report or action evidence. Any later deletion/anonymization policy requires a forward-only migration
and privacy review.
