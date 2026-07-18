import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPresence, SocialGiftView, SocialTradeView } from '@starville/realtime';

import type { RealtimeSocialGraphView, RealtimeSocialView } from '../app/realtime-client';
import { SocialInteractionPanel } from './SocialInteractionPanel';

const selfPresenceId = '10000000-0000-4000-8000-000000000001';
const remotePresenceId = '10000000-0000-4000-8000-000000000002';
const interactionId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-07-14T00:00:00.000Z';

const remote: PublicPresence = {
  presenceId: remotePresenceId,
  displayName: 'Fern Friend',
  level: 4,
  worldId: 'lantern-square',
  worldVersionId: '30000000-0000-4000-8000-000000000001',
  channelId: '40000000-0000-4000-8000-000000000001',
  channelNumber: 1,
  x: 13,
  y: 7,
  facingDirection: 'south',
  movementState: 'idle',
  appearancePreset: 'moss',
  sequence: 1,
  connected: true,
};

const gift: SocialGiftView = {
  id: interactionId,
  kind: 'gift',
  status: 'pending',
  sender: { presenceId: remotePresenceId, displayName: 'Fern Friend' },
  target: { presenceId: selfPresenceId, displayName: 'Moss Friend' },
  item: {
    itemSlug: 'moonbean-seed',
    name: 'Moonbean Seed',
    category: 'seed',
    assetRef: 'item-moonbean-seed',
    quantity: 2,
  },
  createdAt: timestamp,
  expiresAt: '2026-07-14T00:01:30.000Z',
};

function trade(revision = 3): SocialTradeView {
  return {
    id: interactionId,
    kind: 'trade',
    status: 'negotiating',
    revision,
    senderOffer: {
      participant: { presenceId: selfPresenceId, displayName: 'Moss Friend' },
      items: [],
      confirmedRevision: null,
    },
    targetOffer: {
      participant: { presenceId: remotePresenceId, displayName: 'Fern Friend' },
      items: [
        {
          itemSlug: 'sunroot-seed',
          name: 'Sunroot Seed',
          category: 'seed',
          assetRef: 'item-sunroot-seed',
          quantity: 1,
        },
      ],
      confirmedRevision: revision,
    },
    createdAt: timestamp,
    expiresAt: '2026-07-14T00:10:00.000Z',
    reconnectDeadline: null,
  };
}

function social(overrides: Partial<RealtimeSocialView> = {}): RealtimeSocialView {
  return {
    inventory: [
      {
        itemSlug: 'moonbean-seed',
        name: 'Moonbean Seed',
        category: 'seed',
        assetRef: 'item-moonbean-seed',
        availableQuantity: 8,
        reservedQuantity: 0,
        minimumTransferQuantity: 1,
        maximumTransferQuantity: 99,
        giftable: true,
        tradable: true,
      },
      {
        itemSlug: 'starter-watering-can',
        name: 'Starter Watering Can',
        category: 'permanent_tool',
        assetRef: 'item-starter-watering-can',
        availableQuantity: 1,
        reservedQuantity: 0,
        minimumTransferQuantity: 1,
        maximumTransferQuantity: 1,
        giftable: false,
        tradable: false,
      },
    ],
    pendingRequests: [],
    activeTrade: null,
    recentReceipts: [],
    interactionDistance: 3,
    dustTransferEnabled: false,
    ...overrides,
  };
}

const callbacks = {
  onSelect: vi.fn(),
  onOpenChange: vi.fn(),
  onInspect: vi.fn(),
  onFriendRequest: vi.fn(),
  onPartyInvite: vi.fn(),
  onGift: vi.fn(),
  onGiftResponse: vi.fn(),
  onTradeRequest: vi.fn(),
  onTradeResponse: vi.fn(),
  onTradeOffer: vi.fn(),
  onTradeConfirm: vi.fn(),
  onTradeCancel: vi.fn(),
  onTradeResume: vi.fn(),
  onPreference: vi.fn(),
};

const socialGraph: RealtimeSocialGraphView = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  party: null,
  invitations: [],
  notifications: [],
  settings: {
    maximumFriends: 100,
    maximumIncomingRequests: 50,
    maximumOutgoingRequests: 25,
    partyCapacity: 4,
    friendRequestExpirySeconds: 604_800,
    partyInvitationExpirySeconds: 120,
    readyCheckExpirySeconds: 30,
    leaderReconnectGraceSeconds: 60,
    partyDormantTimeoutSeconds: 86_400,
    nearbyInvitationsEnabled: true,
    partyChatEnabled: true,
    friendLocationVisibilityEnabled: true,
    version: 1,
  },
};

let container: HTMLDivElement;
let root: Root;

function render(view = social(), selectedPresenceId: string | null = null) {
  root.render(
    <SocialInteractionPanel
      connectionStatus="connected"
      preferences={[]}
      remotes={[remote]}
      selectedPresenceId={selectedPresenceId}
      selfPresenceId={selfPresenceId}
      social={view}
      socialGraph={socialGraph}
      {...callbacks}
    />,
  );
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  Object.values(callbacks).forEach((callback) => callback.mockClear());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('nearby social interaction panel', () => {
  it('supports keyboard-safe selection and inspect without exposing restricted inventory items', async () => {
    await act(async () => render());
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.textContent?.includes('Nearby'))
        ?.click(),
    );
    expect(container.textContent).toContain('Players close enough to interact');
    expect(container.textContent).not.toContain('Within 3 tiles');
    expect(container.textContent).not.toContain('3 tiles');
    await act(async () => button('Fern FriendLv 4 · Channel 1')?.click());
    expect(callbacks.onSelect).toHaveBeenCalledWith(remotePresenceId);

    await act(async () => render(social(), remotePresenceId));
    await act(async () => button('Inspect')?.click());
    expect(callbacks.onInspect).toHaveBeenCalledWith(remotePresenceId);
    expect(container.textContent).toContain('Moonbean Seed');
    expect(container.textContent).not.toContain('Starter Watering Can');

    await act(async () =>
      container
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('opens for an incoming gift and routes an exact accept intent', async () => {
    await act(async () => render(social({ pendingRequests: [gift] })));
    expect(container.getAttribute('aria-hidden')).toBeNull();
    expect(container.textContent).toContain('2 × Moonbean Seed');
    await act(async () => button('Accept')?.click());
    expect(callbacks.onGiftResponse).toHaveBeenCalledWith(interactionId, 'accept');
  });

  it('confirms and updates only the currently displayed trade revision', async () => {
    const activeTrade = trade(3);
    await act(async () => render(social({ activeTrade })));
    expect(container.textContent).toContain('Secure Trade');
    expect(container.textContent).not.toContain('revision 3');
    await act(async () => button('Confirm Offer')?.click());
    expect(callbacks.onTradeConfirm).toHaveBeenCalledWith(interactionId, 3);
    await act(async () => button('Update exact offer')?.click());
    expect(callbacks.onTradeOffer).toHaveBeenCalledWith(interactionId, 3, [
      { itemSlug: 'moonbean-seed', quantity: 1 },
    ]);
    expect(container.textContent).toContain('Changing an offer clears both confirmations');
  });
});
