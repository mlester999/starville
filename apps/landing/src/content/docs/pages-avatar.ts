import { contentSection, defineDocumentationPage } from './helpers';

export const characterCustomizationPage = defineDocumentationPage({
  slug: 'character-customization',
  route: '/docs/character-customization',
  title: 'Character Customization',
  eyebrow: 'Build a villager who feels like yours',
  description:
    'Preview the planned modular, cosmetic-only villager experience with eight-direction views, accessible controls, and clear artwork status.',
  section: 'Gameplay',
  audience: 'Players',
  status: 'local_only',
  icon: 'players',
  keywords: [
    'character creator',
    'appearance',
    'wardrobe',
    'skin tone',
    'hair',
    'clothing',
    'accessories',
    'eight directions',
    'idle walk jog',
  ],
  related: ['getting-started', 'controls-and-hud', 'accessibility', 'multiplayer'],
  content: [
    contentSection(
      'current-status',
      'Current availability and artwork status',
      [
        'Character customization and the Wardrobe are coming later. This guide previews the intended experience so players can understand its controls, cosmetic boundaries, privacy approach, and recovery behavior without treating it as available today.',
        'The planned starter catalog covers body, skin tone, face, eyes, eyebrows, hair, hair color, top, bottom, footwear, and compatible accessory combinations. Some preview visuals may use clearly labeled procedural fallbacks while finished illustration is prepared.',
        'Future approved cosmetics may expand the catalog after their own review. Paid cosmetics, DUST purchases, token-gated cosmetics, NFTs, a cosmetic marketplace, trading, rarity speculation, and stat bonuses are not active.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Coming later',
          text: 'The character creator and Wardrobe are not part of the current player experience. Game Status will change when they become available.',
        },
      ],
    ),
    contentSection(
      'first-character',
      'Create your first character',
      [
        'When this experience becomes available, a new eligible player will enter the character creator after wallet access and public-name setup. Choices remain a preview until confirmed. Closing or cancelling does not silently save a half-finished combination, and repeated confirmation resolves through one authoritative profile rather than creating duplicates.',
        'Move through the semantic steps in order or revisit an earlier category: body, skin tone, face, eyes and eyebrows, hair and hair color, clothing, footwear, accessories, then review. Each option has a descriptive text name as well as its visual swatch. The selected state is communicated with text and controls, not color alone.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Choose a body preset',
              text: 'Pick a neutral visual frame; body presets do not describe value, identity, or ability.',
            },
            {
              title: 'Choose skin and face details',
              text: 'Compare labeled skin tones, face, eyes, and eyebrow options in the live preview.',
            },
            {
              title: 'Choose hair',
              text: 'Select a hairstyle and one of its approved catalog colors; arbitrary browser colors are not accepted.',
            },
            {
              title: 'Choose an outfit',
              text: 'Combine compatible tops, bottoms, footwear, and a bounded number of accessories.',
            },
            {
              title: 'Review movement',
              text: 'Rotate through all eight directions and compare idle, walk, and jog before confirming.',
            },
            {
              title: 'Confirm once',
              text: 'Save the reviewed combination and wait for the authoritative profile before entering the world.',
            },
          ],
        },
      ],
    ),
    contentSection('preview-randomize-reset', 'Preview, randomize, reset, and cancel safely', [
      'The animated preview can rotate through north, northeast, east, southeast, south, southwest, west, and northwest. Idle shows a stationary stance, walk shows ordinary movement, and jog uses a visibly quicker presentation. A cozy neutral or Lantern Square-style background helps reveal shadow alignment and accessory overlap at real world scale.',
      'Randomize chooses only compatible starter options from the active catalog. It cannot select protected administrator cosmetics, unpublished definitions, arbitrary colors, scripts, remote URLs, or an excessive accessory combination. Reset returns the unsaved preview to the last authoritative appearance, while Cancel leaves the saved profile untouched.',
      'Appearance selection is cosmetic-only. Changing a body preset, hairstyle, clothing, color, footwear, or accessory does not change movement speed, collision, wallet eligibility, DUST, inventory, rewards, activity ability, social authority, or administrator permission.',
    ]),
    contentSection('wardrobe', 'Change appearance later', [
      'When available, an existing player can open the legitimate in-game appearance editor, called the Wardrobe. The editor loads the latest authoritative revision and stages changes on the current device. Saving sends bounded catalog keys with a one-time request identifier and the expected profile revision; the browser does not choose raw asset paths, render order, or public image URLs.',
      'If the profile changed in another tab or session, the older save is rejected instead of overwriting the newer appearance. Reload the latest profile, review the current choices, and apply the intended change again. If an option was disabled or superseded, choose a currently available compatible option or allow the safe fallback.',
      'Saving an appearance keeps the character in the same accepted world position. It does not create another player entity, restart progression, reset inventory, or manufacture a movement update. Nearby players receive the new resolved appearance revision through the trusted realtime boundary.',
    ]),
    contentSection(
      'multiplayer-privacy',
      'Public appearance and multiplayer privacy',
      [
        'Other players can see the safe resolved appearance needed to draw your villager: the approved preset or layer keys, appearance identifier, revision, and compatible fallback state. Realtime presence and appearance updates do not include wallet address, email, private inventory, locked cosmetics, DUST, token holdings, session identifiers, administrator notes, or private asset-intake locations.',
        'Remote villagers use the same eight-direction idle, walk, and jog presentation as the local player. Appearance updates happen in place so a wardrobe change does not reset position or duplicate the remote entity. Switching worlds or channels removes and restores the correct player representation through ordinary presence rules.',
        'A player cannot impersonate a protected administrator appearance by editing a browser request. Trusted services validate each closed catalog key, compatibility rule, module state, profile revision, and publication state before returning the privacy-safe resolved profile.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Multiplayer',
              href: '/docs/multiplayer',
              description: 'Learn how resolved appearance travels with world and channel presence.',
            },
            {
              label: 'Player Safety',
              href: '/docs/player-safety',
              description: 'Review the public profile fields other villagers may safely see.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'accessibility',
      'Accessible and responsive creation',
      [
        'On mobile, the creator uses a staged wizard so the animated preview remains visible and the confirmation action stays reachable. Tablet and desktop layouts may place the preview beside category controls. Categories scroll inside their intended region, palette swatches preserve touch size, and the page avoids horizontal overflow at supported viewport and interface scales.',
        'Use semantic step navigation, Tab and Shift+Tab to move between controls, arrow keys where an option group supports them, Enter or Space to select, and Escape to close a safe modal or return focus. Labels describe color and style choices in words. Validation errors are associated with the relevant control and live announcements remain short.',
        'Reduced Motion pauses or minimizes preview animation while preserving a readable pose. Increased Text Contrast strengthens labels and surfaces, and 90%, 100%, 110%, or 120% UI Scale can help fit the editor comfortably. These settings change presentation only and cannot weaken server validation.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Accessibility',
              href: '/docs/accessibility',
              description: 'Configure reduced motion, contrast, interface scale, and keyboard use.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'troubleshooting',
      'Troubleshoot a character change',
      [
        'If an option disappears, the content may have been disabled, superseded, found incompatible, or held for production review. Refresh the catalog and select an available alternative. If the editor says the character changed elsewhere, reload the latest appearance rather than repeatedly submitting the stale revision.',
        'If an approved asset fails to load, Starville uses a safe development or legacy fallback without accepting a browser-provided replacement URL. A fallback can look simpler than the selected production content while preserving position, movement, and profile integrity. Report the visible option name, direction, and animation state without including private wallet or session information.',
        'If customization is temporarily unavailable, keep the current authoritative appearance and try again later. Do not clear wallet data, create another player, or approve any transaction: appearance editing never requires a wallet transaction, token payment, NFT approval, or DUST purchase.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Troubleshooting',
              href: '/docs/troubleshooting',
              description: 'Find safe recovery steps for access, realtime, and game features.',
            },
            {
              label: 'Game Status',
              href: '/game-status',
              description: 'Confirm whether character customization is available or coming later.',
            },
          ],
        },
      ],
    ),
  ],
});
