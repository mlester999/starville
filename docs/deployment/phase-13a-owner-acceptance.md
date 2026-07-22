# Phase 13A owner acceptance checklist

All checks are deliberately unmarked. Local automated evidence does not complete owner acceptance,
and the owner intends to perform the larger manual session after more roadmap phases.

## Environment and evidence

- [ ] Confirm the review is using an owner-approved development environment, never `starville-prod`.
- [ ] Review the dirty-tree inventory and separate Phase 13A from preserved Phase 12E/12F/owner
      work.
- [ ] Review the Phase 13A local validation report and any failures added after it was recorded.
- [ ] Confirm Phase 12E owner acceptance is still pending and was not implied by this phase.

## Complete new-player journey

- [ ] Complete all 26 new-player steps from Landing through reconnect persistence confirmation.
- [ ] Confirm wallet/network identity cannot expose a prior player's state.
- [ ] Confirm profile and character handoff renders the saved approved character.
- [ ] Confirm Lantern Square loads the intended authorized revision and safe spawn.
- [ ] Confirm onboarding shows one clear objective and all required recovery guidance.
- [ ] Confirm starter resources, farming output, workstation output, and onboarding rewards settle
      once.
- [ ] Confirm General Store inventory, DUST, stock/limits, progression, and objective results agree.
- [ ] Disconnect/reconnect and confirm world, position, crop, inventory, DUST, progression, and
      objectives persist.

## Returning-player journey

- [ ] Reopen a returning player and confirm offline crop/job readiness reconciles.
- [ ] Background/focus the game and confirm stale mutable projections refresh without duplicate
      requests or settlements.
- [ ] Switch wallet account and confirm all prior-player panels/listeners/state disappear.
- [ ] Leave the village and confirm persistence flush, session revoke, and listener cleanup.

## Cross-system gameplay

- [ ] Review farming, inventory-full recovery, cooking, crafting, and duplicate collection behavior.
- [ ] Review General Store buy/sale, zero DUST, insufficient DUST, stale price, retry, and receipt.
- [ ] Review XP, level, achievement, title, active/completed/expired/disabled objectives.
- [ ] Review housing draft/save/stale revision, furniture location, storage, and upgrade behavior.
- [ ] Review private/public home policy, invitation, guestbook, appreciation, and helper watering.
- [ ] Review friends, parties, chat, gifts, and trades through cancellation/reconnect/changed
      offers.
- [ ] Confirm Animal Care has no player entry or claimable state.

## UI and recovery

- [ ] Distinguish loading, empty, zero, unavailable, blocked, unauthorized, retrying, reconnecting,
      completed, expired, disabled, and unreleased states.
- [ ] Confirm a timeout or disconnect never shows fabricated success.
- [ ] Confirm a stale/conflict response reloads authority and preserves a safe retry.
- [ ] Confirm world/asset failure uses a truthful fallback or unavailable state.

## Game Test and Admin

- [ ] Inspect all 27 **Complete Gameplay Integration** Game Test steps.
- [ ] Confirm Game Test creates no persistent player, inventory, DUST, progression, chat, visit,
      friendship, gift, trade, world, asset, or telemetry record.
- [ ] Open Operations → Gameplay Health as an authorized admin.
- [ ] Confirm it is read-only, contains no private-player detail, and clearly separates local,
      hosted, Phase 13B, and owner evidence.

## Deferred Phase 13B gates

- [ ] Complete hosted RLS and role-boundary validation.
- [ ] Complete contention, abuse, rate-limit, moderation, and economy-abuse testing.
- [ ] Complete approximately 40-player channel and real owner-plus-ten visitor testing.
- [ ] Complete physical network interruption and worker/database contention testing.
- [ ] Complete required browser, screen-reader, and physical-device review.
- [ ] Complete observability, backup/recovery, and closed-beta operational readiness.

## Decision

- [ ] Owner accepts the Phase 13A gameplay integration candidate.
- [ ] Owner records any blockers with exact reproduction and expected behavior.
