import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminRequestRateLimiter } from '../admin-operations/rate-limit.js';
import type { AdminCozyService } from '../cozy-gameplay/admin.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { disableResponseCaching } from '../token-access/http.js';
import { assertTrustedBrowserMutation } from '../token-access/http.js';

interface Options {
  readonly adminGateway: AdminAuthGateway;
  readonly service: AdminCozyService;
  readonly logger: ServiceLogger;
  readonly readLimiter: AdminRequestRateLimiter;
  readonly allowedOrigins: ReadonlySet<string>;
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function playerId(request: FastifyRequest): unknown {
  return property(request.params, 'playerId');
}

function contentId(request: FastifyRequest, key: 'itemId' | 'cropId'): unknown {
  return property(request.params, key);
}

function claim(options: Options, userId: string, resource: string): void {
  if (!options.readLimiter.claim(`${userId}:cozy:${resource}`)) {
    throw new PublicApiError(429, 'RATE_LIMITED');
  }
}

export function registerAdminCozyGameplayRoutes(app: FastifyInstance, options: Options): void {
  app.get('/api/v1/admin/players/:playerId/economy', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'economy.read',
    ]);
    claim(options, identity.userId, 'economy');
    return {
      success: true,
      data: await options.service.getEconomy(identity, playerId(request), request.query),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId/inventory', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'inventories.read',
    ]);
    claim(options, identity.userId, 'inventory');
    return {
      success: true,
      data: await options.service.getInventory(identity, playerId(request), request.query),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId/cozy-gameplay', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'cozy_gameplay.read',
    ]);
    claim(options, identity.userId, 'summary');
    return {
      success: true,
      data: await options.service.getCozy(identity, playerId(request)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/game-content', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'items.read',
    );
    claim(options, identity.userId, 'content');
    return {
      success: true,
      data: await options.service.getContent(identity),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/farming', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.read',
    );
    claim(options, identity.userId, 'farming-content');
    return {
      success: true,
      data: await options.service.getFarmingContent(identity),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId/farming', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'farming.player_read',
    ]);
    claim(options, identity.userId, 'player-farming');
    return {
      success: true,
      data: await options.service.getPlayerFarming(identity, playerId(request)),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/farming/live-ops', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.liveops',
    );
    claim(options, identity.userId, 'farming-live-ops');
    return {
      success: true,
      data: await options.service.updateFarmingLiveOps(identity, request.body, request.id),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/farming/items/:itemId', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.content_manage',
    );
    claim(options, identity.userId, 'farming-item-update');
    return {
      success: true,
      data: await options.service.updateFarmingItem(
        identity,
        contentId(request, 'itemId'),
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/farming/crops/:cropId', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.content_manage',
    );
    claim(options, identity.userId, 'farming-crop-update');
    return {
      success: true,
      data: await options.service.updateFarmingCrop(
        identity,
        contentId(request, 'cropId'),
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/farming/plot-template/successor', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.content_manage',
    );
    claim(options, identity.userId, 'farming-template-successor');
    return {
      success: true,
      data: await options.service.createFarmingPlotTemplateSuccessor(
        identity,
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/farming/starter-quest/successor', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'farming.content_manage',
    );
    claim(options, identity.userId, 'farming-quest-successor');
    return {
      success: true,
      data: await options.service.createStarterQuestSuccessor(identity, request.body, request.id),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/crafting', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'crafting.read',
    );
    claim(options, identity.userId, 'crafting-content');
    return {
      success: true,
      data: await options.service.getCraftingContent(identity),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId/crafting', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'crafting.player_read',
    ]);
    claim(options, identity.userId, 'player-crafting');
    return {
      success: true,
      data: await options.service.getPlayerCrafting(identity, playerId(request)),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/crafting/live-ops', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'crafting.liveops',
    );
    claim(options, identity.userId, 'crafting-live-ops');
    return {
      success: true,
      data: await options.service.updateCraftingLiveOps(identity, request.body, request.id),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/crafting/workstations/:workstationId', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'crafting.content_manage',
    );
    claim(options, identity.userId, 'crafting-workstation');
    return {
      success: true,
      data: await options.service.updateWorkstation(
        identity,
        property(request.params, 'workstationId'),
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/crafting/recipes/successor', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'crafting.content_manage',
    );
    claim(options, identity.userId, 'crafting-recipe-successor');
    return {
      success: true,
      data: await options.service.createRecipeSuccessor(identity, request.body, request.id),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/crafting/jobs/:jobId/reconcile', async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'crafting.job_reconcile',
    );
    claim(options, identity.userId, 'crafting-job-reconcile');
    return {
      success: true,
      data: await options.service.requestCraftingReconciliation(
        identity,
        property(request.params, 'jobId'),
        request.body,
        request.id,
      ),
      requestId: request.id,
    };
  });
}
