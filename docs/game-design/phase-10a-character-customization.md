# Phase 10A character customization design

Status: locally implemented with development-safe modular visuals; hosted and owner acceptance
pending.

## Experience goals

The creator should feel like a calm introduction to a cozy villager, not an account form or a
technical asset tool. A first-time player sees a large animated character, descriptive choices,
predictable steps, safe randomize/reset behavior, and an honest confirmation. An existing player
uses the Wardrobe to change the same cosmetic profile without leaving the world or losing position.

Appearance is public presentation only. Body presets use neutral names and never imply gender,
value, health, ability, rarity, or social rank. Skin tones and colors always have text labels.
Nothing in the creator changes speed, collision, progression, wallet eligibility, items, DUST,
rewards, moderation or administrator authority.

## Starter catalog target

The locally testable catalog supports at least:

- 6 skin tones;
- 8 hairstyles;
- 8 approved hair colors;
- 8 tops;
- 6 bottoms;
- 4 footwear options; and
- 6 accessories.

It also includes compatible body, face, eye and eyebrow options and a small curated preset set. When
approved production artwork is not available, procedural non-pixel development layers exercise the
same stable keys, foot anchors, order, colors, eight-direction facing and animation-state contract.
They are labeled development fallback and cannot be auto-published.

## First-time flow

1. Identity setup completes through the existing trusted profile boundary.
2. The staged creator opens before permanent world entry when required.
3. The player selects body and skin, face details, hair and color, outfit, footwear and accessories.
4. The preview rotates across all eight directions and switches between idle, walk and jog.
5. Randomize chooses only active compatible starter content; Reset restores the last saved/default
   selection.
6. Confirm creates one authoritative profile and admits the player only after the response succeeds.

Unsaved selections remain local. Cancelling an edit restores the saved appearance. A first-time
player cannot bypass a required creator by manipulating the browser, and an interrupted create can
be safely retrieved or replayed.

## Wardrobe flow

The Wardrobe is accessible from a legitimate in-game profile/settings route. It loads the current
catalog and latest appearance revision, lets the player stage changes, and warns before discarding
an unsaved selection. Saving is disabled if a complete authoritative catalog is unavailable. A stale
update reports that the character changed elsewhere and asks the player to reload.

The confirmed profile updates the local renderer in place. Nearby players receive the new revision
without a position reset, world/channel change, second entity, chat interruption, inventory reload,
or economy operation.

## Animation language

The canonical facings are north, northeast, east, southeast, south, southwest, west and northwest.
Movement acceptance—not raw key input—chooses facing. Stationary input noise keeps the prior
direction and returns idle. Walking uses a relaxed step cadence. Jogging is visually faster and is
shown only when the accepted displacement exceeds the ordinary walk envelope under valid jog intent.

All modular layers share a foot anchor, frame dimensions and compatible frame count for each
state/direction. Hair-back, body, skin, face, eyes, eyebrows, clothing, footwear, accessories,
hair-front and shadow retain stable relative order. Depth sorting uses the world foot position so a
character moves correctly in front of and behind scenery.

## Responsive and accessible presentation

Mobile uses a semantic staged wizard; desktop may use preview beside category controls. At 360×800
through 1920×1080, the preview remains visible, categories scroll safely, swatches keep touch size,
confirmation remains reachable and no horizontal overflow is required. UI scale at 90–120%,
increased contrast and reduced motion remain supported.

Selected options are expressed through label, control state and visual treatment. Keyboard focus is
visible, option groups support logical navigation, errors point to the relevant choice, dialogs trap
and restore focus, Escape closes safely, and announcements are short. Reduced Motion pauses or
minimizes animation while retaining a descriptive preview summary.

## Future boundary

Phase 10A does not add wardrobe unlock inventory, DUST cosmetic purchases, token-gated cosmetics,
NFTs, a marketplace, player cosmetic trading, stat bonuses, stat equipment, emotes, sitting,
carrying, seasonal collections or cosmetic achievements. Those require a separately authorized later
phase and cannot be inferred from the catalog or renderer foundation.
