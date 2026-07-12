import type { FastifyInstance } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminOperationsService } from '../admin-operations/contracts.js';
import type { AdminRequestRateLimiter } from '../admin-operations/rate-limit.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { disableResponseCaching } from '../token-access/http.js';

export function registerAdminOperationsRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly service: AdminOperationsService;
    readonly logger: ServiceLogger;
    readonly readLimiter: AdminRequestRateLimiter;
  },
): void {
  app.get('/api/v1/admin/operations/summary', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'operations.read',
    );
    if (!options.readLimiter.claim(`${identity.userId}:operations.summary`)) {
      throw new PublicApiError(429, 'RATE_LIMITED');
    }
    return {
      success: true,
      data: await options.service.getOperationsSummary(identity, request.id),
      requestId: request.id,
    };
  });
}
