import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { adminChatReportActionSchema } from '@starville/realtime';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import {
  adminChatReportQuerySchema,
  type AdminChatGateway,
} from '../realtime/chat-admin-gateway.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const reportParametersSchema = z.object({ reportId: z.uuid() }).strict();

function reportId(request: FastifyRequest): string {
  const parsed = reportParametersSchema.safeParse(request.params);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_CHAT_MODERATION_REQUEST');
  return parsed.data.reportId;
}

export function registerAdminChatRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly chatGateway: AdminChatGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get('/api/v1/admin/multiplayer-chat/reports', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'multiplayer_chat.reports.read',
    );
    const query = adminChatReportQuerySchema.safeParse(request.query);
    if (!query.success) throw new PublicApiError(400, 'INVALID_CHAT_MODERATION_REQUEST');
    return {
      success: true,
      data: await options.chatGateway.list(identity, query.data),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/multiplayer-chat/reports/:reportId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'multiplayer_chat.reports.read',
    );
    const result = await options.chatGateway.detail(identity, reportId(request));
    if (result === undefined) throw new PublicApiError(404, 'CHAT_REPORT_NOT_FOUND');
    return { success: true, data: result, requestId: request.id };
  });

  app.post(
    '/api/v1/admin/multiplayer-chat/reports/:reportId/actions',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'multiplayer_chat.moderate',
      );
      const action = adminChatReportActionSchema.safeParse(request.body);
      if (!action.success) throw new PublicApiError(400, 'INVALID_CHAT_MODERATION_REQUEST');
      return {
        success: true,
        data: await options.chatGateway.act(identity, reportId(request), action.data),
        requestId: request.id,
      };
    },
  );
}
