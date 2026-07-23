import { contentSection, defineDocumentationPage } from './helpers';

export const gettingStartedPage = defineDocumentationPage({
  slug: 'getting-started',
  route: '/docs/getting-started',
  title: 'Getting Started',
  eyebrow: 'Your first visit',
  description:
    'Prepare a Solana wallet, verify access safely, create your villager, and take your first steps through Lantern Square.',
  section: 'Start here',
  audience: 'New players',
  status: 'testing',
  icon: 'spark',
  keywords: ['quick start', 'first login', 'character', 'Lantern Square', 'wallet access'],
  related: ['character-customization', 'controls-and-hud', 'wallet-and-star'],
  content: [
    contentSection(
      'before-you-enter',
      'Before you enter the village',
      [
        'Starville is a browser-based cozy multiplayer game. The launch access flow uses a supported Solana wallet to prove that you control an eligible address. The configured network is Solana Mainnet Beta, and the approved threshold is 10,000 display tokens of the configured STAR mint. The active configuration shown by the access screen is authoritative.',
        'Wallet verification is an ownership check, not a payment. Connecting, signing the one-time access message, and checking eligibility do not ask you to send STAR, SOL, an NFT, or any other asset. Read the message before approving it and make sure you are on the official Starville route.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Keep wallet recovery information private',
          text: 'Starville never asks for a seed phrase, private key, wallet password, or authentication token. Close the page if any prompt asks for one.',
        },
      ],
    ),
    contentSection(
      'quick-start',
      'Ten-minute quick start',
      [
        'Allow a few calm minutes for the first visit. Your wallet may open in an extension or a separate device window. Return to the Starville tab after each wallet step and wait for the access screen to confirm the result.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Prepare your wallet',
              text: 'Unlock a supported Solana wallet and confirm that it is using Mainnet Beta.',
            },
            {
              title: 'Check eligibility',
              text: 'Confirm that the address holds the configured token and meets the amount displayed by Starville.',
            },
            {
              title: 'Connect from the official landing page',
              text: 'Choose Play Now, connect through the wallet selector, and review the selected address.',
            },
            {
              title: 'Sign the access message',
              text: 'Approve the human-readable, one-time ownership message. This is not a transaction.',
            },
            {
              title: 'Complete player setup',
              text: 'Choose a safe public display name, build a compatible cosmetic appearance, preview all eight directions, and confirm it before permanent world entry.',
            },
            {
              title: 'Enter Lantern Square',
              text: 'Wait for the world and your saved position to load before moving.',
            },
            {
              title: 'Learn the essentials',
              text: 'Use WASD to move, hold Shift to jog, press E to interact, and press Enter to open chat.',
            },
            {
              title: 'Explore a road',
              text: 'Follow one of the four roads to a marked map edge and allow the transition to complete.',
            },
            {
              title: 'Meet another villager',
              text: 'Use Nearby Players when someone is close enough and choose only an action that is currently available.',
            },
            {
              title: 'Try a party',
              text: 'Invite an eligible friend or nearby player, then use Party chat and a ready check before an activity.',
            },
          ],
        },
      ],
    ),
    contentSection('player-setup', 'Player setup and your public identity', [
      'Your display name is the name other villagers see above your character, in chat, and in social panels. Choose something you are comfortable sharing publicly. Do not use an email address, wallet address, full legal name, or other sensitive personal information as a display name.',
      'Character setup creates the server-backed player profile used by the current game session. The staged creator combines only active compatible body, skin, face, hair, clothing, footwear, and accessory options. Previewing or randomizing remains local until confirmation; appearance is cosmetic-only and cannot grant administrator privileges, movement power, items, DUST, or rewards.',
      'If Starville requires a name change, complete it through the in-game prompt. Refreshing or changing browser data does not override the authoritative profile. If a setup request is interrupted, reconnect and let the game retrieve the result instead of repeatedly creating new requests.',
    ]),
    contentSection(
      'first-minutes',
      'Your first minutes in Lantern Square',
      [
        'Lantern Square is the village crossroads. The square, stream, bridge, cottages, lamps, notice board, and four roads teach the world’s basic scale. Walk around objects instead of trying to pass through them. Character and scenery layers change naturally as you move in front of or behind larger objects.',
        'Approach the village notice and press E when the interaction hint appears. Not every flower, stone, sign, or building is interactive; decoration gives the world character without always opening a panel. Watch for a visible prompt before assuming an object can be used.',
        'Four edge exits lead to Moonpetal Meadow, Brooklight Crossing, Hearthfield Road, and Whisperpine Gate. A short travel presentation appears while the server validates the destination and safe spawn. Avoid holding movement toward the edge until the new world has finished loading.',
      ],
      [
        {
          type: 'callout',
          tone: 'tip',
          title: 'Start with the notice board',
          text: 'The notice near the center of Lantern Square is a simple way to practice positioning, the E interaction, and closing a panel with Escape.',
        },
      ],
    ),
    contentSection(
      'if-access-fails',
      'If access does not complete',
      [
        'An eligibility result can fail for several different reasons. An insufficient balance is different from a temporary network or balance-check outage. Read the message carefully: a temporary verification error does not mean that the wallet was rejected or that the balance is zero.',
        'Confirm the selected address, Mainnet Beta, and the configured token mint. Unlock the wallet, retry the check once, and allow time for a recent token-account update to become visible. If the session expires, begin a fresh verification so that Starville can issue a new one-time message.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Wallet and STAR',
              href: '/docs/wallet-and-star',
              description:
                'Understand eligibility, signatures, networks, and safe wallet behavior.',
            },
            {
              label: 'Troubleshooting',
              href: '/docs/troubleshooting',
              description: 'Work through common access, connection, social, and shop problems.',
            },
          ],
        },
      ],
    ),
  ],
});

export const controlsAndHudPage = defineDocumentationPage({
  slug: 'controls-and-hud',
  route: '/docs/controls-and-hud',
  title: 'Controls & HUD',
  eyebrow: 'Read the village at a glance',
  description:
    'Use Starville’s current keyboard controls and understand each part of the responsive player interface.',
  section: 'Gameplay',
  audience: 'Players',
  status: 'owner_tested',
  icon: 'controls',
  keywords: ['WASD', 'Shift', 'E', 'Enter', 'Escape', 'quickbar', 'HUD', 'settings'],
  related: ['getting-started', 'accessibility', 'multiplayer'],
  content: [
    contentSection(
      'control-reference',
      'Current control reference',
      [
        'Starville supports smooth eight-direction movement by combining the four movement keys. The current bindings are a fixed guide and are not yet rebindable. Mouse and touch users can operate visible interface buttons, tabs, lists, dialogs, and shop actions where those controls are present.',
      ],
      [
        {
          type: 'keys',
          items: [
            {
              label: 'Move',
              keys: ['W', 'A', 'S', 'D'],
              description:
                'Walk north-west, south-west, south-east, north-east, or combine keys for all eight directions.',
            },
            {
              label: 'Jog',
              keys: ['Shift'],
              description: 'Hold either Shift key while moving for the current faster travel pace.',
            },
            {
              label: 'Interact',
              keys: ['E'],
              description: 'Use the nearest valid world interaction when its prompt is visible.',
            },
            {
              label: 'Quickbar',
              keys: ['1–8'],
              description: 'Select one of the eight persistent quickbar slots.',
            },
            {
              label: 'Chat',
              keys: ['Enter'],
              description: 'Open or focus Village chat when gameplay input is available.',
            },
            {
              label: 'Close / back',
              keys: ['Esc'],
              description: 'Close the topmost safe panel, menu, popover, or chat composer.',
            },
          ],
        },
      ],
    ),
    contentSection('input-safety', 'When controls pause', [
      'Typing into chat does not move your character. Starville recognizes focused text fields and suppresses gameplay input while you write. Dialogs, menus, world transitions, cooperative activity states, and selected social interactions also block conflicting movement or interaction input.',
      'Escape closes the safest top layer first. For example, it can dismiss the chat composer before closing another interface beneath it. After the active panel closes, focus returns to an appropriate control where supported and normal gameplay input resumes.',
      'If movement appears unresponsive, check whether a panel is open, a text field has focus, or a world transition is still underway. Do not repeatedly press purchase, gift, trade, or activity actions while a result is pending; those operations wait for an authoritative response.',
    ]),
    contentSection(
      'status-dock',
      'Player identity, location, and connection',
      [
        'The top status area identifies your public player name and current location. It also shows the active multiplayer channel, population information, and the connection state that applies to your current world session. The wallet and network presentation confirms access context without exposing your full wallet to other players.',
        'Connected means the current realtime session is active. Reconnecting means Starville is attempting to restore the connection and authoritative social state. Connection Interrupted means realtime delivery is currently unavailable; avoid assuming that another player received an action until the interface confirms recovery.',
        'The current channel is marked in the channel selector. Switching to an available channel changes which players are visible in the world, while party state may continue across channel or world changes. A full channel remains visible but cannot be selected until capacity becomes available.',
      ],
      [
        {
          type: 'table',
          caption: 'Player-facing connection states',
          columns: ['State', 'Meaning', 'What to do'],
          rows: [
            ['Connected', 'Realtime world delivery is active.', 'Continue playing normally.'],
            [
              'Reconnecting',
              'Starville is restoring a temporary interruption.',
              'Wait briefly and keep the tab active.',
            ],
            [
              'Connection Interrupted',
              'The realtime session is unavailable.',
              'Check your connection and refresh if recovery does not occur.',
            ],
          ],
        },
      ],
    ),
    contentSection('player-tools', 'Inventory, quickbar, and DUST', [
      'Inventory shows ordinary items and their server-backed quantities. The quickbar provides eight persistent assignments for frequently used items or tools. Selecting a number highlights the corresponding slot; assigning or consuming an item is confirmed by the server and then reflected in the interface.',
      'The DUST display shows the current off-chain game-currency balance. Recent earnings and spending are available in DUST history when the hardened economy build is deployed. A displayed balance is informative; the server and append-only receipt history decide whether a purchase or reward succeeds.',
      'Shop, farming, cooking, crafting, furniture, and home controls appear when the current interaction or location supports them. Development-marker artwork can identify content whose production art is still being prepared without changing the underlying item or interaction authority.',
    ]),
    contentSection('social-hud', 'Chat, Nearby Players, Friends & Party', [
      'Village chat sits at the lower-left and includes Nearby, Channel, Party, and System scopes. Unread markers help you find a scope with new messages. The Nearby Players panel lists villagers close enough for a supported interaction; actions can include inspecting, adding a friend, inviting to a party, gifting, trading, muting, or blocking.',
      'Friends & Party contains friend requests, persistent friends, party invitations, current members, leadership controls, ready checks, and member connection states. The compact party HUD keeps the current party visible while the larger panel is closed. Activities opens the cooperative catalog and current activity controls when that foundation is enabled.',
    ]),
    contentSection(
      'settings',
      'Settings and interface comfort',
      [
        'Settings is divided into Audio, Gameplay, Controls, Accessibility, and How to Play. Audio currently provides Master Volume and Mute. Gameplay includes interaction hints, nearby names, location banner visibility, leave-activity confirmation, compact HUD, chat timestamps, and important party notifications.',
        'Accessibility provides Reduced Motion, four UI Scale choices, Larger Chat Text, Increased Text Contrast, and Simplified HUD. These preferences are stored locally in the browser. They change presentation and comfort, never authoritative movement, balance, inventory, social state, or wallet eligibility.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Accessibility settings',
              href: '/docs/accessibility',
              description:
                'Learn what each comfort setting changes and what remains authoritative.',
            },
          ],
        },
      ],
    ),
  ],
});

export const worldsAndExplorationPage = defineDocumentationPage({
  slug: 'worlds-and-exploration',
  route: '/docs/worlds-and-exploration',
  title: 'Worlds & Exploration',
  eyebrow: 'Four roads beneath the lanterns',
  description:
    'Explore Starville’s five current world maps, understand safe transitions, and move naturally through the isometric scenery.',
  section: 'Gameplay',
  audience: 'Players',
  status: 'testing',
  icon: 'map',
  keywords: ['Lantern Square', 'Moonpetal Meadow', 'world transition', 'channel', 'collision'],
  related: ['controls-and-hud', 'multiplayer', 'farming-and-cozy-gameplay'],
  content: [
    contentSection('isometric-movement', 'Moving through an isometric world', [
      'Starville uses a polished two-dimensional isometric view. WASD movement follows the diagonal screen axes, and combining keys gives eight directions. The camera follows your character while the world’s depth order changes so that characters can pass naturally in front of and behind trees, buildings, roofs, and foreground details.',
      'Collision keeps players out of water, structure bases, fences, and other blocked spaces. If a direct line is blocked, release the key and walk around the object. Decorative details may have no interaction, while usable objects show an E prompt when your character is in a valid position.',
      'Your position is saved through trusted world state. After entering or reconnecting, Starville restores a safe valid position when possible and falls back to a map spawn when an old position cannot be used. The browser cannot choose an arbitrary destination or unsafe coordinate.',
    ]),
    contentSection(
      'lantern-square',
      'Lantern Square',
      [
        'Lantern Square is the current village center and the first map for a new player. A stone plaza, stream, bridge, cottages, trees, lanterns, and a village notice establish the main visual language. The square is also a crossroads: one visible route leaves through each edge of the map.',
        'The north road leads to Moonpetal Meadow, the east road to Brooklight Crossing, the south road to Hearthfield Road, and the west road to Whisperpine Gate. Each route has a corresponding return spawn, so crossing back should place you safely inside the destination rather than immediately triggering another trip.',
      ],
      [
        {
          type: 'table',
          caption: 'Current Starville world routes',
          columns: ['From Lantern Square', 'Destination', 'Character'],
          rows: [
            ['North', 'Moonpetal Meadow', 'A meadow route connected to cozy farming foundations.'],
            ['East', 'Brooklight Crossing', 'A waterside crossing beyond the village center.'],
            ['South', 'Hearthfield Road', 'A warm rural road leading away from the square.'],
            [
              'West',
              'Whisperpine Gate',
              'A woodland gate at the edge of the current route network.',
            ],
          ],
        },
      ],
    ),
    contentSection(
      'transitions',
      'World exits and safe travel',
      [
        'An exit is a narrow region near a marked map edge, not a menu teleport. Walk toward the end of the road and allow the travel presentation to begin. The server verifies the current map, destination relationship, version, and destination spawn before the client shows the new world.',
        'Travel normally takes a short fade and loading interval. Keep the tab open, do not refresh during the transition, and release the movement key until the destination appears. If validation or loading fails, Starville keeps or returns you to a safe position instead of inventing an arrival.',
        'Saved positions are world-specific. Reconnecting should restore the last trusted state without placing the player through a wall, in water, or directly inside an exit loop. A map may also move to a newer published version; in that case, a valid spawn is safer than reusing an incompatible old coordinate.',
      ],
      [
        {
          type: 'callout',
          tone: 'tip',
          title: 'Release movement during travel',
          text: 'Let the destination finish loading before walking again. This avoids immediately pressing back into an edge exit.',
        },
      ],
    ),
    contentSection('world-presence', 'Worlds, channels, and other players', [
      'A world identifies the place; a channel identifies one multiplayer copy of that place. You see active villagers who share both your current world and channel. A friend or party member can remain in your social state while exploring a different place, but their world character should not appear beside you until your presence matches again.',
      'The current configured channel target is 40 active characters, although a deployment may use a different safe capacity. The channel selector shows the current population and whether another channel can accept a switch. Switching changes nearby presence and local conversation without moving your durable inventory or progression.',
    ]),
    contentSection(
      'development-art',
      'World art and current scope',
      [
        'The current worlds use modular terrain, structures, props, collision, interaction layers, and versioned map data. They are not one flattened background. This lets Starville update routes, scenery, safe spawns, and interactions without replacing an entire world image.',
        'Some areas use clearly identified development-marker artwork while production assets are prepared. A marker means the presentation can change; it does not turn a decorative object into a completed gameplay system. Additional regions, interiors, seasonal spaces, and richer environment behavior belong to future development and should not be assumed active from concept art alone.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Current route network',
          text: 'Lantern Square, Moonpetal Meadow, Brooklight Crossing, Hearthfield Road, and Whisperpine Gate are the five maps represented by the current world foundation. Availability still depends on the deployed build.',
        },
      ],
    ),
  ],
});

export const farmingAndCozyGameplayPage = defineDocumentationPage({
  slug: 'farming-and-cozy-gameplay',
  route: '/docs/farming-and-cozy-gameplay',
  title: 'Farming & Cozy Gameplay',
  eyebrow: 'A gentle foundation',
  description:
    'Learn the current farming, cooking, crafting, inventory, home, furniture, and ordinary shop foundations without confusing them with future plans.',
  section: 'Gameplay',
  audience: 'Players',
  status: 'testing',
  icon: 'leaf',
  keywords: ['farm', 'plant', 'water', 'harvest', 'cook', 'craft', 'home', 'furniture'],
  related: ['worlds-and-exploration', 'village-supply-shop', 'dust-economy'],
  content: [
    contentSection(
      'personal-farm',
      'Your personal farming plots',
      [
        'The cozy foundation provides six private farming plots. A valid seed can be selected from inventory or the quickbar, planted into an open plot, watered when required, and harvested after server-controlled growth completes. The farm state belongs to the player and persists beyond the current browser view.',
        'Growth time is based on trusted server time. Refreshing the page, changing a device clock, or clicking a plot repeatedly does not accelerate it. Planting consumes an eligible seed only after the authoritative operation succeeds, and harvesting grants the defined result without trusting a client-submitted quantity.',
        'Approach the farming interaction and follow the panel state. A plot explains whether it is empty, planted, needs water, is growing, or is ready. If an operation is already pending, wait for the updated farm and inventory state instead of submitting it again.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Choose a seed',
              text: 'Place an eligible seed in inventory or select it from the quickbar.',
            },
            {
              title: 'Plant',
              text: 'Use an open personal plot and confirm the current seed choice.',
            },
            { title: 'Water', text: 'Water the plot when its status says that care is required.' },
            {
              title: 'Wait',
              text: 'Growth advances using server time, including while you are away.',
            },
            { title: 'Harvest', text: 'Collect the result once the plot reaches its ready state.' },
          ],
        },
      ],
    ),
    contentSection('cooking-crafting', 'Cooking and crafting', [
      'The current cozy foundation includes four cooking recipes and two basic crafting recipes. Each recipe is a data-backed definition with required ingredients and an output. The server checks ownership and quantity, consumes the requirements atomically, and grants the finished item only when the entire operation can succeed.',
      'Use the cooking hearth for available food recipes and the crafting workbench for supported crafted goods. A recipe may be unavailable because ingredients are missing, an item is disabled, inventory has no safe space, or the current content definition is not active. The interface should give a friendly reason rather than exposing internal data.',
      'Cooking businesses, advanced professions, recipe discovery, quality tiers, and large production chains remain part of the broader game direction. The current recipe set is a working foundation, not a claim that every planned cozy career is already playable.',
    ]),
    contentSection('inventory-quickbar', 'Inventory and the eight-slot quickbar', [
      'Inventory quantities are server-authoritative and bounded by stack and storage rules. An ordinary item can be received from farming, cooking, crafting, an eligible gift or trade, a cooperative completion, or a server-controlled shop purchase. Protected, temporary, and permanent starter items follow stricter transfer rules.',
      'The quickbar stores eight assignments for fast selection. Press 1 through 8 to highlight a slot. A quickbar assignment points to an owned inventory stack; if that stack is consumed or removed, Starville reconciles the assignment rather than displaying an item the player no longer owns.',
      'When inventory is full, operations that need new space fail safely. They should not deduct DUST, consume ingredients, or remove another player’s reserved item without completing the corresponding grant. Free a suitable slot and retry after the pending state clears.',
    ]),
    contentSection('home-furniture', 'Private starter home and furniture', [
      'Each player has a version-pinned private starter-home instance in the current foundation. Enter through the supported home interaction and return to the village through the matching exit. Other public-world players are not automatically placed inside the private instance.',
      'Owned furniture can be placed on valid home cells, moved, rotated where the definition allows, and removed back to inventory. Placement checks ownership, boundaries, footprints, overlap, rotation, and the current home revision. The browser suggests a position; the server decides whether it is legal.',
      'Room expansion, additional floors, extensive exterior customization, gardens, businesses, and layout presets are long-term cozy goals. They should be treated as planned unless the current status page says otherwise.',
    ]),
    contentSection(
      'current-and-coming',
      'What is implemented and what comes later',
      [
        'The cozy slice includes ordinary item definitions, inventory, a persistent quickbar, six farming plots, the initial recipe set, a fixed-price system shop foundation, a private home, and furniture placement. Some experiences may have limited availability, while the expanded DUST economy and polished Village Supply Shop are coming later.',
        'Animals, quests, player businesses, broad marketplace play, large housing expansion, advanced crop catalogs, seasonal production, and creator commerce are not current promises. Starville’s roadmap grows these systems through careful updates while preserving a stable, server-authoritative foundation.',
      ],
      [
        {
          type: 'callout',
          tone: 'coming_later',
          title: 'The cozy world will keep growing',
          text: 'Planned animals, richer homes, businesses, seasonal systems, and additional production loops are not active merely because they appear in the long-term design direction.',
        },
      ],
    ),
  ],
});

export const accessibilityPage = defineDocumentationPage({
  slug: 'accessibility',
  route: '/docs/accessibility',
  title: 'Accessibility',
  eyebrow: 'Make the village comfortable',
  description:
    'Adjust motion, scale, chat text, contrast, and HUD detail while keeping gameplay authority unchanged.',
  section: 'Help',
  audience: 'Players',
  status: 'owner_tested',
  icon: 'accessibility',
  keywords: ['reduced motion', 'UI scale', 'larger chat', 'contrast', 'keyboard', 'touch'],
  related: ['controls-and-hud', 'character-customization', 'troubleshooting'],
  content: [
    contentSection(
      'available-settings',
      'Current accessibility settings',
      [
        'Open Settings and choose Accessibility. Reduced Motion minimizes interface animation and movement effects. UI Scale resizes interface text and controls without scaling the game world. Larger Chat Text increases message and composer text. Increased Text Contrast brightens secondary labels and strengthens panel surfaces. Simplified HUD removes decorative detail while keeping essential status and actions.',
        'UI Scale offers 90%, 100%, 110%, and 120%. Choose the smallest size that remains comfortable for your display and distance. A larger scale may cause dense panels to reflow into taller layouts, so scroll within a dialog when necessary rather than reducing text below a readable size.',
      ],
      [
        {
          type: 'table',
          caption: 'Accessibility presentation controls',
          columns: ['Setting', 'Changes', 'Does not change'],
          rows: [
            [
              'Reduced Motion',
              'Interface transitions and decorative animation',
              'Movement speed or world timing',
            ],
            ['UI Scale', 'HUD text and control size', 'Camera scale or collision'],
            ['Larger Chat Text', 'Chat message and composer size', 'Message limits or delivery'],
            [
              'Increased Text Contrast',
              'Secondary text and panel separation',
              'Game authority or status',
            ],
            ['Simplified HUD', 'Decorative HUD detail', 'Essential actions and information'],
          ],
        },
      ],
    ),
    contentSection('keyboard-focus', 'Keyboard and focus behavior', [
      'Interactive controls have visible focus treatment and descriptive labels. Use Tab and Shift+Tab to move through links, buttons, fields, and dialog actions. Tab lists such as Settings support arrow-key movement, with Home and End moving to the first or last section where implemented.',
      'Dialogs keep focus inside while open and return it to the triggering control when closed. Escape closes the topmost safe panel. Chat recognizes text entry, preventing movement while a message is being typed. Search, documentation navigation, and the mobile contents drawer are also keyboard reachable.',
      'A visible focus ring is intentional. It shows which control will receive Enter or Space. If focus seems lost after a connection update, press Tab once or close the current panel with Escape before continuing.',
    ]),
    contentSection('touch-responsive', 'Touch targets and responsive layouts', [
      'The player interface adapts across phone, tablet, and desktop sizes. Dense tables become lists or scroll safely, actions wrap instead of clipping, and important controls keep practical touch targets. The HUD changes arrangement rather than shrinking every element into an unreadable desktop layout.',
      'On a smaller display, open panels may cover more of the world. Close the current panel before moving, and use compact or simplified HUD settings if the visible play area feels crowded. Landscape orientation can help with wide activity and social interfaces, but all essential actions should remain available in portrait layouts.',
      'The planned character creator uses a staged mobile wizard and a preview-with-controls desktop layout. Every appearance option has a text label, the selected state is not communicated by color alone, and confirmation remains reachable at supported sizes. Reduced Motion pauses or simplifies the idle, walk, and jog preview while retaining an accessible pose summary.',
    ]),
    contentSection(
      'local-preferences',
      'What is stored locally',
      [
        'Audio, gameplay, and accessibility preferences are stored in the current browser when storage is available. Another device, browser profile, or cleared site data may begin with the defaults. Reapply the preferences that make play comfortable after switching environments.',
        'Local preferences never decide wallet eligibility, movement validity, inventory, DUST, party membership, activity progress, or moderation state. A changed setting cannot grant an item or bypass a restriction, and losing a setting cannot remove durable player data.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'Tell us about a barrier',
          text: 'If an essential action cannot be reached with your input method or a label is unclear, record the page, control, device size, and expected behavior without sharing account secrets.',
        },
      ],
    ),
  ],
});
