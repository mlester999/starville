import type { ServiceHealth } from '@starville/shared-types';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiRuntimeConfig, ServiceLogger } from '../contracts.js';

const SERVICE_VERSION = '0.1.0';

interface ReadinessHealth extends ServiceHealth {
  readonly readiness: 'ready' | 'not-ready';
  readonly dependencies: 'available' | 'unavailable';
  readonly architecture: {
    readonly realtimeProvider: 'custom' | 'supabase';
    readonly backgroundJobsProvider: 'custom' | 'supabase';
    readonly migrationState: 'custom-active' | 'foundation-incomplete';
  };
  readonly reason?: 'SUPABASE_MIGRATION_PARITY_INCOMPLETE' | 'DEPENDENCY_UNAVAILABLE';
}

export interface ApiReadinessArchitecture {
  readonly realtimeProvider: 'custom' | 'supabase';
  readonly backgroundJobsProvider: 'custom' | 'supabase';
  readonly migrationState: 'custom-active' | 'foundation-incomplete';
}

export function registerHealthRoutes(
  app: FastifyInstance,
  config: ApiRuntimeConfig,
  logger: ServiceLogger,
  architecture: ApiReadinessArchitecture = {
    realtimeProvider: 'custom',
    backgroundJobsProvider: 'custom',
    migrationState: 'custom-active',
  },
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
      if (architecture.migrationState !== 'custom-active') {
        throw new Error('SUPABASE_MIGRATION_PARITY_INCOMPLETE');
      }
      return {
        service: 'api',
        environment: config.environment,
        status: 'ok',
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        readiness: 'ready',
        dependencies: 'available',
        architecture,
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
        architecture,
        reason:
          architecture.migrationState === 'foundation-incomplete'
            ? 'SUPABASE_MIGRATION_PARITY_INCOMPLETE'
            : 'DEPENDENCY_UNAVAILABLE',
      };
    }
  });
}
