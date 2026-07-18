import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPresence } from '@starville/realtime';

import type { RealtimeSocialGraphView } from '../app/realtime-client';
import { CompactPartyHud, SocialGraphPanel } from './SocialGraphPanel';

const selfPresenceId = '10000000-0000-4000-8000-000000000001';
const remotePresenceId = '10000000-0000-4000-8000-000000000002';
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

function graph(overrides: Partial<RealtimeSocialGraphView> = {}): RealtimeSocialGraphView {
  return {
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
    ...overrides,
  };
}

const callbacks = {
  onOpenChange: vi.fn(),
  onFriendRequest: vi.fn(),
  onFriendResponse: vi.fn(),
  onFriendRemove: vi.fn(),
  onPartyCreate: vi.fn(),
  onPartyInvite: vi.fn(),
  onJoinLeaderChannel: vi.fn(),
  onPartyInvitationResponse: vi.fn(),
  onPartyLeave: vi.fn(),
  onPartyKick: vi.fn(),
  onPartyPromote: vi.fn(),
  onPartyDisband: vi.fn(),
  onReadyCheckStart: vi.fn(),
  onReadyCheckRespond: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

function render(socialGraph = graph()) {
  root.render(
    <SocialGraphPanel
      connectionStatus="connected"
      nearbyPlayers={[remote]}
      selfPresenceId={selfPresenceId}
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

describe('friends and party panel', () => {
  it('opens accessibly, sends nearby friend intent, and closes with Escape', async () => {
    await act(async () => render());
    await act(async () => button('♢Friends')?.click());
    expect(container.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    await act(async () => button('Add friend')?.click());
    expect(callbacks.onFriendRequest).toHaveBeenCalledWith(remotePresenceId);
    await act(async () =>
      container
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(button('♢Friends'));
  });

  it('routes exact friend and party invitation responses from the requests tab', async () => {
    const player = {
      presenceId: remotePresenceId,
      displayName: remote.displayName,
      level: remote.level,
      appearancePreset: remote.appearancePreset,
    };
    await act(async () =>
      render(
        graph({
          incomingRequests: [
            {
              id: '50000000-0000-4000-8000-000000000001',
              status: 'pending',
              sender: player,
              target: { ...player, presenceId: selfPresenceId, displayName: 'Moss Friend' },
              createdAt: timestamp,
              expiresAt: '2026-07-21T00:00:00.000Z',
            },
          ],
          invitations: [
            {
              id: '60000000-0000-4000-8000-000000000001',
              partyId: '70000000-0000-4000-8000-000000000001',
              partyRevision: 3,
              status: 'pending',
              inviter: player,
              target: { ...player, presenceId: selfPresenceId, displayName: 'Moss Friend' },
              createdAt: timestamp,
              expiresAt: '2026-07-14T00:02:00.000Z',
            },
          ],
        }),
      ),
    );
    await act(async () => button('♢Friends2')?.click());
    await act(async () => button('Requests (2)')?.click());
    const acceptButtons = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
      (candidate) => candidate.textContent?.trim() === 'Accept',
    );
    await act(async () => acceptButtons[0]?.click());
    await act(async () => acceptButtons[1]?.click());
    expect(callbacks.onFriendResponse).toHaveBeenCalledWith(
      '50000000-0000-4000-8000-000000000001',
      'accept',
    );
    expect(callbacks.onPartyInvitationResponse).toHaveBeenCalledWith(
      '60000000-0000-4000-8000-000000000001',
      3,
      'accept',
    );
  });

  it('renders a polite compact party status without exposing private identifiers', async () => {
    const socialGraph = graph({
      party: {
        partyId: '70000000-0000-4000-8000-000000000001',
        revision: 2,
        status: 'active',
        capacity: 4,
        leaderPresenceId: selfPresenceId,
        members: [
          {
            presenceId: selfPresenceId,
            displayName: 'Moss Friend',
            level: 1,
            appearancePreset: 'moss',
            role: 'leader',
            connectionStatus: 'online',
            worldId: 'lantern-square',
            worldName: 'Lantern Square',
            channelNumber: 1,
            readyState: 'ready',
            joinedAt: timestamp,
          },
        ],
        pendingInvitationCount: 0,
        readyCheck: null,
        leaderReconnectDeadline: null,
      },
    });
    await act(async () => root.render(<CompactPartyHud socialGraph={socialGraph} />));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Party · 1/4');
    expect(container.textContent).not.toContain('70000000-0000-4000-8000-000000000001');
  });

  it('shows safe party locations, bounded notifications, and joins the leader channel by number', async () => {
    const socialGraph = graph({
      notifications: [
        {
          id: '80000000-0000-4000-8000-000000000001',
          type: 'leader_changed',
          message: 'Fern Friend is now the party leader.',
          actorPresenceId: remotePresenceId,
          partyId: '70000000-0000-4000-8000-000000000001',
          createdAt: timestamp,
          expiresAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      party: {
        partyId: '70000000-0000-4000-8000-000000000001',
        revision: 4,
        status: 'active',
        capacity: 4,
        leaderPresenceId: remotePresenceId,
        members: [
          {
            presenceId: remotePresenceId,
            displayName: 'Fern Friend',
            level: 4,
            appearancePreset: 'moss',
            role: 'leader',
            connectionStatus: 'online',
            worldId: 'lantern-square',
            worldName: 'Lantern Square',
            channelNumber: 2,
            readyState: 'waiting',
            joinedAt: timestamp,
          },
          {
            presenceId: selfPresenceId,
            displayName: 'Moss Friend',
            level: 1,
            appearancePreset: 'moss',
            role: 'member',
            connectionStatus: 'online',
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
      },
    });
    await act(async () => render(socialGraph));
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Fern Friend is now the party leader.',
    );
    await act(async () => button('♢Friends')?.click());
    await act(async () => button('Party')?.click());
    expect(container.textContent).toContain('Lantern Square · Channel 2');
    await act(async () => button("Join leader's channel")?.click());
    expect(callbacks.onJoinLeaderChannel).toHaveBeenCalledWith(2);
  });
});
