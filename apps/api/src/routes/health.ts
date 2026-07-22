import type { ServiceHealth } from '@starville/shared-types';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiRuntimeConfig, ServiceLogger } from '../contracts.js';

const SERVICE_VERSION = '0.1.0';

interface ReadinessHealth extends ServiceHealth {
  readonly readiness: 'ready' | 'not-ready';
  readonly dependencies: 'available' | 'unavailable';
}

export function registerHealthRoutes(
  app: FastifyInstance,
  config: ApiRuntimeConfig,
  logger: ServiceLogger,
  checkDependencies?: () => Promise<void>,
): void {
  app.get('/health', async (): Promise<ServiceHealth> => ({
    service: 'api',
    environment: config.environment,
    status: 'ok',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get('/ready', async (request, reply: FastifyReply): Promise<ReadinessHealth> => {
    try {
      await checkDependencies?.();
      return {
        service: 'api',
        environment: config.environment,
        status: 'ok',
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        readiness: 'ready',
        dependencies: 'available',
      };
    } catch (error) {
      logger.child({ requestId: request.id }).warn('api.readiness.degraded', { error });
      void reply.status(503);
      return {
        service: 'api',
        environment: config.environment,
        status: 'degraded',
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        readiness: 'not-ready',
        dependencies: 'unavailable',
      };
    }
  });
}
