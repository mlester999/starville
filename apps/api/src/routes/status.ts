import type { ApiSuccessResponse } from '@starville/shared-types';
import type { FastifyInstance } from 'fastify';

interface ApiStatus {
  readonly service: 'api';
  readonly apiVersion: 'v1';
  readonly status: 'operational';
}

export function registerStatusRoutes(app: FastifyInstance): void {
  app.get('/api/v1/status', async (request): Promise<ApiSuccessResponse<ApiStatus>> => ({
    success: true,
    data: {
      service: 'api',
      apiVersion: 'v1',
      status: 'operational',
    },
    requestId: request.id,
  }));
}
