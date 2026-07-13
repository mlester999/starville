# Phase 7 manual acceptance checklist

Run this checklist only against Starville Development with an owner-controlled eligible wallet.
Hosted migrations and the reviewed Phase 7 world drafts must be deployed and published first. Keep
production credentials, wallets, and infrastructure out of local tests.

## Preconditions

- Confirm `SUPABASE_ENVIRONMENT=development` and verify the exact project target.
- Back up the development database and confirm restore readiness.
- Apply the four additive Phase 7 migrations after explicit approval.
- Validate and explicitly publish the derived Lantern Square and Moonpetal Meadow drafts. The
  migrations never publish them automatically.
- Keep Phase 8 social systems and Phase 9 rewards disabled.
- Use a test player whose suspension, rename, maintenance, and token-gate state are known.

## Player loop

1. Connect and sign with an eligible wallet, enter Starville, and record the initial DUST balance.
2. Refresh and reconnect several times. Confirm 250 starter DUST, the watering can, starter chair,
   six farm plots, and one private home exist exactly once.
3. Open inventory; assign and clear quickbar slots with mouse and keys 1–8. Confirm number keys do
   nothing while focus is in a form field and Phaser is not recreated.
4. Enter the Lantern General Store, buy a seed, and confirm the returned DUST and inventory state.
5. At each Moonpetal plot, plant and water. Attempt an early harvest, wait for database time to
   reach readiness, harvest, and confirm deterministic inventory output.
6. Cook one recipe and craft one item at their exact typed stations. Confirm ingredients and any
   configured DUST fee change atomically.
7. Sell an eligible item and confirm DUST increases once. Confirm permanent and non-sellable items
   cannot be sold.
8. Buy or craft furniture, enter the private starter home, and place, move, rotate, and store it.
   Confirm blocked cells, overlaps, unsupported rotations, bounds, and the exit corridor are denied.
9. Refresh inside or after leaving the home and confirm inventory, placements, public return
   destination, farm state, quickbar, and DUST reconcile from the server.

## Existing access controls

1. Suspend the test player and confirm gameplay is replaced by the suspension boundary.
2. Restore the player and confirm no wallet session is created automatically; reconnect normally.
3. Require a rename and confirm the protected rename flow still precedes world and cozy bootstrap.
4. Enable development maintenance and confirm it replaces gameplay without changing DUST, inventory,
   farm, home, wallet, or token state. Disable it and re-enter through normal checks.

## Administrator checks

- Super Administrator and Game Administrator can read the permitted bounded DUST, inventory, farm,
  and home views.
- Read-only Analyst receives only its reviewed read access.
- Customer Support, Moderator, Blockchain Operator, and other unauthorized roles receive 403 for
  cozy summaries they do not own permission to read.
- `/game-content` is read-only and clearly labels development-marker art.
- No page or API offers DUST adjustment, inventory mutation, arbitrary JSON editing, or access to
  idempotency keys, request identifiers from ledger entries, service-role data, or raw metadata.

## Responsive and accessibility matrix

Check 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, and 1920×1080. Phones must
retain the truthful keyboard-required notice; Phase 7 does not claim touch gameplay. On supported
desktop widths, confirm no body overflow, reachable modal actions, readable DUST, non-overlapping
quickbar and announcements, focus trapping/restoration, Escape handling, visible focus, reduced
motion, and screen-reader labels for quantities, plots, home cells, and DUST.

Record request IDs for safe failures. Never record cookies, wallet signatures, authorization
headers, service-role credentials, private RPC URLs, or full secret-bearing logs.
