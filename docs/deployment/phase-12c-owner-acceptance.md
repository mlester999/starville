# Phase 12C owner acceptance

Phase status: **PHASE 12C LOCALLY COMPLETE, HOSTED VALIDATION PENDING**. Owner acceptance status:
pending. Every item is intentionally unchecked. Run against the exact local revision under review;
do not publish a world, activate an asset, write hosted data, or record durable Game Test evidence
merely by following this checklist.

Repository automation passed, and the local HUD acceptance fixture filled all eight requested
viewports without horizontal overflow. Its 360×800 and 390×844 frames reported no visible target
below 44 CSS pixels; 390×844 and 1280×800 captures were retained locally. That is HUD fixture
evidence only. It does not check any item below or substitute for actual secure Game Test, Phaser
renderer, exact-revision Composer/Draft Preview, 200 percent zoom, assistive-technology, device,
GPU, memory, frame-time, or WAN inspection.

## Camera and terrain

- [ ] Open Lantern Square on desktop and confirm the world fills the viewport
- [ ] Confirm no dark empty area appears during normal movement
- [ ] Walk to all reachable edges and confirm stable camera follow and a natural boundary
- [ ] Confirm the player can still reach every enabled exit and cannot cross authoritative bounds
- [ ] Confirm the permanent heavy terrain grid is gone
- [ ] Inspect grass variation, path edges/intersections, plaza, bridge, and water shoreline
- [ ] Confirm water motion is restrained and has a static Reduced Motion fallback
- [ ] Confirm the farm plot and interaction markers remain readable

## Scale, grounding, and depth

- [ ] Compare player height to a door, lamp, tree, bush, sign, workstation, and cottage
- [ ] Confirm the player is immediately readable on desktop, tablet, and mobile
- [ ] Confirm object and player shadows are soft, base-anchored, and never affect collision
- [ ] Walk behind and in front of a tree, cottage, sign, lamp, and workstation
- [ ] Confirm multiple players sort correctly and labels/bubbles remain readable
- [ ] Confirm missing-asset fallback preserves collision, interaction, and safe depth behavior

## Composition and routes

- [ ] Identify Lantern Square center without relying on a floating label
- [ ] Find the General Store, Cooking Hearth, Crafting Workbench, and personal-home entrance routes
- [ ] Confirm every enabled exit remains legible and reachable
- [ ] Confirm gathering spaces feel populated without random clutter or blocked navigation
- [ ] Confirm primary landmarks dominate tertiary flowers, bushes, rocks, and lamps

## HUD and realtime

- [ ] Confirm compact HUD is the safe default
- [ ] Expand and collapse the status panel with keyboard and pointer input
- [ ] Confirm DUST distinguishes Loading, real zero, ready value, and unavailable
- [ ] Confirm Level distinguishes Loading, real value, and unavailable
- [ ] Confirm connection states announce connecting, reconnecting, connected, offline, and failure
- [ ] Confirm retry is bounded and does not spam errors
- [ ] Confirm interaction prompt remains visible above the mobile safe zone
- [ ] Confirm hotbar, objective, chat, and connection remain immediately accessible

## Multiplayer and chat

- [ ] Join with a second controlled account and confirm readable distance-bounded labels
- [ ] Confirm no wallet identifier or private profile value appears
- [ ] Confirm selected title/badge treatment is shown only when authoritative public data exists
- [ ] Send a short nearby message and confirm its bubble is bounded, timed, and associated correctly
- [ ] Confirm the same message remains in persistent moderated chat history
- [ ] Run the local eleven-player fixture and inspect label/bubble overlap and frame pacing

## Motion, performance, and settings

- [ ] Inspect water shimmer, lantern ambience, vegetation/particle limits, and frame-time stability
- [ ] Enable Reduced Motion and confirm nonessential motion stops or becomes static
- [ ] Enable Low visual quality and confirm effects/shadows/label range reduce while gameplay
      remains
- [ ] Exercise Visual Quality, Ambient Effects, Shadows, Water Animation, World Labels, Chat
      Bubbles, UI scale, and HUD density settings
- [ ] Inspect first meaningful render, camera movement, duplicate asset downloads, desktop memory,
      and mobile memory using browser tooling

## World Composer, Draft Preview, and Game Test

- [ ] Open the exact Lantern Square local draft in World Composer
- [ ] Confirm scale, anchors, footprint, rotation, depth point, collision, terrain, and shadows
      agree with Game Client
- [ ] Inspect camera/world-edge preview and all advisory visual-readiness findings
- [ ] Confirm density, spacing, route, repetition, scale, landmark, boundary, and void warnings
      guide without automatically mutating the draft
- [ ] Open Draft Preview and Game Test's default exact authorized revision
- [ ] Explicitly switch Game Test to the labeled unpublished Lantern Square local composition
- [ ] Confirm non-Lantern Game Test sessions do not offer or substitute that local composition
- [ ] Run one-player, eleven-player, front/behind depth, compact/expanded HUD, mobile, Reduced
      Motion, low-quality, and missing-asset fixtures
- [ ] Confirm none of those fixtures publishes, activates, progresses, rewards, or persists
      telemetry

## Responsive matrix

- [ ] 360 × 800
- [ ] 390 × 844
- [ ] 768 × 1024
- [ ] 820 × 1180
- [ ] 1024 × 768
- [ ] 1280 × 800
- [ ] 1440 × 900
- [ ] 1920 × 1080
- [ ] At every viewport: no horizontal overflow or dark void; world, hotbar, movement, prompt, chat,
      connection, labels, bubbles, safe-area insets, drawers, and 44-pixel targets remain usable

## Accessibility and originality

- [ ] Complete keyboard-only navigation and confirm visible focus and focus restoration
- [ ] Inspect at 200 percent browser zoom
- [ ] Confirm accessible location, active objective, participant list, connection, DUST, and Level
      text
- [ ] Confirm labels and status are not communicated by color alone
- [ ] Confirm ambience does not flash and contrast remains readable
- [ ] Confirm no external commercial-game asset or copied visual identity is present
- [ ] Confirm no animal/livestock, Fablesol, Pokentara, Sailana, or AIvanza mechanic was introduced

Owner decision: [ ] accept [ ] reject [ ] revise. Record reviewer, timestamp, environment, exact
HEAD, asset-manifest version, visual-policy version, tested world revision, viewport/browser matrix,
measured performance evidence, screenshots, hosted-validation state, and every unresolved
observation.
