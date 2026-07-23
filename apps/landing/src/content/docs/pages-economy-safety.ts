import { contentSection, defineDocumentationPage } from './helpers';

export const dustEconomyPage = defineDocumentationPage({
  slug: 'dust-economy',
  route: '/docs/dust-economy',
  title: 'DUST Economy',
  eyebrow: 'Game currency, not a token',
  description:
    'Understand off-chain DUST, authoritative balances and receipts, common history entries, and the strict separation from STAR and SOL.',
  section: 'Economy',
  audience: 'Players',
  status: 'local_only',
  icon: 'dust',
  keywords: ['DUST', 'off-chain', 'balance', 'ledger', 'receipt', 'history', 'correction'],
  related: ['village-supply-shop', 'wallet-and-star', 'cooperative-activities'],
  content: [
    contentSection(
      'what-is-dust',
      'What DUST is',
      [
        'DUST is Starville’s ordinary off-chain game currency. It is recorded by trusted Starville services and used for normal in-game purchases and progression. It does not live in a Solana wallet, is not cryptocurrency, and has no guaranteed financial value.',
        'DUST is separate from the configured STAR access token. Holding STAR does not automatically grant a DUST multiplier, and DUST cannot currently be converted to STAR or SOL. DUST is not withdrawable and cannot currently be transferred directly between players, included in an item trade, or placed in an item gift.',
        'Disabled token-claim research does not change that boundary. DUST balances and receipts do not create a player token claim, and no DUST conversion, withdrawal, signer, treasury connection, or on-chain claim transaction exists.',
        'The expanded receipt-backed DUST economy and polished history are coming later. This guide describes their intended player experience and safety boundaries without presenting them as available today. Check Game Status for current availability.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'Off-chain means inside Starville',
          text: 'DUST is server-authoritative game data. It is not a wallet asset, cannot be withdrawn, and cannot currently be exchanged for STAR, SOL, cash, or an NFT.',
        },
      ],
    ),
    contentSection('sources-sinks', 'Earning and spending', [
      'An approved DUST source describes a specific way DUST can be created, such as a starter balance, an eligible Moonpetal Harvest Help completion, a controlled system refund, or an administrative correction credit. Each source has a closed stable key, limits, ownership, lifecycle, and versioned configuration.',
      'An approved DUST sink describes a specific way DUST can be destroyed, such as a Village Supply Shop purchase or a controlled correction debit. The server chooses the amount from the published operation and checks the current policy. The browser cannot invent a source, sink, price, or balance change.',
      'The economy is designed to preserve useful beginner access while controlling repeatable emission and adding meaningful optional spending. Simulations compare planning assumptions, but a planning result does not alter player balances or publish a new policy.',
    ]),
    contentSection(
      'receipts',
      'Balances, ledger entries, and receipts',
      [
        'Every completed DUST change is represented by an append-only ledger entry. It records the operation, direction, amount, balance before, balance after, time, and safe references needed to explain the result. Completed entries cannot be edited or deleted through ordinary operations.',
        'Balances are protected from intentional negative results. A purchase or correction debit that would spend more than the authoritative balance is rejected. Repeating the same accepted request does not apply the credit or debit twice; it returns or preserves the original authoritative result.',
        'Atomic shop settlement means DUST is not deducted without the corresponding item grant, and the item is not granted without the debit. A receipt ties the outcome together. If the network response is delayed, refresh history or the shop state before deciding to retry.',
      ],
      [
        {
          type: 'callout',
          tone: 'tip',
          title: 'Use the receipt when asking for help',
          text: 'Share only the safe public receipt reference shown by the player interface. Do not copy private session data, wallet signatures, or browser authentication information.',
        },
      ],
    ),
    contentSection(
      'history',
      'Reading DUST history',
      [
        'DUST history shows the current balance and recent credits and debits using friendly names. A positive amount means DUST entered the account; a negative amount means DUST was spent. Each entry includes a timestamp and safe receipt details when available.',
        'Common labels include Starter Balance, Moonpetal Harvest Help, Village Supply Shop, System Refund, and Administrative Correction. A starter entry might show +250 DUST, a development Moonpetal completion +15 DUST, and a shop purchase −20 DUST. The exact amount comes from the published configuration and receipt, not the example.',
        'An empty account reads “No DUST activity yet” rather than displaying fabricated history. Refreshing should preserve completed entries and the resulting balance. Internal operation identifiers, database fields, and private staff information do not belong in the player view.',
      ],
      [
        {
          type: 'table',
          caption: 'Friendly DUST history examples',
          columns: ['Entry', 'Direction', 'What it means'],
          rows: [
            ['Starter Balance', '+ DUST', 'A one-time configured beginning balance.'],
            ['Moonpetal Harvest Help', '+ DUST', 'An eligible cooperative completion reward.'],
            ['Village Supply Shop', '− DUST', 'A completed server-priced item purchase.'],
            ['System Refund', '+ DUST', 'A controlled refund tied to a prior operation.'],
            ['Administrative Correction', '+ or − DUST', 'A reviewed, explained, audited repair.'],
          ],
        },
      ],
    ),
    contentSection('integrity', 'Reconciliation and controlled corrections', [
      'Reconciliation compares the account balance with the append-only ledger total. It identifies a balanced account or a mismatch for review; it does not silently rewrite the balance. Operations staff can inspect a verified mismatch and create a bounded correction request when evidence supports one.',
      'A correction requires a player, direction, amount, reason, explanation, and related evidence. Higher-value changes require stronger separation of duties, and an approved correction settles once. Completed corrections remain immutable and visible in the relevant audit history.',
      'Risk signals help authorized reviewers find unusual patterns, but a heuristic alone does not automatically suspend a player. Review states and evidence support a human decision. Exact detection thresholds are intentionally not public because publishing them would weaken fair-play controls.',
    ]),
  ],
});

export const villageSupplyShopPage = defineDocumentationPage({
  slug: 'village-supply-shop',
  route: '/docs/village-supply-shop',
  title: 'Village Supply Shop',
  eyebrow: 'Ordinary goods, authoritative prices',
  description:
    'Browse published offers, review limits and inventory capacity, confirm a DUST purchase, and understand its receipt.',
  section: 'Economy',
  audience: 'Players',
  status: 'local_only',
  icon: 'shop',
  keywords: ['shop', 'purchase', 'price', 'quantity', 'cooldown', 'daily limit', 'inventory full'],
  related: ['dust-economy', 'farming-and-cozy-gameplay', 'troubleshooting'],
  content: [
    contentSection(
      'open-shop',
      'Open and browse the shop',
      [
        'When the polished Village Supply Shop becomes available, use its interaction from the supported world location. The catalog shows the shop identity, shopkeeper or location context, current DUST, and approved active offers. Each card includes an item name, description, image or clearly marked preview art, unit price, quantity controls where supported, purchase limits, cooldown context, and inventory availability.',
        'Only offers in the active published shop version are player-visible. Drafts, validation reports, reviews, schedules, and internal version identifiers stay inside authorized operations. If a shop version is disabled or not yet effective, the player catalog closes safely instead of leaking unpublished offers.',
        'Prices are controlled by the server. Browser text, a stale catalog, or a modified request cannot choose another item or a lower amount. The final operation verifies the active shop, offer, item, quantity, price, limits, inventory, and current DUST again.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Coming later',
          text: 'The polished Village Supply Shop is not part of the current player experience. Game Status will change when it becomes available.',
        },
      ],
    ),
    contentSection(
      'availability',
      'Understand offer states',
      [
        'Available means the current offer can be purchased with the selected quantity under known player state. Not Enough DUST means the authoritative balance cannot cover the total. Inventory Full means the resulting item has no compatible capacity. Daily Limit Reached and Available Again Soon explain configured repeat limits and cooldowns.',
        'Shop Temporarily Closed can mean purchases are paused, the shop is disabled, no published version is active, or the availability window is closed. An offer can also become unavailable between catalog load and confirmation when operations staff safely activate a new reviewed version.',
        'The interface refreshes these states after a purchase, but the server repeats every check at settlement. A visually enabled button is not a guarantee if another concurrent operation has spent DUST or filled the final inventory space.',
      ],
      [
        {
          type: 'table',
          caption: 'Village Supply Shop states',
          columns: ['State', 'Meaning', 'Next step'],
          rows: [
            [
              'Available',
              'Current known state can purchase the offer.',
              'Review the confirmation.',
            ],
            [
              'Not Enough DUST',
              'The balance is below the authoritative total.',
              'Earn DUST or choose a lower supported quantity.',
            ],
            [
              'Inventory Full',
              'No compatible capacity is available.',
              'Free inventory space and refresh.',
            ],
            [
              'Daily Limit Reached',
              'The configured rewarded purchase count is exhausted.',
              'Return after the displayed reset.',
            ],
            [
              'Available Again Soon',
              'A configured cooldown is active.',
              'Wait for the displayed availability.',
            ],
            [
              'Shop Temporarily Closed',
              'Purchases are unavailable for the active shop.',
              'Close the shop and check again later.',
            ],
          ],
        },
      ],
    ),
    contentSection(
      'confirmation',
      'Review the purchase confirmation',
      [
        'Choose an available offer and quantity to open confirmation. Review the item, quantity, total DUST price, current balance, predicted balance after purchase, and inventory availability. The prediction helps you decide; authoritative settlement still determines the final balance.',
        'Purchase submits once and becomes disabled while the result is pending. Cancel returns to the catalog without spending DUST or changing inventory. Closing a preview or confirmation never grants an item, creates a receipt, or records a ledger entry.',
        'If the selected offer changed or became unavailable, Starville rejects the stale request and asks you to refresh. This protects players from buying a different version than the one they reviewed.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Check the item',
              text: 'Read its name, description, quantity, and development-art marker if present.',
            },
            {
              title: 'Check the total',
              text: 'Compare the server-provided total with current DUST and balance after purchase.',
            },
            {
              title: 'Check capacity and limits',
              text: 'Confirm inventory space, purchase limits, and cooldown state.',
            },
            {
              title: 'Purchase once',
              text: 'Submit and wait for Purchase Complete or a friendly failure result.',
            },
          ],
        },
      ],
    ),
    contentSection('result', 'Purchase result and receipt', [
      'Purchase Complete shows the item and quantity received, DUST spent, new balance, and a safe receipt reference. The purchase is atomic: DUST and inventory change together, or neither change completes. Refreshing preserves the item, balance, and receipt.',
      'A repeated request with the same protected identity does not create a second debit or duplicate item. If the first response was interrupted, refresh and inspect DUST history and inventory before trying a new purchase.',
      'Friendly failures include Not enough DUST, Your inventory is full, This offer is no longer available, You reached the purchase limit, The shop is temporarily closed, and Your session needs to be refreshed. Player screens should not expose database messages, request internals, or raw network errors.',
    ]),
    contentSection('limits', 'Limits, cooldowns, and safe retries', [
      'Offer limits and cooldowns are part of the published shop version and economy policy. They can apply to an individual purchase, a day, or another approved window. These controls support fair access and economy balance without allowing the browser to reset counters.',
      'If a limit or cooldown looks stale, close and reopen the catalog after the relevant time. Do not switch devices or change a device clock to bypass a server-controlled window. If the shop is disabled during a pending request, the operation resolves according to the authoritative lock and active version without partial settlement.',
    ]),
  ],
});

export const walletAndStarPage = defineDocumentationPage({
  slug: 'wallet-and-star',
  route: '/docs/wallet-and-star',
  title: 'Wallet & STAR',
  eyebrow: 'Access without custody',
  description:
    'Understand Solana Mainnet Beta access verification, the configured STAR requirement, wallet safety, and why token claims remain disabled.',
  section: 'Wallet & safety',
  audience: 'Players',
  status: 'available',
  icon: 'wallet',
  keywords: [
    'Solana',
    'Mainnet Beta',
    'STAR',
    '1000',
    'Reown',
    'signature',
    'eligibility',
    'disabled token claims',
    'offline architecture',
    'treasury',
  ],
  related: ['getting-started', 'player-safety', 'dust-economy'],
  content: [
    contentSection(
      'relationship',
      'What STAR does today',
      [
        'STAR is the configured Solana token used for launch access eligibility. The current network is Solana Mainnet Beta, and the approved threshold is 10,000 STAR display tokens. Starville checks the selected wallet’s balance of the configured mint.',
        'The token remains in the player’s wallet. Ordinary access verification does not automatically spend, transfer, approve, lock, stake, or burn STAR. It does not request SOL, an NFT, or a token payment. Disconnecting the wallet also does not move an asset.',
        'STAR is not DUST. It does not currently provide a DUST multiplier, stronger tools, faster crop growth, guaranteed rewards, income, yield, profit, or investment return. Carefully reviewed non-financial utility may be researched later, but no token reward or on-chain claim flow is active.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Starville never asks for a seed phrase',
          text: 'Never type or paste a seed phrase, recovery phrase, private key, wallet password, or authentication token into Starville or send it to someone offering support.',
        },
      ],
    ),
    contentSection('connection', 'Wallet connection with Reown', [
      'The landing page uses Reown AppKit’s Solana connection layer to present compatible wallet choices available in the player’s environment. Support can depend on the browser, installed wallet, device, and current AppKit capabilities, so this guide does not promise a specific provider.',
      'Choose Play Now, select a wallet, and review the connected address. You can copy the shortened address, change wallets, or disconnect from the access flow. The selected network must match the current Solana configuration. An unsupported network or wrong mint cannot satisfy eligibility.',
      'Connection lets the site request a signature and read the public address needed for verification. It does not reveal the wallet’s recovery information or give Starville custody of the wallet.',
    ]),
    contentSection('ownership-message', 'The one-time ownership message', [
      'After connection, Starville requests a short-lived challenge. The message includes the selected wallet address, official application domain, intended action, network, creation time, expiration, and a unique one-time value. Read it before signing.',
      'Signing proves control of the address for that access attempt. It is not a Solana transaction and should not contain an instruction to transfer or approve assets. The backend verifies the signature, expiration, address, domain, network, and one-time use before it checks eligibility.',
      'A challenge expires and cannot be reused. If signing takes too long, the access screen asks for a fresh challenge. Do not approve an old prompt from an unknown tab, different domain, different wallet, or unexpected action.',
    ]),
    contentSection('eligibility', 'How eligibility is checked', [
      'The trusted access service loads the active token configuration, queries the configured Solana network, finds accounts owned by the wallet for the configured mint and token program, and compares the summed raw balance with the required amount. The browser does not declare itself eligible.',
      'A missing token account, zero balance, insufficient balance, invalid signature, expired challenge, reused challenge, network mismatch, or unsupported token configuration produces a specific safe result. A temporary RPC or balance-check failure is shown as a verification problem, not a false zero balance or an insufficient-balance decision.',
      'Eligibility may need to be refreshed after the configured interval, a session expiry, a configuration change, an account-risk change, or a future high-value action. A short-lived game session carries the latest verified context without turning local storage into proof of access.',
    ]),
    contentSection(
      'claims-disabled',
      'Access verification is not token claiming',
      [
        'Starville maintains a disabled research boundary for evaluating a possible future claim model. It includes typed eligibility and intent concepts, a treasury threat model, disabled and mock signer boundaries, offline instruction planning, and deterministic fixture simulations. These are design and test tools—not player reward functionality.',
        'Token claims are disabled. There is no player token reward, Claim button, withdrawal, DUST conversion, connected treasury, live signer, live blockhash, wallet transaction request, submitted transaction, or payout. Ordinary access still asks only for its human-readable ownership message and never asks for a seed phrase, recovery phrase, or private key.',
        'The preferred future direction is only a recommendation for review: immutable off-chain eligibility, short-lived authorization bound to recipient, mint, network, amount, policy, nonce, and expiry, reviewed multisig treasury control, and a dedicated on-chain claim program. Owner, security, treasury, legal, and compliance review would all be required before a later prototype or player action could be considered.',
      ],
      [
        {
          type: 'table',
          caption: 'Current and future wallet boundaries',
          columns: ['Boundary', 'Current status', 'What it means'],
          rows: [
            [
              'Wallet access verification',
              'Available',
              'A one-time ownership message and trusted configured-token check; not a transaction.',
            ],
            [
              'Off-chain DUST',
              'Coming later',
              'Server-authoritative game currency with no withdrawal or token conversion.',
            ],
            [
              'Disabled claim research',
              'Disabled',
              'Offline plans, mock states, fixture simulations, and no connected signer or treasury.',
            ],
            [
              'Future token claiming',
              'Research only',
              'Requires product, security, treasury, legal, compliance, and explicit approval.',
            ],
          ],
        },
        {
          type: 'callout',
          tone: 'important',
          title: 'No claim transaction is required',
          text: 'If any current Starville access flow asks you to claim, withdraw, transfer, approve, or connect to receive a reward, reject it and leave the page. That is not part of Starville’s current access flow.',
        },
      ],
    ),
    contentSection(
      'dust-star',
      'DUST and STAR stay separate',
      [
        'DUST is off-chain server-authoritative game currency for ordinary progression. It is not held by the wallet, cannot be withdrawn, and cannot currently be converted to STAR or SOL. A Village Supply Shop purchase uses DUST only and should not open a wallet transaction prompt.',
        'STAR currently supports access eligibility only. Token rewards, Play-to-Earn, staking, withdrawals, on-chain claims, token-to-DUST conversion, and NFT transfer are disabled or deferred. Security research does not activate any of them, and a roadmap or recommendation is not an active financial product.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'DUST Economy',
              href: '/docs/dust-economy',
              description: 'Learn how ordinary game-currency balances, receipts, and history work.',
            },
            {
              label: 'Player Safety',
              href: '/docs/player-safety',
              description: 'Review wallet prompts, domains, social offers, and account safety.',
            },
          ],
        },
      ],
    ),
  ],
});

export const playerSafetyPage = defineDocumentationPage({
  slug: 'player-safety',
  route: '/docs/player-safety',
  title: 'Player Safety',
  eyebrow: 'Protect your wallet and your peace',
  description:
    'Use official access routes, review wallet and trade prompts, protect personal information, and respond safely to suspicious behavior.',
  section: 'Wallet & safety',
  audience: 'Players',
  status: 'testing',
  icon: 'shield',
  keywords: [
    'wallet safety',
    'seed phrase',
    'private key',
    'trade safety',
    'chat safety',
    'report',
  ],
  related: ['wallet-and-star', 'chat-and-safety', 'gifts-and-trading'],
  content: [
    contentSection(
      'wallet-safety',
      'Wallet safety',
      [
        'Verify that you are using an official Starville route before connecting. Check the full domain, avoid links from unsolicited direct messages, and review every wallet prompt. Ordinary access asks for a human-readable ownership signature and eligibility check; it does not require sending tokens or approving a token transfer.',
        'Never share a seed phrase, recovery phrase, private key, wallet password, authentication token, or copied browser session. Legitimate Starville support does not need them. A person who receives this information can take control of accounts or assets even if they claim they are only diagnosing a problem.',
        'Disconnect suspicious sessions from the wallet’s own trusted interface and close unfamiliar tabs. If a prompt describes a transfer, approval, stake, claim, swap, bridge, or NFT action during ordinary access, reject it. Starville does not currently use those flows.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Stop on an unexpected transaction',
          text: 'The current Starville access flow requires no blockchain transaction. Reject any unexpected asset movement or approval request and verify the domain before continuing.',
        },
      ],
    ),
    contentSection('trade-safety', 'Gift and trade safety', [
      'Keep the full exchange inside Starville’s official item trade panel. Review every item and quantity after the latest change. When either side changes an offer, confirmations clear so that both players must approve the new version.',
      'Only eligible ordinary items can move. DUST, STAR, SOL, NFTs, cash, protected items, permanent starter items, and temporary activity items are not supported trade content. Do not trust an external promise to pay after a Starville item is delivered.',
      'Cancel if the other player pressures you, changes an offer repeatedly, asks you to move to an unofficial site, or requests private account information. Blocking prevents incompatible new social interactions; a cancelled or expired exchange releases its item reservations.',
    ]),
    contentSection('chat-privacy', 'Chat and personal privacy', [
      'Treat Nearby, Channel, and Party chat as shared spaces. Do not post an email address, home address, legal identity, school, workplace, financial information, wallet recovery information, or private authentication data. A public display name should not contain those details either.',
      'Mute reduces what you see. Block prevents incompatible social contact. Report preserves the selected message and review context for moderation. System messages are game-authored and visually identified; an ordinary player cannot legitimately impersonate that scope.',
      'Public player inspection is intentionally narrow. It may show a display name, level, appearance, safe world or channel context, and permitted party state. It does not show email, wallet address, private inventory, DUST balance, token holdings, session information, moderation details, block reasons, or staff notes.',
    ]),
    contentSection('account-safety', 'Account and session safety', [
      'Use one active play tab for the same player when possible. Multiple tabs can replace a realtime connection or create confusion about which interface holds the current state. If a session is interrupted, refresh from an official route and retrieve authoritative state rather than copying credentials between tabs.',
      'Maintenance notices can temporarily prevent entry or a gameplay operation without changing wallet ownership or saved data. Read the notice, expected return information, and safe public action. No genuine maintenance page needs private wallet recovery material.',
      'If you report a technical problem, include the public route, visible message, device and browser type, approximate time, and safe receipt reference where applicable. Remove wallet signatures, full authentication data, and private user information from screenshots.',
    ]),
    contentSection(
      'suspicious-behavior',
      'Respond to suspicious behavior',
      [
        'Leave an unsafe interaction, mute or block the player, and report the relevant message through the official control. For a suspicious wallet prompt, reject it first; do not continue merely to collect evidence. Preserve only safe context that does not reveal credentials.',
        'Starville can use risk signals and moderation review, but heuristics alone should not automatically determine guilt. Reports, evidence, review states, and account actions follow controlled staff workflows. Exact anti-abuse thresholds and internal evidence are not public.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Chat safety controls',
              href: '/docs/chat-and-safety',
              description: 'Learn when to mute, block, or report a message.',
            },
            {
              label: 'Troubleshooting',
              href: '/docs/troubleshooting',
              description: 'Resolve common problems without exposing secrets.',
            },
          ],
        },
      ],
    ),
  ],
});

export const troubleshootingPage = defineDocumentationPage({
  slug: 'troubleshooting',
  route: '/docs/troubleshooting',
  title: 'Troubleshooting',
  eyebrow: 'Calm checks before a retry',
  description:
    'Resolve common wallet, access, connection, presence, chat, social, activity, and shop problems without exposing private information.',
  section: 'Help',
  audience: 'Players',
  status: 'testing',
  icon: 'tools',
  keywords: [
    'wallet not connect',
    'access denied',
    'reconnecting',
    'player missing',
    'purchase failed',
  ],
  related: ['getting-started', 'player-safety', 'game-status'],
  content: [
    contentSection('wallet', 'Wallet will not connect', [
      'Refresh the official landing page, unlock the wallet, and open Play Now again. Confirm that the wallet is available for Solana through the current browser or device and that Mainnet Beta is selected. If the wallet selector opens in another window or device, finish there and return to the original tab.',
      'Disconnect and reconnect safely if the wrong address is selected. Reject any prompt that asks for a recovery phrase, private key, token transfer, or approval. A supported wallet can still be unavailable in a particular browser environment, so try an officially supported configuration rather than submitting private details to a helper.',
    ]),
    contentSection('access', 'Access is not granted', [
      'Compare the connected address, Solana Mainnet Beta, configured token mint, and required amount shown by the access screen. The approved threshold is 10,000 STAR display tokens, and the live reviewed configuration is authoritative. Make sure the eligible token belongs to the selected wallet rather than another address.',
      'Use Check Again after confirming the state. A recent token-account update can take time to become visible. A temporary network or balance-check error is not the same as insufficient balance; wait and retry rather than assuming Starville measured zero.',
      'If a signed message expired, request a fresh access attempt. Do not reuse an old wallet prompt, change browser eligibility values, or send tokens to someone claiming they can activate the account.',
    ]),
    contentSection('connection', 'The game says Reconnecting', [
      'Wait briefly with the tab active and check the internet connection. Starville attempts to restore realtime presence and eligible social or activity state. Avoid submitting new gifts, trades, shop purchases, or activity completions until the status returns to Connected.',
      'If Connection Interrupted persists, refresh the official game route once. Use a single active tab for that player. A refreshed client retrieves authoritative durable state, so do not assume a delayed result failed and repeat it without checking.',
    ]),
    contentSection('presence-chat', 'Another player or message is missing', [
      'For a missing player, confirm that both players are in the same world and marked channel. Move close enough when testing Nearby Players, check that neither player blocked the other, and allow presence to settle after switching channels or reconnecting.',
      'For a missing chat message, confirm Nearby, Channel, Party, or System scope. Nearby requires sufficient proximity, Channel requires the same channel, and Party requires an active shared party. Check mute, block, sending restrictions, message validity, and current connection status.',
      'Do not compare a stale screenshot with a new session as proof of duplicate presence. Refresh both clients, enter one active session per player, and compare the current marked world and channel.',
    ]),
    contentSection('social', 'Gift, trade, or party invitation is unavailable', [
      'Move the players closer and confirm the same required world and channel. Check for an active block, incompatible existing interaction, account restriction, disconnected state, or expired invitation. A player can belong to only one active party, and the current default party capacity is four.',
      'For gifts and trades, confirm that the selected quantity is available, unreserved, ordinary, and explicitly eligible. Protected, permanent starter, and temporary activity items cannot move. The receiving inventory must have compatible capacity.',
      'If an old settlement is still pending, wait or refresh authoritative state. Do not create a second request from another tab to force the first one through.',
    ]),
    contentSection('activity', 'An activity cannot start or continue', [
      'Moonpetal Harvest Help currently expects two to four eligible party members. Confirm that the activity is published and enabled for the deployed environment, the leader is preparing it, all required members answered a current ready check, entry cooldowns have cleared, and maintenance is not active.',
      'Inside the activity, follow the current shared objective. A later interaction cannot complete before seed gathering, plot preparation, planting, watering, growth, harvest, and delivery reach their valid states. Temporary activity items never appear in permanent inventory.',
      'After reconnect, wait for the existing instance to restore. If too few eligible participants remain or the run fails, no completion reward is granted. Do not begin another run solely because the first reward response was delayed.',
    ]),
    contentSection(
      'purchase',
      'A Village Supply Shop purchase failed',
      [
        'Check current DUST, total price, inventory capacity, offer availability, purchase limits, cooldown, shop state, and session freshness. Refresh the catalog if the offer changed. The server can reject a request that looked available when a concurrent purchase used the final balance or inventory slot.',
        'A safe retry begins by checking inventory, DUST history, and the receipt result. A completed purchase persists through refresh and should show one debit and one item grant. Do not press Purchase repeatedly while the action is pending.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Share safe context only',
          text: 'A support report can include the visible error and safe receipt reference. Never include a recovery phrase, private key, wallet signature, authentication header, or copied browser token.',
        },
      ],
    ),
  ],
});
