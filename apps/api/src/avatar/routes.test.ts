import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvatarService } from './contracts.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { buildApiApp } from '../app.js';
import type { PlayerService } from '../player/contracts.js';
import type { TokenAccessService } from '../token-access/contracts.js';

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

const playerProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Luna Vale',
  appearancePreset: 'moss' as const,
  mapId: 'lantern-square' as const,
  mapVersionId: null,
  x: 12,
  y: 7.5,
  facingDirection: 'south' as const,
  gameStateVersion: 1,
  stateVersion: 1,
  lastTransitionAt: null,
  createdAt: '2026-07-15T08:00:00.000Z',
  updatedAt: '2026-07-15T08:00:00.000Z',
  lastEnteredAt: '2026-07-15T08:00:00.000Z',
};

const selection = {
  body: 'moss',
  skinTone: 'skin-one',
  face: 'face-one',
  eyes: 'eyes-one',
  eyebrows: 'eyebrows-one',
  hair: 'hair-one',
  hairColor: 'hair-color-one',
  top: 'top-one',
  bottom: 'bottom-one',
  footwear: 'footwear-one',
  accessories: ['accessory-one'],
};

const resolved = {
  appearanceId: '33333333-3333-4333-8333-333333333333',
  revision: 1,
  legacyFallbackPreset: 'moss' as const,
  selection,
  presetKey: null,
};

function avatarService(): AvatarService {
  return {
    getCatalog: vi.fn(async () => ({
      revision: 1,
      options: {
        body: [],
        skinTone: [],
        face: [],
        eyes: [],
        eyebrows: [],
        hair: [],
        hairColor: [],
        top: [],
        bottom: [],
        footwear: [],
        accessories: [],
      },
      presets: [],
      settings: {
        maximumAccessories: 3,
        customizationEnabled: false,
        developmentFallback: false,
      },
    })),
    getProfile: vi.fn(async () => resolved),
    preview: vi.fn(async () => selection),
    create: vi.fn(async () => ({
      ...resolved,
      creatorCompleted: true,
      updatedAt: '2026-07-15T08:00:00.000Z',
    })),
    update: vi.fn(async () => ({
      ...resolved,
      revision: 2,
      creatorCompleted: true,
      updatedAt: '2026-07-15T08:01:00.000Z',
    })),
    resolvePublic: vi.fn(async () => resolved),
  };
}

function tokenService(): TokenAccessService {
  return {
    getCurrentSession: vi.fn(async () => ({
      view: {
        access: 'granted' as const,
        walletAddress: '11111111111111111111111111111111',
        network: 'solana:mainnet-beta' as const,
        symbol: 'STAR',
        requiredAmount: '1000',
        observedAmount: '1000',
        expiresAt: '2026-07-15T09:00:00.000Z',
        recheckAfter: '2026-07-15T08:05:00.000Z',
      },
    })),
  } as unknown as TokenAccessService;
}

function playerService(): PlayerService {
  return {
    loadEntry: vi.fn(async () => ({ entryState: 'active' as const, profile: playerProfile })),
  } as unknown as PlayerService;
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(avatars: AvatarService) {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      corsAllowedOrigins: ['http://localhost:3001'],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: adminGateway,
    adminSessionTtlMinutes: 60,
    tokenAccess: {
      service: tokenService(),
      cookieHashSecret: 'test-cookie-secret-at-least-32-characters',
      cookieSecure: false,
      cookieMaxAgeSeconds: 900,
      playerService: playerService(),
      avatarService: avatars,
    },
  });
  apps.push(app);
  return app;
}

const cookie = `starville-token-access=${'t'.repeat(43)}`;

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('avatar HTTP routes', () => {
  it('uses only the trusted session wallet and server-computed access token hash', async () => {
    const avatars = avatarService();
    const response = await createApp(avatars).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/avatar',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(avatars.getProfile).toHaveBeenCalledWith({
      walletAddress: '11111111111111111111111111111111',
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      requestId: expect.any(String),
    });
    expect(JSON.stringify(vi.mocked(avatars.getProfile).mock.calls)).not.toContain('t'.repeat(43));
    expect(response.body).not.toContain('walletAddress');
  });

  it('rejects a missing scoped cookie before the avatar service', async () => {
    const avatars = avatarService();
    const response = await createApp(avatars).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/avatar',
    });
    expect(response.statusCode).toBe(401);
    expect(avatars.getProfile).not.toHaveBeenCalled();
  });

  it('requires a trusted browser origin for preview and mutations', async () => {
    const avatars = avatarService();
    const app = createApp(avatars);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/avatar/preview',
      headers: { cookie },
      payload: { selection },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/avatar/preview',
      headers: { cookie, origin: 'http://localhost:3001' },
      payload: { selection },
    });
    expect(denied.statusCode).toBe(403);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ success: true, data: { selection } });
  });

  it('returns a privacy-safe public appearance without requiring player authentication', async () => {
    const avatars = avatarService();
    const response = await createApp(avatars).inject({
      method: 'GET',
      url: `/api/v1/token-access/player/avatar/public/${resolved.appearanceId}?revision=1`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { appearance: resolved } });
    expect(response.body).not.toContain('wallet');
    expect(response.body).not.toContain('email');
  });

  it('rejects invalid public appearance identifiers and revisions', async () => {
    const avatars = avatarService();
    const app = createApp(avatars);
    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/avatar/public/not-an-id?revision=1',
    });
    const invalidRevision = await app.inject({
      method: 'GET',
      url: `/api/v1/token-access/player/avatar/public/${resolved.appearanceId}?revision=-1`,
    });
    expect(invalidId.statusCode).toBe(400);
    expect(invalidRevision.statusCode).toBe(400);
    expect(avatars.resolvePublic).not.toHaveBeenCalled();
  });
});
