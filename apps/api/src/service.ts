import type { FastifyInstance } from 'fastify';
import { buildApiApp, type ApiTokenAccessOptions, type BuildApiAppOptions } from './app.js';
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
  readonly tokenAccess?: ApiTokenAccessOptions;
  readonly adminOperations?: BuildApiAppOptions['adminOperations'];
  readonly adminWorld?: BuildApiAppOptions['adminWorld'];
  readonly liveOperations?: BuildApiAppOptions['liveOperations'];
  readonly adminCozy?: BuildApiAppOptions['adminCozy'];
  readonly adminAssets?: BuildApiAppOptions['adminAssets'];
  readonly platformConfiguration?: BuildApiAppOptions['platformConfiguration'];
}

export function createApiService({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes,
  tokenAccess,
  adminOperations,
  adminWorld,
  liveOperations,
  adminCozy,
  adminAssets,
  platformConfiguration,
}: CreateApiServiceOptions): ApiService {
  const app = buildApiApp({
    config,
    logger,
    adminAuthGateway,
    adminSessionTtlMinutes,
    ...(tokenAccess === undefined ? {} : { tokenAccess }),
    ...(adminOperations === undefined ? {} : { adminOperations }),
    ...(adminWorld === undefined ? {} : { adminWorld }),
    ...(liveOperations === undefined ? {} : { liveOperations }),
    ...(adminCozy === undefined ? {} : { adminCozy }),
    ...(adminAssets === undefined ? {} : { adminAssets }),
    ...(platformConfiguration === undefined ? {} : { platformConfiguration }),
  });

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
