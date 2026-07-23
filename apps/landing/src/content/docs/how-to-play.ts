import { contentSection, defineDocumentationPage } from './helpers';

export const howToPlayPage = defineDocumentationPage({
  slug: 'how-to-play',
  route: '/how-to-play',
  title: 'How to Play Starville',
  eyebrow: 'Your practical village guide',
  description:
    'A practical guide to entering the village, exploring the world, meeting other players, using tools, joining parties, and playing cooperative activities.',
  section: 'Start here',
  audience: 'New players',
  status: 'available',
  icon: 'compass',
  keywords: [
    'how to play',
    'beginner',
    'character creator',
    'controls',
    'HUD',
    'party',
    'Moonpetal',
    'DUST',
    'Daily Rhythm',
    'onboarding',
  ],
  related: ['getting-started', 'character-customization', 'game-status'],
  content: [
    contentSection(
      'quick-facts',
      'Starville in one minute',
      [
        'Starville is a browser-based isometric cozy multiplayer game. You enter through a Solana wallet eligibility check, create a public villager identity, explore connected worlds, use farming and home foundations, meet players in bounded channels, form parties, and prepare cooperative activities. DUST is the ordinary off-chain game currency; STAR is the configured wallet token used for launch access eligibility.',
        'The responsive HUD, realtime presence, movement, chat, personal plot, cooking, crafting, General Store, and first progression journey are implemented in the current development scope. Some social and cooperative experiences have limited availability. Token claiming is currently unavailable. Use Game Status whenever availability matters.',
      ],
      [
        {
          type: 'table',
          caption: 'Starville quick facts',
          columns: ['Experience', 'Current fact', 'Remember'],
          rows: [
            ['Platform', 'Browser-based', 'Use the official Starville route.'],
            ['Access', 'Solana wallet eligibility', 'No ordinary access transaction is required.'],
            ['Movement', 'WASD with Shift jogging', 'Combine keys for eight directions.'],
            ['Multiplayer', 'World and channel presence', 'Match both when meeting a player.'],
            ['Activities', 'Private-party cooperative play', 'Public matchmaking is not active.'],
            ['Economy', 'Off-chain DUST', 'No withdrawal or token conversion.'],
          ],
        },
        {
          type: 'links',
          links: [
            {
              label: 'Enter Starville',
              href: '/',
              description: 'Return to the landing page and choose Play Now.',
            },
            {
              label: 'Read full documentation',
              href: '/docs',
              description: 'Browse every focused guide and search the knowledge base.',
            },
            {
              label: 'Check game status',
              href: '/game-status',
              description: 'See what is available now, limited, coming later, or unavailable.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'quick-start',
      'Quick start: from wallet to village',
      [
        'Give the first visit a few uninterrupted minutes. Wallet connection may open an extension or a device handoff, and the game needs time to load a trusted profile and world state. Return to the original Starville tab after each wallet step instead of opening several play sessions.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Prepare a supported Solana wallet',
              text: 'Unlock a wallet available through the current Reown connection experience.',
            },
            {
              title: 'Confirm Mainnet Beta and eligibility',
              text: 'Use the selected address and the configured STAR mint. The approved threshold is 10,000 STAR display tokens.',
            },
            {
              title: 'Connect through Play Now',
              text: 'Review the address shown by Starville and change it before signing if it is not the intended wallet.',
            },
            {
              title: 'Sign the ownership message',
              text: 'Read and approve the one-time access message. It is not a transaction and does not send tokens.',
            },
            {
              title: 'Complete player setup',
              text: 'Choose a safe public display name. If the character creator is offered, review the appearance from every direction and confirm once.',
            },
            {
              title: 'Enter Lantern Square',
              text: 'Wait for the world, character, and saved state to finish loading.',
            },
            {
              title: 'Practice movement',
              text: 'Use WASD, hold Shift to jog, and follow the Guide toward Willow Guide.',
            },
            {
              title: 'Try an interaction',
              text: 'Press E only when a valid interaction hint is visible.',
            },
            {
              title: 'Open Village chat',
              text: 'Press Enter, choose a scope, type a short message, and press Escape to close.',
            },
            {
              title: 'Form a party when ready',
              text: 'Invite an eligible friend or nearby villager before preparing a cooperative activity.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'first-day',
      'Your first day in Starville',
      [
        'The compact Starville Guide presents one objective at a time. The intended lifecycle is: Enter Starville → Learn the Basics → Find Your Home → Grow Something → Make Something → Trade Something → Improve Your Starvillian → Personalize Your Home → Connect Socially → Begin Your Daily Rhythm.',
        'Follow stable world markers to Willow Guide, your personal-home entrance, one of eight garden tiles, the Cooking Hearth or Crafting Workbench, and the General Store. If a marker is unavailable, the same objective keeps an accessible text route and a safe recovery action; a missing marker never counts as completion.',
        'Your starter inventory, 250 starter DUST, Willow Chair, recipes, XP, and Starville Beginnings quest progress come from the existing authoritative gameplay systems. The Guide coordinates those systems and does not issue a second set of rewards. Existing players keep recognized progress and do not receive starter grants again.',
        'You can pause, minimize, or reduce guidance without losing verified progress. The home-visit lesson is optional and solo-safe: reviewing visibility and interaction modes is enough when no other player is online or live visits are paused.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Server evidence protects progress',
          text: 'Crop, production, shop, XP, housing, quest, and daily completion advance only after the corresponding server-authoritative gameplay action succeeds.',
        },
      ],
    ),
    contentSection(
      'wallet-access',
      'Connect and verify wallet access safely',
      [
        'Starville uses Reown AppKit as the Solana wallet connection layer. The exact compatible wallet choices depend on the browser, device, installed wallet, and current connection capabilities, so do not rely on an unofficial provider list. Choose only a wallet you control and verify the shortened address in the access panel.',
        'The configured network is Solana Mainnet Beta. The trusted access boundary checks the configured STAR mint and the approved 10,000 display-token requirement. A token with the same symbol but a different mint does not satisfy the check.',
        'After connection, Starville creates a one-time challenge with the wallet address, official domain, intended action, network, timestamps, and unique value. Signing proves control for that access attempt. It does not transfer STAR, approve a token account, spend SOL, stake, claim a reward, or expose a private key.',
        'The token remains in the wallet. Disconnecting changes the connection state but does not move an asset. Eligibility may be refreshed after a session interval, expiry, or configuration update. A temporary balance-check outage is shown as a verification error rather than an inaccurate zero balance.',
        'Token claims and payouts remain disabled: there is no Claim button, connected treasury, live signer, withdrawal, DUST conversion, wallet transaction, or token reward. Any future direction still requires product, security, treasury, legal, and compliance review.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Never share wallet recovery information',
          text: 'Starville never asks for a seed phrase, recovery phrase, private key, wallet password, or copied authentication token. Reject and close any prompt that does.',
        },
      ],
    ),
    contentSection(
      'character-customization',
      'Create and change your character',
      [
        'The character creator and Wardrobe are coming later. When available, the first-time creator will open after identity setup and offer a body preset, skin tone, face, eyes, eyebrows, hairstyle, approved hair color, top, bottom, footwear, and a bounded accessory combination. Each option has a descriptive label, and the animated preview can rotate through all eight directions in idle, walk, or jog.',
        'The planned Randomize action chooses only compatible active starter content. Reset returns to the last saved appearance, and Cancel keeps unsaved changes on the current device. Confirming creates one authoritative appearance profile, while a stale save from an older tab is rejected instead of overwriting a newer revision.',
        'Appearance is cosmetic-only. It cannot change movement speed, collision, inventory, DUST, rewards, wallet access, social authority, or administrator status. The intended shared update is privacy-safe and changes the character in place without resetting position or creating a duplicate.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Character Customization',
              href: '/docs/character-customization',
              description:
                'Read the complete creator, Wardrobe, multiplayer, accessibility, and troubleshooting guide.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'controls',
      'Learn the current controls',
      [
        'Movement follows the isometric screen axes. Press one movement key for a diagonal direction or combine two keys for the remaining directions. Jogging is useful on a clear road, but collision still protects blocked water, structures, fences, and world edges.',
        'Typing into chat does not move the player. Text fields, dialogs, menus, world transitions, and certain social or activity states suppress conflicting gameplay input. Escape closes the topmost safe panel and normal control returns after the active layer closes.',
      ],
      [
        {
          type: 'keys',
          items: [
            {
              label: 'Movement',
              keys: ['W', 'A', 'S', 'D'],
              description: 'Walk smoothly in eight directions by using single or combined keys.',
            },
            { label: 'Jog', keys: ['Shift'], description: 'Hold either Shift while moving.' },
            {
              label: 'Interact',
              keys: ['E'],
              description: 'Use the nearest valid prompted object.',
            },
            {
              label: 'Quickbar',
              keys: ['1–8'],
              description: 'Select one of eight persistent item or tool slots.',
            },
            {
              label: 'Chat',
              keys: ['Enter'],
              description: 'Open or focus Village chat when input is free.',
            },
            {
              label: 'Close / back',
              keys: ['Esc'],
              description: 'Close the topmost safe interface layer.',
            },
          ],
        },
      ],
    ),
    contentSection('hud', 'Read the HUD', [
      'The identity and location area shows your public player name and current world. The status dock identifies the current channel and connection. Connected means realtime delivery is active. Reconnecting means Starville is attempting to restore it. Connection Interrupted means social delivery is unavailable and a pending interaction should not be assumed complete.',
      'DUST shows the current ordinary game-currency balance. Inventory lists server-backed items and quantities. The eight-slot quickbar keeps selected assignments close to hand. Farming, cooking, crafting, shop, home, and furniture panels appear only when the current location and interaction support them.',
      'Village chat includes Nearby, Channel, Party, and System tabs with unread markers. Nearby Players lists villagers close enough for supported actions. Friends & Party manages requests, friends, invitations, members, leadership, and ready checks. Activities opens the cooperative catalog and current activity state where the feature is enabled.',
      'Settings contains Audio, Gameplay, Controls, Accessibility, and an in-game How to Play summary. The interface adapts for phone, tablet, and desktop; panels reflow and scroll instead of preserving an overlapping desktop arrangement.',
    ]),
    contentSection('exploration', 'Explore Lantern Square and the four roads', [
      'Lantern Square is the first village crossroads. Practice walking around the plaza, stream, bridge, cottages, trees, and fence lines. Approach the village notice until its E prompt appears. Not every decorative object is interactive, and an object without a prompt may simply be part of the scenery.',
      'Characters and scenery use depth sorting, so you can pass in front of or behind supported structures and canopies without the world looking flat. Collision describes the solid base, not every visible leaf or roof edge. Walk around a blocked base instead of trying to force through it.',
      'A visible road exits each edge. North leads to Moonpetal Meadow, east to Brooklight Crossing, south to Hearthfield Road, and west to Whisperpine Gate. Enter the narrow edge transition, release movement, and wait for the short fade and validated destination spawn.',
      'Starville saves a trusted world position and restores a safe location after reconnect. If an old position is invalid for a newer map version, the game uses a safe spawn. The browser cannot select an arbitrary map or coordinate, and a failed transition should not leave the character inside an exit loop.',
    ]),
    contentSection('channels', 'Understand channels and presence', [
      'A world is a place; a channel is one bounded multiplayer copy of that place. Players see one another when both world and channel match. Someone in another channel or another world should not appear beside you, even if that player is still a friend or party member.',
      'The current configured channel target is about 40 active characters, although deployment configuration can vary. The channel selector marks your current channel, shows population, and prevents switching into an unavailable full channel. Switching changes local presence and Channel chat without copying durable inventory or progression.',
      'Realtime movement makes other connected villagers move smoothly. A temporary network delay may pause a remote player, but it should not create a duplicate or grant arbitrary travel. Use one active tab for the same player to avoid replacing an older realtime connection.',
    ]),
    contentSection('chat', 'Chat kindly and choose the right scope', [
      'Nearby chat is for players close enough to share local conversation. Channel chat reaches the current channel. Party chat reaches active party members and can support coordination across worlds or channels. System contains game-authored notices; ordinary players cannot impersonate it.',
      'Messages have a bounded player-friendly length and sending rate. The composer prevents oversized text, and the service can reject invalid or overly frequent messages. Reconnect can restore an appropriate recent view, and unread indicators help you find a scope with new activity.',
      'Mute hides an ordinary player’s messages from your view. Block creates a stronger incompatible social boundary. Report attaches the relevant message and category to a controlled moderation review. Use these controls without announcing retaliation or exposing private information.',
      'Never share recovery phrases, private keys, wallet passwords, login details, personal contact information, or private moderation context in chat. System messages are not a reason to reveal credentials.',
    ]),
    contentSection('nearby-inspect', 'Meet nearby villagers and respect inspection privacy', [
      'Open Nearby Players when another villager is close enough. Select a player to see actions currently allowed by distance, session, block state, party capacity, inventory, and interaction lifecycle. Options can include Inspect, Add Friend, Invite to Party, Send Gift, Request Trade, Mute, and Block.',
      'An unavailable action can mean the player moved away, is busy, is blocked, belongs to another party, has a full party, is already trading, or has a current account or maintenance restriction. Move closer and refresh current state rather than trying to bypass the disabled action.',
      'Safe inspection may show display name, level, appearance, limited world or channel context, and party state where permitted. It never shows email, wallet address, private inventory, DUST balance, token holdings, session information, moderation details, block reasons, or staff notes.',
    ]),
    contentSection('friends-parties', 'Build a friends list and a party', [
      'Send a friend request to an eligible nearby player. The recipient can accept or decline, and you can cancel an outgoing request. Friendships persist beyond a live session. The current maximum is 100 friends, with bounded pending requests that can expire.',
      'Create a party and invite an eligible friend or nearby villager. The default party capacity is four, each player can have only one active party, and one member is the leader. Party chat remains available to the active group even when physical proximity changes.',
      'The leader manages invitations, can remove or promote a member, begins ready checks, and prepares supported activities. Members can leave. The leader can disband. If the leader briefly disconnects, the party preserves the role through a grace period; if the leader does not return, leadership may pass to another connected member.',
      'A ready check collects each member’s current answer. It does not automatically spend an item or enter an activity. Membership changes or a new check can invalidate old responses, so begin a fresh check after everyone has finished changing worlds or shopping.',
    ]),
    contentSection(
      'gifts-trades',
      'Give and trade ordinary items safely',
      [
        'A gift reserves an eligible ordinary item while the recipient decides. Both players must meet the current eligibility and proximity rules. Accepting settles one server-authoritative transfer; declining, cancellation, expiry, or invalidation releases the reservation. Accepting twice does not duplicate an item.',
        'Protected items, permanent starter items, and temporary activity items cannot be gifted. DUST gifting is not available, and gifts never contain STAR, SOL, NFTs, or other wallet assets.',
        'A trade lets both players add eligible ordinary items. Review both offers, then confirm the current version. If either player changes any item or quantity, both confirmations clear. The server settles the entire exchange atomically only after both players confirm the latest unchanged offer.',
        'No current trade supports DUST, STAR, SOL, NFTs, cash, or external services. Do not trust an off-platform promise. Cancel if the other player asks you to use another website, reveal credentials, or accept an item now for payment later.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Review the latest trade offer',
          text: 'A previous confirmation is cleared when either offer changes. Read every current item and quantity before confirming again.',
        },
      ],
    ),
    contentSection(
      'moonpetal',
      'Prepare Moonpetal Harvest Help',
      [
        'Moonpetal Harvest Help is the first cooperative activity foundation: a private, non-combat shared harvest for two to four party members. There is no public matchmaking. The leader chooses the enabled activity, the party confirms readiness, and the run locks its eligible participant roster.',
        'Gather temporary seed bundles, prepare the shared plots, plant Moonpetals, water the crops, wait for server-controlled growth, harvest temporary bundles, and deliver the complete shared harvest. Progress belongs to the instance and is shared by the group. Repeating the same interaction does not create duplicate progress.',
        'Activity plots are separate from personal farms. Temporary seeds and harvest bundles never enter permanent inventory and cannot be gifted or traded. A reconnect can restore the current run, and the activity may continue with enough eligible players. Failure grants no completion reward.',
        'A configurable example grants 15 DUST, 2 Moonbeans, and a completion receipt to each eligible successful participant. It uses two rewarded completions per UTC day, an entry cooldown around 60 seconds, and a reward cooldown around 300 seconds. The current game may use different published values, so always read the activity summary before starting.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Availability can vary',
          text: 'Moonpetal Harvest Help may not appear in every current game version. If it is available, the activity summary shows the authoritative rewards, limits, and cooldowns.',
        },
      ],
    ),
    contentSection('cozy', 'Use the current cozy foundations', [
      'The personal cozy slice includes eight garden tiles. Prepare a tile, select an eligible seed, plant, water once to start growth, wait for trusted server time, and harvest the result. Moonbeans use the canonical five-minute duration in normal play. Refreshing or changing a device clock does not accelerate growth.',
      'Four cooking recipes and two basic crafting recipes use the current hearth and workbench foundations. The server checks ingredients, inventory capacity, and content availability, then consumes and grants the full recipe atomically. An invalid or full inventory leaves ingredients untouched.',
      'Inventory stores ordinary server-backed items, and the quickbar holds eight persistent assignments. One private starter-home instance supports owned furniture placement, movement, allowed rotation, and removal within validated boundaries. Some content uses clearly marked development art while production assets are prepared.',
      'Animals, businesses, broad housing expansion, deeper recipe catalogs, public marketplaces, and seasonal production are planned or deferred. The current slice includes the bounded Starville Beginnings questline without claiming every long-term cozy fantasy is already available.',
    ]),
    contentSection('daily-rhythm', 'Begin your Daily Rhythm', [
      'Daily Rhythm uses one canonical UTC game day. The server lazily selects three unique objectives from eligible farming, cooking or crafting, General Store, progression, housing, and solo-safe social-readiness actions. Locked or paused gameplay actions are excluded, and no objective requires another player or premium spending.',
      'Open the Guide to see progress and the exact reset time. Reconnect and refresh reread the same assignment for that UTC date; the browser cannot choose a date or submit its own objective. At 00:00 UTC, the next eligible set is created lazily when needed rather than scanning every player at midnight.',
      'Daily Rhythm v1 is deliberately non-economic: each objective and the full-set completion mark grant 0 DUST, 0 XP, no item, no STAR, and no streak multiplier. Ordinary farming, production, shop, quest, and progression actions can still earn their existing canonical outcomes.',
    ]),
    contentSection('progression', 'Follow My Starville Journey', [
      'Player Level is your overall Starville progress. Skill Level is progress within one activity: Farming, Cooking, or Crafting. Valid server-confirmed actions award bounded XP; preview, failed, or repeated requests do not. The HUD shows Player Level, and My Journey shows exact totals, recent XP, skill progress, and the next visible unlock requirements.',
      'An unlock is authoritative permission to use specific content such as a crop, seed shop entry, recipe, or quest. The server checks it again when you plant, purchase, or start a recipe. Ordinary earned unlocks remain yours when later requirements change.',
      'Starville Beginnings connects Farming Introduction, Hearth and Hands, General Store Tutorial, Growing Roots, Homegrown Help, and A Place in Starville. Track one active chapter for a compact HUD objective. Reconnect restores the server-backed chapter, objective, reward, skill, level, and unlock state.',
      'Achievements are non-repeatable milestones. Titles and badges are cosmetic profile choices with no stat, wallet, inventory, DUST, or access advantage. A pending item reward is preserved safely if inventory is full and can be retried after making space.',
      'Game Test Progression is temporary preview data only. It cannot award XP, complete a real quest, earn an achievement, grant an unlock, change a title, add inventory, or change DUST.',
    ]),
    contentSection('dust-shop', 'Understand DUST and the Village Supply Shop', [
      'DUST is Starville’s off-chain game currency for ordinary purchases and progression. It is server-authoritative, separate from STAR, not withdrawable, not directly convertible to STAR or SOL, and not directly transferable between players in the current version.',
      'The expanded economy direction records append-only credits and debits with authoritative receipts. Friendly history can include Starter Balance, Moonpetal Harvest Help, Village Supply Shop, System Refund, and Administrative Correction. A positive amount is an earning; a negative amount is spending.',
      'The Village Supply Shop catalog shows approved offers, server-controlled prices, quantity where supported, purchase limits, cooldowns, inventory status, and current DUST. Confirmation shows item, quantity, total, current balance, predicted balance after purchase, and capacity before you choose Purchase.',
      'Purchase Complete shows the item, amount spent, new balance, and safe receipt reference. Settlement is designed to be atomic and idempotent: DUST cannot be deducted without the item, the item cannot be granted without the debit, and the same request cannot apply twice. The expanded economy and polished shop are coming later; this description does not make them available today.',
    ]),
    contentSection('settings-accessibility', 'Tune Settings and accessibility', [
      'Audio includes Master Volume and Mute. Gameplay settings include interaction hints, nearby player names, location banner, confirmation before leaving activities, compact HUD, chat timestamps, and important party notifications. Controls shows the fixed current reference.',
      'Accessibility includes Reduced Motion, UI Scale at 90%, 100%, 110%, or 120%, Larger Chat Text, Increased Text Contrast, and Simplified HUD. Use the combination that keeps text, actions, and the world comfortable at your device size.',
      'Settings persist locally in the current browser when storage is available. They change presentation only. They do not change movement authority, inventory, DUST, wallet eligibility, party state, cooldowns, or activity progress.',
    ]),
    contentSection('recover', 'Recover from common problems', [
      'If a wallet will not connect, refresh the official landing page, unlock the wallet, confirm Mainnet Beta, and reconnect safely. If access is not granted, compare the selected address, configured mint, and live required amount. A temporary network error is not an insufficient-balance result.',
      'If the game is Reconnecting, keep the tab active and wait briefly. Confirm internet access and use one active play tab. Refresh once if recovery does not complete, then retrieve authoritative party, activity, inventory, balance, and receipt state before retrying an operation.',
      'If another player is missing, compare world and channel. If chat is missing, compare scope, proximity, party, mute, block, and connection. If a gift, trade, or party invitation is unavailable, check proximity, capacity, item eligibility, existing interactions, blocks, and restrictions.',
      'If an activity cannot start, confirm two or more eligible party members, leadership, a current ready check, cooldown, daily limits, activity publication, and maintenance. If a purchase fails, check DUST, inventory, offer state, limit, cooldown, shop state, and session freshness.',
    ]),
    contentSection(
      'safety-status',
      'Stay safe and follow current status',
      [
        'Use official routes, inspect wallet prompts, keep recovery information private, and reject unexpected transactions. Review the latest trade offer. Keep personal information out of chat. Use mute, block, and report controls when needed. A genuine support process can work from a safe public receipt reference and visible error without private credentials.',
        'Read Game Status before relying on a feature for an event. Available-now, limited-availability, coming-later, and currently-unavailable systems are intentionally separate. The current game interface takes priority over an older guide or screenshot.',
        'Starville currently has no active token payout, on-chain claim, Play-to-Earn, staking, withdrawal, swap, marketplace, auction, or NFT flow. No claim transaction is required, and Starville never asks for a seed phrase or private key. DUST has no guaranteed financial value.',
        'Disabled security research may model eligibility, claim-intent, treasury, signer, and instruction-planning boundaries using mock state and offline fixtures. It creates no player reward or claim action. Future research must not be mistaken for a current promise.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Browse documentation',
              href: '/docs',
              description: 'Search focused guides and follow related articles.',
            },
            {
              label: 'Game Status',
              href: '/game-status',
              description: 'Review the current player-friendly feature register.',
            },
            {
              label: 'Troubleshooting',
              href: '/docs/troubleshooting',
              description: 'Follow detailed recovery checks without exposing secrets.',
            },
          ],
        },
      ],
    ),
  ],
});
