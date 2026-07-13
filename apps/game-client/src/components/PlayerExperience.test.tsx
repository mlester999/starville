import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlayerProfile } from '@starville/game-core';

import { PlayerExperience } from './PlayerExperience';

vi.mock('./CharacterSetup', () => ({
  CharacterSetup: () => <div data-testid="character-setup" />,
}));
vi.mock('./GameWorld', () => ({
  GameWorld: ({ profile }: { readonly profile: PlayerProfile }) => (
    <div data-name={profile.displayName} data-testid="game-world" />
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

function entryResponse(entryState: 'active' | 'rename_required') {
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
    expect(container.textContent).toContain('Connection interrupted');
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
