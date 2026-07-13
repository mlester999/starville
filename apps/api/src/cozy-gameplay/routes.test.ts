import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlayerProfile } from '@starville/game-core';
import type { TokenAccessSessionView } from '@starville/wallet-access';

import { buildApiApp } from '../app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../contracts.js';
import type { LiveOperationsService } from '../live-operations/contracts.js';
import type { PlayerService } from '../player/contracts.js';
import type { RuntimeTokenGateConfig, TokenAccessService } from '../token-access/contracts.js';
import type { CozyGameplayService } from './contracts.js';
import {
  WALLET_ADDRESS,
  cozyBootstrapFixture,
  dustLedgerFixture,
  farmMutationFixture,
  farmPlotListFixture,
  furnitureMutationFixture,
  homeAccessFixture,
  homeViewFixture,
  inventoryHistoryFixture,
  inventoryViewFixture,
  itemCatalogFixture,
  quickbarMutationFixture,
  recipeActionFixture,
  recipeCatalogFixture,
  shopCatalogFixture,
  shopTransactionFixture,
} from './test-fixtures.js';

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
  createdAt: '2026-07-13T01:00:00.000Z',
  updatedAt: '2026-07-13T01:00:00.000Z',
  lastEnteredAt: '2026-07-13T01:00:00.000Z',
};

function players(entryState: 'active' | 'suspended' | 'rename_required' = 'active'): PlayerService {
  return {
    loadEntry: vi.fn(async () => ({ entryState, profile })),
    createProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    completeRename: vi.fn(async () => profile),
    saveState: vi.fn(async () => profile),
  };
}

const grantedView: TokenAccessSessionView = {
  access: 'granted',
  walletAddress: WALLET_ADDRESS,
  network: 'solana:mainnet-beta',
  symbol: 'STAR',
  requiredAmount: '1000',
  observedAmount: '1000',
  expiresAt: '2026-07-13T02:00:00.000Z',
  recheckAfter: '2026-07-13T01:05:00.000Z',
};

function tokenService(view: TokenAccessSessionView = grantedView): TokenAccessService {
  const runtimeConfig = {
    id: '22222222-2222-4222-8222-222222222222',
    environmentKey: 'test',
    network: 'solana:mainnet-beta',
    mintAddress: 'So11111111111111111111111111111111111111112',
    tokenProgram: 'spl-token',
    symbol: 'STAR',
    decimals: 6,
    requiredAmountRaw: '1000000000',
    requiredAmount: '1000',
    enabled: true,
    availability: 'available',
    commitment: 'confirmed',
    sessionTtlSeconds: 900,
    recheckIntervalSeconds: 300,
    configVersion: 1,
    lastValidatedAt: null,
    lastValidatedSlot: null,
  } as const satisfies RuntimeTokenGateConfig;

  return {
    getPublicConfig: vi.fn(async () => ({
      enabled: true,
      availability: 'available' as const,
      network: 'solana:mainnet-beta' as const,
      symbol: 'STAR',
      mintAddress: runtimeConfig.mintAddress,
      requiredAmount: '1000',
      recheckIntervalSeconds: 300,
    })),
    createChallenge: vi.fn(async () => ({
      challengeId: '33333333-3333-4333-8333-333333333333',
      message: 'message',
      expiresAt: '2026-07-13T01:05:00.000Z',
    })),
    verify: vi.fn(async () => ({ view })),
    getCurrentSession: vi.fn(async () => ({ view })),
    recheck: vi.fn(async () => ({ view })),
    revoke: vi.fn(async () => true),
    getAdminConfig: vi.fn(async () => runtimeConfig),
    validateAdminMint: vi.fn(async () => ({
      network: 'solana:mainnet-beta' as const,
      mintAddress: runtimeConfig.mintAddress,
      tokenProgram: 'spl-token' as const,
      decimals: 6,
      slot: '100',
      commitment: 'confirmed' as const,
    })),
    updateAdminConfig: vi.fn(async () => runtimeConfig),
  };
}

function cozyService(): CozyGameplayService {
  return {
    bootstrap: vi.fn(async () => cozyBootstrapFixture),
    getDustLedger: vi.fn(async () => dustLedgerFixture),
    getInventory: vi.fn(async () => inventoryViewFixture),
    getInventoryHistory: vi.fn(async () => inventoryHistoryFixture),
    updateQuickbar: vi.fn(async () => quickbarMutationFixture),
    getFarmPlots: vi.fn(async () => farmPlotListFixture),
    getItemCatalog: vi.fn(async () => itemCatalogFixture),
    plant: vi.fn(async () => farmMutationFixture),
    water: vi.fn(async () => farmMutationFixture),
    harvest: vi.fn(async () => farmMutationFixture),
    getRecipeCatalog: vi.fn(async () => recipeCatalogFixture),
    executeRecipe: vi.fn(async () => recipeActionFixture),
    getShopCatalog: vi.fn(async () => shopCatalogFixture),
    executeShopTransaction: vi.fn(async () => shopTransactionFixture),
    getHome: vi.fn(async () => homeViewFixture),
    enterHome: vi.fn(async () => homeAccessFixture),
    exitHome: vi.fn(async () => ({ ...homeAccessFixture, location: 'public_world' as const })),
    placeFurniture: vi.fn(async () => furnitureMutationFixture),
    moveFurniture: vi.fn(async () => furnitureMutationFixture),
    rotateFurniture: vi.fn(async () => furnitureMutationFixture),
    removeFurniture: vi.fn(async () => furnitureMutationFixture),
  };
}

function liveOperations(active: boolean): LiveOperationsService {
  return {
    getPublic: vi.fn(async () => ({
      maintenance: {
        state: active ? ('active' as const) : ('disabled' as const),
        active,
        revision: 1,
        title: 'SERVER PAUSED',
        message: 'A safe maintenance message.',
        updateDetails: [],
        expectedEndAt: null,
        expectedReturnMessage: null,
        showReturnToLanding: true,
        ctaLabel: null,
        ctaUrl: null,
        updatedAt: '2026-07-13T01:00:00.000Z',
      },
      announcements: [],
      generatedAt: '2026-07-13T01:00:00.000Z',
    })),
    getAdmin: vi.fn(async () => {
      throw new Error('not used');
    }),
    updateMaintenance: vi.fn(async () => {
      throw new Error('not used');
    }),
    saveAnnouncement: vi.fn(async () => {
      throw new Error('not used');
    }),
    setAnnouncementStatus: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp(
  options: {
    readonly token?: TokenAccessService;
    readonly player?: PlayerService;
    readonly cozy?: CozyGameplayService;
    readonly maintenance?: boolean;
  } = {},
) {
  const service = options.cozy ?? cozyService();
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
      service: options.token ?? tokenService(),
      cookieHashSecret: 'test-cookie-secret-at-least-32-characters',
      cookieSecure: false,
      cookieMaxAgeSeconds: 900,
      playerService: options.player ?? players(),
      cozyGameplayService: service,
    },
    liveOperations: { service: liveOperations(options.maintenance ?? false) },
  });
  apps.push(app);
  return { app, service };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('protected cozy gameplay routes', () => {
  it('derives the bootstrap wallet from the trusted token session', async () => {
    const { app, service } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/bootstrap',
      headers: { origin: 'http://localhost:3001' },
      payload: { idempotencyKey: 'phase7-bootstrap-0001' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(service.bootstrap).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      { idempotencyKey: 'phase7-bootstrap-0001' },
      expect.any(String),
    );
    expect(response.body).not.toContain(WALLET_ADDRESS);
  });

  it.each(['none', 'expired', 'revoked', 'configuration_changed'] as const)(
    'blocks %s token sessions before cozy state access',
    async (access) => {
      const service = cozyService();
      const { app } = createApp({
        cozy: service,
        token: tokenService({
          access,
          network: 'solana:mainnet-beta',
          symbol: 'STAR',
          requiredAmount: '1000',
        }),
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/token-access/player/cozy/inventory',
      });

      expect(response.statusCode).toBe(401);
      expect(service.getInventory).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['suspended', 403, 'PLAYER_SUSPENDED'],
    ['rename_required', 409, 'PLAYER_RENAME_REQUIRED'],
  ] as const)('blocks %s players before bootstrap grants', async (entryState, status, code) => {
    const service = cozyService();
    const { app } = createApp({ cozy: service, player: players(entryState) });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/bootstrap',
      headers: { origin: 'http://localhost:3001' },
      payload: { idempotencyKey: 'phase7-bootstrap-0001' },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(service.bootstrap).not.toHaveBeenCalled();
  });

  it('allows a restored active player to bootstrap cozy gameplay with a new session', async () => {
    const service = cozyService();
    const player = players('active');
    const { app } = createApp({ cozy: service, player });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/bootstrap',
      headers: { origin: 'http://localhost:3001' },
      payload: { idempotencyKey: 'phase7-bootstrap-restored-0001' },
    });

    expect(response.statusCode).toBe(200);
    expect(service.bootstrap).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      { idempotencyKey: 'phase7-bootstrap-restored-0001' },
      expect.any(String),
    );
    expect(player.loadEntry).toHaveBeenCalled();
  });

  it('denies unauthenticated cozy bootstrap without calling persistence', async () => {
    const service = cozyService();
    const player = players('active');
    const { app } = createApp({
      cozy: service,
      player,
      token: tokenService({
        access: 'none',
        network: 'solana:mainnet-beta',
        symbol: 'STAR',
        requiredAmount: '1000',
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/bootstrap',
      headers: { origin: 'http://localhost:3001' },
      payload: { idempotencyKey: 'phase7-bootstrap-unauth-0001' },
    });

    expect(response.statusCode).toBe(401);
    expect(service.bootstrap).not.toHaveBeenCalled();
    expect(player.loadEntry).not.toHaveBeenCalled();
  });

  it('keeps maintenance ahead of every cozy gameplay operation', async () => {
    const service = cozyService();
    const { app } = createApp({ cozy: service, maintenance: true });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cozy/dust?cursor=1&limit=20',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: 'GAME_MAINTENANCE' } });
    expect(service.getDustLedger).not.toHaveBeenCalled();
  });

  it('passes only bounded read query data through the common response envelope', async () => {
    const { app, service } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cozy/dust?cursor=2&limit=50',
      headers: { 'x-request-id': 'phase7-dust-read' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(service.getDustLedger).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      { cursor: '2', limit: '50' },
      'phase7-dust-read',
    );
    expect(response.json()).toMatchObject({
      success: true,
      data: { account: { balance: 250 }, pagination: { page: 1, pageSize: 20 } },
      requestId: 'phase7-dust-read',
    });
  });

  it('requires an allowlisted JSON origin for value-changing requests', async () => {
    const { app, service } = createApp();
    const untrusted = await app.inject({
      method: 'PUT',
      url: '/api/v1/token-access/player/cozy/quickbar/1',
      headers: { origin: 'https://untrusted.example' },
      payload: {
        inventoryStackId: null,
        expectedStateVersion: 1,
        idempotencyKey: 'phase7-quickbar-0001',
      },
    });
    const nonJson = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/bootstrap',
      headers: { origin: 'http://localhost:3001', 'content-type': 'text/plain' },
      payload: 'not-json',
    });

    expect(untrusted.statusCode).toBe(403);
    expect(nonJson.statusCode).toBe(400);
    expect(service.updateQuickbar).not.toHaveBeenCalled();
    expect(service.bootstrap).not.toHaveBeenCalled();
  });

  it('rate-limits quickbar writes per trusted player and operation', async () => {
    const { app, service } = createApp();
    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(
        await app.inject({
          method: 'PUT',
          url: '/api/v1/token-access/player/cozy/quickbar/1',
          headers: { origin: 'http://localhost:3001' },
          payload: {
            inventoryStackId: null,
            expectedStateVersion: 1,
            idempotencyKey: `phase7-quickbar-${String(index).padStart(4, '0')}`,
          },
        }),
      );
    }

    expect(responses.slice(0, 30).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[30]?.statusCode).toBe(429);
    expect(service.updateQuickbar).toHaveBeenCalledTimes(30);
  });

  it('routes farm, recipe, and shop reads through the trusted wallet boundary', async () => {
    const { app, service } = createApp();
    const items = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cozy/items',
    });
    const farm = await app.inject({ method: 'GET', url: '/api/v1/token-access/player/cozy/farm' });
    const recipes = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cozy/recipes/all',
    });
    const shop = await app.inject({
      method: 'GET',
      url: '/api/v1/token-access/player/cozy/shops/moonpetal-general-store',
    });

    expect([items.statusCode, farm.statusCode, recipes.statusCode, shop.statusCode]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(service.getItemCatalog).toHaveBeenCalledWith(WALLET_ADDRESS, expect.any(String));
    expect(service.getFarmPlots).toHaveBeenCalledWith(WALLET_ADDRESS, expect.any(String));
    expect(service.getRecipeCatalog).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'all',
      expect.any(String),
    );
    expect(service.getShopCatalog).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'moonpetal-general-store',
      expect.any(String),
    );
  });

  it('routes value mutations without accepting client-computed outcomes or prices', async () => {
    const { app, service } = createApp();
    const plant = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/farm/plant',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        plotId: '66666666-6666-4666-8666-666666666666',
        seedItemSlug: 'moonberry-seeds',
        expectedStateVersion: 1,
        idempotencyKey: 'phase7-plant-0001',
      },
    });
    const cook = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/cook',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        recipeSlug: 'moonberry-preserves',
        stationInteractionId: 'lantern-hearth',
        quantity: 1,
        expectedInventoryStateVersion: 2,
        expectedDustStateVersion: 1,
        idempotencyKey: 'phase7-cooking-0001',
      },
    });
    const buy = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/shops/moonpetal-general-store/buy',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        offerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        quantity: 2,
        expectedDustStateVersion: 1,
        expectedInventoryStateVersion: 2,
        idempotencyKey: 'phase7-shop-buy-0001',
      },
    });

    expect([plant.statusCode, cook.statusCode, buy.statusCode]).toEqual([200, 200, 200]);
    expect(service.plant).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      expect.not.objectContaining({ readyAt: expect.anything(), yield: expect.anything() }),
      expect.any(String),
    );
    expect(service.executeRecipe).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'cooking',
      expect.not.objectContaining({
        outputItemSlug: expect.anything(),
        dustFee: expect.anything(),
      }),
      expect.any(String),
    );
    expect(service.executeShopTransaction).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'moonpetal-general-store',
      'buy',
      expect.not.objectContaining({ buyPrice: expect.anything(), total: expect.anything() }),
      expect.any(String),
    );
  });

  it('applies maintenance takeover to Phase 7B reads and mutations', async () => {
    const service = cozyService();
    const { app } = createApp({ cozy: service, maintenance: true });
    const farm = await app.inject({ method: 'GET', url: '/api/v1/token-access/player/cozy/farm' });
    const sell = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/shops/moonpetal-general-store/sell',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        offerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        quantity: 1,
        expectedDustStateVersion: 1,
        expectedInventoryStateVersion: 1,
        idempotencyKey: 'phase7-shop-sell-0001',
      },
    });

    expect(farm.statusCode).toBe(503);
    expect(sell.statusCode).toBe(503);
    expect(service.getFarmPlots).not.toHaveBeenCalled();
    expect(service.executeShopTransaction).not.toHaveBeenCalled();
  });

  it('keeps home loading and furniture mutations behind the trusted player boundary', async () => {
    const service = cozyService();
    const { app } = createApp({ cozy: service });
    const home = await app.inject({ method: 'GET', url: '/api/v1/token-access/player/cozy/home' });
    const place = await app.inject({
      method: 'POST',
      url: '/api/v1/token-access/player/cozy/home/furniture/place',
      headers: { origin: 'http://localhost:3001' },
      payload: {
        homeId: homeViewFixture.home.id,
        inventoryStackId: '22222222-2222-4222-8222-222222222222',
        furnitureSlug: 'willow-chair',
        x: 1,
        y: 1,
        rotation: 0,
        expectedHomeStateVersion: 3,
        idempotencyKey: 'phase7-furniture-place-0001',
      },
    });

    expect(home.statusCode).toBe(200);
    expect(place.statusCode).toBe(200);
    expect(service.getHome).toHaveBeenCalledWith(WALLET_ADDRESS, expect.any(String));
    expect(service.placeFurniture).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      expect.not.objectContaining({ ownerPlayerId: expect.anything() }),
      expect.any(String),
    );
  });
});
