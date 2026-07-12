import { describe, expect, it, vi } from 'vitest';

import type { PlayerProfile } from '@starville/game-core';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { PublicApiError } from '../errors.js';
import type { PlayerGateway } from './contracts.js';
import { createPlayerService } from './service.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

const profile: PlayerProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Luna Vale',
  appearancePreset: 'moss',
  mapId: 'lantern-square',
  x: 12,
  y: 7.5,
  facingDirection: 'south',
  gameStateVersion: 1,
  createdAt: '2026-07-11T04:00:00.000Z',
  updatedAt: '2026-07-11T04:00:00.000Z',
  lastEnteredAt: '2026-07-11T04:00:00.000Z',
};

function createGateway(): PlayerGateway {
  return {
    loadEntry: vi.fn(async () => ({ entryState: 'active' as const, profile })),
    createProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => ({ entryState: 'active' as const, profile })),
    completeRename: vi.fn(async () => ({ entryState: 'active' as const, profile })),
    saveState: vi.fn(async () => ({ entryState: 'active' as const, profile })),
  };
}

describe('player service', () => {
  it('normalizes and validates profile creation before calling the trusted gateway', async () => {
    const gateway = createGateway();
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(
      service.createProfile(
        '11111111111111111111111111111111',
        { displayName: '  Luna   Vale ', appearancePreset: 'moss' },
        'request-create',
      ),
    ).resolves.toEqual(profile);
    expect(gateway.createProfile).toHaveBeenCalledWith(
      '11111111111111111111111111111111',
      { displayName: 'Luna Vale', appearancePreset: 'moss' },
      'request-create',
      6,
    );
  });

  it.each([
    { displayName: '<Luna>', appearancePreset: 'moss' },
    { displayName: '  ', appearancePreset: 'moss' },
    { displayName: 'Luna', appearancePreset: 'paid' },
    { displayName: 'Luna', appearancePreset: 'moss', walletAddress: 'attacker' },
  ])('rejects malformed profile input without persistence', async (input) => {
    const gateway = createGateway();
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(service.createProfile('server-wallet', input, 'request-invalid')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_PLAYER_PROFILE', statusCode: 400 }),
    );
    expect(gateway.createProfile).not.toHaveBeenCalled();
  });

  it('maps durable rate limiting to the shared safe error envelope', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.createProfile).mockResolvedValueOnce('rate_limited');
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(
      service.createProfile(
        'server-wallet',
        { displayName: 'Luna', appearancePreset: 'river' },
        'request-rate',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'RATE_LIMITED', statusCode: 429 }));
  });

  it('validates safe state saves and rejects client-supplied state outside the map boundary', async () => {
    const gateway = createGateway();
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await service.saveState(
      'server-wallet',
      {
        mapId: 'lantern-square',
        x: 12.25,
        y: 8,
        facingDirection: 'southeast',
        expectedGameStateVersion: 1,
      },
      'request-save',
    );
    expect(gateway.saveState).toHaveBeenCalledWith(
      'server-wallet',
      {
        mapId: 'lantern-square',
        x: 12.25,
        y: 8,
        facingDirection: 'southeast',
        expectedGameStateVersion: 1,
      },
      'request-save',
      30,
    );

    await expect(
      service.saveState(
        'server-wallet',
        {
          mapId: 'lantern-square',
          x: 0.8,
          y: 0.8,
          facingDirection: 'south',
          expectedGameStateVersion: 1,
        },
        'request-unsafe',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'UNSAFE_PLAYER_POSITION' }));

    await expect(
      service.saveState(
        'server-wallet',
        {
          mapId: 'lantern-square',
          x: 5,
          y: 4.25,
          facingDirection: 'south',
          expectedGameStateVersion: 1,
        },
        'request-inside-cottage',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'UNSAFE_PLAYER_POSITION' }));
  });

  it.each([
    { mapId: 'another-map', x: 12, y: 8, facingDirection: 'south' },
    { mapId: 'lantern-square', x: Number.NaN, y: 8, facingDirection: 'south' },
    { mapId: 'lantern-square', x: 12, y: Number.POSITIVE_INFINITY, facingDirection: 'south' },
    { mapId: 'lantern-square', x: 12, y: 8, facingDirection: 'sideways' },
  ])('rejects malformed saved state', async (input) => {
    const gateway = createGateway();
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(
      service.saveState('server-wallet', input, 'request-invalid-state'),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_PLAYER_STATE', statusCode: 400 }));
    expect(gateway.saveState).not.toHaveBeenCalled();
  });

  it('maps a stale state version to a safe reload conflict', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.saveState).mockResolvedValueOnce('game_state_version_conflict');
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(
      service.saveState(
        'server-wallet',
        {
          mapId: 'lantern-square',
          x: 12,
          y: 7.5,
          facingDirection: 'south',
          expectedGameStateVersion: 1,
        },
        'request-stale-state',
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'PLAYER_STATE_VERSION_CONFLICT', statusCode: 409 }),
    );
  });

  it('falls back to the configured safe spawn when persisted state is blocked', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.loadEntry).mockResolvedValueOnce({
      entryState: 'active',
      profile: { ...profile, x: 5, y: 4.25 },
    });
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(service.loadEntry('server-wallet', 'request-resume', true)).resolves.toMatchObject(
      {
        entryState: 'active',
        profile: {
          mapId: 'lantern-square',
          x: 12,
          y: 7.5,
          facingDirection: 'south',
        },
      },
    );
  });

  it('does not leak persistence failures through raw errors', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.loadEntry).mockRejectedValueOnce(new Error('private database detail'));
    const service = createPlayerService({ gateway, logger: new SilentLogger() });

    await expect(service.loadEntry('server-wallet', 'request-failure', true)).rejects.toEqual(
      expect.objectContaining({
        code: 'PLAYER_PERSISTENCE_UNAVAILABLE',
        statusCode: 503,
        message: 'The player service is temporarily unavailable.',
      } satisfies Partial<PublicApiError>),
    );
  });
});
