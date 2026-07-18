# Phase 11B owner acceptance

This checklist is intentionally unverified. Complete it only after the forward migrations are
reviewed and applied through the approved hosted workflow. Do not use World Game Test as evidence of
production persistence.

## Prerequisites

- [ ] Load a Phase 11A player.
- [ ] Confirm the private home plot.
- [ ] Confirm inventory contains tutorial ingredients.
- [ ] Confirm a Cooking Hearth exists.
- [ ] Confirm a Crafting Workbench exists.

## Cooking

- [ ] Approach the Cooking Hearth and confirm the prompt.
- [ ] Open the workstation panel and confirm the tutorial recipe.
- [ ] Confirm required and owned quantities.
- [ ] Start one cooking job and confirm ingredients decrease exactly once.
- [ ] Confirm the job appears Running.
- [ ] Close the panel, leave the plot, and disconnect.
- [ ] Reconnect after the configured local test duration and confirm the job is Ready.
- [ ] Collect output and confirm it is added exactly once.
- [ ] Repeat collection and confirm no duplicate output.

## Inventory full

- [ ] Fill inventory and try collecting a Ready job.
- [ ] Confirm `INVENTORY_FULL` and that the job remains Ready.
- [ ] Clear inventory space, retry, and confirm output is received once.

## Crafting

- [ ] Approach the Crafting Workbench and confirm the prompt.
- [ ] Open crafting recipes and start the tutorial crafting job.
- [ ] Confirm materials decrease once.
- [ ] Wait or reconnect, collect the crafted output, and confirm it appears in inventory.

## Queue

- [ ] Fill the workstation queue.
- [ ] Try starting another job and confirm the queue-full explanation.
- [ ] Confirm no ingredients or DUST are consumed.

## Tutorial quest

- [ ] Confirm the cooking objective progresses after collection.
- [ ] Confirm the crafting objective progresses after collection.
- [ ] Return to Willow Guide and complete the continuation.
- [ ] Confirm exactly 20 DUST settles once.
- [ ] Repeat the NPC interaction and confirm no duplicate reward.

## Offline safety

- [ ] Start a job and disconnect.
- [ ] Reconnect before completion and confirm remaining time.
- [ ] Disconnect again, reconnect after completion, and confirm Ready state.

## Public and preview safety

- [ ] Confirm private job events do not appear in Lantern Square.
- [ ] Confirm another player cannot inspect or collect the job.
- [ ] Confirm Game Test uses temporary fixtures only.
- [ ] Confirm Game Test does not consume real ingredients or DUST.
- [ ] Confirm Game Test does not create real jobs, grant output, or advance quests.
- [ ] Confirm normal gameplay persists after reconnect.

## Responsive and accessible

- [ ] Test desktop, tablet, and mobile layouts.
- [ ] Confirm recipes, queue, quantity, jobs, and Collect remain usable.
- [ ] Confirm keyboard navigation, focus containment, Escape, visible focus, progress labels, Ready
      announcement, touch targets, and reduced-motion behavior.

Record environment, migration head, browser/device, player ID, job IDs, timestamps, inventory/DUST
ledger receipts, screenshots, and any failures without exposing secrets.
