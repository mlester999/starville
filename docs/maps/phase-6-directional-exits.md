# Phase 6 directional exits

Phase 6 implements the directional model recorded here. See `phase-6-world-graph.md` for the active
five-map relationships and approved arrival spawns.

Every playable map supports an approved exit slot centered on each edge: north at the top, east at
the right, south at the bottom, and west at the left. Each exit must be visibly continued by a road,
stone path, bridge, gate, or comparable environmental cue. Destination relationships and destination
spawn directions must come from server-authoritative or validated published map data; clients may
not select arbitrary destinations.

An exit triggers only inside its intended region. Arrival positioning must prevent immediate
re-trigger loops. A short fade or travel presentation should normally last about one to two seconds
and may remain visible only while genuine loading continues—never as an artificial five-second wait.
The destination name may be shown where useful. A load or validation failure returns the player to a
safe valid position instead of exposing empty world space.

Lantern Square activates all four routes. Each outer Phase 6 map activates its return route and
truthfully disables and visibly blocks the other three. Adjacent-map relationships, transition
regions, destination spawns, loading/unloading, safe transition persistence, and administrator
editing/validation/preview/publication/version history are versioned content.
