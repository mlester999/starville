import type { FastifyInstance } from 'fastify';
import { buildApiApp } from './app.js';
import type { AdminAuthGateway, ApiRuntimeConfig, ServiceLogger } from './contracts.js';

export interface ApiService {
  readonly app: FastifyInstance;
  start(): Promise<string>;
  stop(): Promise<void>;
}

export interface CreateApiServiceOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly adminAuthGateway: AdminAuthGateway;
  readonly adminSessionTtlMinutes: number;
}

export function createApiService({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes,
}: CreateApiServiceOptions): ApiService {
  const app = buildApiApp({ config, logger, adminAuthGateway, adminSessionTtlMinutes });

  return {
    app,
    async start() {
      const address = await app.listen({ host: config.host, port: config.port });
      logger.info('api.started', { address, host: config.host, port: config.port });
      return address;
    },
    async stop() {
      await app.close();
      logger.info('api.stopped');
    },
  };
}
