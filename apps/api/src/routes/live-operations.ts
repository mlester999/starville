import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import type { LiveOperationsService } from '../live-operations/contracts.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

function parameter(request: FastifyRequest, key: string): unknown {
  return typeof request.params === 'object' && request.params !== null
    ? Reflect.get(request.params, key)
    : undefined;
}
function response(data: unknown, requestId: string) {
  return { success: true, data, requestId } as const;
}

export function registerLiveOperationsRoutes(
  app: FastifyInstance,
  options: {
    readonly service: LiveOperationsService;
    readonly adminGateway: AdminAuthGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get('/api/v1/live-operations', async (request, reply) => {
    disableResponseCaching(reply);
    return response(await options.service.getPublic(request.id), request.id);
  });
  app.get('/api/v1/admin/live-operations', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'live_operations.read',
    );
    return response(await options.service.getAdmin(identity, request.query), request.id);
  });
  app.post(
    '/api/v1/admin/live-operations/maintenance',
    { bodyLimit: 16_384 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'live_operations.manage',
      );
      return response(
        await options.service.updateMaintenance(identity, request.body, request.id),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/live-operations/announcements',
    { bodyLimit: 16_384 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'announcements.manage',
      );
      return response(
        await options.service.saveAnnouncement(identity, request.body, request.id),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/live-operations/announcements/:id/:action',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'announcements.manage',
      );
      return response(
        await options.service.setAnnouncementStatus(
          identity,
          parameter(request, 'id'),
          parameter(request, 'action'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );
}
