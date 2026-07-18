# Phase 11C owner acceptance — pending

Nothing in this checklist is marked passed. Run it only after separately authorizing hosted
migration validation and a safe owner test environment.

## Prerequisites and access

- [ ] Load a Phase 11A/11B player and record inventory and DUST.
- [ ] Confirm the General Store and Mira are reachable in Lantern Square.
- [ ] Approach the store, verify the prompt, active catalog, Buy/Sell/Receipts tabs, keyboard flow,
      and mobile layout.

## Buy and failure paths

- [ ] Buy one starter seed after checking unit price, quantity, and total.
- [ ] Confirm DUST decreases once, inventory increases once, and the receipt is inspectable.
- [ ] Replay the exact request and confirm no duplicate charge, item, stock use, limit use, or
      receipt.
- [ ] With insufficient fixture DUST, confirm the safe failure and no item, stock, or limit change.
- [ ] With a full fixture inventory, confirm no DUST debit or stock change.
- [ ] Race two purchases for the final stock unit; confirm one success, stock zero, and one safe
      failure.
- [ ] Reach the purchase limit and confirm another request does not settle.

## Sell and reconnect

- [ ] Sell one eligible crop after checking owned quantity, unit value, and total.
- [ ] Confirm inventory decreases once, DUST increases once, and replay issues no duplicate DUST.
- [ ] Confirm permanent tools and bound items cannot be sold and explain why.
- [ ] Reach the sale limit and confirm no item removal or DUST issuance.
- [ ] Disconnect/reconnect and confirm balance, inventory, limits, stock, receipt, and active
      catalog rehydrate.

## Tutorial and Game Test

- [ ] Accept the tutorial only after Hearth and Hands completion.
- [ ] Complete required buy, sale, receipt inspection, return, and turn-in objectives.
- [ ] Confirm the 15 DUST reward settles once and repeated interaction cannot duplicate it.
- [ ] Open Lantern Square through Game Test and use the temporary buy and sell flows.
- [ ] Confirm real DUST, inventory, stock, limits, receipts, quests, and public telemetry remain
      unchanged.

## Administration and responsive review

- [ ] Inspect the active catalog, create a successor, edit a local price, validate, review warnings,
      and exercise a local-only activation fixture.
- [ ] Confirm old receipts retain old prices; inspect stock, local manual restock, transaction,
      receipt, reconciliation, risk, audit, and live-ops controls.
- [ ] Test desktop, tablet, and mobile layouts with no overlap or unreachable action.
- [ ] Test 200% zoom, keyboard-only operation, focus restoration, screen-reader labels, reduced
      motion, and 44-pixel touch targets.
