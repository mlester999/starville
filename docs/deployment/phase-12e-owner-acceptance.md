# Phase 12E owner acceptance

Status: **NOT STARTED — every item below is intentionally unchecked.**

This is the manual owner gate for the unpublished Phase 12E beta candidate. Local automated evidence
is not owner acceptance, hosted validation is not owner acceptance, and completing this list does
not activate V2, publish a world, deploy an application, or make Starville production ready.

## Review setup

- [ ] Start the local stack with the normal repository environment checks passing.
- [ ] Sign in as an authorized administrator with the required assurance level.
- [ ] Open **Operations → Beta Readiness** and confirm the page labels local, hosted, owner, and
      production states separately.
- [ ] Launch the protected Lantern Square Game Test from an exact authorized V1 revision.
- [ ] Confirm the banner says **GAME TEST · NO PROGRESSION**.
- [ ] Confirm the initial source is **Exact authorized revision**.
- [ ] Explicitly select **Local Phase 12E beta composition · Phase 12D visuals**.
- [ ] Confirm the selected source says **LOCAL PHASE 12E DRAFT · UNPUBLISHED · IN MEMORY**.
- [ ] Record reviewer, date, browser, operating system, viewport, build identifier, and evidence
      links in the owner’s review record.

## Lantern Square

- [ ] Confirm the world composition reads as one coherent village square.
- [ ] Confirm the four main paths and bridge route are readable.
- [ ] Confirm the plaza, General Store, personal home, Willow Guide, stream, and photo garden are
      obvious landmarks.
- [ ] Confirm open spaces feel intentional rather than unfinished.
- [ ] Confirm environmental clusters do not look mechanically repeated.
- [ ] Confirm no decorative object blocks the default spawn or critical routes.
- [ ] Walk from the default spawn to Willow Guide.
- [ ] Walk from the plaza to the General Store entrance.
- [ ] Walk from the plaza to the personal-home entrance.
- [ ] Walk from the north exit through the plaza to the south exit.
- [ ] Walk from Willow Guide to the photo garden.
- [ ] Confirm the avatar renders behind and in front of trees correctly.
- [ ] Confirm the avatar renders behind and in front of buildings correctly.
- [ ] Confirm visible structure footprints match collision boundaries.
- [ ] Confirm no invisible barrier appears on a visible path.
- [ ] Confirm the photo-garden interaction remains nonblocking.

## V2 character

- [ ] Review all eight idle directions.
- [ ] Review all eight walk directions.
- [ ] Review all eight jog directions.
- [ ] Confirm direction changes do not flash a stale frame.
- [ ] Confirm walk-to-idle and jog-to-idle transitions remain stable.
- [ ] Confirm the player’s foot anchor stays planted across directions.
- [ ] Confirm the V2 avatar scale is coherent beside doors, trees, furniture, and remote players.
- [ ] Enable the eleven-player fixture and confirm every remote player uses the intended candidate
      rig.
- [ ] Confirm remote facing, labels, and depth sorting match the local player.
- [ ] Trigger a realtime reconnect cycle and confirm the avatar does not duplicate.
- [ ] Test the character with Reduced Motion enabled.
- [ ] Test the character with increased contrast enabled.

## Environmental ambience and audio

- [ ] Inspect foliage motion in the plaza, by buildings, and near the stream.
- [ ] Inspect lantern flicker without rapid or distracting changes.
- [ ] Inspect hearth glow.
- [ ] Inspect workbench glow.
- [ ] Inspect bounded particles or motes and confirm they do not obscure gameplay.
- [ ] Switch visual quality to low and confirm nonessential ambience stops.
- [ ] Enable Reduced Motion and confirm ambience becomes static or is suppressed.
- [ ] Enable increased contrast and confirm ambience does not weaken object outlines.
- [ ] Adjust ambience volume independently.
- [ ] Adjust music volume independently.
- [ ] Adjust sound-effect volume independently.
- [ ] Mute all audio and confirm silence.
- [ ] Mute music, ambience, and sound effects independently.
- [ ] Confirm the Lantern Square and personal-home foundations do not overlap or restart
      unnecessarily.
- [ ] Background the browser tab and confirm audio suspends safely.
- [ ] Restore the tab and confirm audio resumes only when allowed by the saved settings and browser
      policy.
- [ ] Confirm no missing or fabricated sound is represented as production audio.
- [ ] Confirm every current cue remains labeled `development_safe` with project-owned procedural
      provenance and no third-party audio.
- [ ] Block Web Audio and confirm the visible unavailable notice plus text-equivalent feedback.

## Gameplay states

- [ ] Plant one crop and confirm the planted state is distinct.
- [ ] Water the crop and confirm the watered state is distinct.
- [ ] Harvest the crop and confirm the ready/harvest transition is clear.
- [ ] Start one cooking or crafting job and confirm the in-progress state is clear.
- [ ] Confirm unavailable workstation actions are visibly disabled.
- [ ] Collect one workstation output and confirm the ready state clears.
- [ ] Purchase one item and verify the authoritative result is reflected once.
- [ ] Sell one item and verify the authoritative result is reflected once.
- [ ] Gain XP and confirm progression feedback is readable and nonblocking.
- [ ] Place one furniture item and confirm placement, collision, and selection visuals agree.
- [ ] Host one home visit and confirm owner/visitor state is unambiguous.
- [ ] Add one guestbook entry or appreciation through the existing authoritative flow.
- [ ] Help water one crop and confirm helper/owner presentation is clear.
- [ ] Confirm every target, unavailable, quest, onboarding, and landmark marker is visually
      distinguishable.
- [ ] Confirm interaction markers do not change collision or authoritative interaction range.

## HUD, panels, and modals

- [ ] Confirm identity, location, controls, prompts, chat, and status dock do not overlap at each
      required viewport.
- [ ] Open and close the notice board.
- [ ] Open and close inventory.
- [ ] Open and close the General Store.
- [ ] Open and close a workstation.
- [ ] Open and close the journey/journal panel.
- [ ] Open and close settings.
- [ ] Open and close housing placement.
- [ ] Open and close home-visit surfaces.
- [ ] Open and close onboarding/help.
- [ ] Open and close error details.
- [ ] Use Escape on each dismissible surface.
- [ ] Confirm keyboard focus enters each modal.
- [ ] Confirm focus returns to the initiating control after dismissal.
- [ ] Confirm background input is blocked while a modal is open.
- [ ] Confirm no blur, scrim, or input lock remains after dismissal.
- [ ] Confirm prompts stay above the world but below active modal content.

## Recovery

- [ ] Stop the local API and observe a clear unavailable state.
- [ ] Restore the API and confirm bounded manual or automatic recovery succeeds.
- [ ] Stop the local realtime service and confirm local movement remains available.
- [ ] Restore realtime and confirm one presence subscription and one local avatar.
- [ ] Trigger a profile `503` and confirm retry preserves server authority.
- [ ] Trigger a world-manifest load failure and confirm no stale world is presented as current.
- [ ] Trigger a missing managed asset and confirm one diagnostic plus a safe fallback.
- [ ] Repeat the same missing-asset failure and confirm diagnostics are deduplicated.
- [ ] Trigger a persistence failure and confirm unsaved state is disclosed without fabricating
      success.
- [ ] Confirm retry attempts are bounded and cancellable.
- [ ] Revoke access during interruption and confirm reconnect does not restore revoked access.
- [ ] Confirm no raw SQL error, storage path, token, or secret appears in the browser.

## Performance and longevity

- [ ] Review on a desktop-class viewport.
- [ ] Review on a tablet viewport.
- [ ] Review on a mobile viewport.
- [ ] Review at 200 percent zoom.
- [ ] Enable the eleven-player fixture and confirm stable movement and readable labels.
- [ ] Run a continuous 30-minute owner session.
- [ ] Repeat world transitions and confirm no duplicated scene, listener, or audio lifecycle.
- [ ] Repeatedly open and close every major modal.
- [ ] Repeat API and realtime reconnect cycles.
- [ ] Confirm the development diagnostics show bounded ambience, marker, listener, retry, and asset
      failure counts.
- [ ] Confirm no sustained memory, listener, timer, presence, or modal growth is observed.

## Required responsive matrix

- [ ] 360 × 800.
- [ ] 390 × 844.
- [ ] 412 × 915.
- [ ] 768 × 1024.
- [ ] 820 × 1180.
- [ ] 1024 × 768.
- [ ] 1280 × 800.
- [ ] 1366 × 768.
- [ ] 1440 × 900.
- [ ] 1920 × 1080.
- [ ] 2560 × 1440.
- [ ] 200 percent browser zoom at a desktop viewport.
- [ ] Operating-system Reduced Motion preference.
- [ ] Increased/forced-contrast mode where supported.
- [ ] Keyboard-only navigation.

## Integrated Game Test

- [ ] Complete all 23 steps in the **Phase 12E beta scenario**.
- [ ] Confirm the scenario covers spawn, V2 character, remote parity, objective, home, farming,
      workstation, store, XP, housing, home visits, guestbook/appreciation, helper watering, modal,
      audio, audio-unavailable fallback, reconnect, missing asset, Reduced Motion, high contrast,
      and the 11-viewport review.
- [ ] Confirm the scenario does not mutate player data, inventory, DUST, progression, social state,
      world publication, or hosted asset state.
- [ ] Switch between exact authorized V1 and the local V2 candidate.
- [ ] Confirm candidate asset fallback diagnostics are inspectable.
- [ ] Confirm every opened review surface can recover and close cleanly.

## Admin Beta Readiness

- [ ] Open **Operations → Beta Readiness**.
- [ ] Review automated local evidence.
- [ ] Confirm hosted checks that were not run remain pending rather than passed.
- [ ] Confirm owner checks remain pending until this review is signed.
- [ ] Review current blockers and known limitations.
- [ ] Review the deployment-readiness checklist.
- [ ] Review the rollback checklist.
- [ ] Review maintenance-mode and recovery guidance.
- [ ] Confirm a read-only administrator cannot perform mutation actions from this area.
- [ ] Confirm sensitive activation controls, if later implemented, still require permission, AAL2,
      reason, expected revision, preview, audit, and rollback.

## V1 and hosted safety

- [ ] Open the normal game without candidate mode and confirm V1 remains the default.
- [ ] Confirm no V2 asset version is active in hosted state.
- [ ] Confirm no Phase 12E world revision is published.
- [ ] Confirm the candidate cannot be selected through a public or anonymous override.
- [ ] Confirm the browser cannot authoritatively choose world version, collision, rewards, or
      success events.
- [ ] Confirm no migration was pushed for Phase 12E.
- [ ] Confirm no deployment was performed for Phase 12E.

## Owner decision

- [ ] Every required item above has evidence or an explicitly accepted exception.
- [ ] Hosted pgTAP/RLS validation has been run separately in the intended hosted environment.
- [ ] Remaining blockers and accepted limitations are documented.
- [ ] Rollback ownership and maintenance contacts are confirmed.
- [ ] The owner records **ACCEPT**, **ACCEPT WITH DOCUMENTED LIMITATIONS**, or **REJECT** with a
      reason.

Until the owner records that decision, the truthful state remains **owner acceptance pending**.
