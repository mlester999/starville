# Phase 10A deferred owner acceptance

Status: prepared only. Do not mark complete until the named hosted environment is deployed and the
owner records evidence.

## Preconditions

- The Phase 10A migrations are deployed through the reviewed hosted process.
- Hosted database lint, pgTAP and RLS checks are green.
- The game API, realtime server, game client, admin portal and worker use the same reviewed version.
- No draft or development fallback is represented as production artwork.
- A normal player, a second player and each required narrow administrator role are available.
- No token claim, signer, treasury, paid cosmetic, NFT or DUST cosmetic purchase feature is enabled.

## First-time creator

1. Create a new eligible player and confirm the creator opens before permanent world entry.
2. Change body preset, skin tone, face, hairstyle, hair color, top, bottom and footwear.
3. Add and remove an accessory.
4. Preview north, northeast, east, southeast, south, southwest, west and northwest.
5. Preview idle, walk and jog and confirm jog is visually distinct.
6. Randomize and confirm every result is compatible and selectable.
7. Reset and confirm the reviewed default returns.
8. Confirm once, enter Lantern Square, refresh and verify persistence.
9. Verify no wallet transaction, DUST debit, inventory grant or receipt occurs.

## Appearance editing

1. Open the Wardrobe from the legitimate player route.
2. Make unsaved changes, cancel and confirm the saved appearance returns.
3. Save a new appearance and refresh to confirm persistence.
4. Attempt a stale update from another session and verify the latest authoritative revision wins.
5. Confirm the player remains at the same accepted position and no duplicate entity appears.
6. Disable or supersede a selected development definition in a controlled test and verify compatible
   fallback behavior.

## Multiplayer

1. Sign in two players to the same world and channel.
2. Confirm both resolve the other’s correct appearance.
3. Move in all eight directions and compare local/remote idle, walk and jog.
4. Change Player A and verify Player B receives an in-place appearance update.
5. Switch channels, return, reconnect and switch worlds; verify the latest appearance restores.
6. Verify no movement payload includes a URL or private profile field.
7. Confirm no duplicate remote player, position reset or animation slide appears.

## Administrator workflow

1. Select an approved World Asset version through the Avatar Content editor.
2. Configure all 24 direction/state mappings and preview both backgrounds and scales.
3. Validate, resolve findings and submit for review.
4. Review with the review role; confirm the submitted version cannot be silently edited.
5. Approve with the approval role and activate with the activation role.
6. Confirm the option becomes player-selectable only after activation.
7. Supersede it, verify compatibility/fallback and inspect append-only audit.
8. Verify direct routes fail for each insufficient role and wallet access never grants admin
   authority.

## Responsive and accessibility matrix

Test the creator and Wardrobe at 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900
and 1920×1080. Repeat representative mobile, tablet and desktop checks at 90%, 110% and 120% UI
scale, with Reduced Motion and Increased Text Contrast.

Confirm the preview stays visible; category controls scroll; there is no page-level horizontal
overflow; confirmation is reachable; swatches meet touch size; keyboard focus is visible; selected
state has text; labels describe colors; errors are associated; dialogs trap/restore focus and handle
Escape; and announcements remain bounded.

## Evidence record

Record environment, release identifiers, database migration list, tester, date, device/browser,
role, result and evidence location for each group. A partial pass remains pending. Local automation,
a local screenshot or source inspection alone cannot satisfy hosted owner acceptance.
