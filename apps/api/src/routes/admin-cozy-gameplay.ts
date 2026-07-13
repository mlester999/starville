import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminRequestRateLimiter } from '../admin-operations/rate-limit.js';
import type { AdminCozyService } from '../cozy-gameplay/admin.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { disableResponseCaching } from '../token-access/http.js';

interface Options {
  readonly adminGateway: AdminAuthGateway;
  readonly service: AdminCozyService;
  readonly logger: ServiceLogger;
  readonly readLimiter: AdminRequestRateLimiter;
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function playerId(request: FastifyRequest): unknown {
  return property(request.params, 'playerId');
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
}
