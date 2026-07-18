import '@starville/design-tokens/styles.css';
import '../styles.css';

import { StrictMode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  MOONPETAL_HARVEST_HELP,
  type CooperativeActivityInstanceSnapshot,
} from '@starville/cooperative-activities';
import type { PartySnapshot, PublicPresence } from '@starville/realtime';
import type { CosmeticWardrobe } from '@starville/cosmetics';
import { housingLocalFixture } from '@starville/housing';

import { DEFAULT_GAME_SETTINGS, type GameSettings, type GameUiScale } from '../app/game-settings';
import { COMPILED_AVATAR_STARTER_CATALOG, defaultAvatarSelection } from '../app/avatar-client';
import { INITIAL_REALTIME_VIEW } from '../app/realtime-client';
import { CharacterCustomization } from '../components/CharacterCustomization';
import { CooperativeActivityPanel } from '../components/CooperativeActivityPanel';
import { CozyGameplay } from '../components/CozyGameplay';
import { DustHistoryPanel, VillageSupplyShopPanel } from '../components/EconomyPanels';
import { GameSettingsDialog } from '../components/GameSettingsDialog';
import { HousingWorkspacePanel } from '../components/HousingWorkspacePanel';
import { PlayerStatusDock } from '../components/PlayerStatusDock';
import { PremiumWardrobe } from '../components/PremiumWardrobe';
import { CompactPartyHud, SocialGraphPanel } from '../components/SocialGraphPanel';
import { SocialInteractionPanel } from '../components/SocialInteractionPanel';
import { AVATAR_VISUAL_ACCEPTANCE_PANELS } from './matrix';
import { PHASE11A_PREVIEW_API_PREFIX, phase11aPreviewApi } from './phase11a-preview';

type PreviewPanel =
  | 'default'
  | 'settings'
  | 'activities'
  | 'nearby'
  | 'nearby-list'
  | 'friends'
  | 'requests'
  | 'party'
  | 'active-party'
  | 'active-activity'
  | 'shop'
  | 'dust'
  | 'creator'
  | 'wardrobe'
  | 'cosmetics'
  | 'farming'
  | 'cooking'
  | 'housing';

const selfPresenceId = '10000000-0000-4000-8000-000000000001';
const friendPresenceId = '10000000-0000-4000-8000-000000000002';
const timestamp = '2026-07-15T00:00:00.000Z';
const cosmeticPreviewProfile = {
  appearanceId: '40000000-0000-4000-8000-000000000001',
  revision: 3,
  legacyFallbackPreset: 'moss' as const,
  selection: defaultAvatarSelection('moss'),
  presetKey: 'moss-starter',
};
const cosmeticPreviewWardrobe: CosmeticWardrobe = {
  status: 'loaded',
  ownedItems: [
    {
      ownershipId: '51000000-0000-4000-8000-000000000001',
      definitionId: '52000000-0000-4000-8000-000000000001',
      key: 'moss-tunic',
      name: 'Moss tunic',
      category: 'outfit',
      layer: 'top',
      source: 'starter_catalog',
      sourceLabel: 'Starter wardrobe',
      state: 'owned',
      available: true,
      equipped: true,
      usableVersionId: '53000000-0000-4000-8000-000000000001',
      usableVersionNumber: 1,
      previewMediaUrl: null,
      acquiredAt: timestamp,
    },
    {
      ownershipId: '51000000-0000-4000-8000-000000000002',
      definitionId: '52000000-0000-4000-8000-000000000002',
      key: 'lantern-coat',
      name: 'Lantern coat',
      category: 'outfit',
      layer: 'top',
      source: 'collection_reward',
      sourceLabel: 'Meadow collection',
      state: 'owned',
      available: false,
      equipped: false,
      usableVersionId: null,
      usableVersionNumber: null,
      previewMediaUrl: null,
      acquiredAt: timestamp,
    },
    {
      ownershipId: '51000000-0000-4000-8000-000000000003',
      definitionId: '52000000-0000-4000-8000-000000000003',
      key: 'retired-hat',
      name: 'Retired festival hat',
      category: 'accessory',
      layer: 'head_accessory',
      source: 'administrator_grant',
      sourceLabel: 'Administrator grant',
      state: 'revoked',
      available: false,
      equipped: false,
      usableVersionId: null,
      usableVersionNumber: null,
      previewMediaUrl: null,
      acquiredAt: timestamp,
    },
  ],
  loadouts: [
    {
      loadoutId: '54000000-0000-4000-8000-000000000001',
      slot: 1,
      name: 'Meadow walk',
      selection: cosmeticPreviewProfile.selection,
      revision: 2,
      active: true,
      updatedAt: timestamp,
    },
  ],
  emotes: [
    {
      key: 'wave',
      name: 'Wave',
      durationMs: 1_800,
      interruptible: true,
      owned: true,
      sourceLabel: 'Starter emote',
    },
    {
      key: 'dance',
      name: 'Dance',
      durationMs: 5_000,
      interruptible: true,
      owned: false,
      sourceLabel: 'Collection reward',
    },
  ],
  emoteWheel: ['wave'],
  emoteWheelRevision: 1,
  collections: [
    {
      key: 'meadow-friends',
      name: 'Meadow Friends',
      description: 'A small cosmetic-only collection.',
      ownedCount: 2,
      requiredCount: 3,
      completed: false,
      rewardKey: 'flower-crown',
      rewardClaimed: false,
    },
  ],
  shop: {
    enabled: false,
    lifecycle: 'disabled_preview',
    currency: 'DUST',
    purchaseAvailable: false,
    message: 'Cosmetic purchases are not enabled in this phase.',
    offers: [],
  },
};

const party: PartySnapshot = {
  partyId: '30000000-0000-4000-8000-000000000001',
  revision: 7,
  status: 'active',
  capacity: 4,
  leaderPresenceId: selfPresenceId,
  members: [
    {
      presenceId: selfPresenceId,
      displayName: 'Cozy Jinrae',
      level: 4,
      appearancePreset: 'moss',
      role: 'leader',
      connectionStatus: 'online',
      worldId: 'lantern-square',
      worldName: 'Lantern Square',
      channelNumber: 1,
      readyState: 'ready',
      joinedAt: timestamp,
    },
    {
      presenceId: friendPresenceId,
      displayName: 'Fern Friend',
      level: 3,
      appearancePreset: 'river',
      role: 'member',
      connectionStatus: 'reconnecting',
      worldId: 'lantern-square',
      worldName: 'Lantern Square',
      channelNumber: 1,
      readyState: 'waiting',
      joinedAt: timestamp,
    },
  ],
  pendingInvitationCount: 0,
  readyCheck: null,
  leaderReconnectDeadline: null,
};

const remote: PublicPresence = {
  presenceId: friendPresenceId,
  displayName: 'Fern Friend',
  level: 3,
  worldId: 'lantern-square',
  worldVersionId: '30000000-0000-4000-8000-000000000002',
  channelId: 'channel-1',
  channelNumber: 1,
  x: 13,
  y: 7,
  facingDirection: 'south',
  movementState: 'idle',
  appearancePreset: 'river',
  sequence: 1,
  connected: true,
};

const channels = [
  { id: 'channel-1', number: 1, population: 4, capacity: 40, available: true },
  { id: 'channel-2', number: 2, population: 12, capacity: 40, available: true },
  { id: 'channel-3', number: 3, population: 40, capacity: 40, available: false },
];

const activity = {
  ...INITIAL_REALTIME_VIEW.activity,
  catalog: {
    generatedAt: '2026-07-15T00:00:00.000Z',
    activities: [
      {
        activity: MOONPETAL_HARVEST_HELP,
        availability: 'party_required' as const,
        availableAt: null,
        rewardedCompletionsToday: 0,
        partyEligible: false,
        leader: false,
      },
    ],
  },
};

const activeInstance: CooperativeActivityInstanceSnapshot = {
  instanceId: '8d0b0000-0000-4000-8000-000000000010',
  activity: MOONPETAL_HARVEST_HELP,
  status: 'active',
  revision: 2,
  currentObjectiveKey: 'gather-seed-bundles',
  objectives: [
    {
      key: 'gather-seed-bundles',
      label: 'Gather Seed Bundles',
      type: 'shared_collect_count',
      current: 4,
      target: 6,
      status: 'active',
      startedAt: timestamp,
      completedAt: null,
      timerEndsAt: null,
    },
  ],
  participants: party.members.map((member) => ({
    presenceId: member.presenceId,
    displayName: member.displayName,
    level: member.level,
    connectionStatus: member.connectionStatus,
    contribution: member.role === 'leader' ? 3 : 1,
    rewardEligible: true,
    reconnectDeadline: member.connectionStatus === 'reconnecting' ? timestamp : null,
  })),
  objects: [],
  personalContribution: 3,
  temporaryItemCount: 4,
  startedAt: timestamp,
  expiresAt: new Date(Date.now() + 8 * 60 * 1_000).toISOString(),
  pausedAt: null,
  completedAt: null,
  resultCode: null,
  receipts: [],
  spawn: { x: 14, y: 9 },
};

const activeActivity = { ...activity, instance: activeInstance };
const socialGraphWithParty = { ...INITIAL_REALTIME_VIEW.socialGraph, party };

const economyPreviewItem = {
  id: '71000000-0000-4000-8000-000000000001',
  slug: 'moonbean-seed',
  name: 'Moonbean Seed',
  description: 'A gentle meadow seed for Moonbeans.',
  category: 'seed' as const,
  stackable: true,
  maxStackSize: 99,
  buyEligible: true,
  sellEligible: false,
  giftable: true,
  tradable: true,
  accountBound: false,
  permanentTool: false,
  minimumTransferQuantity: 1,
  maximumTransferQuantity: 20,
  defaultBuyPrice: 8,
  defaultSellPrice: null,
  assetRef: 'phase7-dev-moonbean-seed',
  assetReadiness: 'development_marker' as const,
  active: true,
  contentVersion: 1,
  metadata: { kind: 'seed' as const, cropSlug: 'moonbean' },
};

const economyPreviewInventory = {
  capacity: { capacity: 24, usedSlots: 3, stateVersion: 2 },
  stacks: [
    {
      id: '10000000-0000-4000-8000-000000000010',
      item: economyPreviewItem,
      quantity: 4,
      acquiredAt: timestamp,
      updatedAt: timestamp,
      stateVersion: 1,
    },
  ],
};

const economyPreviewCatalog = {
  shop: {
    id: '74000000-0000-4000-8000-000000000001',
    slug: 'lantern-general-store',
    name: 'Lantern General Store',
    description: 'Seeds, pantry goods, materials, and starter furnishings.',
    active: true,
    contentVersion: 1,
  },
  offers: [
    {
      id: '74000000-0000-4000-8000-000000000011',
      shopSlug: 'lantern-general-store',
      itemSlug: 'moonbean-seed',
      buyPrice: 8,
      sellPrice: null,
      minimumQuantity: 1,
      maximumQuantity: 20,
      active: true,
      availableFrom: null,
      availableUntil: null,
      contentVersion: 1,
    },
  ],
  generatedAt: timestamp,
};

const economyPreviewShop = {
  shop: {
    shopKey: 'village-supply-shop',
    name: 'Village Supply Shop',
    versionId: '99000000-0000-4000-8000-000000000031',
    versionNumber: 1,
    revision: 1,
    status: 'published' as const,
    interactionKey: 'phase7-general-store',
    publishedAt: timestamp,
  },
  offers: [
    {
      offerId: '74000000-0000-4000-8000-000000000011',
      itemSlug: 'moonbean-seed',
      itemName: 'Moonbean Seed',
      itemDescription: 'A gentle meadow seed for Moonbeans.',
      itemCategory: 'seed' as const,
      unitPrice: 8,
      maximumQuantity: 20,
      dailyLimit: 40,
      cooldownSeconds: 0,
      inventoryCapacityCost: 1,
      protectedItem: false as const,
      enabled: true,
      revision: 1,
      purchasedToday: 2,
      remainingToday: 38,
      availableAt: null,
    },
  ],
  availability: 'open' as const,
  generatedAt: timestamp,
};

const economyPreviewHistory = {
  dustBalance: 245,
  dustStateVersion: 4,
  policyVersion: 1,
  nextCursor: null,
  generatedAt: timestamp,
  history: [
    {
      publicReceiptId: 'DUST-00000000000000000003',
      operationKey: 'shop_purchase',
      sourceKey: null,
      sinkKey: 'village-supply-shop',
      delta: -20,
      balanceBefore: 265,
      balanceAfter: 245,
      referenceType: 'shop_transaction',
      referenceId: '90000000-0000-4000-8000-000000000003',
      relatedPublicReceiptId: 'SHOP-00000000000000000003',
      referenceLabel: 'Village Supply Shop',
      correlationId: null,
      createdAt: timestamp,
    },
    {
      publicReceiptId: 'DUST-00000000000000000002',
      operationKey: 'cooperative_activity_reward',
      sourceKey: 'moonpetal-harvest-help',
      sinkKey: null,
      delta: 15,
      balanceBefore: 250,
      balanceAfter: 265,
      referenceType: 'activity_completion',
      referenceId: '90000000-0000-4000-8000-000000000002',
      referenceLabel: 'Moonpetal Harvest Help',
      correlationId: null,
      createdAt: timestamp,
    },
    {
      publicReceiptId: 'DUST-00000000000000000001',
      operationKey: 'starter_grant',
      sourceKey: 'starter-grant',
      sinkKey: null,
      delta: 250,
      balanceBefore: 0,
      balanceAfter: 250,
      referenceType: 'player_bootstrap',
      referenceId: null,
      referenceLabel: 'Starter Balance',
      correlationId: null,
      createdAt: timestamp,
    },
  ],
};

function EconomyPreviewPanel({ panel }: { readonly panel: 'shop' | 'dust' }) {
  return (
    <div className="world-overlay cozy-overlay" role="presentation">
      <section
        className="cozy-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="economy-preview-title"
      >
        <header className="cozy-panel__header">
          <div>
            <p className="game-kicker">
              {panel === 'shop' ? 'Village shopping' : 'Your DUST journal'}
            </p>
            <h2 id="economy-preview-title">
              {panel === 'shop' ? 'Village Supply Shop' : 'DUST history'}
            </h2>
          </div>
          <button type="button" aria-label="Close preview">
            ×
          </button>
        </header>
        {panel === 'shop' ? (
          <VillageSupplyShopPanel
            balance={250}
            busy={false}
            catalog={economyPreviewCatalog}
            economyCatalog={economyPreviewShop}
            inventory={economyPreviewInventory}
            items={{ contentVersion: 1, generatedAt: timestamp, items: [economyPreviewItem] }}
            onPurchase={() =>
              Promise.resolve({
                ok: false as const,
                message: 'Visual preview only. No purchase was sent.',
              })
            }
            onSell={() => undefined}
          />
        ) : (
          <DustHistoryPanel economy={economyPreviewHistory} />
        )}
      </section>
    </div>
  );
}

export function QuickbarPreview() {
  return (
    <div className="cozy-quickbar" role="toolbar" aria-label="Quickbar preview">
      {Array.from({ length: 8 }, (_, index) => (
        <button
          className={index === 0 ? 'cozy-quickbar__slot--selected' : undefined}
          key={index}
          type="button"
        >
          <kbd>{index + 1}</kbd>
          <span>{index === 0 ? 'Starter Watering Can' : 'Empty'}</span>
        </button>
      ))}
    </div>
  );
}

export function AvatarCustomizationPreview({
  panel,
  initialScale,
  reducedMotion,
  highContrast,
}: {
  readonly panel: 'creator' | 'wardrobe';
  readonly initialScale: GameUiScale;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
}) {
  const selection = defaultAvatarSelection(panel === 'creator' ? 'moss' : 'river');
  return (
    <div
      className={[
        'avatar-visual-fixture',
        `game-ui-scale--${String(Math.round(initialScale * 100))}`,
        reducedMotion ? 'world-shell--reduced-motion' : '',
        highContrast ? 'world-shell--increased-contrast' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-visual-contrast={highContrast ? 'high' : 'default'}
      data-visual-motion={reducedMotion ? 'reduced' : 'default'}
    >
      <CharacterCustomization
        busy={false}
        catalog={COMPILED_AVATAR_STARTER_CATALOG}
        mode={panel === 'creator' ? 'create' : 'edit'}
        previewOnly
        savedSelection={selection}
        onClose={() => undefined}
        onSave={async () => undefined}
      />
    </div>
  );
}

export function PreviewWorld({
  panel,
  initialScale = 1,
  reducedMotion = false,
  highContrast = false,
}: {
  readonly panel: PreviewPanel;
  readonly initialScale?: GameUiScale;
  readonly reducedMotion?: boolean;
  readonly highContrast?: boolean;
}) {
  const [settings, setSettings] = useState<GameSettings>({
    ...DEFAULT_GAME_SETTINGS,
    uiScale: initialScale,
  });
  const modalOpen = [
    'settings',
    'activities',
    'nearby',
    'nearby-list',
    'friends',
    'requests',
    'party',
    'shop',
    'dust',
    'cosmetics',
    'cooking',
    'housing',
  ].includes(panel);
  const noop = () => undefined;
  return (
    <main
      className={[
        'world-shell',
        `game-ui-scale--${Math.round(settings.uiScale * 100)}`,
        reducedMotion ? 'world-shell--reduced-motion' : '',
        highContrast ? 'world-shell--increased-contrast' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-visual-contrast={highContrast ? 'high' : 'default'}
      data-visual-motion={reducedMotion ? 'reduced' : 'default'}
    >
      <header className="world-topbar">
        <div className="world-brand">
          <span aria-hidden="true">✦</span>
          <strong>STARVILLE</strong>
        </div>
        <div className="world-session">
          <span className="world-session__dot" aria-hidden="true" />
          <span>Solana Mainnet</span>
          <button type="button">Verify access</button>
        </div>
      </header>
      <section
        className={`world-frame visual-acceptance-world${modalOpen ? ' world-frame--modal-open' : ''}${
          panel === 'active-activity' ? ' world-frame--activity-active' : ''
        }`}
        aria-label="Visual acceptance world"
      >
        <div className="visual-acceptance-world__terrain" aria-hidden="true" />
        <div className="world-hud world-hud--identity">
          <p className="world-hud__eyebrow">Villager</p>
          <strong>CozyJinraeLongname</strong>
          <span>Safe position ready</span>
        </div>
        <div className="world-hud world-hud--location">
          <p className="world-hud__eyebrow">Current location</p>
          <strong>Lantern Square</strong>
          <span>The lantern-lit village center where four roads meet beside the stream.</span>
        </div>
        <div className="world-hud world-hud--controls">
          <span>
            <kbd>WASD</kbd> Move
          </span>
          <span>
            <kbd>Shift</kbd> Jog
          </span>
          <span>
            <kbd>E</kbd> Interact
          </span>
          <button type="button">Settings</button>
        </div>
        <button className="chat-panel__toggle visual-chat-launcher" type="button">
          <span aria-hidden="true">✦</span>
          <span>Chat</span>
          <strong aria-label="12 unread messages">12</strong>
        </button>
        <QuickbarPreview />
        <PlayerStatusDock
          activityActive={panel === 'active-activity'}
          channels={channels}
          connectionStatus="connected"
          currentChannelId="channel-1"
          disabled={modalOpen}
          dustBalance={250}
          nearbyCount={3}
          socialNoticeCount={12}
          onActivities={noop}
          onChannelSwitch={noop}
          onFriends={noop}
          onInventory={noop}
          onNearby={noop}
          onPopoverOpenChange={noop}
        />

        {panel === 'settings' ? (
          <GameSettingsDialog
            settings={settings}
            pendingAction={false}
            onSettingsChange={setSettings}
            onResume={noop}
            onReturnLanding={async () => undefined}
            onEndSession={async () => undefined}
          />
        ) : null}
        {panel === 'activities' ? (
          <CooperativeActivityPanel
            activity={activity}
            disabled={false}
            externalOpenRequest={1}
            party={null}
            selfPresenceId={selfPresenceId}
            showLauncher={false}
            onCatalogRequest={noop}
            onEnter={noop}
            onLeave={noop}
            onOpenChange={noop}
            onPrepare={noop}
            onReady={noop}
            onSnapshotRequest={noop}
          />
        ) : null}
        {panel === 'nearby' || panel === 'nearby-list' ? (
          <SocialInteractionPanel
            connectionStatus="connected"
            externalOpenRequest={1}
            preferences={[]}
            remotes={panel === 'nearby-list' ? [remote] : []}
            selectedPresenceId={null}
            selfPresenceId={selfPresenceId}
            showLauncher={false}
            social={INITIAL_REALTIME_VIEW.social}
            socialGraph={INITIAL_REALTIME_VIEW.socialGraph}
            onGift={noop}
            onFriendRequest={noop}
            onGiftResponse={noop}
            onInspect={noop}
            onOpenChange={noop}
            onPartyInvite={noop}
            onPreference={noop}
            onSelect={noop}
            onTradeCancel={noop}
            onTradeConfirm={noop}
            onTradeOffer={noop}
            onTradeRequest={noop}
            onTradeResponse={noop}
            onTradeResume={noop}
          />
        ) : null}
        {panel === 'friends' || panel === 'requests' || panel === 'party' ? (
          <SocialGraphPanel
            connectionStatus="connected"
            externalOpenRequest={1}
            nearbyPlayers={[]}
            requestedTab={panel}
            selfPresenceId={selfPresenceId}
            showLauncher={false}
            showNotifications={false}
            socialGraph={INITIAL_REALTIME_VIEW.socialGraph}
            onFindNearby={noop}
            onFriendRemove={noop}
            onFriendRequest={noop}
            onFriendResponse={noop}
            onJoinLeaderChannel={noop}
            onOpenChange={noop}
            onPartyCreate={noop}
            onPartyDisband={noop}
            onPartyInvitationResponse={noop}
            onPartyInvite={noop}
            onPartyKick={noop}
            onPartyLeave={noop}
            onPartyPromote={noop}
            onReadyCheckRespond={noop}
            onReadyCheckStart={noop}
          />
        ) : null}
        {panel === 'active-party' ? <CompactPartyHud socialGraph={socialGraphWithParty} /> : null}
        {panel === 'active-activity' ? (
          <CooperativeActivityPanel
            activity={activeActivity}
            disabled={false}
            party={party}
            selfPresenceId={selfPresenceId}
            showLauncher={false}
            onCatalogRequest={noop}
            onEnter={noop}
            onLeave={noop}
            onOpenChange={noop}
            onPrepare={noop}
            onReady={noop}
            onSnapshotRequest={noop}
          />
        ) : null}
        {panel === 'shop' || panel === 'dust' ? <EconomyPreviewPanel panel={panel} /> : null}
        {panel === 'cosmetics' ? (
          <PremiumWardrobe
            apiUrl={window.location.origin}
            current={cosmeticPreviewProfile}
            onActivateEmote={noop}
            onClose={noop}
            onSaved={noop}
          />
        ) : null}
        {panel === 'farming' ? (
          <CozyGameplay
            apiUrl={window.location.origin}
            interaction={{
              id: 'phase11a.garden-one',
              type: 'home_farm_tile',
              x: 3,
              y: 3,
              range: 4,
              title: 'Garden one',
              content: 'Use the selected farming tool or seed.',
              tileKey: 'garden-1',
              slot: 1,
            }}
            onAccessInvalid={noop}
            onInteractionClose={noop}
            onOpenChange={noop}
          />
        ) : null}
        {panel === 'cooking' ? (
          <CozyGameplay
            apiUrl={window.location.origin}
            interaction={{
              id: 'starter-cooking-hearth',
              type: 'cooking_station',
              x: 2.5,
              y: 2.5,
              range: 1.75,
              title: 'Cooking Hearth',
              content: 'Prepare warm recipes in your private home.',
              stationType: 'cooking_hearth',
              workstationInstanceId: 'b1100000-0000-4000-8000-000000000101',
            }}
            onAccessInvalid={noop}
            onInteractionClose={noop}
            onOpenChange={noop}
          />
        ) : null}
        {panel === 'housing' ? (
          <div className="world-overlay cozy-overlay">
            <section className="cozy-panel" aria-label="Housing responsive preview">
              <div className="cozy-panel__body">
                <HousingWorkspacePanel apiUrl={window.location.origin} />
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const query = new URLSearchParams(window.location.search);
const requested = query.get('panel');
const panel: PreviewPanel = [
  'settings',
  'activities',
  'nearby',
  'nearby-list',
  'friends',
  'requests',
  'party',
  'active-party',
  'active-activity',
  'shop',
  'dust',
  'farming',
  'cooking',
  'housing',
  ...AVATAR_VISUAL_ACCEPTANCE_PANELS,
].includes(requested ?? '')
  ? (requested as PreviewPanel)
  : 'default';
if (panel === 'cosmetics') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl =
      input instanceof URL ? input : new URL(input.toString(), window.location.href);
    if (
      requestUrl.pathname === '/api/v1/token-access/player/cosmetics' &&
      (init?.method ?? 'GET') === 'GET'
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          data: cosmeticPreviewWardrobe,
          requestId: 'phase10b-visual-acceptance',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return nativeFetch(input, init);
  };
}
if (panel === 'farming' || panel === 'cooking') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl =
      input instanceof URL ? input : new URL(input.toString(), window.location.href);
    const preview = phase11aPreviewApi(requestUrl.pathname, init?.method ?? 'GET');
    if (preview !== undefined) {
      return new Response(
        JSON.stringify({ success: true, data: preview, requestId: 'phase11a-visual-acceptance' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (requestUrl.pathname.startsWith(PHASE11A_PREVIEW_API_PREFIX)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'visual_acceptance_read_only',
            message: 'Phase 11A visual acceptance does not send gameplay mutations.',
          },
          requestId: 'phase11a-visual-acceptance',
        }),
        { status: 405, headers: { 'content-type': 'application/json' } },
      );
    }
    return nativeFetch(input, init);
  };
}
if (panel === 'housing') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl =
      input instanceof URL ? input : new URL(input.toString(), window.location.href);
    const method = init?.method ?? 'GET';
    if (requestUrl.pathname === '/api/v1/token-access/player/housing' && method === 'GET') {
      return new Response(
        JSON.stringify({
          success: true,
          data: housingLocalFixture,
          requestId: 'phase11e-visual-acceptance',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (requestUrl.pathname.startsWith('/api/v1/token-access/player/housing')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'visual_acceptance_read_only',
            message: 'Phase 11E visual acceptance does not send housing mutations.',
          },
          requestId: 'phase11e-visual-acceptance',
        }),
        { status: 405, headers: { 'content-type': 'application/json' } },
      );
    }
    return nativeFetch(input, init);
  };
}
const viewport = query.get('viewport')?.match(/^(\d{3,4})x(\d{3,4})$/);
const framedWidth = viewport?.[1] === undefined ? null : Number(viewport[1]);
const framedHeight = viewport?.[2] === undefined ? null : Number(viewport[2]);
const requestedScale = query.get('scale');
const reducedMotion = query.get('motion') === 'reduced';
const highContrast = query.get('contrast') === 'high';
const initialScale: GameUiScale =
  requestedScale === '90'
    ? 0.9
    : requestedScale === '110'
      ? 1.1
      : requestedScale === '120'
        ? 1.2
        : 1;
const root = document.getElementById('root');
if (root === null) throw new Error('Visual acceptance preview requires a #root element.');
const visualWindow = window as Window & { __starvilleVisualAcceptanceRoot?: Root };
const visualRoot = visualWindow.__starvilleVisualAcceptanceRoot ?? createRoot(root);
visualWindow.__starvilleVisualAcceptanceRoot = visualRoot;
const preview =
  panel === 'creator' || panel === 'wardrobe' ? (
    <AvatarCustomizationPreview
      highContrast={highContrast}
      initialScale={initialScale}
      panel={panel}
      reducedMotion={reducedMotion}
    />
  ) : (
    <PreviewWorld
      highContrast={highContrast}
      initialScale={initialScale}
      panel={panel}
      reducedMotion={reducedMotion}
    />
  );
visualRoot.render(
  <StrictMode>
    {framedWidth === null || framedHeight === null ? (
      preview
    ) : (
      <main className="visual-viewport-runner">
        <p>
          Starville visual acceptance viewport: {framedWidth} × {framedHeight}
        </p>
        <iframe
          height={framedHeight}
          src={`/visual-acceptance.html?panel=${panel}&scale=${String(Math.round(initialScale * 100))}&motion=${reducedMotion ? 'reduced' : 'default'}&contrast=${highContrast ? 'high' : 'default'}`}
          title={`Starville ${panel} preview at ${framedWidth} by ${framedHeight}`}
          width={framedWidth}
        />
      </main>
    )}
  </StrictMode>,
);
