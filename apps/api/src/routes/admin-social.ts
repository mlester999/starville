import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import {
  AdminSocialPersistenceError,
  adminSocialInteractionQuerySchema,
  type AdminSocialGateway,
} from '../realtime/social-admin-gateway.js';
import { disableResponseCaching } from '../token-access/http.js';

const interactionParametersSchema = z.object({ interactionId: z.uuid() }).strict();

function interactionId(request: FastifyRequest): string {
  const parsed = interactionParametersSchema.safeParse(request.params);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_SOCIAL_INTERACTION_REQUEST');
  return parsed.data.interactionId;
}

async function socialOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminSocialPersistenceError) {
      throw new PublicApiError(503, 'SOCIAL_INTERACTIONS_UNAVAILABLE');
    }
    throw error;
  }
}

export function registerAdminSocialRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly socialGateway: AdminSocialGateway;
    readonly logger: ServiceLogger;
  },
): void {
  app.get('/api/v1/admin/social-interactions', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_interactions.read',
    );
    const query = adminSocialInteractionQuerySchema.safeParse(request.query);
    if (!query.success) throw new PublicApiError(400, 'INVALID_SOCIAL_INTERACTION_REQUEST');
    return {
      success: true,
      data: await socialOperation(async () => options.socialGateway.list(identity, query.data)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/social-interactions/:interactionId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'social_interactions.audit.read',
    );
    const detail = await socialOperation(async () =>
      options.socialGateway.detail(identity, interactionId(request)),
    );
    if (detail === undefined) throw new PublicApiError(404, 'SOCIAL_INTERACTION_NOT_FOUND');
    return { success: true, data: detail, requestId: request.id };
  });
}
