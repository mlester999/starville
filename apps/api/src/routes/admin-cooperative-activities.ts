import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { updateCooperativeActivitySettingsSchema } from '@starville/cooperative-activities';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import {
  AdminCooperativeActivityPersistenceError,
  adminCooperativeActivityQuerySchema,
  cooperativeActivityDraftCreateSchema,
  cooperativeActivityDraftUpdateSchema,
  cooperativeActivityLifecycleRequestSchema,
  cooperativeActivityPreviewRequestSchema,
  type AdminCooperativeActivityGateway,
} from '../realtime/cooperative-activity-admin-gateway.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const identifierSchema = z.object({ id: z.uuid() }).strict();

function identifier(request: FastifyRequest): string {
  const parsed = identifierSchema.safeParse(request.params);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_REQUEST');
  return parsed.data.id;
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof AdminCooperativeActivityPersistenceError) {
      throw new PublicApiError(503, 'COOPERATIVE_ACTIVITIES_UNAVAILABLE');
    }
    throw error;
  }
}

export function registerAdminCooperativeActivityRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly activityGateway: AdminCooperativeActivityGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get('/api/v1/admin/cooperative-activities', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      request.query !== null &&
        typeof request.query === 'object' &&
        'view' in request.query &&
        request.query.view === 'audit'
        ? 'cooperative_activities.audit.read'
        : 'cooperative_activities.read',
    );
    const query = adminCooperativeActivityQuerySchema.safeParse(request.query);
    if (!query.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_REQUEST');
    return {
      success: true,
      data: await operation(() => options.activityGateway.list(identity, query.data)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/cooperative-activities/instances/:id', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cooperative_activities.read',
    );
    const detail = await operation(() =>
      options.activityGateway.instance(identity, identifier(request)),
    );
    if (detail === undefined) throw new PublicApiError(404, 'COOPERATIVE_ACTIVITY_NOT_FOUND');
    return { success: true, data: detail, requestId: request.id };
  });

  app.get('/api/v1/admin/cooperative-activities/settings', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cooperative_activities.settings.read',
    );
    return {
      success: true,
      data: await operation(() => options.activityGateway.settings(identity)),
      requestId: request.id,
    };
  });

  app.patch(
    '/api/v1/admin/cooperative-activities/settings',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'cooperative_activities.settings.edit',
      );
      const input = updateCooperativeActivitySettingsSchema.safeParse(request.body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_SETTINGS');
      return {
        success: true,
        data: await operation(() =>
          options.activityGateway.updateSettings(identity, input.data, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/cooperative-activities/preview',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'cooperative_activities.preview',
      );
      const input = cooperativeActivityPreviewRequestSchema.safeParse(request.body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_PREVIEW');
      const preview = await operation(() =>
        options.activityGateway.preview(identity, input.data.versionId, input.data.simulationStep),
      );
      if (preview === undefined) throw new PublicApiError(404, 'COOPERATIVE_ACTIVITY_NOT_FOUND');
      return { success: true, data: preview, requestId: request.id };
    },
  );

  app.post(
    '/api/v1/admin/cooperative-activities/drafts',
    { bodyLimit: 64_000 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'cooperative_activities.edit',
      );
      const input = cooperativeActivityDraftCreateSchema.safeParse(request.body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_DRAFT');
      return {
        success: true,
        data: await operation(() =>
          options.activityGateway.createDraft(identity, input.data.activity, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.put(
    '/api/v1/admin/cooperative-activities/versions/:id',
    { bodyLimit: 64_000 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'cooperative_activities.edit',
      );
      const input = cooperativeActivityDraftUpdateSchema.safeParse(request.body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_DRAFT');
      return {
        success: true,
        data: await operation(() =>
          options.activityGateway.updateDraft(
            identity,
            identifier(request),
            input.data.expectedRevision,
            input.data.activity,
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/cooperative-activities/versions/:id/lifecycle',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const input = cooperativeActivityLifecycleRequestSchema.safeParse(request.body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_COOPERATIVE_ACTIVITY_LIFECYCLE');
      const permission =
        input.data.action === 'validate'
          ? 'cooperative_activities.validate'
          : input.data.action === 'publish' || input.data.action === 'disable'
            ? 'cooperative_activities.publish'
            : 'cooperative_activities.review';
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permission,
      );
      return {
        success: true,
        data: await operation(() =>
          options.activityGateway.transition(
            identity,
            identifier(request),
            input.data.expectedRevision,
            input.data.action,
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );
}
