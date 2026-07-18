# Phase 12A owner acceptance

Status: pending hosted validation and signed-in owner review.

No hosted operation is authorized by this checklist. First verify the exact Starville Development
target and obtain explicit approval before migration, RLS, or browser acceptance work.

## Player journey

- [ ] A brand-new profile sees the welcome prompt after canonical bootstrap, with no duplicate
      starter DUST/items/quests.
- [ ] Start, pause, resume, minimize, reduced guidance, reconnect, and optional-only skip preserve
      the current authoritative step.
- [ ] The fourteen objectives advance only from the intended canonical action.
- [ ] Willow Guide, home entrance, farm, workstation, General Store, My Journey, Decoration Mode,
      home visits, and Daily Rhythm guidance target the correct published objects.
- [ ] Missing guidance falls back to accessible text and does not fabricate completion.
- [ ] Inventory-full, insufficient DUST, invalid tile, recipe unavailable, shop paused, stale
      revision, reconnect, and reset flows show a safe recovery action.
- [ ] DUST is described as off-chain, non-withdrawable, distinct from `$STAR`, with no monetary
      value promise.
- [ ] XP, quest, inventory, transaction, housing, and daily feedback are legible without relying on
      color alone.

## Daily Rhythm

- [ ] Exactly three unique eligible objectives appear for the UTC game day.
- [ ] There is one farming objective, two distinct non-farming categories, at least one solo-safe
      objective, and at most one social objective.
- [ ] Locked/unavailable farming, housing, production, shop/economy, or progression actions are not
      assigned; paused home visits retain only the solo-safe settings-review fallback.
- [ ] Reconnect and UTC rollover do not duplicate the assignment or contribution.
- [ ] Daily v1 changes no DUST, XP, item, `$STAR`, token claim, or streak multiplier.

## HUD, mobile, and accessibility

- [ ] Only one Phase 12A objective is presented; the canonical quest tracker remains available when
      that objective is absent.
- [ ] Keyboard, touch, focus order, screen-reader labels, 320px mobile width, safe areas, long text,
      reduced motion, and modal input blocking are acceptable.
- [ ] Critical, action-required, progress, social, and informational feedback priorities remain
      understandable and non-spammy.

## Game Test and administration

- [ ] Game Test can inspect all fourteen steps, daily objectives, help, General Store, and
      progression while clearly displaying no persistence.
- [ ] Exiting or expiring Game Test leaves player, inventory, DUST, XP, quest, daily, and telemetry
      state unchanged.
- [ ] Player Experience admin requires `player_experience.inspect`; support actions require current
      AAL2 plus `player_experience.support`.
- [ ] A daily-policy manager can create an audited draft successor with eight pinned objective
      definitions; the active policy remains unchanged and AAL1 is denied.
- [ ] Read-only roles cannot mutate. Support can only reset guide UI, resume blocked guidance, or
      retry reviewed recovery. There is no complete-all or reward grant.
- [ ] Funnel/drop-off, daily readiness, guidance readiness, recovery, aggregate telemetry, and audit
      contain no private wallet/session/IP data.

## Database and services

- [ ] Hosted migration list matches the local three-migration tail before applying anything.
- [ ] Hosted migration push, lint, RLS, cross-player denial, rate limit, raw-error redaction, and
      service-role scans pass after approval.
- [ ] API, worker, player client, admin portal, and Game Test are exercised with real signed-in
      sessions in the approved development environment.
- [ ] Candidate D remains unpublished and unchanged.

Owner decision: [ ] accept [ ] reject [ ] revise. Record reviewer, timestamp, environment, exact
commit, migration list, and unresolved observations.
