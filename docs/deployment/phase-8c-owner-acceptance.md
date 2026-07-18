# Phase 8C owner acceptance checklist

This checklist remains pending until an owner performs it with approved eligible test players.

- [ ] Open two eligible sessions in the same published world/channel and move within three tiles.
- [ ] Select the other player with pointer/touch and keyboard nearby list; inspect only safe public
      fields.
- [ ] Send and accept an eligible item gift; repeat acceptance and confirm exactly one transfer and
      receipt.
- [ ] Decline and cancel gifts; confirm no transfer. Attempt the permanent watering can and confirm
      rejection. Fill the recipient inventory and confirm a safe capacity failure.
- [ ] Request/accept a trade and add eligible items from both players.
- [ ] Confirm from A, change B's offer, and verify both confirmations clear on the new revision.
- [ ] Confirm the exact latest revision from both players and verify atomic settlement after
      refresh.
- [ ] Cancel another trade and verify reservations release.
- [ ] Switch channel/world during pending/negotiating work and verify invalidation with no transfer.
- [ ] Block a participant and verify active work invalidates and new inspect/gift/trade requests
      fail.
- [ ] Disconnect during negotiation, reconnect within 30 seconds, and verify the exact server
      revision resumes. Let another trade expire and verify reservations release.
- [ ] Verify DUST persists but cannot be added to a Phase 8C trade.
- [ ] Review list/detail/receipt/audit in Administration and verify there is no manual settlement
      edit.
- [ ] Verify unauthorized staff receive 403 and read-only analysts have only `.read` permissions.
- [ ] Test suspension, token-access loss, and maintenance closure.
- [ ] Validate 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080
      with no horizontal overflow or trapped inaccessible focus.
- [ ] Run owner-approved non-production hosted lint, pgTAP, RLS, concurrency, and controlled load
      checks. Never use real player transfers as fixtures.
