import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import type { PlatformConfigurationService } from '../platform-configuration/contracts.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

function parameter(request: FastifyRequest, key: string): unknown {
  return typeof request.params === 'object' && request.params !== null
    ? Reflect.get(request.params, key)
    : undefined;
}

function response(data: unknown, requestId: string) {
  return { success: true, data, requestId } as const;
}

export function registerPlatformConfigurationRoutes(
  app: FastifyInstance,
  options: {
    readonly service: PlatformConfigurationService;
    readonly adminGateway: AdminAuthGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get('/api/v1/platform-configuration/:platformKey', async (request, reply) => {
    const configuration = await options.service.getActive(
      parameter(request, 'platformKey'),
      request.id,
    );
    void reply.header('etag', `"${configuration.etag}"`);
    void reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=60');
    if (request.headers['if-none-match'] === `"${configuration.etag}"`) {
      return reply.status(304).send();
    }
    return response(configuration, request.id);
  });

  app.get('/api/v1/admin/platform-configuration/:platformKey', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'platform_configuration.read',
    );
    return response(
      await options.service.getAdmin(identity, parameter(request, 'platformKey'), request.id),
      request.id,
    );
  });

  app.get(
    '/api/v1/admin/platform-configuration/:platformKey/preview/:versionId',
    async (request, reply) => {
      disableResponseCaching(reply);
      void reply.header('x-robots-tag', 'noindex, nofollow, noarchive');
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'platform_configuration.preview',
      );
      return response(
        await options.service.preview(
          identity,
          parameter(request, 'platformKey'),
          parameter(request, 'versionId'),
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/platform-configuration/drafts',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'platform_configuration.edit',
      );
      return response(
        await options.service.createDraft(identity, request.body, request.id),
        request.id,
      );
    },
  );

  app.patch(
    '/api/v1/admin/platform-configuration/versions/:versionId',
    { bodyLimit: 131_072 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'platform_configuration.edit',
      );
      return response(
        await options.service.updateDraft(
          identity,
          parameter(request, 'versionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  const action = (
    path: string,
    permission:
      | 'platform_configuration.validate'
      | 'platform_configuration.edit'
      | 'platform_configuration.review'
      | 'platform_configuration.publish'
      | 'platform_configuration.rollback',
    invoke: (
      identity: Awaited<ReturnType<typeof authorizeAdminRequest>>,
      versionId: unknown,
      body: unknown,
      requestId: string,
    ) => Promise<unknown>,
  ) => {
    app.post(path, { bodyLimit: 8_192 }, async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permission,
      );
      return response(
        await invoke(identity, parameter(request, 'versionId'), request.body, request.id),
        request.id,
      );
    });
  };

  action(
    '/api/v1/admin/platform-configuration/versions/:versionId/validate',
    'platform_configuration.validate',
    (identity, versionId, body, requestId) =>
      options.service.validate(identity, versionId, body, requestId),
  );
  action(
    '/api/v1/admin/platform-configuration/versions/:versionId/submit-review',
    'platform_configuration.edit',
    (identity, versionId, body, requestId) =>
      options.service.submitReview(identity, versionId, body, requestId),
  );
  action(
    '/api/v1/admin/platform-configuration/versions/:versionId/review',
    'platform_configuration.review',
    (identity, versionId, body, requestId) =>
      options.service.review(identity, versionId, body, requestId),
  );
  action(
    '/api/v1/admin/platform-configuration/versions/:versionId/publish',
    'platform_configuration.publish',
    (identity, versionId, body, requestId) =>
      options.service.publish(identity, versionId, body, requestId),
  );
  action(
    '/api/v1/admin/platform-configuration/versions/:versionId/rollback',
    'platform_configuration.rollback',
    (identity, versionId, body, requestId) =>
      options.service.rollback(identity, versionId, body, requestId),
  );
}
