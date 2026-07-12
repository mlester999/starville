import { ADMIN_PLAYER_ACTION_PERMISSIONS, type AdminPlayerActionKey } from '@starville/admin-auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminOperationsService } from '../admin-operations/contracts.js';
import type { AdminRequestRateLimiter } from '../admin-operations/rate-limit.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const BODY_LIMIT_BYTES = 4_096;

interface RegisterAdminPlayerRoutesOptions {
  readonly adminGateway: AdminAuthGateway;
  readonly service: AdminOperationsService;
  readonly logger: ServiceLogger;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly readLimiter: AdminRequestRateLimiter;
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function playerId(request: FastifyRequest): unknown {
  return property(request.params, 'playerId');
}

function registerAction(
  app: FastifyInstance,
  action: AdminPlayerActionKey,
  options: RegisterAdminPlayerRoutesOptions,
): void {
  app.post(
    `/api/v1/admin/players/:playerId/${action}`,
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        ADMIN_PLAYER_ACTION_PERMISSIONS[action],
      );
      return {
        success: true,
        data: await options.service.performPlayerAction(
          identity,
          playerId(request),
          action,
          request.body,
          request.id,
        ),
        requestId: request.id,
      };
    },
  );
}

export function registerAdminPlayerRoutes(
  app: FastifyInstance,
  options: RegisterAdminPlayerRoutesOptions,
): void {
  app.get('/api/v1/admin/players', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'players.read',
    );
    if (!options.readLimiter.claim(`${identity.userId}:players.directory`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    return {
      success: true,
      data: await options.service.listPlayers(identity, request.query),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'players.read',
    );
    if (!options.readLimiter.claim(`${identity.userId}:players.detail`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    return {
      success: true,
      data: await options.service.getPlayer(identity, playerId(request)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/players/:playerId/activity', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, options.adminGateway, options.logger, [
      'players.read',
      'player_audit.read',
    ]);
    if (!options.readLimiter.claim(`${identity.userId}:players.activity`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    return {
      success: true,
      data: await options.service.getPlayerActivity(identity, playerId(request), request.query),
      requestId: request.id,
    };
  });

  for (const action of Object.keys(ADMIN_PLAYER_ACTION_PERMISSIONS) as AdminPlayerActionKey[]) {
    registerAction(app, action, options);
  }
}
