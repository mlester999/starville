import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { CozyGameplayService } from '../cozy-gameplay/contracts.js';
import type { PlayerRequestRateLimiter } from '../cozy-gameplay/rate-limit.js';
import { PublicApiError } from '../errors.js';
import type { LiveOperationsService } from '../live-operations/contracts.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const COZY_API_PREFIX = '/api/v1/token-access/player/cozy';
const BODY_LIMIT_BYTES = 4_096;

interface RegisterCozyGameplayRoutesOptions {
  readonly service: CozyGameplayService;
  readonly playerService: PlayerService;
  readonly tokenAccessService: TokenAccessService;
  readonly liveOperationsService?: LiveOperationsService;
  readonly cookie: TokenAccessCookieOptions;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly readLimiter: PlayerRequestRateLimiter;
  readonly mutationLimiter: PlayerRequestRateLimiter;
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

async function authorizeCozyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RegisterCozyGameplayRoutesOptions,
): Promise<string> {
  const walletAddress = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  const entry = await requirePlayerEntry(
    options.playerService,
    walletAddress,
    request.id,
    false,
    false,
  );
  if (entry === undefined) throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  if ((await options.liveOperationsService?.getPublic(request.id))?.maintenance.active === true) {
    throw new PublicApiError(503, 'GAME_MAINTENANCE');
  }
  return walletAddress;
}

function claim(limiter: PlayerRequestRateLimiter, walletAddress: string, operation: string): void {
  if (!limiter.claim(`${walletAddress}:${operation}`)) {
    throw new PublicApiError(429, 'RATE_LIMITED');
  }
}

export function registerCozyGameplayRoutes(
  app: FastifyInstance,
  options: RegisterCozyGameplayRoutesOptions,
): void {
  app.post(
    `${COZY_API_PREFIX}/bootstrap`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const walletAddress = await authorizeCozyRequest(request, reply, options);
      claim(options.mutationLimiter, walletAddress, 'bootstrap');
      return {
        success: true,
        data: await options.service.bootstrap(walletAddress, request.body, request.id),
        requestId: request.id,
      };
    },
  );

  app.get(`${COZY_API_PREFIX}/dust`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'dust');
    return {
      success: true,
      data: await options.service.getDustLedger(walletAddress, request.query, request.id),
      requestId: request.id,
    };
  });

  app.get(`${COZY_API_PREFIX}/inventory`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'inventory');
    return {
      success: true,
      data: await options.service.getInventory(walletAddress, request.id),
      requestId: request.id,
    };
  });

  app.get(`${COZY_API_PREFIX}/inventory/history`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'inventory-history');
    return {
      success: true,
      data: await options.service.getInventoryHistory(walletAddress, request.query, request.id),
      requestId: request.id,
    };
  });

  app.put(
    `${COZY_API_PREFIX}/quickbar/:slot`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const walletAddress = await authorizeCozyRequest(request, reply, options);
      claim(options.mutationLimiter, walletAddress, 'quickbar');
      return {
        success: true,
        data: await options.service.updateQuickbar(
          walletAddress,
          property(request.params, 'slot'),
          request.body,
          request.id,
        ),
        requestId: request.id,
      };
    },
  );

  app.get(`${COZY_API_PREFIX}/farm`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'farm');
    return {
      success: true,
      data: await options.service.getFarmPlots(walletAddress, request.id),
      requestId: request.id,
    };
  });

  app.get(`${COZY_API_PREFIX}/items`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'items');
    return {
      success: true,
      data: await options.service.getItemCatalog(walletAddress, request.id),
      requestId: request.id,
    };
  });

  app.post(
    `${COZY_API_PREFIX}/farm/plant`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const walletAddress = await authorizeCozyRequest(request, reply, options);
      claim(options.mutationLimiter, walletAddress, 'farm-plant');
      return {
        success: true,
        data: await options.service.plant(walletAddress, request.body, request.id),
        requestId: request.id,
      };
    },
  );

  app.post(
    `${COZY_API_PREFIX}/farm/water`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const walletAddress = await authorizeCozyRequest(request, reply, options);
      claim(options.mutationLimiter, walletAddress, 'farm-water');
      return {
        success: true,
        data: await options.service.water(walletAddress, request.body, request.id),
        requestId: request.id,
      };
    },
  );

  app.post(
    `${COZY_API_PREFIX}/farm/harvest`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const walletAddress = await authorizeCozyRequest(request, reply, options);
      claim(options.mutationLimiter, walletAddress, 'farm-harvest');
      return {
        success: true,
        data: await options.service.harvest(walletAddress, request.body, request.id),
        requestId: request.id,
      };
    },
  );

  app.get(`${COZY_API_PREFIX}/recipes/:kind`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'recipes');
    return {
      success: true,
      data: await options.service.getRecipeCatalog(
        walletAddress,
        property(request.params, 'kind'),
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.post(`${COZY_API_PREFIX}/cook`, { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.mutationLimiter, walletAddress, 'cook');
    return {
      success: true,
      data: await options.service.executeRecipe(walletAddress, 'cooking', request.body, request.id),
      requestId: request.id,
    };
  });

  app.post(`${COZY_API_PREFIX}/craft`, { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.mutationLimiter, walletAddress, 'craft');
    return {
      success: true,
      data: await options.service.executeRecipe(
        walletAddress,
        'crafting',
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.get(`${COZY_API_PREFIX}/shops/:shopSlug`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'shop');
    return {
      success: true,
      data: await options.service.getShopCatalog(
        walletAddress,
        property(request.params, 'shopSlug'),
        request.id,
      ),
      requestId: request.id,
    };
  });

  for (const operation of ['buy', 'sell'] as const) {
    app.post(
      `${COZY_API_PREFIX}/shops/:shopSlug/${operation}`,
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const walletAddress = await authorizeCozyRequest(request, reply, options);
        claim(options.mutationLimiter, walletAddress, `shop-${operation}`);
        if (operation === 'buy') {
          throw new PublicApiError(409, 'ECONOMY_PURCHASE_ENDPOINT_REQUIRED');
        }
        return {
          success: true,
          data: await options.service.executeShopTransaction(
            walletAddress,
            property(request.params, 'shopSlug'),
            operation,
            request.body,
            request.id,
          ),
          requestId: request.id,
        };
      },
    );
  }

  app.get(`${COZY_API_PREFIX}/home`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'home');
    return {
      success: true,
      data: await options.service.getHome(walletAddress, request.id),
      requestId: request.id,
    };
  });

  app.get(`${COZY_API_PREFIX}/vertical-slice`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'vertical-slice');
    return {
      success: true,
      data: await options.service.getPlayableVerticalSlice(walletAddress, request.id),
      requestId: request.id,
    };
  });

  const verticalSliceActions = {
    'quest/accept': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.acceptStarterQuest(walletAddress, body, requestId),
    'quest/deliver': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.deliverStarterQuest(walletAddress, body, requestId),
    'home-plot/prepare': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.prepareHomeSoil(walletAddress, body, requestId),
    'home-plot/plant': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.plantHomeCrop(walletAddress, body, requestId),
    'home-plot/water': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.waterHomeCrop(walletAddress, body, requestId),
    'home-plot/harvest': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.harvestHomeCrop(walletAddress, body, requestId),
  } as const;

  for (const [route, action] of Object.entries(verticalSliceActions)) {
    app.post(
      `${COZY_API_PREFIX}/${route}`,
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const walletAddress = await authorizeCozyRequest(request, reply, options);
        claim(options.mutationLimiter, walletAddress, route);
        return {
          success: true,
          data: await action(walletAddress, request.body, request.id),
          requestId: request.id,
        };
      },
    );
  }

  for (const operation of ['enter', 'exit'] as const) {
    app.post(
      `${COZY_API_PREFIX}/home/${operation}`,
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const walletAddress = await authorizeCozyRequest(request, reply, options);
        claim(options.mutationLimiter, walletAddress, `home-${operation}`);
        const data =
          operation === 'enter'
            ? await options.service.enterHome(walletAddress, request.body, request.id)
            : await options.service.exitHome(walletAddress, request.body, request.id);
        return { success: true, data, requestId: request.id };
      },
    );
  }

  const furnitureActions = {
    place: (walletAddress: string, body: unknown, requestId: string) =>
      options.service.placeFurniture(walletAddress, body, requestId),
    move: (walletAddress: string, body: unknown, requestId: string) =>
      options.service.moveFurniture(walletAddress, body, requestId),
    rotate: (walletAddress: string, body: unknown, requestId: string) =>
      options.service.rotateFurniture(walletAddress, body, requestId),
    remove: (walletAddress: string, body: unknown, requestId: string) =>
      options.service.removeFurniture(walletAddress, body, requestId),
  } as const;
  for (const [operation, execute] of Object.entries(furnitureActions)) {
    app.post(
      `${COZY_API_PREFIX}/home/furniture/${operation}`,
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const walletAddress = await authorizeCozyRequest(request, reply, options);
        claim(options.mutationLimiter, walletAddress, `furniture-${operation}`);
        return {
          success: true,
          data: await execute(walletAddress, request.body, request.id),
          requestId: request.id,
        };
      },
    );
  }

  app.get(`${COZY_API_PREFIX}/workstations/:workstationId`, async (request, reply) => {
    disableResponseCaching(reply);
    const walletAddress = await authorizeCozyRequest(request, reply, options);
    claim(options.readLimiter, walletAddress, 'workstation');
    return {
      success: true,
      data: await options.service.getWorkstationWorkspace(
        walletAddress,
        property(request.params, 'workstationId'),
        request.id,
      ),
      requestId: request.id,
    };
  });

  const workstationActions = {
    'workstation-jobs/start': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.startWorkstationJob(walletAddress, body, requestId),
    'workstation-jobs/collect': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.collectWorkstationJob(walletAddress, body, requestId),
    'quest/workstations/accept': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.acceptWorkstationTutorial(walletAddress, body, requestId),
    'quest/workstations/turn-in': (walletAddress: string, body: unknown, requestId: string) =>
      options.service.turnInWorkstationTutorial(walletAddress, body, requestId),
  } as const;

  for (const [route, action] of Object.entries(workstationActions)) {
    app.post(
      `${COZY_API_PREFIX}/${route}`,
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const walletAddress = await authorizeCozyRequest(request, reply, options);
        claim(options.mutationLimiter, walletAddress, route);
        return {
          success: true,
          data: await action(walletAddress, request.body, request.id),
          requestId: request.id,
        };
      },
    );
  }
}
