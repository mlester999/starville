import type { ServiceHealth } from '@starville/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ApiRuntimeConfig } from '../contracts.js';

const SERVICE_VERSION = '0.1.0';

export function registerHealthRoutes(app: FastifyInstance, config: ApiRuntimeConfig): void {
  app.get('/health', async (): Promise<ServiceHealth> => ({
    service: 'api',
    environment: config.environment,
    status: 'ok',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get('/ready', async (): Promise<ServiceHealth> => ({
    service: 'api',
    environment: config.environment,
    status: 'ok',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  }));
}
