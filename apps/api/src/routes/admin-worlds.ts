import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';
import type { AdminWorldService } from '../world/admin-contracts.js';

function parameter(request: FastifyRequest, key: string): unknown {
  return typeof request.params === 'object' && request.params !== null
    ? Reflect.get(request.params, key)
    : undefined;
}

function response(data: unknown, requestId: string) {
  return { success: true, data, requestId } as const;
}

export function registerAdminWorldRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly service: AdminWorldService;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
    readonly manifestMaximumBytes: number;
    readonly includeLegacyAssetDirectory?: boolean;
  },
): void {
  const authorize = (
    request: FastifyRequest,
    permission: Parameters<typeof authorizeAdminRequest>[3],
  ) => authorizeAdminRequest(request, options.adminGateway, options.logger, permission);

  app.get('/api/v1/admin/worlds', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.read');
    return response(
      await options.service.listWorlds(identity, request.query, request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/world-topology', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'maps.read',
    );
    return {
      success: true,
      data: await options.service.getPublishedTopology(identity, request.id),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/worlds/:mapId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.read');
    return response(
      await options.service.getWorld(identity, parameter(request, 'mapId'), request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/worlds/:mapId/drafts/:versionId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.edit');
    return response(
      await options.service.getDraft(
        identity,
        parameter(request, 'mapId'),
        parameter(request, 'versionId'),
        request.id,
      ),
      request.id,
    );
  });

  app.post('/api/v1/admin/worlds/:mapId/drafts', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.edit');
    return response(
      await options.service.createDraft(
        identity,
        parameter(request, 'mapId'),
        request.body,
        request.id,
      ),
      request.id,
    );
  });

  app.post(
    '/api/v1/admin/worlds/:mapId/drafts/:versionId/save',
    { bodyLimit: options.manifestMaximumBytes + 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'maps.edit');
      return response(
        await options.service.saveDraft(
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
    '/api/v1/admin/worlds/:mapId/drafts/:versionId/validate',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'maps.edit');
      return response(
        await options.service.validateDraft(
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
    '/api/v1/admin/worlds/:mapId/drafts/:versionId/publish',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'maps.publish');
      return response(
        await options.service.publishVersion(
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
    '/api/v1/admin/worlds/:mapId/versions/:versionId/derive',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'maps.edit');
      return response(
        await options.service.deriveVersion(
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

  app.get('/api/v1/admin/worlds/:mapId/versions/:versionId/preview', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.preview');
    return response(
      await options.service.previewVersion(
        identity,
        parameter(request, 'mapId'),
        parameter(request, 'versionId'),
        request.id,
      ),
      request.id,
    );
  });

  app.get('/api/v1/admin/worlds/:mapId/audit', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.audit_read');
    return response(
      await options.service.listAudit(
        identity,
        parameter(request, 'mapId'),
        request.query,
        request.id,
      ),
      request.id,
    );
  });

  if (options.includeLegacyAssetDirectory !== false) {
    app.get('/api/v1/admin/world-assets', async (request, reply) => {
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.read');
      return response(
        await options.service.listAssets(identity, request.query, request.id),
        request.id,
      );
    });
  }

  app.get('/api/v1/admin/world-audit', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'maps.audit_read');
    return response(
      await options.service.listAudit(identity, null, request.query, request.id),
      request.id,
    );
  });
}
