import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import { buildApiApp } from '../app.js';
import type { PlayerService } from '../player/contracts.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import type { CosmeticGateway, CosmeticService } from './contracts.js';

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
  body: 'meadow-frame',
  skinTone: 'warm-tone',
  face: 'soft-face',
  eyes: 'bright-eyes',
  eyebrows: 'soft-brows',
  hair: 'meadow-hair',
  hairColor: 'chestnut-color',
  top: 'lantern-top',
  bottom: 'meadow-bottom',
  footwear: 'trail-shoes',
  accessories: [],
};
const wardrobe = {
  status: 'loaded' as const,
  ownedItems: [],
  loadouts: [],
  emotes: [
    {
      key: 'wave',
      name: 'Wave',
      durationMs: 1800,
      interruptible: true,
      owned: true,
      sourceLabel: 'Starter wardrobe',
    },
  ],
  emoteWheel: ['wave'],
  emoteWheelRevision: 0,
  collections: [],
  shop: {
    enabled: false as const,
    lifecycle: 'disabled_preview' as const,
    currency: 'DUST' as const,
    purchaseAvailable: false as const,
    message: 'Cosmetic offers are preview-only and purchases are unavailable.',
    offers: [],
  },
};

function cosmeticService(): CosmeticService {
  return { wardrobe: vi.fn(async () => wardrobe), mutate: vi.fn(async (operation) => operation()) };
}
function cosmeticGateway(): CosmeticGateway {
  return {
    wardrobe: vi.fn(async () => wardrobe),
    saveLoadout: vi.fn(async () => ({ status: 'saved' })),
    renameLoadout: vi.fn(async () => ({ status: 'renamed' })),
    deleteLoadout: vi.fn(async () => ({ status: 'deleted' })),
    applyLoadout: vi.fn(async () => ({ status: 'updated' })),
    updateEmoteWheel: vi.fn(async () => ({ status: 'updated' })),
    activateEmote: vi.fn(async () => ({ status: 'activated' })),
    claimCollection: vi.fn(async () => ({ status: 'claimed' })),
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
        requiredAmount: '10000',
        observedAmount: '10000',
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
function createApp(service: CosmeticService, gateway: CosmeticGateway) {
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
      cosmeticService: service,
      cosmeticGateway: gateway,
    },
  });
  apps.push(app);
  return app;
}
const cookie = `starville-token-access=${'t'.repeat(43)}`;
afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())));

describe('cosmetic HTTP routes', () => {
  it('loads only the authenticated player Wardrobe and emits no private identity', async () => {
    const service = cosmeticService();
    const gateway = cosmeticGateway();
    const response = await createApp(service, gateway).inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cosmetics',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(service.wardrobe).toHaveBeenCalledWith({
      walletAddress: '11111111111111111111111111111111',
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain('walletAddress');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('requires trusted origin and rejects out-of-bound loadout and emote input', async () => {
    const service = cosmeticService();
    const gateway = cosmeticGateway();
    const app = createApp(service, gateway);
    const requestId = '55555555-5555-4555-8555-555555555555';
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cosmetics/loadouts',
      headers: { cookie },
      payload: { slot: 1, name: 'Safe outfit', selection, expectedRevision: 0, requestId },
    });
    const invalidSlot = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cosmetics/loadouts',
      headers: { cookie, origin: 'http://localhost:3001' },
      payload: { slot: 6, name: 'Too many', selection, expectedRevision: 0, requestId },
    });
    const oversizedEmote = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cosmetics/emotes/activate',
      headers: { cookie, origin: 'http://localhost:3001' },
      payload: { emoteKey: `e${'m'.repeat(80)}`, requestId },
    });
    expect(denied.statusCode).toBe(403);
    expect(invalidSlot.statusCode).toBe(400);
    expect(oversizedEmote.statusCode).toBe(400);
    expect(gateway.saveLoadout).not.toHaveBeenCalled();
    expect(gateway.activateEmote).not.toHaveBeenCalled();
  });

  it('has no cosmetic purchase endpoint while the shop is disabled', async () => {
    const gateway = cosmeticGateway();
    const response = await createApp(cosmeticService(), gateway).inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cosmetics/purchase',
      headers: { cookie, origin: 'http://localhost:3001' },
      payload: { offerKey: 'anything' },
    });
    expect(response.statusCode).toBe(404);
    expect(
      Object.values(gateway).every((operation) => vi.mocked(operation).mock.calls.length === 0),
    ).toBe(true);
  });
});
