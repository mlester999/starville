import { contentSection, defineDocumentationPage } from './helpers';

export const docsIndexPage = defineDocumentationPage({
  slug: 'docs',
  route: '/docs',
  title: 'Documentation',
  eyebrow: 'The Starville field guide',
  description:
    'A complete guide to Starville’s gameplay, multiplayer, economy, wallet access, safety, current status, and development direction.',
  section: 'Start here',
  audience: 'Community',
  status: 'available',
  icon: 'book',
  keywords: [
    'documentation',
    'quick start',
    'game status',
    'character customization',
    'wallet',
    'multiplayer',
    'economy',
  ],
  related: ['getting-started', 'game-status', 'roadmap'],
  content: [
    contentSection(
      'welcome',
      'Welcome to the field guide',
      [
        'Starville is a browser-based isometric cozy multiplayer world built around exploration, farming foundations, small-group social play, cooperative activities, and fair ordinary progression. This documentation explains the current experience in concrete terms and clearly separates what is available now, what has limited availability, and what is coming later.',
        'Start with Getting Started when you are preparing a wallet or entering for the first time. Use How to Play for a practical walkthrough of controls, HUD, worlds, chat, social interactions, parties, Moonpetal Harvest Help, DUST, the Village Supply Shop, settings, and safe recovery. The focused guides answer deeper questions without requiring you to read them in order.',
        'If the game differs from an older guide or screenshot, the current interface and Game Status page explain what is available. No guide asks for wallet recovery information or treats a planned token system as active.',
        'Every article includes a reviewed date, clear audience, searchable keywords, stable section links, related reading, and plain availability language where it matters. That structure makes a long field guide easier to scan without hiding important safety context.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'How to Play',
              href: '/how-to-play',
              description:
                'Follow the complete practical player guide from wallet access to cooperative play.',
            },
            {
              label: 'Getting Started',
              href: '/docs/getting-started',
              description:
                'Complete the wallet, character, and first-world setup in a few calm steps.',
            },
            {
              label: 'Game Status',
              href: '/game-status',
              description: 'Check the player-friendly availability of every major current system.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'quick-start',
      'Quick start overview',
      [
        'Prepare a supported Solana wallet on Mainnet Beta and confirm that the selected address meets the access requirement shown by Starville. The current expected threshold is 1,000 of the configured STAR token. Choose Play Now, connect through the Reown wallet selector, and sign the one-time human-readable ownership message. This is an eligibility check, not a transaction or transfer.',
        'Create your public display name and appearance when prompted, then enter Lantern Square. Move with WASD, hold Shift to jog, press E near a valid interaction, select quickbar slots with 1–8, open chat with Enter, and close the topmost safe panel with Escape. Typing and open panels suppress conflicting movement input.',
        'Explore the four roads from Lantern Square to Moonpetal Meadow, Brooklight Crossing, Hearthfield Road, and Whisperpine Gate. Match both world and channel when meeting another player. Use Nearby Players for proximity actions, Friends & Party for persistent social state, and Activities after a party of at least two eligible players is prepared.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Wallet',
              text: 'Connect an eligible Solana Mainnet Beta address through the official access flow.',
            },
            {
              title: 'Access',
              text: 'Sign one ownership message and wait for the trusted balance check.',
            },
            { title: 'Controls', text: 'Use WASD, Shift, E, 1–8, Enter, and Escape.' },
            {
              title: 'World',
              text: 'Begin in Lantern Square and follow a marked road when ready.',
            },
            {
              title: 'Multiplayer',
              text: 'Match world and channel, then use chat and nearby actions respectfully.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'current-status',
      'Current game status',
      [
        'The responsive HUD, realtime multiplayer presence, realtime movement, core chat, and wallet access verification are available now.',
        'Moderation edges, inspection privacy, gifts, trades, friends, parties, ready checks, reconnect behavior, and Moonpetal Harvest Help may have limited availability while refinements continue. Their guides explain intended safe use and recovery.',
        'The expanded receipt-backed DUST economy, polished Village Supply Shop, friendly DUST history, modular character creator, and Wardrobe are coming later. Their guides describe the intended experience without presenting it as available today.',
        'Disabled token-claim research does not add a player claim action, connected signer or treasury, transaction, withdrawal, DUST conversion, payout, or Play-to-Earn flow.',
        'Public matchmaking, guilds, clans, combat, raids, PvP, marketplace, auctions, token rewards, on-chain claims, Play-to-Earn, staking, withdrawals, and NFT systems are planned, deferred, or disabled—not active.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Read the complete status register',
              href: '/game-status',
              description:
                'See one clear source for available, limited, coming-later, and unavailable features.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'core-systems',
      'Core systems',
      [
        'Movement uses eight directions, collision, camera follow, safe positions, and isometric depth sorting. Worlds are structured maps with terrain, objects, collision, spawns, interactions, and versioned edge exits. The current network links five named worlds and avoids flattening the village into one unchangeable background.',
        'Multiplayer channels create bounded copies of a world, currently targeting about 40 active characters per channel where configured. Presence and movement are realtime, while durable world and account state remains trusted. Chat provides Nearby, Channel, Party, and System scopes with rate limits, mute, block, and report.',
        'Friends persist beyond a live session. Parties support four members by default, one leader, invitations, Party chat, ready checks, and reconnect-aware leadership. Eligible private parties can prepare Moonpetal Harvest Help, a non-combat shared farming activity for two to four players.',
        'The cozy slice includes inventory, an eight-slot quickbar, six private farm plots, planting, watering, growth, harvesting, an initial cooking and crafting set, a system shop foundation, a private starter home, and furniture placement. It is a development foundation, not every long-term cozy system in the master direction.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Controls & HUD',
              href: '/docs/controls-and-hud',
              description: 'Read every current binding and interface region.',
            },
            {
              label: 'Character Customization',
              href: '/docs/character-customization',
              description:
                'Build a modular cosmetic villager and understand preview, privacy, and artwork status.',
            },
            {
              label: 'Worlds & Exploration',
              href: '/docs/worlds-and-exploration',
              description: 'Learn the five current maps and safe travel behavior.',
            },
            {
              label: 'Multiplayer',
              href: '/docs/multiplayer',
              description: 'Understand presence, channels, nearby players, and recovery.',
            },
            {
              label: 'Farming & Cozy Gameplay',
              href: '/docs/farming-and-cozy-gameplay',
              description: 'Separate current cozy foundations from future systems.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'featured-guides',
      'Featured guides',
      [
        'The guides below answer the most common player questions. Wallet & STAR explains what the one-time signature proves and why ordinary access does not transfer tokens. Multiplayer and Friends & Parties explain who can see and contact you. Cooperative Activities walks through every Moonpetal objective and clearly labels configurable reward examples.',
        'DUST Economy and Village Supply Shop explain append-only history, server-controlled prices, atomic purchase receipts, limits, cooldowns, and safe retries. Player Safety brings wallet, chat, inspection, gift, trade, and account boundaries together in one place.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Wallet & STAR',
              href: '/docs/wallet-and-star',
              description: 'Connect, sign, verify, and keep your wallet safe.',
            },
            {
              label: 'Cooperative Activities',
              href: '/docs/cooperative-activities',
              description: 'Prepare and complete Moonpetal Harvest Help.',
            },
            {
              label: 'DUST Economy',
              href: '/docs/dust-economy',
              description: 'Understand off-chain game currency and receipts.',
            },
            {
              label: 'Player Safety',
              href: '/docs/player-safety',
              description: 'Protect wallet, privacy, items, and account context.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'economy',
      'DUST, shop, and economy integrity',
      [
        'DUST is off-chain game currency tracked by Starville’s trusted services. It supports ordinary progression and is separate from the STAR access token. DUST is not withdrawable, not directly convertible to STAR or SOL, and not directly transferable between players in the current version.',
        'The expanded economy direction records completed credits and debits through append-only ledger entries and immutable receipts. Approved sources can include a starter balance, an eligible Moonpetal completion, a controlled refund, or an audited correction. Approved sinks include server-priced Village Supply Shop purchases and controlled correction debits.',
        'Purchases are atomic and idempotent: DUST and inventory change together once. Reconciliation checks ledger integrity without silently changing balances. Corrections require a reason, evidence, review, separation of duties, and exactly-once settlement. Simulations are planning tools and never alter real player data or publish a policy.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'No conversion or payout',
          text: 'There is no DUST withdrawal, DUST-to-STAR conversion, active token payout, or Play-to-Earn flow. Security research does not activate blockchain economics.',
        },
      ],
    ),
    contentSection('wallet-safety', 'Wallet access and player safety', [
      'Starville verifies an eligible Solana address on Mainnet Beta using the configured STAR mint and amount. The token remains in the wallet. The access signature is a short-lived, one-time ownership message—not a transfer, approval, stake, claim, swap, or purchase.',
      'Never share a seed phrase, recovery phrase, private key, wallet password, authentication token, or private session data. Verify the full domain, read prompts, reject unexpected transactions, and disconnect suspicious sessions through the wallet’s trusted interface.',
      'In chat and social systems, avoid sharing personal information. Use mute for a quieter view, block for an incompatible social boundary, and report the relevant message for moderation review. Inspect shows only safe public fields and never exposes a wallet address, private inventory, DUST balance, token holdings, session details, or staff notes.',
    ]),
    contentSection(
      'roadmap',
      'Development direction',
      [
        'Starville grows through careful, reviewable updates: platform and access foundations, world and cozy gameplay, social multiplayer, cooperative activities, and the off-chain economy. Each update preserves server authority, version history, auditability, responsive presentation, accessibility, and honest player-facing availability.',
        'Nearer-term direction emphasizes additional cooperative play, worlds, cozy systems, production art, economy readiness, and infrastructure quality. Future blockchain research must remain carefully reviewed, optional, non-pay-to-win, legally considered, and clearly separated from current functionality.',
        'The public roadmap intentionally avoids precise release dates until they are ready to share. A planned system can change as security, testing, art, performance, and community needs become clearer.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Public Roadmap',
              href: '/docs/roadmap',
              description: 'See complete, testing, in-development, planned, and deferred work.',
            },
            {
              label: 'Technical Overview',
              href: '/docs/technical-overview',
              description: 'Understand the safe high-level architecture and authority boundaries.',
            },
          ],
        },
      ],
    ),
    contentSection(
      'clarifications',
      'Important clarifications',
      [
        'Feature availability can depend on the current game version, reviewed configuration, maintenance state, account eligibility, world, channel, proximity, party membership, cooldowns, inventory capacity, and other safe server checks. An older screenshot or guide does not override the current authoritative result.',
      ],
      [
        {
          type: 'list',
          items: [
            'DUST is off-chain game currency and has no guaranteed monetary value.',
            'DUST cannot currently be withdrawn or converted to STAR or SOL.',
            'No token reward, on-chain claim, staking, or Play-to-Earn system is active.',
            'There is no player Claim action, connected signer, treasury, or claim transaction.',
            'Ordinary wallet access does not send, approve, lock, or spend tokens.',
            'Starville never asks for a seed phrase or private key.',
            'Gifts and trades support eligible ordinary items—not DUST or blockchain assets.',
            'Public matchmaking, guilds, combat, marketplaces, auctions, and NFTs are not current player features.',
            'The expanded DUST economy and polished Village Supply Shop are coming later.',
          ],
        },
      ],
    ),
  ],
});
