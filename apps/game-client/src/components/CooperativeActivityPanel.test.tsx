import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOONPETAL_HARVEST_HELP,
  type CooperativeActivityInstanceSnapshot,
} from '@starville/cooperative-activities';
import type { PartySnapshot } from '@starville/realtime';

import type { RealtimeActivityView } from '../app/realtime-client';
import { CooperativeActivityPanel } from './CooperativeActivityPanel';

const selfPresenceId = '10000000-0000-4000-8000-000000000001';
const friendPresenceId = '10000000-0000-4000-8000-000000000002';
const party: PartySnapshot = {
  partyId: '30000000-0000-4000-8000-000000000001',
  revision: 7,
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
      worldId: 'moonpetal-meadow',
      worldName: 'Moonpetal Meadow',
      channelNumber: 1,
      readyState: 'waiting',
      joinedAt: '2026-07-15T00:00:00.000Z',
    },
    {
      presenceId: friendPresenceId,
      displayName: 'Fern Friend',
      level: 1,
      appearancePreset: 'river',
      role: 'member',
      connectionStatus: 'online',
      worldId: 'moonpetal-meadow',
      worldName: 'Moonpetal Meadow',
      channelNumber: 1,
      readyState: 'waiting',
      joinedAt: '2026-07-15T00:00:00.000Z',
    },
  ],
  pendingInvitationCount: 0,
  readyCheck: null,
  leaderReconnectDeadline: null,
};

function catalogActivity(): RealtimeActivityView {
  return {
    catalog: {
      generatedAt: '2026-07-15T00:00:00.000Z',
      activities: [
        {
          activity: MOONPETAL_HARVEST_HELP,
          availability: 'available',
          availableAt: null,
          rewardedCompletionsToday: 0,
          partyEligible: true,
          leader: true,
        },
      ],
    },
    preparation: null,
    instance: null,
  };
}

function catalogWithTwoActivities(): RealtimeActivityView {
  const activity = catalogActivity();
  const first = activity.catalog.activities[0]!;
  return {
    ...activity,
    catalog: {
      ...activity.catalog,
      activities: [
        first,
        {
          ...first,
          activity: {
            ...first.activity,
            activityKey: 'lantern-garden-help',
            versionId: '8d0b0000-0000-4000-8000-000000000099',
            name: 'Lantern Garden Help',
          },
        },
      ],
    },
  };
}

function instance(status: CooperativeActivityInstanceSnapshot['status'] = 'active') {
  return {
    instanceId: '8d0b0000-0000-4000-8000-000000000010',
    activity: MOONPETAL_HARVEST_HELP,
    status,
    revision: 2,
    currentObjectiveKey: status === 'active' ? 'gather-seed-bundles' : null,
    objectives: [
      {
        key: 'gather-seed-bundles',
        label: 'Gather Seed Bundles',
        type: 'shared_collect_count' as const,
        current: status === 'completed' ? 6 : 2,
        target: 6,
        status: status === 'completed' ? ('completed' as const) : ('active' as const),
        startedAt: '2026-07-15T00:00:00.000Z',
        completedAt: status === 'completed' ? '2026-07-15T00:04:00.000Z' : null,
        timerEndsAt: null,
      },
    ],
    participants: party.members.map((member) => ({
      presenceId: member.presenceId,
      displayName: member.displayName,
      level: member.level,
      connectionStatus: 'online' as const,
      contribution: 3,
      rewardEligible: true,
      reconnectDeadline: null,
    })),
    objects: [],
    personalContribution: 3,
    temporaryItemCount: 1,
    startedAt: '2026-07-15T00:00:00.000Z',
    expiresAt: '2026-07-15T00:08:00.000Z',
    pausedAt: null,
    completedAt: status === 'completed' ? '2026-07-15T00:04:00.000Z' : null,
    resultCode: status === 'completed' ? 'community_harvest_complete' : null,
    receipts:
      status === 'completed'
        ? [
            {
              receiptId: '8d0b0000-0000-4000-8000-000000000020',
              status: 'settled' as const,
              dust: 15,
              items: [{ itemSlug: 'moonbean', quantity: 2 }],
              settledAt: '2026-07-15T00:04:00.000Z',
              dailyRewardNumber: 1,
            },
          ]
        : [],
    spawn: { x: 14, y: 9 },
  } satisfies CooperativeActivityInstanceSnapshot;
}

const callbacks = {
  onOpenChange: vi.fn(),
  onCatalogRequest: vi.fn(),
  onPrepare: vi.fn(),
  onReady: vi.fn(),
  onEnter: vi.fn(),
  onLeave: vi.fn(),
  onSnapshotRequest: vi.fn(),
  onOpenFriends: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

function render(activity: RealtimeActivityView, currentParty: PartySnapshot | null = party) {
  root.render(
    <CooperativeActivityPanel
      activity={activity}
      party={currentParty}
      selfPresenceId={selfPresenceId}
      disabled={false}
      {...callbacks}
    />,
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

describe('cooperative activity player experience', () => {
  it('shows bounded requirements and lets only the authoritative party revision be prepared', async () => {
    await act(async () => render(catalogActivity()));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Activities'))
        ?.click(),
    );
    expect(callbacks.onCatalogRequest).toHaveBeenCalledOnce();
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('2–4 Players');
    expect(container.textContent).toContain('15DUST');
    expect(container.textContent).toContain('2Moonbeans');
    expect(container.textContent).not.toContain('2 moonbean');
    expect(container.textContent).toContain('Objective Journey');
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Prepare Activity')
        ?.click(),
    );
    expect(callbacks.onPrepare).toHaveBeenCalledWith('moonpetal-harvest-help', 7);
  });

  it('blocks gameplay for leave confirmation and terminal receipt dialogs', async () => {
    await act(async () => render({ ...catalogActivity(), instance: instance() }));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Leave')
        ?.click(),
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(true);
    await act(async () => render({ ...catalogActivity(), instance: instance('completed') }));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('15 DUST');
    expect(container.textContent).toContain('2 Moonbeans');
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('supports arrow-key activity selection without introducing an inactive focus stop', async () => {
    await act(async () => render(catalogWithTwoActivities()));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Activities'))
        ?.click(),
    );
    const first = container.querySelector<HTMLButtonElement>(
      '#activity-option-moonpetal-harvest-help',
    );
    first?.focus();
    await act(async () =>
      first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    const second = container.querySelector<HTMLButtonElement>(
      '#activity-option-lantern-garden-help',
    );
    expect(second?.getAttribute('aria-current')).toBe('true');
    expect(second?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(second);
    expect(container.textContent).toContain('Lantern Garden Help');
  });

  it('routes an ineligible player to a real party action instead of a dead disabled CTA', async () => {
    await act(async () => render(catalogActivity(), null));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Activities'))
        ?.click(),
    );
    const openParty = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Open Friends & Party',
    );
    expect(openParty?.disabled).toBe(false);
    await act(async () => openParty?.click());
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    expect(callbacks.onOpenFriends).toHaveBeenCalledWith('party');
  });

  it('renders cooldown and failure outcomes as player-facing status, never raw codes', async () => {
    const view = catalogActivity();
    const first = view.catalog.activities[0]!;
    await act(async () =>
      render({
        ...view,
        catalog: {
          ...view.catalog,
          activities: [
            {
              ...first,
              availability: 'cooldown',
              availableAt: '2099-07-15T00:08:00.000Z',
              partyEligible: false,
            },
          ],
        },
      }),
    );
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Activities'))
        ?.click(),
    );
    expect(container.textContent).toContain('On Cooldown');
    expect(container.textContent).not.toContain('cooldown');

    await act(async () => render({ ...catalogActivity(), instance: instance('failed') }));
    expect(container.textContent).toContain('The Community Harvest Was Not Completed');
    expect(container.textContent).toContain('No rewards granted');
    expect(container.textContent).not.toContain('resultCode');
  });
});
