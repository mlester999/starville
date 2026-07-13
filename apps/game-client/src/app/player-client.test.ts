import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PlayerRequestError,
  createPlayerProfile,
  loadPlayerEntry,
  loadPlayerProfile,
  savePlayerState,
} from './player-client';

const originalFetch = globalThis.fetch;
const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Luna Vale',
  appearancePreset: 'moss',
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('protected player client', () => {
  it('loads only the current session-owned profile with credentials', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: { profile, entryState: 'active' },
        requestId: 'request-load',
      }),
    );

    await expect(loadPlayerProfile('http://localhost:4000')).resolves.toEqual(profile);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/v1/token-access/player/profile'),
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
    );
  });

  it('preserves a trusted rename-required entry state without starting gameplay', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: { profile, entryState: 'rename_required' },
      }),
    );

    await expect(loadPlayerEntry('http://localhost:4000')).resolves.toEqual({
      profile,
      entryState: 'rename_required',
    });
  });

  it('creates a character without accepting a wallet identity in the browser request', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ success: true, data: { profile }, requestId: 'request-create' }),
    );

    await createPlayerProfile('http://localhost:4000', {
      displayName: 'Luna Vale',
      appearancePreset: 'moss',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ displayName: 'Luna Vale', appearancePreset: 'moss' }),
      }),
    );
    expect(JSON.stringify(vi.mocked(globalThis.fetch).mock.calls)).not.toContain('walletAddress');
  });

  it('accepts only the validated state fields from a successful save response', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          mapId: 'lantern-square',
          x: 12.5,
          y: 8,
          facingDirection: 'east',
          gameStateVersion: 2,
          updatedAt: '2026-07-11T04:01:00.000Z',
        },
      }),
    );

    await expect(
      savePlayerState(
        'http://localhost:4000',
        {
          mapId: 'lantern-square',
          x: 12.5,
          y: 8,
          facingDirection: 'east',
        },
        1,
      ),
    ).resolves.toEqual({
      mapId: 'lantern-square',
      x: 12.5,
      y: 8,
      facingDirection: 'east',
      gameStateVersion: 2,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          mapId: 'lantern-square',
          x: 12.5,
          y: 8,
          facingDirection: 'east',
          expectedGameStateVersion: 1,
        }),
      }),
    );
  });

  it('fails closed on malformed success payloads and preserves safe API error codes', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: { profile: { walletAddress: 'attacker' }, entryState: 'active' },
      }),
    );
    await expect(loadPlayerProfile('http://localhost:4000')).rejects.toBeInstanceOf(
      PlayerRequestError,
    );

    globalThis.fetch = vi.fn(async () =>
      Response.json(
        { success: false, error: { code: 'TOKEN_ACCESS_EXPIRED', message: 'Expired' } },
        { status: 401 },
      ),
    );
    await expect(loadPlayerProfile('http://localhost:4000')).rejects.toEqual(
      expect.objectContaining({ status: 401, code: 'TOKEN_ACCESS_EXPIRED' }),
    );
  });
});
