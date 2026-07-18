# Phase 11F owner acceptance — pending

Do not mark any item passed from automated or local fixture results. Run this checklist only after
the owner explicitly authorizes the target environment and every prerequisite is satisfied.

## Prerequisites

- [ ] Load owner account.
- [ ] Load visitor account.
- [ ] Confirm friendship test accounts.
- [ ] Confirm blocked test account.
- [ ] Confirm personal home and crops.
- [ ] Confirm realtime services running.

## Public home

- [ ] Owner enters home.
- [ ] Set visibility to Public.
- [ ] Set mode to View Only.
- [ ] Start hosting.
- [ ] Visitor discovers home.
- [ ] Visitor joins.
- [ ] Owner sees visitor appear.
- [ ] Visitor sees owner.
- [ ] Move both players and confirm synchronized movement.
- [ ] Confirm visitor cannot use social or helper actions.
- [ ] Visitor leaves and confirm safe return.

## Friends Only

- [ ] Set Friends Only.
- [ ] Friend joins.
- [ ] Non-friend is denied.
- [ ] Remove friendship during visit and confirm configured removal behavior.

## Invite Only

- [ ] Set Invite Only.
- [ ] Non-invited player is denied.
- [ ] Send invitation; visitor accepts and joins.
- [ ] Revoke another invitation and confirm it is denied.
- [ ] Test an expired invitation.

## Private

- [ ] Set Private.
- [ ] Confirm discovery is hidden.
- [ ] Confirm a new visitor is denied.
- [ ] Confirm a current visitor is removed safely when policy requires.

## Social Interactions

- [ ] Enable Social Interactions.
- [ ] Visitor emotes.
- [ ] Visitor sits and occupied-seat behavior is correct.
- [ ] Use a photo area.
- [ ] Inspect furniture.
- [ ] Write a guestbook entry.
- [ ] Leave appreciation.
- [ ] Confirm owner notifications.
- [ ] Confirm no storage, inventory, DUST, Decoration Mode, or workstation access.

## Allow Helpers

- [ ] Enable Allow Helpers.
- [ ] Visitor approaches an eligible crop and waters it once.
- [ ] Confirm the crop changes once.
- [ ] Repeat the request and confirm no duplicate watering.
- [ ] Confirm the visitor receives no crop output, DUST, or repeatable farming XP.
- [ ] Confirm the owner retains harvest ownership.
- [ ] Confirm the helper limit.

## Capacity

- [ ] Join ten visitors and confirm owner plus ten visitors are visible.
- [ ] Attempt an eleventh visitor and confirm `HOME_VISIT_FULL`.
- [ ] Send two concurrent requests for the final slot and confirm exactly one succeeds.

## Moderation

- [ ] Owner removes a visitor and confirms safe return/channel revocation.
- [ ] Visitor attempts rejoin according to current access.
- [ ] Owner blocks a visitor and confirms immediate removal.
- [ ] Confirm future discovery and entry are denied.
- [ ] Create a report and confirm safe evidence in the Admin Portal.

## Owner disconnect

- [ ] Owner disconnects; confirm new admissions stop and visitors see reconnect state.
- [ ] Reconnect within grace and confirm the session continues.
- [ ] Disconnect again and let grace expire.
- [ ] Confirm the session closes and visitors return safely.

## Visitor reconnect

- [ ] Visitor disconnects and reconnects within grace.
- [ ] Confirm the same slot and safe position are restored.
- [ ] Disconnect past grace and confirm capacity is released.

## Decoration protection

- [ ] Start a hosted session and attempt Decoration Mode.
- [ ] Confirm it is blocked with an explanation.
- [ ] End the session and confirm Decoration Mode works again.

## Game Test

- [ ] Simulate owner plus ten visitors.
- [ ] Test visibility modes, social interactions, guestbook, appreciation, helper watering, and
      moderation.
- [ ] Confirm real friendships, blocks, crops, progression, and visit history are unchanged.

## Administration

- [ ] Inspect active sessions, participants, and invitations.
- [ ] Moderate a guestbook entry.
- [ ] Inspect appreciation, helper activity, and a report.
- [ ] Run reconciliation.
- [ ] Toggle social live-ops controls.
- [ ] Confirm a read-only role cannot mutate.

## Responsive behavior

- [ ] Test desktop, tablet, and mobile.
- [ ] Confirm movement and social controls remain usable.
- [ ] Confirm visitor and hosting panels do not overlap gameplay.
