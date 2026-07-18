import { contentSection, defineDocumentationPage } from './helpers';

export const multiplayerPage = defineDocumentationPage({
  slug: 'multiplayer',
  route: '/docs/multiplayer',
  title: 'Multiplayer',
  eyebrow: 'Share a world, not a crowd',
  description:
    'Understand presence, world channels, connection recovery, nearby interactions, and the boundary between realtime display and durable state.',
  section: 'Multiplayer',
  audience: 'Players',
  status: 'owner_tested',
  icon: 'players',
  keywords: ['presence', 'channel', 'reconnecting', 'nearby players', '40 players'],
  related: ['character-customization', 'chat-and-safety', 'friends-and-parties'],
  content: [
    contentSection('presence', 'Who appears in your world', [
      'Realtime presence represents active villagers in the same world and channel. When another player enters, their safe public character information and current world position can appear. When they leave, change worlds, switch channels, or lose the session, their character is removed after the appropriate connection handling.',
      'A player in another world should not appear beside you. A player in another channel is in a separate copy of the same map and should not appear either. Social state is broader than physical presence: a friend or party member can remain listed while elsewhere, but nearby-only interactions wait until both players meet the required proximity and session conditions.',
      'Starville avoids duplicate character entities by tying a live presence to an authenticated game session and channel. Opening the same player in multiple browser sessions can still cause a newer connection to replace an older one. Use one active play tab when testing movement and social interactions.',
    ]),
    contentSection(
      'channels',
      'World channels',
      [
        'Channels keep a busy world readable by separating presence into bounded groups. The status dock marks your current channel and shows population for available alternatives. Choosing a new channel changes nearby villagers and channel chat, but it does not duplicate your character, reset inventory, or create a second player account.',
        'The current configured target is approximately 40 active characters per authenticated channel. This is a deployment target rather than a promise that every environment always uses exactly that number. A full or unavailable channel cannot be selected. If a switch is accepted, wait for the current presence to settle before starting a proximity-dependent action.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'Match both world and channel',
          text: 'When meeting a friend, compare the location and marked channel. Being in Lantern Square is not enough if the channel numbers differ.',
        },
      ],
    ),
    contentSection('movement-delivery', 'Realtime movement', [
      'Your browser captures movement input and presents a responsive local character. The realtime boundary validates the active session and delivers bounded movement updates to nearby players. Other clients interpolate those updates so remote movement looks smooth instead of jumping between every network message.',
      'Realtime display is not permission to choose arbitrary coordinates, travel through collision, or enter an unrelated world. Durable world position and transitions still use trusted validation. A temporary network delay can make a remote character pause or catch up; it should not grant extra movement or create permanent copies.',
      'Core presence and realtime movement are available now. Reconnect edges and broader social lifecycle refinements continue, so use the recovery guidance below whenever an interruption leaves a result uncertain.',
    ]),
    contentSection('appearance-sync', 'Realtime character appearance', [
      'The coming-later character system is designed to add a privacy-safe resolved appearance identifier and revision to presence. Nearby clients hydrate approved modular layers from trusted catalog keys, then animate the same authoritative facing and idle, walk, or jog movement state. Movement payloads do not carry browser asset URLs or private profile fields.',
      'When a player saves a Wardrobe change, an appearance-updated event replaces the rendered layers in place. Position, channel membership, and the remote entity identity remain stable, preventing a cosmetic change from teleporting or duplicating the villager. Reconnect and world-switch hydration restore the latest authoritative revision.',
      'Shared modular appearance updates are coming later. Existing presence and movement remain available without implying that the future character creator or Wardrobe is already part of the current game.',
    ]),
    contentSection('nearby', 'Nearby Players', [
      'Open Nearby Players to see villagers close enough for the current interaction range. The list uses natural proximity, not a promise that every person visible on screen can be reached. Select a player to see available actions such as Inspect, Add Friend, Invite to Party, Send Gift, Request Trade, Mute, or Block.',
      'Not every action is always enabled. A player may be too far away, busy in another settlement, blocked, restricted, already trading, already in a party, or part of a full party. Some interactions require the same world and channel for their entire lifecycle; moving away or switching can cancel or invalidate them safely.',
      'Inspection is designed around safe public information: display name, level, appearance, and limited world, channel, or party context where permitted. It does not expose email, wallet address, private inventory, DUST balance, token holdings, session data, moderation details, block reasons, or staff notes.',
    ]),
    contentSection(
      'recovery',
      'Connection recovery',
      [
        'Connected is the normal state. Reconnecting means the client is attempting to restore the current session after a brief interruption. Connection Interrupted means realtime delivery is unavailable and social actions should not be assumed delivered. Starville may restore presence, party state, and an eligible activity state after reconnect.',
        'Keep the tab visible and wait briefly. If recovery does not complete, check the internet connection and refresh once. Refreshing retrieves authoritative state, so a completed gift, trade, activity, or shop operation should not be repeated merely because the first screen response was delayed.',
      ],
      [
        {
          type: 'links',
          links: [
            {
              label: 'Troubleshooting connections',
              href: '/docs/troubleshooting',
              description: 'Find safe steps for missing players, reconnecting, and chat delivery.',
            },
          ],
        },
      ],
    ),
  ],
});

export const chatAndSafetyPage = defineDocumentationPage({
  slug: 'chat-and-safety',
  route: '/docs/chat-and-safety',
  title: 'Chat & Safety',
  eyebrow: 'Kind conversation, clear boundaries',
  description:
    'Choose the right chat scope, understand delivery and moderation, and use mute, block, and report controls safely.',
  section: 'Multiplayer',
  audience: 'Players',
  status: 'owner_tested',
  icon: 'chat',
  keywords: ['Nearby chat', 'Channel chat', 'Party chat', 'System', 'mute', 'block', 'report'],
  related: ['multiplayer', 'player-safety', 'friends-and-parties'],
  content: [
    contentSection(
      'scopes',
      'Choose a conversation scope',
      [
        'Press Enter when gameplay input is available or use the Chat button to open Village chat. Tabs separate Nearby, Channel, Party, and System messages. The composer shows the selected scope before you send, so check it when a conversation is meant for a particular group.',
        'Nearby is for players close enough to participate in local conversation. Channel reaches active players in the same channel. Party reaches members of your active party even when party members are in another world or channel where supported. System is reserved for game-authored connection, village, and activity notices; ordinary players cannot send a System message.',
      ],
      [
        {
          type: 'table',
          caption: 'Current chat scopes',
          columns: ['Scope', 'Audience', 'Useful for'],
          rows: [
            [
              'Nearby',
              'Players close enough in the current world',
              'Introductions and local coordination',
            ],
            [
              'Channel',
              'Players in the current channel',
              'World-wide conversation for that channel',
            ],
            ['Party', 'Members of the active party', 'Ready checks and cooperative coordination'],
            ['System', 'Game-authored information', 'Connection, safety, and activity notices'],
          ],
        },
      ],
    ),
    contentSection('sending', 'Writing and receiving messages', [
      'Messages are short, player-friendly chat lines rather than long-form posts. The composer shows the remaining space and prevents an oversized message. Starville sanitizes text, applies a bounded sending rate, and can reject messages that are empty, invalid, too frequent, or unavailable in the selected scope.',
      'Typing suppresses movement input, so WASD and other gameplay keys become text while the composer is focused. Press Escape to close the composer or chat panel safely. Unread counters identify tabs with new messages. Optional local timestamps can be enabled in Settings.',
      'A reconnect can restore a bounded recent history associated with the current live chat context, while entering a fresh session may start with an empty chat view. Chat is not a permanent public archive for players, although moderation may preserve evidence required to review a report.',
    ]),
    contentSection('personal-controls', 'Mute and block', [
      'Mute hides a player’s ordinary messages from your view without telling the sender that you muted them. Use it when you want less noise but do not need to prevent interaction. Unmute restores eligible future messages; it does not recreate messages that were not shown while muted.',
      'Block is the stronger personal safety boundary. It prevents incompatible new social requests and can invalidate supported interactions between the two players. A block does not expose a reason to the other player. Unblocking does not automatically recreate a friendship, party invitation, gift, or trade that was cancelled.',
      'Safety preferences are tied to the player account and should remain authoritative across a refresh. If an unwanted player still appears after a block, allow the current panel and presence state to refresh before assuming the action failed.',
    ]),
    contentSection(
      'reporting',
      'Report harmful chat',
      [
        'Open the safety menu on the relevant player message and choose Report. Select the closest category, then provide a concise explanation if requested. Report the message that contains the behavior rather than copying private account information into a different channel.',
        'Reports can cover harassment, hateful or abusive language, spam, scams or suspicious links, impersonation, sexual content, and other policy concerns. A report creates a reviewable moderation record; it does not guarantee an immediate automated punishment. Human review and broader context may be needed.',
        'Do not announce or coordinate retaliatory reporting. Use mute or block for immediate personal control, leave the conversation if needed, and preserve only the information the official report flow requests.',
      ],
      [
        {
          type: 'callout',
          tone: 'safety',
          title: 'Keep personal information out of chat',
          text: 'Do not post a wallet recovery phrase, private key, email login, home address, authentication token, or private moderation information in any chat scope.',
        },
      ],
    ),
    contentSection('status', 'Availability and safe reporting', [
      'Core realtime chat is available now. Some unusual report, reconnect, restriction, and incompatible-state paths continue to be refined, so a moderation control may occasionally need a refresh or a careful report.',
      'If a moderation control behaves unexpectedly, capture the public display name, approximate time, selected scope, visible error, and safe steps to reproduce. Never include private credentials or copied access headers in a community report.',
    ]),
  ],
});

export const friendsAndPartiesPage = defineDocumentationPage({
  slug: 'friends-and-parties',
  route: '/docs/friends-and-parties',
  title: 'Friends & Parties',
  eyebrow: 'Gather a small circle',
  description:
    'Manage persistent friendships, form a four-player party, use ready checks, and understand leadership during reconnects.',
  section: 'Multiplayer',
  audience: 'Players',
  status: 'testing',
  icon: 'party',
  keywords: [
    'friend request',
    'party invite',
    'leader',
    'ready check',
    'four players',
    'reconnect',
  ],
  related: ['multiplayer', 'cooperative-activities', 'gifts-and-trading'],
  content: [
    contentSection(
      'friends',
      'Friend requests and friendships',
      [
        'Send a friend request from an eligible Nearby Players action or another supported social view. The recipient can accept or decline it, and the sender can cancel an outgoing request while it is pending. Requests are bounded and may expire so that old invitations do not accumulate forever.',
        'An accepted friendship persists beyond the live world session. The friends list can show safe online, world, or channel context when that information is permitted. It never exposes a friend’s email, wallet address, private inventory, DUST balance, token holdings, or moderation record.',
        'The current maximum is 100 friends, with bounded incoming and outgoing requests. A request is unavailable when the two players are already friends, a compatible request already exists, either side has blocked the other, an account restriction applies, or a bounded list has reached capacity.',
      ],
      [
        {
          type: 'steps',
          items: [
            { title: 'Find a villager', text: 'Move close enough and open Nearby Players.' },
            { title: 'Send the request', text: 'Choose Add Friend when the action is available.' },
            {
              title: 'Wait for a decision',
              text: 'The other player can accept or decline; you can cancel while pending.',
            },
            {
              title: 'Use the friends list',
              text: 'Invite an eligible friend to a party or review safe presence information.',
            },
            {
              title: 'Remove when needed',
              text: 'Removing a friend ends the relationship but does not block the player.',
            },
          ],
        },
      ],
    ),
    contentSection('creating-party', 'Create or join a party', [
      'A party is a persistent small group for conversation and private cooperative activities. The current default capacity is four members, and each player can belong to only one active party. One member is the leader; the others have member status.',
      'Create a party from Friends & Party, then invite an eligible friend or nearby villager. The recipient can accept or decline. A player already in another party, a blocked player, a restricted account, an expired invitation, or a full party cannot join through that invitation.',
      'Party chat remains useful when members travel to different worlds or channels. Physical interactions can still require shared world presence, so party membership alone does not make a distant player nearby or bypass an activity’s entry rules.',
    ]),
    contentSection('leadership', 'Leader responsibilities', [
      'The leader manages invitations, can remove an eligible member, can promote another member, can begin ready checks, and prepares supported cooperative activities. A leader can disband the party; an ordinary member can leave. Destructive actions require clear intent and update the whole party state.',
      'Promotion transfers leadership to the selected current member. Kicking removes a member without placing them in another party. Disbanding ends the party for everyone, including Party chat and any preparation that depends on the party. Review the confirmation before using a leadership action.',
      'If the leader’s connection is interrupted, the party briefly keeps the leader’s position. If the leader does not return within the configured grace period, leadership may pass safely to another connected member. This avoids immediately reshuffling a party during a short network hiccup while preventing an absent leader from blocking the group indefinitely.',
    ]),
    contentSection(
      'ready-checks',
      'Ready checks',
      [
        'A ready check asks each connected member to answer Ready or Not Ready before an activity or group decision. The current question and responses appear in the party interface. The leader starts the check, but cannot answer on another member’s behalf.',
        'Membership changes, expiry, cancellation, or a new check can end the old check. A ready response belongs to that exact current check; refreshing should retrieve the authoritative response rather than creating multiple votes. Being marked Ready does not automatically enter an activity or spend an item.',
        'Before preparing Moonpetal Harvest Help, confirm that the party contains the required eligible players and that each member is ready. The activity then locks its own participant roster and state separately from the general ready check.',
      ],
      [
        {
          type: 'callout',
          tone: 'tip',
          title: 'Use Party chat before Ready',
          text: 'Confirm that everyone has finished shopping or changing worlds, then start a fresh ready check for the activity you actually intend to play.',
        },
      ],
    ),
    contentSection('status', 'Availability and recovery', [
      'Friends, parties, Party chat, ready checks, reconnect restoration, and leadership transfer may have limited availability while refinements continue. They are not public matchmaking: a party begins through direct social invitations, and a private activity uses the party’s eligible roster.',
      'If party state looks stale after reconnecting, wait for the connection to return, close and reopen Friends & Party, and avoid accepting the same invitation from multiple tabs. A refreshed client should reconcile to one authoritative active party.',
    ]),
  ],
});

export const giftsAndTradingPage = defineDocumentationPage({
  slug: 'gifts-and-trading',
  route: '/docs/gifts-and-trading',
  title: 'Gifts & Trading',
  eyebrow: 'Generosity with a clear receipt',
  description:
    'Share eligible ordinary items through server-authoritative gifts and mutually confirmed trades, with no currency or blockchain transfers.',
  section: 'Multiplayer',
  audience: 'Players',
  status: 'testing',
  icon: 'gift',
  keywords: ['gift', 'trade', 'reservation', 'confirmation', 'protected item', 'safety'],
  related: ['friends-and-parties', 'player-safety', 'dust-economy'],
  content: [
    contentSection(
      'gift-flow',
      'Send an item gift',
      [
        'Both players must be eligible, active, and close enough in the required world and channel state. Open Nearby Players, select the recipient, choose Send Gift, and select an eligible ordinary inventory item and quantity. Review the recipient and item before submitting the offer.',
        'The server reserves the offered quantity while the gift is pending. The recipient can accept or decline, and the sender can cancel where supported. Acceptance settles the transfer atomically: the item leaves the sender and reaches the recipient as one authoritative result. Accepting or retrying twice does not duplicate it.',
        'Cancelled, declined, invalidated, or expired gifts release their reservations. If the recipient has no compatible inventory capacity, the gift cannot settle. Refreshing retrieves the final result rather than treating a delayed response as permission to send another copy.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'Gifts contain ordinary items only',
          text: 'DUST gifting is not available. Gifts cannot carry STAR, SOL, NFTs, wallet assets, or an external promise of payment.',
        },
      ],
    ),
    contentSection('eligible-items', 'Items that can and cannot move', [
      'An ordinary item must be explicitly eligible for gifting or trading. Protected items, permanent starter items, and temporary cooperative-activity items cannot be transferred. An item can also be unavailable because it is already reserved by another pending interaction or because the current item definition disables that action.',
      'Activity seed bundles and harvest bundles stay inside their private activity state and never become permanent inventory. This prevents temporary objective items from escaping into the normal economy. A protected tool or starter object likewise remains with the account for which its lifecycle was designed.',
      'The browser cannot turn an ineligible item into an eligible one by changing a form, quantity, or request. The trusted inventory and item definition are checked at settlement time, including after both players have made a selection.',
    ]),
    contentSection(
      'trade-flow',
      'Complete a safe trade',
      [
        'A trade is a mutually accepted exchange of eligible ordinary items. Request a trade from Nearby Players, wait for acceptance, then add items to your side of the offer. Each participant sees both current offers before deciding whether to confirm.',
        'When either player changes an offer, both confirmations are cleared. This is a critical safety rule: a confirmation belongs only to the exact offer that was visible at that moment. Both players must confirm the latest unchanged offer before the server settles the exchange atomically.',
        'After settlement, refresh can retrieve the authoritative result. A cancelled, expired, blocked, or invalidated trade releases reserved quantities. Moving out of required proximity, changing world or channel, or losing an eligible session can invalidate an unfinished trade safely.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Request',
              text: 'Choose Request Trade while the other player is eligible and close enough.',
            },
            {
              title: 'Build both offers',
              text: 'Each player adds only eligible ordinary items and quantities they own.',
            },
            {
              title: 'Review',
              text: 'Read both sides, including every quantity, after the latest change.',
            },
            {
              title: 'Confirm',
              text: 'Confirm the current revision. A later change clears this confirmation.',
            },
            {
              title: 'Settle',
              text: 'When both current offers are confirmed, the server applies the complete exchange once.',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'safety',
          title: 'Always review the latest offer',
          text: 'Do not rely on a chat promise, old screenshot, or earlier quantity. A changed offer requires a new review and new confirmation from both players.',
        },
      ],
    ),
    contentSection('not-tradable', 'No currency or blockchain trading', [
      'Current Starville trades do not support DUST, STAR, SOL, NFTs, wallet assets, cash, or external services. DUST is not player-transferable in this version. The wallet-access signature does not authorize an item trade, and an item trade never asks a wallet to sign a blockchain transaction.',
      'Do not accept an external promise that someone will pay after receiving an in-game item. Starville cannot make an off-platform promise safe or settle a dispute involving an unsupported exchange. Keep the complete offer inside the official trade panel.',
    ]),
    contentSection(
      'unavailable',
      'Why an action may be unavailable',
      [
        'A gift or trade can be unavailable because a player is too far away, in another world or channel, busy in another interaction, blocked, restricted, disconnected, or already part of an incompatible pending settlement. Inventory capacity, item eligibility, and existing reservations can also prevent a transfer.',
        'Move closer, confirm the shared world and channel, close any old interaction, check the item type, and allow expired state to clear. If a result is uncertain after a connection interruption, refresh before starting a new transfer. Never retry by changing browser data or exposing account credentials.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Availability can vary',
          text: 'Gifting and trading may not appear in every current game version. When available, reservations and settlement remain server-authoritative.',
        },
      ],
    ),
  ],
});

export const cooperativeActivitiesPage = defineDocumentationPage({
  slug: 'cooperative-activities',
  route: '/docs/cooperative-activities',
  title: 'Cooperative Activities',
  eyebrow: 'A shared task for a prepared party',
  description:
    'Prepare a private party for Moonpetal Harvest Help, complete shared objectives, and understand configurable reward examples and limits.',
  section: 'Multiplayer',
  audience: 'Players',
  status: 'testing',
  icon: 'moonpetal',
  keywords: ['Moonpetal Harvest Help', 'activity', 'ready check', 'party', '15 DUST', 'Moonbeans'],
  related: ['friends-and-parties', 'farming-and-cozy-gameplay', 'dust-economy'],
  content: [
    contentSection(
      'framework',
      'How cooperative activities work',
      [
        'The current activity framework begins with a private party, not public matchmaking. The leader selects an enabled activity, confirms that the party meets its size and eligibility rules, and prepares a run. Members complete a ready flow before entering the private activity instance.',
        'Entry locks the eligible participant roster for that run. Public-world players are not part of the activity merely because they stand nearby. Progress belongs to the instance and is controlled by validated interactions, shared objectives, server time, and the current activity configuration.',
        'A temporary interruption can restore a participant to the current activity. The run may continue when enough eligible participants remain, or fail according to its rules. Success creates one completion result for each eligible participant; failure grants no completion reward.',
      ],
      [
        {
          type: 'callout',
          tone: 'status',
          title: 'Private parties only',
          text: 'Public activity matchmaking is not currently available. Create or join a party before preparing Moonpetal Harvest Help.',
        },
      ],
    ),
    contentSection(
      'moonpetal',
      'Moonpetal Harvest Help',
      [
        'Moonpetal Harvest Help is a non-combat cooperative activity for two to four players. The party helps prepare and deliver a community Moonpetal harvest. The activity uses its own shared plots and temporary resources, separate from every participant’s personal farm.',
        'Progress is shared. A valid action advances the current objective for the party rather than granting a separate private objective to each player. Repeated interactions are idempotent: clicking the same completed target again does not create duplicate progress or duplicate temporary items.',
        'The activity presentation identifies the current objective, participant states, remaining time or growth state where relevant, and the shared completion path. Party chat is the easiest way to coordinate who handles the next available interaction.',
      ],
      [
        {
          type: 'steps',
          items: [
            {
              title: 'Gather seed bundles',
              text: 'Collect the temporary bundles required by the shared preparation.',
            },
            {
              title: 'Prepare shared plots',
              text: 'Ready the activity plots; these are not personal-farm plots.',
            },
            {
              title: 'Plant Moonpetals',
              text: 'Use the activity seeds on the shared valid plots.',
            },
            {
              title: 'Water the crops',
              text: 'Complete the shared care objective for the planted Moonpetals.',
            },
            {
              title: 'Wait for growth',
              text: 'Growth advances using server-controlled time, not a device clock.',
            },
            {
              title: 'Harvest',
              text: 'Collect the temporary harvest bundles after the crops are ready.',
            },
            {
              title: 'Deliver',
              text: 'Bring the full shared harvest to the community delivery objective.',
            },
            {
              title: 'Complete',
              text: 'Settle one eligible completion receipt and equal configured rewards per participant.',
            },
          ],
        },
      ],
    ),
    contentSection('temporary-items', 'Temporary activity state', [
      'Seed bundles, planted activity crops, and harvest bundles exist only inside the private run. They do not enter permanent inventory, cannot be gifted or traded, and cannot be carried back into the public world. This keeps cooperative objectives isolated from ordinary item and DUST systems.',
      'Activity progress is authoritative. The browser sends an interaction intent; the server checks the participant, current objective, target, instance revision, and timing before applying it. Parallel clicks cannot legitimately advance the same step twice.',
      'Leaving or failing releases the temporary state according to the activity lifecycle. It does not remove ordinary inventory merely because the activity displayed a temporary item with a similar name.',
    ]),
    contentSection(
      'rewards-limits',
      'Configurable reward examples and limits',
      [
        'A configurable example grants each eligible successful participant 15 DUST, 2 Moonbeans, and a completion receipt. It limits rewarded completions to two per UTC day, uses an entry cooldown of about 60 seconds, and uses a reward cooldown of about 300 seconds.',
        'These are examples, not a promise that the current game uses the same amounts. The active game configuration decides eligibility, limits, cooldowns, item definitions, and rewards. A failed run grants no completion reward.',
        'A completion request is designed to settle once. Reconnecting, refreshing, or repeating a request should retrieve or preserve the same authoritative receipt rather than issue another DUST or item reward.',
      ],
      [
        {
          type: 'callout',
          tone: 'important',
          title: 'Read the activity summary',
          text: 'Treat 15 DUST, 2 Moonbeans, two rewarded completions, and the example cooldowns as illustrative until the current activity screen confirms them.',
        },
      ],
    ),
    contentSection('prepare-recover', 'Prepare, reconnect, and finish safely', [
      'Use a fresh party ready check before preparation. Confirm that the leader can start, at least two eligible members are present, cooldowns have cleared, and the activity is enabled. Once inside, follow the current objective instead of trying later steps early.',
      'If a participant reconnects, wait for the activity panel to restore the current instance. Do not create a second party or begin another run while recovery is underway. If enough eligible players remain, the shared run can continue; otherwise the activity can end without a reward.',
      'Moonpetal Harvest Help may have limited availability while lifecycle, reward settlement, failure recovery, and receipt review continue to be refined. Public matchmaking, combat, token rewards, and on-chain claims are outside this activity.',
    ]),
  ],
});
