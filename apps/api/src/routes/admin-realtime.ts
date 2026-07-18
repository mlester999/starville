import type { FastifyInstance } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import type { AdminRealtimeGateway } from '../realtime/admin-gateway.js';
import { disableResponseCaching } from '../token-access/http.js';

export function registerAdminRealtimeRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly realtimeGateway: AdminRealtimeGateway;
    readonly logger: ServiceLogger;
  },
): void {
  app.get('/api/v1/admin/realtime', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'realtime.read',
    );
    return {
      success: true,
      data: await options.realtimeGateway.getOverview(identity),
      requestId: request.id,
    };
  });
}
