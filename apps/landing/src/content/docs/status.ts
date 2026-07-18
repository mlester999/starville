import {
  DOCUMENTATION_REVIEW_DATE,
  type DocumentationStatus,
  type PublicFeatureStatus,
} from './types';

export const PUBLIC_STATUS_PRESENTATION: Readonly<
  Record<DocumentationStatus, { readonly label: string; readonly detail: string }>
> = {
  available: {
    label: 'Available now',
    detail: 'Available in the current player experience.',
  },
  owner_tested: {
    label: 'Available now',
    detail: 'Available in the current player experience.',
  },
  testing: {
    label: 'Limited availability',
    detail: 'This experience may be available while final refinements continue.',
  },
  local_only: {
    label: 'Coming later',
    detail: 'This experience is being prepared for a future player update.',
  },
  planned: {
    label: 'Coming later',
    detail: 'This is part of Starville’s direction, but it is not available now.',
  },
  deferred: {
    label: 'Coming later',
    detail: 'This is not part of the current player experience.',
  },
  disabled: {
    label: 'Currently unavailable',
    detail: 'This is not an active player feature.',
  },
  admin_only: {
    label: 'Restricted',
    detail: 'This is available only to authorized Starville operations staff.',
  },
};

export function getPublicStatusPresentation(status: DocumentationStatus) {
  return PUBLIC_STATUS_PRESENTATION[status];
}

const feature = (
  key: string,
  name: string,
  status: DocumentationStatus,
  explanation: string,
  route: string,
): PublicFeatureStatus => ({
  key,
  name,
  status,
  explanation,
  route,
  lastReviewed: DOCUMENTATION_REVIEW_DATE,
});

export const PUBLIC_FEATURE_STATUSES = [
  feature(
    'character-customization',
    'Character creator and Wardrobe',
    'local_only',
    'Modular character creation, Wardrobe editing, and shared appearance updates are being prepared for a future player update.',
    '/docs/character-customization',
  ),
  feature(
    'responsive-hud',
    'Responsive game HUD',
    'owner_tested',
    'The game HUD adapts across supported desktop, tablet, and mobile layouts.',
    '/docs/controls-and-hud',
  ),
  feature(
    'realtime-presence',
    'Realtime multiplayer presence',
    'owner_tested',
    'Connected villagers can see one another when they share the same world and channel.',
    '/docs/multiplayer',
  ),
  feature(
    'realtime-movement',
    'Realtime movement',
    'owner_tested',
    'Nearby villagers can see one another move through the shared world.',
    '/docs/multiplayer',
  ),
  feature(
    'chat-core',
    'Realtime chat core',
    'owner_tested',
    'Nearby, Channel, System, and Party conversations are available in the current chat experience.',
    '/docs/chat-and-safety',
  ),
  feature(
    'moderation-edges',
    'Chat moderation edge cases',
    'testing',
    'Mute, block, and report controls are available, with additional edge-case refinements continuing.',
    '/docs/chat-and-safety',
  ),
  feature(
    'inspect-privacy',
    'Player inspection',
    'testing',
    'Player inspection is limited to safe public profile details, with additional privacy refinements continuing.',
    '/docs/player-safety',
  ),
  feature(
    'gifts',
    'Item gifts',
    'testing',
    'Ordinary-item gifting may be available while lifecycle refinements continue.',
    '/docs/gifts-and-trading',
  ),
  feature(
    'trades',
    'Item trading',
    'testing',
    'Mutually confirmed ordinary-item trading may be available while lifecycle refinements continue.',
    '/docs/gifts-and-trading',
  ),
  feature(
    'friends',
    'Friends',
    'testing',
    'Friend requests and persistent friendships may be available while lifecycle refinements continue.',
    '/docs/friends-and-parties',
  ),
  feature(
    'parties',
    'Parties and ready checks',
    'testing',
    'Small parties, invitations, ready checks, and reconnect behavior may be available while refinements continue.',
    '/docs/friends-and-parties',
  ),
  feature(
    'moonpetal-activity',
    'Moonpetal Harvest Help',
    'testing',
    'The private-party cooperative activity may be available while session and reward refinements continue.',
    '/docs/cooperative-activities',
  ),
  feature(
    'activity-admin',
    'Activity administration',
    'testing',
    'Activity operations tools are restricted and may evolve alongside the player activity.',
    '/docs/cooperative-activities',
  ),
  feature(
    'dust-economy',
    'Hardened DUST economy',
    'local_only',
    'The expanded receipt-backed DUST economy is being prepared for a future player update.',
    '/docs/dust-economy',
  ),
  feature(
    'village-shop',
    'Village Supply Shop',
    'local_only',
    'The polished Village Supply Shop is being prepared for a future player update.',
    '/docs/village-supply-shop',
  ),
  feature(
    'dust-history',
    'DUST history',
    'local_only',
    'Friendly receipt-backed DUST history is being prepared for a future player update.',
    '/docs/dust-economy',
  ),
  feature(
    'economy-operations',
    'Economy operations',
    'local_only',
    'Restricted economy operations, review, and tuning tools are being prepared alongside the expanded economy.',
    '/docs/technical-overview',
  ),
  feature(
    'wallet-access-verification',
    'Wallet access verification',
    'available',
    'Current access checks wallet control and the configured Solana token on trusted services; it is not a claim or transaction.',
    '/docs/wallet-and-star',
  ),
  feature(
    'public-matchmaking',
    'Public activity matchmaking',
    'planned',
    'Cooperative activities currently use private parties; public matchmaking is not available.',
    '/docs/cooperative-activities',
  ),
  feature(
    'guilds-clans',
    'Guilds and clans',
    'deferred',
    'Persistent large community organizations are not part of the current release.',
    '/docs/roadmap',
  ),
  feature(
    'combat-pvp',
    'Combat, raids, and PvP',
    'deferred',
    'Starville is currently focused on cozy and cooperative play; combat systems are not available.',
    '/docs/roadmap',
  ),
  feature(
    'marketplace-auctions',
    'Marketplace and auctions',
    'deferred',
    'There is no current player marketplace or auction house.',
    '/docs/roadmap',
  ),
  feature(
    'token-rewards',
    'Token claims and payouts',
    'disabled',
    'Token claiming is not an active player feature; no reward, claim action, connected signer, treasury transaction, or payout is available.',
    '/docs/wallet-and-star',
  ),
  feature(
    'staking-withdrawals',
    'Staking and withdrawals',
    'deferred',
    'Starville does not offer staking, DUST withdrawal, or DUST-to-token conversion.',
    '/docs/dust-economy',
  ),
  feature(
    'nfts',
    'NFT systems',
    'deferred',
    'No NFT gameplay or transfer system is part of the current release.',
    '/docs/roadmap',
  ),
] as const satisfies readonly PublicFeatureStatus[];

export function getFeatureStatus(key: string): PublicFeatureStatus {
  const entry = PUBLIC_FEATURE_STATUSES.find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`Unknown public feature status: ${key}`);
  return entry;
}
