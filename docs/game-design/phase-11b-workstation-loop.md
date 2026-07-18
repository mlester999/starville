# Phase 11B workstation loop

Phase 11B turns harvested materials into a calm return loop rather than an instant recipe button:

Harvest Ingredients → Use Workstation → Select Recipe → Start Job → Wait or Go Offline → Return →
Collect Output → Continue Tutorial

The Cooking Hearth and Crafting Workbench live inside the player’s private starter home. Approaching
an owner-bound object opens an accessible panel with recipe search, required/owned quantities,
output, duration, optional DUST fee, batch quantity, locked explanation, and queue capacity.
Starting consumes ingredients once. Running jobs continue on server time while the player closes the
panel, leaves, or disconnects. A Ready notification invites return; output enters inventory only
when collected.

The two-slot queue is intentionally small and legible. Running and Ready jobs occupy slots, which
teaches the player to return and collect. Queue-full attempts consume nothing. Inventory-full
collection leaves the finished output safe at the station. Cancellation is unavailable in this
phase, avoiding ambiguous refund rules.

The tutorial continuation, **Hearth and Hands**, becomes available only after the Phase 11A farming
tutorial. Willow Guide introduces cooking, unlocks the tutorial path, observes server-confirmed
cooking and crafting collection, and settles exactly 20 DUST once when all seven objectives are
complete. The client cannot self-report an objective or select the reward.

Motion is restrained and respects reduced-motion preferences. A one-second visible-panel countdown
is a presentation aid only; server timestamps determine readiness. Missing art uses an explicit
marker and accessible name. Keyboard focus remains trapped in the open dialog, Escape closes it,
tabs expose Recipes and Jobs, progress elements have labels, Ready changes are announced, and touch
targets/layout collapse for small screens.

Game Test must use temporary, non-mutating presentation fixtures. It must never consume production
ingredients, create production jobs, grant output, or advance a player quest.
