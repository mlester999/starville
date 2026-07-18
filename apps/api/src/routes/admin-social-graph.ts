import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { updateSocialGraphSettingsInputSchema } from '@starville/realtime';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import {
  AdminSocialGraphPersistenceError,
  adminSocialGraphAuditQuerySchema,
  adminSocialGraphQuerySchema,
  type AdminSocialGraphGateway,
} from '../realtime/social-graph-admin-gateway.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const partyParametersSchema = z.object({ partyId: z.uuid() }).strict();

function partyId(request: FastifyRequest): string {
  const parsed = partyParametersSchema.safeParse(request.params);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_SOCIAL_GRAPH_REQUEST');
  return parsed.data.partyId;
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof AdminSocialGraphPersistenceError) {
      throw new PublicApiError(503, 'SOCIAL_GRAPH_UNAVAILABLE');
    }
    throw error;
  }
}

export function registerAdminSocialGraphRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly socialGraphGateway: AdminSocialGraphGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get('/api/v1/admin/social-graph', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_graph.read',
    );
    const query = adminSocialGraphQuerySchema.safeParse(request.query);
    if (!query.success) throw new PublicApiError(400, 'INVALID_SOCIAL_GRAPH_REQUEST');
    return {
      success: true,
      data: await operation(() => options.socialGraphGateway.list(identity, query.data)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/social-graph/parties/:partyId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_graph.audit.read',
    );
    const detail = await operation(() =>
      options.socialGraphGateway.party(identity, partyId(request)),
    );
    if (detail === undefined) throw new PublicApiError(404, 'SOCIAL_GRAPH_PARTY_NOT_FOUND');
    return { success: true, data: detail, requestId: request.id };
  });

  app.get('/api/v1/admin/social-graph/audit', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_graph.audit.read',
    );
    const query = adminSocialGraphAuditQuerySchema.safeParse(request.query);
    if (!query.success) throw new PublicApiError(400, 'INVALID_SOCIAL_GRAPH_REQUEST');
    return {
      success: true,
      data: await operation(() => options.socialGraphGateway.audit(identity, query.data)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/social-graph/settings', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_graph.settings.read',
    );
    return {
      success: true,
      data: await operation(() => options.socialGraphGateway.settings(identity)),
      requestId: request.id,
    };
  });

  app.patch('/api/v1/admin/social-graph/settings', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_graph.settings.edit',
    );
    const input = updateSocialGraphSettingsInputSchema.safeParse(request.body);
    if (!input.success) throw new PublicApiError(400, 'INVALID_SOCIAL_GRAPH_SETTINGS');
    return {
      success: true,
      data: await operation(() =>
        options.socialGraphGateway.updateSettings(identity, input.data, request.id),
      ),
      requestId: request.id,
    };
  });
}
