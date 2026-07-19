import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlayerProfile } from '@starville/game-core';

import { PlayerExperience } from './PlayerExperience';

vi.mock('./CharacterSetup', () => ({
  CharacterSetup: ({
    onCreate,
  }: {
    readonly onCreate: (input: {
      readonly displayName: string;
      readonly appearancePreset: 'moss';
    }) => Promise<PlayerProfile>;
  }) => (
    <button
      data-testid="character-setup"
      type="button"
      onClick={() => void onCreate({ displayName: 'Luna Vale', appearancePreset: 'moss' })}
    >
      Create profile
    </button>
  ),
}));
vi.mock('./CharacterCustomization', () => ({
  FirstTimeCharacterCreator: ({ onComplete }: { readonly onComplete: () => void }) => (
    <button data-testid="character-creator" type="button" onClick={onComplete}>
      Confirm appearance
    </button>
  ),
}));
vi.mock('./GameWorld', () => ({
  GameWorld: ({
    profile,
    profileConnectionWarning,
  }: {
    readonly profile: PlayerProfile;
    readonly profileConnectionWarning?: boolean;
  }) => (
    <div
      data-connection-warning={String(profileConnectionWarning ?? false)}
      data-name={profile.displayName}
      data-testid="game-world"
    />
  ),
}));
vi.mock('./RequiredRename', () => ({
  RequiredRename: ({
    profile,
    onComplete,
  }: {
    readonly profile: PlayerProfile;
    readonly onComplete: (profile: PlayerProfile) => void;
  }) => (
    <button
      data-testid="required-rename"
      onClick={() => onComplete({ ...profile, displayName: 'Luna Harbor' })}
      type="button"
    >
      Complete rename
    </button>
  ),
}));

const profile: PlayerProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Luna Vale',
  appearancePreset: 'moonberry',
  mapId: 'lantern-square',
  mapVersionId: null,
  x: 12,
  y: 7.5,
  facingDirection: 'south',
  gameStateVersion: 1,
  stateVersion: 1,
  lastTransitionAt: null,
  createdAt: '2026-07-11T04:00:00.000Z',
  updatedAt: '2026-07-11T04:00:00.000Z',
  lastEnteredAt: '2026-07-11T04:00:00.000Z',
};

const access = {
  access: 'granted' as const,
  walletAddress: '11111111111111111111111111111111',
  network: 'solana:mainnet-beta' as const,
  symbol: 'STAR',
  requiredAmount: '1000',
  observedAmount: '1000',
  expiresAt: '2099-07-11T05:00:00.000Z',
  recheckAfter: '2099-07-11T04:05:00.000Z',
};

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  vi.clearAllMocks();
});

async function renderExperience() {
  await act(async () => {
    root.render(
      <PlayerExperience
        access={access}
        apiUrl="http://localhost:4000"
        landingUrl="http://localhost:3000"
        onAccessInvalid={vi.fn()}
        onLeaveVillage={vi.fn(async () => undefined)}
        onRecheck={vi.fn(async () => undefined)}
        rechecking={false}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function entryResponse(entryState: 'active' | 'rename_required' | 'appearance_required') {
  return Response.json({ success: true, data: { entryState, profile } });
}

describe('PlayerExperience moderation bootstrap boundary', () => {
  it('keeps the map unmounted and offers a safe home action for suspension', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ success: false, error: { code: 'PLAYER_SUSPENDED' } }, { status: 403 }),
    );

    await renderExperience();

    expect(container.querySelector('[data-testid="game-world"]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="http://localhost:3000"]')?.textContent,
    ).toContain('Return home');
  });

  it('keeps the map unmounted until a required rename succeeds', async () => {
    globalThis.fetch = vi.fn(async () => entryResponse('rename_required'));
    await renderExperience();

    expect(container.querySelector('[data-testid="game-world"]')).toBeNull();
    const rename = container.querySelector<HTMLButtonElement>('[data-testid="required-rename"]');
    expect(rename).not.toBeNull();

    await act(async () => rename?.click());
    expect(container.querySelector('[data-testid="required-rename"]')).toBeNull();
    expect(container.querySelector('[data-testid="game-world"]')?.getAttribute('data-name')).toBe(
      'Luna Harbor',
    );
  });

  it('mounts the game world only for an active entry state', async () => {
    globalThis.fetch = vi.fn(async () => entryResponse('active'));
    await renderExperience();
    expect(container.querySelector('[data-testid="game-world"]')).not.toBeNull();
  });

  it('keeps the world unmounted until the required first-time appearance is confirmed', async () => {
    globalThis.fetch = vi.fn(async () => entryResponse('appearance_required'));
    await renderExperience();
    expect(container.querySelector('[data-testid="game-world"]')).toBeNull();
    const creator = container.querySelector<HTMLButtonElement>('[data-testid="character-creator"]');
    expect(creator).not.toBeNull();
    await act(async () => creator?.click());
    expect(container.querySelector('[data-testid="character-creator"]')).toBeNull();
    expect(container.querySelector('[data-testid="game-world"]')).not.toBeNull();
  });

  it('continues to the creator when profile creation succeeds but entry reconciliation drops', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, data: { entryState: 'active', profile: null } }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, data: { profile } }))
      .mockRejectedValueOnce(new TypeError('network interrupted'));
    await renderExperience();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="character-setup"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="character-setup"]')).toBeNull();
    expect(container.querySelector('[data-testid="character-creator"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="game-world"]')).toBeNull();
  });

  it('refreshes an administrator-renamed display name when the window regains focus', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(entryResponse('active'))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { entryState: 'active', profile: { ...profile, displayName: 'Willow Vale' } },
        }),
      );
    await renderExperience();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-testid="game-world"]')?.getAttribute('data-name')).toBe(
      'Willow Vale',
    );
  });

  it('keeps the game world mounted when focus reconciliation fails temporarily', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(entryResponse('active'))
      .mockRejectedValueOnce(new TypeError('network interrupted'));
    await renderExperience();
    expect(container.querySelector('[data-testid="game-world"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="game-world"]')).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="game-world"]')
        ?.getAttribute('data-connection-warning'),
    ).toBe('true');
    expect(container.textContent).not.toContain('Loading your villager');
  });

  it('replaces gameplay when focus reconciliation reports suspension', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(entryResponse('active'))
      .mockResolvedValueOnce(
        Response.json({ success: false, error: { code: 'PLAYER_SUSPENDED' } }, { status: 403 }),
      );
    await renderExperience();
    expect(container.querySelector('[data-testid="game-world"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="game-world"]')).toBeNull();
    expect(container.textContent).toContain('Account suspended');
  });
});
