import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { assertTrustedBrowserMutation } from '../token-access/http.js';
import type { AdminRequestRateLimiter } from '../admin-operations/rate-limit.js';
import type { PlayerRequestRateLimiter } from '../cozy-gameplay/rate-limit.js';
import type { WorldGameTestService } from '../world/game-test-contracts.js';
import {
  clearWorldGameTestCookie,
  readWorldGameTestCookie,
  secureWorldGameTestResponse,
  setWorldGameTestCookie,
  type WorldGameTestCookieOptions,
} from '../world/game-test-http.js';

function parameter(request: FastifyRequest, key: string): unknown {
  return typeof request.params === 'object' && request.params !== null
    ? Reflect.get(request.params, key)
    : undefined;
}

function response(data: unknown, requestId: string) {
  return { success: true, data, requestId } as const;
}

export function registerWorldGameTestRoutes(
  app: FastifyInstance,
  options: {
    readonly service: WorldGameTestService;
    readonly adminGateway: AdminAuthGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
    readonly cookie: WorldGameTestCookieOptions;
    readonly adminMutationLimiter: AdminRequestRateLimiter;
    readonly gameReadLimiter: PlayerRequestRateLimiter;
    readonly gameMutationLimiter: PlayerRequestRateLimiter;
  },
): void {
  app.get(
    '/api/v1/admin/worlds/:mapId/versions/:versionId/game-test-status',
    async (request, reply) => {
      secureWorldGameTestResponse(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'maps.preview',
      );
      if (!options.gameReadLimiter.claim(`${identity.userId}:game-test:admin-status`)) {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      return response(
        await options.service.statusAdmin(
          identity,
          parameter(request, 'mapId'),
          parameter(request, 'versionId'),
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/worlds/:mapId/versions/:versionId/game-tests',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      secureWorldGameTestResponse(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'maps.preview',
      );
      if (!options.adminMutationLimiter.claim(`${identity.userId}:game-test:create`)) {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      return response(
        await options.service.createAdmin(
          identity,
          parameter(request, 'mapId'),
          parameter(request, 'versionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-game-tests/:sessionId/revoke',
    { bodyLimit: 256 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      secureWorldGameTestResponse(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'maps.preview',
      );
      if (!options.adminMutationLimiter.claim(`${identity.userId}:game-test:revoke`)) {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      return response(
        await options.service.revokeAdmin(identity, parameter(request, 'sessionId'), request.id),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-game-tests/:sessionId/evidence',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      secureWorldGameTestResponse(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'maps.preview',
      );
      if (!options.adminMutationLimiter.claim(`${identity.userId}:game-test:evidence`)) {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      return response(
        await options.service.recordEvidence(
          identity,
          parameter(request, 'sessionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post('/api/v1/game-test/exchange', { bodyLimit: 2_048 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    secureWorldGameTestResponse(reply);
    if (!options.gameMutationLimiter.claim(`${request.ip}:game-test:exchange`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    const result = await options.service.exchange(request.body, request.id);
    setWorldGameTestCookie(reply, result.sessionToken, options.cookie);
    return response(result.projection, request.id);
  });

  app.get('/api/v1/game-test/session', async (request, reply) => {
    secureWorldGameTestResponse(reply);
    if (!options.gameReadLimiter.claim(`${request.ip}:game-test:session`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    try {
      return response(
        await options.service.load(readWorldGameTestCookie(request), request.id),
        request.id,
      );
    } catch (error) {
      if (error instanceof PublicApiError && error.statusCode === 401) {
        clearWorldGameTestCookie(reply, options.cookie);
      }
      throw error;
    }
  });

  app.post('/api/v1/game-test/exit', { bodyLimit: 256 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    secureWorldGameTestResponse(reply);
    if (!options.gameMutationLimiter.claim(`${request.ip}:game-test:exit`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    await options.service.exit(readWorldGameTestCookie(request), request.id);
    clearWorldGameTestCookie(reply, options.cookie);
    return response({ status: 'exited' }, request.id);
  });
}
