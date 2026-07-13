# Live Operations Runbook

Open **Operations → Live Operations** with `live_operations.read`. Mutation controls appear only to
administrators with the matching manage permission.

For immediate maintenance, enter the player-facing content, a 12–500 character internal reason, and
the exact phrase `MAINTENANCE`. New player bootstrap is blocked after the server accepts the new
revision. For scheduled maintenance, use UTC-backed date-time values; the page also renders browser
local times. An expected end is informational unless **Auto-disable** is selected.

Announcements are saved as drafts first. Publish, deactivate, and archive operations require a fresh
reason and revision. Only published announcements inside their time window reach players. Higher
priority is returned first, critical severity is visually distinct, and dismissal is stored only on
the current device for that announcement revision.

If configuration is unavailable, do not infer that the game is healthy. The player client shows the
fixed safe maintenance fallback while the admin page reports the backend failure. Resolve database
or API availability, review the audit request ID, then use **Check again**; do not bypass token,
session, moderation, or RLS controls.
