import { contentSection, defineDocumentationPage } from './helpers';
import { getPublicStatusPresentation, PUBLIC_FEATURE_STATUSES } from './status';

const statusRows = PUBLIC_FEATURE_STATUSES.map(
  (entry) =>
    [entry.name, getPublicStatusPresentation(entry.status).label, entry.explanation] as const,
);

export const gameStatusPage = defineDocumentationPage({
  slug: 'game-status',
  route: '/game-status',
  title: 'Game Status',
  eyebrow: 'What you can explore today',
  description:
    'A calm, player-friendly view of what is available now, what may have limited availability, and what is coming later.',
  section: 'Project',
  audience: 'Community',
  status: 'available',
  icon: 'status',
  keywords: [
    'status',
    'available now',
    'limited availability',
    'coming later',
    'disabled token claims',
    'character customization',
    'planned',
    'deferred',
  ],
  related: ['roadmap', 'technical-overview', 'getting-started'],
  content: [
    contentSection(
      'how-to-read',
      'How to read this status',
      [
        'Available now means the feature is part of the current player experience. Limited availability means it may appear only for some players, sessions, or current game versions while refinements continue. Check the feature itself before planning a group event around it.',
        'Coming later means the feature is not part of the current player experience. Currently unavailable means there is no active player action for it. These plain-language labels keep future direction separate from what you can use today.',
        'Availability can change as Starville grows. This page is the shared public reference, so focused guides can explain how a system works without turning future direction into a promise.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'No active Play-to-Earn',
          text: 'Token rewards, on-chain claims, staking, withdrawals, and Play-to-Earn are not active. DUST remains an off-chain game currency and cannot be converted to STAR.',
        },
      ],
    ),
    contentSection(
      'available-now',
      'Available now',
      [
        'The responsive HUD, realtime multiplayer presence, realtime movement, and core chat experience are available now. The HUD adapts across supported layouts, and villagers who share a world and channel can see one another move and use the current conversation scopes.',
        'Wallet access verification is also available. It proves control of the connected address and checks the configured access token through trusted services; it is not a claim, transfer, or payment transaction.',
      ],
      [
        {
          type: 'list',
          items: [
            'Responsive redesigned HUD',
            'Realtime multiplayer presence',
            'Realtime movement delivery',
            'Realtime chat core',
          ],
        },
      ],
    ),
    contentSection(
      'limited-availability',
      'Limited availability',
      [
        'Some social and cooperative experiences may be available while refinements continue: moderation edge cases, privacy-bounded inspection, ordinary-item gifts and trades, friendships, parties, ready checks, reconnect behavior, and Moonpetal Harvest Help.',
        'When one of these features is visible, follow the focused guide and use its recovery advice. If it is absent or temporarily unavailable, do not rely on an older screenshot or guide excerpt; the current game interface is authoritative.',
      ],
      [
        {
          type: 'list',
          items: [
            'Moderation edge cases and inspect privacy',
            'Item gifting and mutually confirmed item trading',
            'Friendship persistence and party membership lifecycle',
            'Ready checks, reconnect recovery, and leadership transfer',
            'Moonpetal activity lifecycle, reward settlement, and failure behavior',
            'Activity administration and receipt review',
          ],
        },
      ],
    ),
    contentSection(
      'coming-later',
      'Coming later',
      [
        'The expanded receipt-backed DUST economy, polished Village Supply Shop, friendly DUST history, modular character creator, Wardrobe, and shared appearance updates are being prepared for a future player update.',
        'Their guides explain the intended player experience and safety boundaries, but the Coming later label takes priority. You should not expect those screens or behaviors in the current game until this status changes.',
      ],
      [
        {
          type: 'list',
          items: [
            'Hardened DUST accounts, ledger, sources, sinks, policies, and receipts',
            'Village Supply Shop and friendly DUST history',
            'Dedicated economy administration and audit workflows',
            'Reconciliation, corrections, and risk review',
            'Deterministic economy simulations and tuning comparisons',
            'Modular character creator, Wardrobe, realtime appearance sync, and avatar administration',
          ],
        },
      ],
    ),
    contentSection(
      'disabled-claim-architecture',
      'Token claiming — Currently unavailable',
      [
        'No player token reward or claim action exists. No treasury or signer is connected, no wallet transaction signature is requested, no instruction is submitted, and no payout occurs.',
        'Starville may study security and treasury boundaries for possible future systems, but research is not an active financial product. Any future direction would require independent security, treasury, legal, compliance, geographic, and product review.',
        'Current wallet verification remains only an access check. It never asks you to claim a reward, approve a token transfer, or pay to enter ordinary social play.',
      ],
      [
        {
          type: 'list',
          items: [
            'Current wallet access verification remains available and separate from claiming',
            'Off-chain DUST remains non-withdrawable and non-convertible',
            'Token-claim planning remains offline, disabled, and non-custodial',
            'Any future implementation would require explicit approval and independent review',
          ],
        },
      ],
    ),
    contentSection('planned-deferred', 'Planned, deferred, or disabled', [
      'Public activity matchmaking, guilds and clans, combat, raids, PvP, a player marketplace, auctions, token rewards, on-chain claims, Play-to-Earn, staking, withdrawals, and NFT systems are not current player features.',
      'The game is designed as a cozy experience first. Social systems, movement, chat, parties, channel switching, and ordinary play should not require a transaction fee. Future blockchain research must remain optional, reviewed, non-pay-to-win, and separate from current availability claims.',
    ]),
    contentSection(
      'status-register',
      'Public feature register',
      [
        'The table below is rendered from the same typed status source used by documentation badges, roadmap summaries, and relevant feature guides. Machine status keys are translated into player-readable labels by the interface.',
      ],
      [
        {
          type: 'table',
          caption: 'Starville public feature status register',
          columns: ['Feature', 'Player status', 'What that means'],
          rows: statusRows,
        },
      ],
    ),
  ],
});

export const roadmapPage = defineDocumentationPage({
  slug: 'roadmap',
  route: '/docs/roadmap',
  title: 'Public Roadmap',
  eyebrow: 'Direction without invented dates',
  description:
    'Follow Starville’s foundation, cozy world, multiplayer, economy, and future research as evidence-backed status—not a release-date promise.',
  section: 'Project',
  audience: 'Community',
  status: 'available',
  icon: 'roadmap',
  keywords: [
    'roadmap',
    'foundation',
    'multiplayer',
    'economy',
    'token claim architecture',
    'future',
    'deferred',
  ],
  related: ['game-status', 'technical-overview', 'farming-and-cozy-gameplay'],
  content: [
    contentSection('roadmap-rules', 'How this roadmap works', [
      'This roadmap explains product direction without publishing speculative dates. Available now means a named player foundation can be used today. Refining means important behavior may have limited availability. Coming later means the work is not a current player promise.',
      'Large systems grow through careful, reviewable steps that preserve security and authority boundaries. A roadmap card never authorizes a token transfer or a change to current player balances.',
    ]),
    contentSection(
      'foundation',
      'Foundation — Complete',
      [
        'Starville has a pnpm and Turborepo multi-application foundation: a public landing experience, game client, protected administrator portal, API, realtime server, worker, shared packages, PostgreSQL and authentication through Supabase, and a Solana wallet connection layer through Reown.',
        'The access architecture proves wallet ownership with a one-time message and checks the configured token on the server. Administrator identity remains separate from player wallet access. Security, validation, versioned configuration, monitoring, and repeatable testing support future growth.',
      ],
      [
        {
          type: 'list',
          items: [
            'Multi-application monorepo and shared TypeScript packages',
            'Wallet ownership and configurable token-access foundation',
            'Protected administrator authorization and operational audit',
            'Database migrations, row-level access controls, and repeatable validation',
          ],
        },
      ],
    ),
    contentSection('world-cozy', 'World & cozy gameplay — Testing', [
      'Current world work includes smooth eight-direction movement, collision, depth sorting, camera follow, safe saved positions, five connected world maps, visible edge exits, versioned transitions, modular map data, development art, and authorized world-management foundations.',
      'The cozy slice includes ordinary items, persistent inventory and quickbar, six private farm plots, planting, watering, server-time growth, harvesting, four cooking recipes, two crafting recipes, a system shop foundation, one private starter home, and owned furniture placement.',
      'Richer farming catalogs, animals, quests, businesses, expanded housing, seasonal areas, and more complete production art remain Planned. Current foundations must not be described as every master-spec cozy system already complete.',
    ]),
    contentSection('multiplayer', 'Multiplayer — Available now and refining', [
      'Presence, realtime movement, and core chat are available now. Channels organize bounded groups within a world. Nearby interaction, moderation, inspection, item gifts and trades, friends, parties, Party chat, ready checks, reconnect leadership, and Moonpetal Harvest Help may have limited availability while refinements continue.',
      'The first cooperative activity uses private parties and has no combat. Public matchmaking is Planned. Guilds, clans, combat, raids, and PvP are Deferred from the current scope.',
    ]),
    contentSection('characters', 'Character customization — In Development', [
      'The planned character experience includes a staged first-time creator, an in-game Wardrobe, curated modular starter choices, eight-direction idle, walk, and jog previews, responsive and accessible controls, privacy-safe public appearance resolution, and in-place multiplayer appearance updates.',
      'The avatar catalog uses approved versioned World Asset references and a separated draft, validation, review, approval, activation, and superseding lifecycle. Procedural development fallbacks are clearly labeled and do not pretend to be final production illustration.',
      'This experience is coming later, and its final artwork remains under review. Paid cosmetics, DUST cosmetic purchases, token-gated cosmetics, NFTs, marketplace trading, stat bonuses, and speculative rarity are outside the current direction.',
    ]),
    contentSection('economy', 'Off-chain economy — In Development', [
      'The expanded DUST direction keeps the game currency off-chain and server-authoritative. It includes append-only history, controlled sources and sinks, atomic shop receipts, economy policies, reconciliation, corrections, risk review, simulations, and dedicated administrator experiences.',
      'This expanded economy is coming later. A conservative balance candidate may be recommended through simulations, but it remains unpublished until an authorized operator chooses and publishes a reviewed version. Current published behavior does not change automatically.',
      'The roadmap keeps social systems, chat, parties, movement, and channel switching free. It does not introduce artificial transaction fees, pay-to-win advantages, or a browser-controlled economy.',
    ]),
    contentSection(
      'token-claim-architecture',
      'Token-claim security architecture — Disabled research',
      [
        'Starville maintains a disabled security research boundary for studying possible future token claims. It covers architecture comparison, treasury threats and reserves, typed eligibility and mock intent states, replay and exactly-once guarantees, disabled signer boundaries, offline instruction planning, and deterministic simulations.',
        'The preferred direction—immutable off-chain eligibility, short-lived bound authorization, reviewed multisig treasury control, and a dedicated on-chain claim program—is not approved. No treasury, signer, live transaction, payout, withdrawal, DUST conversion, or player Claim action exists.',
        'Moving beyond research would require explicit entry criteria, independent security and treasury review, qualified legal and compliance review, geographic decisions, product approval, and a separately reviewed implementation. This roadmap supplies no launch date or promise of token rewards.',
      ],
      [
        {
          type: 'callout',
          tone: 'coming_later',
          title: 'Architecture is not activation',
          text: 'Offline mock planning helps identify unsafe assumptions. It does not authorize a treasury connection, wallet transaction, player claim interface, token payout, or Play-to-Earn release.',
        },
      ],
    ),
    contentSection(
      'future',
      'Future research & development — Planned or Deferred',
      [
        'Future product work may include more private cooperative activities, more worlds, deeper cozy systems, richer homes and farms, additional creator-approved cosmetics, non-financial cosmetic utility, infrastructure scaling, and additional accessibility improvements. Each requires its own scope and review criteria.',
        'Blockchain work remains carefully gated. Disabled claim research does not make token rewards, claims, Play-to-Earn, staking, withdrawals, swaps, marketplaces, auctions, treasury signing, or NFTs into player features. Any later consideration requires stable economy behavior, treasury security planning, qualified legal and compliance review, product approval, and truthful documentation.',
      ],
      [
        {
          type: 'callout',
          tone: 'coming_later',
          title: 'No precise dates yet',
          text: 'The roadmap intentionally uses evidence-backed status instead of speculative release dates. Plans can change as testing, security, art, and community needs evolve.',
        },
      ],
    ),
  ],
});

export const technicalOverviewPage = defineDocumentationPage({
  slug: 'technical-overview',
  route: '/docs/technical-overview',
  title: 'Technical Overview',
  eyebrow: 'A safe view of the architecture',
  description:
    'See how Starville separates presentation, realtime delivery, trusted operations, durable state, and disabled token-claim research without exposing sensitive internals.',
  section: 'Project',
  audience: 'Technical readers',
  status: 'testing',
  icon: 'architecture',
  keywords: [
    'monorepo',
    'Next.js',
    'realtime',
    'Supabase',
    'PostgreSQL',
    'RLS',
    'server authoritative',
    'disabled token claims',
    'offline instruction planning',
    'treasury trust boundary',
    'modular avatars',
    'appearance privacy',
  ],
  related: ['game-status', 'roadmap', 'wallet-and-star'],
  content: [
    contentSection('applications', 'One platform, distinct applications', [
      'Starville is organized as a pnpm and Turborepo monorepo. The landing application provides the public village entrance, wallet-access presentation, How to Play guide, and documentation. The game client renders the isometric world and player interfaces. The administrator portal is a separate protected application for authorized operations staff.',
      'A backend API handles trusted player and administrator workflows. A dedicated realtime server handles live session presence, movement delivery, chat, social events, and cooperative activity events. A worker performs bounded background maintenance and scheduled operations. Shared packages carry validation, contracts, design tokens, game definitions, wallet access, economy logic, and testing helpers.',
      'Separating these applications avoids turning the public website into an administrator surface or the browser into the authority for balances. Shared contracts reduce drift without exposing private staff functions to player navigation.',
    ]),
    contentSection(
      'authority',
      'Authority boundaries',
      [
        'The client owns input and presentation: keyboard movement intent, visible panels, wallet connection, and a player’s request to interact. It can predict or preview safe presentation, but it does not decide final movement, inventory, DUST, party state, activity progress, shop price, or eligibility.',
        'The realtime server owns the active authenticated session, bounded world presence, movement and chat delivery, social event delivery, and live activity events. It does not turn a message from a browser into durable currency without a trusted operation.',
        'The API and other trusted service boundaries authorize player operations, administrator operations, receipt reads, and reviewed configuration workflows. PostgreSQL stores durable accounts, inventories, DUST, social relationships, activities, receipts, configuration versions, and append-only audits.',
      ],
      [
        {
          type: 'table',
          caption: 'High-level authority map',
          columns: ['Boundary', 'Responsible for', 'Never trusted to decide alone'],
          rows: [
            [
              'Client',
              'Input, presentation, wallet connection, interaction intent',
              'Balances, prices, item grants, admin role',
            ],
            [
              'Realtime server',
              'Active session, presence, movement/chat delivery, activity events',
              'Arbitrary durable currency or inventory mutation',
            ],
            [
              'Trusted API/services',
              'Authorized operations, receipts, reviewed configuration workflows',
              'Unverified browser identity or amount',
            ],
            [
              'PostgreSQL',
              'Durable state, constraints, versioned configuration, audits',
              'Public direct mutation outside policy',
            ],
          ],
        },
      ],
    ),
    contentSection('data-security', 'Supabase, PostgreSQL, and access control', [
      'Supabase provides PostgreSQL, authentication, and storage foundations. PostgreSQL Row Level Security (RLS) and backend authorization separate player-owned data, public safe views, and authorized administrator operations. Passing the player token gate does not grant administrator access.',
      'Important currency and receipt records are append-only after completion. Published maps, policies, shop versions, and platform configuration use immutable version history rather than silent in-place edits. Draft, validation, review, approval, scheduling, publication, and rollback are explicit lifecycle concepts.',
      'Official game assets use controlled storage and versioned metadata. World maps remain structured tile, object, collision, spawn, interaction, zone, and version data rather than one flattened image. Avatar definitions pin approved asset versions and closed catalog keys; a browser cannot provide raw asset URLs, scripts, render order, or administrator-only cosmetics. This supports safe updates and predictable client compatibility.',
    ]),
    contentSection('avatar-authority', 'Modular avatar authority and privacy', [
      'The game client owns only staged cosmetic intent and visual preview. Trusted APIs authenticate the player, validate bounded catalog keys and layer compatibility, compare the expected profile revision, and return one authoritative appearance. PostgreSQL preserves one canonical player profile, forced row-level access controls, immutable active content versions, idempotent requests, and append-only administrative audit.',
      'The realtime boundary hydrates a privacy-safe appearance identifier and revision, then broadcasts an appearance-updated event without embedding remote asset URLs in movement messages. Authoritative movement facing and idle, walking, or jogging state drive local and remote animation. An appearance change replaces layers in place and cannot reset position or duplicate the player.',
      'Authorized content staff use the existing World Asset lifecycle and a dedicated Avatar Content workspace for catalog drafts, validation, separated review, explicit approval, activation, superseding, presets, settings, and audit. Navigation visibility never replaces backend permission checks, and player wallet eligibility never grants avatar administration.',
    ]),
    contentSection('wallet', 'Solana wallet verification', [
      'Reown AppKit provides the Solana wallet connection presentation. A one-time challenge proves control of the selected address, and the trusted access boundary checks the configured network, mint, token program, decimals, and raw balance. A short-lived game session records the verified context.',
      'The browser does not submit a trusted eligibility boolean, and an RPC failure is not treated as a zero balance. Current access does not require an on-chain transaction, wallet custody, seed phrase, private key, token approval, or asset transfer.',
    ]),
    contentSection(
      'claim-architecture',
      'Disabled token-claim architecture',
      [
        'Disabled token-claim research is an offline design and testing boundary, separate from current wallet access and off-chain DUST. Typed models describe possible future eligibility, mock claim intent, immutable authorization fields, layered caps, treasury reserves, quarantine, disputes, and exactly-once reconciliation. They create no player entitlement or financial promise.',
        'The game client could only present status and a future intent request; it could never choose reward amount, mint, network, treasury, or eligibility. Trusted services could validate bounded state but could not hold the final treasury signing key. A future authorization boundary would bind recipient, mint, network, amount, policy, nonce, and expiry. No such live authorization or signer exists now.',
        'Offline instruction planning deliberately stops before a recent blockhash, wallet signature, treasury signature, serialized transaction, RPC submission, or confirmation. Fixture treasury and simulation values are labeled Mock or Offline Simulation and never represent live funds. The preferred future model remains pending owner, security, treasury, legal, and compliance review.',
      ],
      [
        {
          type: 'table',
          caption: 'Disabled token-claim trust boundaries',
          columns: ['Boundary', 'May model', 'Cannot do while disabled'],
          rows: [
            [
              'Client and wallet',
              'Public disabled status and existing access proof',
              'Choose a reward or sign a claim transaction',
            ],
            [
              'API, worker, and database',
              'Typed offline state, uniqueness, caps, and receipt concepts',
              'Create live eligibility or sign and submit a payout',
            ],
            [
              'Authorization and signer',
              'Disabled or deterministic mock interfaces',
              'Load a secret, connect a treasury, or produce a live signature',
            ],
            [
              'Solana',
              'Network and instruction-plan validation without RPC',
              'Receive any claim transaction',
            ],
          ],
        },
      ],
    ),
    contentSection('durability', 'Receipts, configuration, and operations', [
      'Currency, item purchase, cooperative completion, gift, trade, and correction operations are designed around idempotent request identities and transactional settlement. A retry resolves to one authoritative outcome. Reconciliation detects mismatches without silently rewriting an account.',
      'Configuration is versioned and reviewed. Published versions remain immutable, and scheduled activation is handled by trusted operations rather than a public browser clock. Audit records capture sensitive changes and remain append-only for normal administration.',
      'Maintenance controls can deny new playable-world entry or pause a module while preserving durable balances and receipts. White-label platform modules allow presentation and selected capabilities to be configured without granting permissions or deleting underlying player data.',
    ]),
    contentSection(
      'privacy',
      'What this overview leaves out',
      [
        'Public architecture explains responsibility without publishing credentials, private database locations, raw access policies, staff recovery paths, internal moderation evidence, private user data, or exact anti-abuse thresholds. Those details would not help a player understand the system and could weaken security.',
        'The overview also keeps future-facing economy and avatar work separate from current player availability. Token reward, claim, signer, and treasury systems are not active.',
      ],
      [
        {
          type: 'callout',
          tone: 'admin_only',
          title: 'Operational controls stay private',
          text: 'Detailed administrator procedures, security recovery, private moderation evidence, and deployment credentials are restricted to authorized staff and contributor runbooks.',
        },
      ],
    ),
  ],
});
