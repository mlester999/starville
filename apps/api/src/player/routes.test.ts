import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlayerProfile } from '@starville/game-core';
import type { TokenAccessSessionView } from '@starville/wallet-access';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { PlayerService } from './contracts.js';
import type { RuntimeTokenGateConfig, TokenAccessService } from '../token-access/contracts.js';

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

const adminGateway: AdminAuthGateway = {
  verifyBearer: async () => undefined,
  loadAuthorization: async () => ({ outcome: 'unauthenticated' }),
  createSession: async () => ({ outcome: 'unauthenticated' }),
  revokeCurrentSession: async () => false,
  recordDenial: async () => undefined,
};

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

function playerService(): PlayerService {
  return {
    loadEntry: vi.fn(async () => ({ entryState: 'active' as const, profile })),
    createProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    completeRename: vi.fn(async () => profile),
    saveState: vi.fn(async () => profile),
  };
}

const grantedView: TokenAccessSessionView = {
  access: 'granted',
  walletAddress: '11111111111111111111111111111111',
  network: 'solana:mainnet-beta',
  symbol: 'STAR',
  requiredAmount: '1000',
  observedAmount: '1000',
  expiresAt: '2026-07-11T05:00:00.000Z',
  recheckAfter: '2026-07-11T04:05:00.000Z',
};

function tokenService(view: TokenAccessSessionView = grantedView): TokenAccessService {
  const mintAddress = 'So11111111111111111111111111111111111111112';
  const runtimeConfig: RuntimeTokenGateConfig = {
    id: '22222222-2222-4222-8222-222222222222',
    environmentKey: 'test',
    network: 'solana:mainnet-beta',
    mintAddress,
    tokenProgram: 'spl-token' as const,
    symbol: 'STAR',
    decimals: 6,
    requiredAmountRaw: '1000000000',
    requiredAmount: '1000',
    enabled: true,
    availability: 'available' as const,
    commitment: 'confirmed' as const,
    sessionTtlSeconds: 900,
    recheckIntervalSeconds: 300,
    configVersion: 1,
    lastValidatedAt: null,
    lastValidatedSlot: null,
  };

  return {
    getPublicConfig: vi.fn(
      async () =>
        ({
          enabled: true,
          availability: 'available',
          network: 'solana:mainnet-beta',
          symbol: 'STAR',
          mintAddress,
          requiredAmount: '1000',
          recheckIntervalSeconds: 300,
        }) as const,
    ),
    createChallenge: vi.fn(async () => ({
      challengeId: '33333333-3333-4333-8333-333333333333',
      message: 'message',
      expiresAt: '2026-07-11T04:05:00.000Z',
    })),
    verify: vi.fn(async () => ({ view })),
    getCurrentSession: vi.fn(async () => ({ view })),
    recheck: vi.fn(async () => ({ view })),
    revoke: vi.fn(async () => true),
    getAdminConfig: vi.fn(async () => runtimeConfig),
    validateAdminMint: vi.fn(
      async () =>
        ({
          network: 'solana:mainnet-beta',
          mintAddress,
          tokenProgram: 'spl-token',
          decimals: 6,
          slot: '100',
          commitment: 'confirmed',
        }) as const,
    ),
    updateAdminConfig: vi.fn(async () => runtimeConfig),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(service = tokenService(), players = playerService()) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3001'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: adminGateway,
    adminSessionTtlMinutes: 60,
    tokenAccess: {
      service,
      cookieHashSecret: 'test-cookie-secret-at-least-32-characters',
      cookieSecure: false,
      cookieMaxAgeSeconds: 900,
      playerService: players,
    },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('protected player routes', () => {
  it('derives wallet ownership only from the trusted access session', async () => {
    const players = playerService();
    const response = await createApp(tokenService(), players).inject({
      method: 'POST',
      url: '/api/v1/token-access/player/profile',
      headers: { origin: 'http://localhost:3001' },
      payload: { displayName: 'Luna Vale', appearancePreset: 'moonberry' },
    });

    expect(response.statusCode).toBe(200);
    expect(players.createProfile).toHaveBeenCalledWith(
      grantedView.walletAddress,
      { displayName: 'Luna Vale', appearancePreset: 'moonberry' },
      expect.any(String),
    );
    expect(response.body).not.toContain(grantedView.walletAddress ?? 'missing-wallet');
  });

  it.each(['none', 'expired', 'revoked', 'configuration_changed'] as const)(
    'blocks %s sessions before profile access',
    async (access) => {
      const players = playerService();
      const service = tokenService({
        access,
        network: 'solana:mainnet-beta',
        symbol: 'STAR',
        requiredAmount: '1000',
      });
      const response = await createApp(service, players).inject({
        method: 'GET',
        url: '/api/v1/token-access/player/profile',
      });

      expect(response.statusCode).toBe(401);
      expect(players.loadEntry).not.toHaveBeenCalled();
    },
  );

  it('loads the eligible profile without exposing a public enumeration route', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });
    const enumeration = await createApp().inject({
      method: 'GET',
      url: `/api/v1/token-access/player/profile/${profile.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { profile, entryState: 'active' },
    });
    expect(enumeration.statusCode).toBe(404);
  });

  it('touches last-entered only for profile bootstrap, not profile or state writes', async () => {
    const players = playerService();
    const app = createApp(tokenService(), players);
    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(players.loadEntry).toHaveBeenCalledWith(
      grantedView.walletAddress,
      expect.any(String),
      true,
    );

    vi.mocked(players.loadEntry).mockClear();
    const profileUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/v1/token-access/player/profile',
      headers: { origin: 'http://localhost:3001' },
      payload: { appearancePreset: 'river' },
    });
    const stateUpdate = await app.inject({
      method: 'PUT',
      url: '/api/v1/token-access/player/state',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        mapId: 'lantern-square',
        x: 12.5,
        y: 8,
        facingDirection: 'east',
        expectedGameStateVersion: 1,
      },
    });

    expect(profileUpdate.statusCode).toBe(200);
    expect(stateUpdate.statusCode).toBe(200);
    expect(players.loadEntry).not.toHaveBeenCalled();
    expect(players.saveState).toHaveBeenCalledWith(
      grantedView.walletAddress,
      expect.objectContaining({ expectedGameStateVersion: 1 }),
      expect.any(String),
    );
  });

  it('blocks a suspended profile before state or canvas bootstrap', async () => {
    const players = playerService();
    vi.mocked(players.loadEntry).mockResolvedValue({ entryState: 'suspended', profile });
    const response = await createApp(tokenService(), players).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'PLAYER_SUSPENDED' },
    });
  });

  it('returns a sanitized 503 when player persistence is unavailable', async () => {
    const players = playerService();
    vi.mocked(players.loadEntry).mockRejectedValue(
      new PublicApiError(503, 'PLAYER_PERSISTENCE_UNAVAILABLE'),
    );
    const response = await createApp(tokenService(), players).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'PLAYER_PERSISTENCE_UNAVAILABLE',
        message: 'The player service is temporarily unavailable.',
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('mapVersionId');
    expect(JSON.stringify(response.json())).not.toContain('Zod');
    expect(JSON.stringify(response.json())).not.toContain('postgres');
  });

  it('allows a restored active player with Phase 6 multi-map profile fields', async () => {
    const restoredProfile = {
      ...profile,
      mapVersionId: '55555555-5555-4555-8555-555555555555',
      gameStateVersion: 3,
      stateVersion: 3,
      lastTransitionAt: '2026-07-12T12:00:00.000Z',
    };
    const players = playerService();
    vi.mocked(players.loadEntry).mockResolvedValue({
      entryState: 'active',
      profile: restoredProfile,
    });
    const response = await createApp(tokenService(), players).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        entryState: 'active',
        profile: {
          mapVersionId: restoredProfile.mapVersionId,
          stateVersion: 3,
          lastTransitionAt: restoredProfile.lastTransitionAt,
        },
      },
    });
  });

  it('routes rename-required players to the minimum protected rename flow', async () => {
    const players = playerService();
    vi.mocked(players.loadEntry).mockResolvedValue({ entryState: 'rename_required', profile });
    const app = createApp(tokenService(), players);
    const entry = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/profile',
    });
    const blockedState = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/state',
    });
    const renamed = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/rename',
      headers: { origin: 'http://localhost:3001' },
      payload: { displayName: 'Luna Harbor' },
    });

    expect(entry.statusCode).toBe(200);
    expect(entry.json()).toMatchObject({ data: { entryState: 'rename_required', profile } });
    expect(blockedState.statusCode).toBe(409);
    expect(blockedState.json()).toMatchObject({ error: { code: 'PLAYER_RENAME_REQUIRED' } });
    expect(renamed.statusCode).toBe(200);
    expect(players.completeRename).toHaveBeenCalledWith(
      grantedView.walletAddress,
      { displayName: 'Luna Harbor' },
      expect.any(String),
    );
  });

  it('requires allowlisted JSON mutations for PATCH and PUT', async () => {
    const app = createApp();
    const untrusted = await app.inject({
      method: 'PATCH',
      url: '/api/v1/token-access/player/profile',
      headers: { origin: 'https://untrusted.example' },
      payload: { displayName: 'Luna' },
    });
    const nonJson = await app.inject({
      method: 'PUT',
      url: '/api/v1/token-access/player/state',
      headers: { origin: 'http://localhost:3001', 'content-type': 'text/plain' },
      payload: 'state',
    });

    expect(untrusted.statusCode).toBe(403);
    expect(nonJson.statusCode).toBe(400);
  });

  it('supports credentialed PUT preflight only for allowlisted origins', async () => {
    const response = await createApp().inject({
      method: 'OPTIONS',
      url: '/api/v1/token-access/player/state',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'PUT',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
  });
});
