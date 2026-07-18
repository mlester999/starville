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
  readonly adminRealtime?: BuildApiAppOptions['adminRealtime'];
  readonly adminChat?: BuildApiAppOptions['adminChat'];
  readonly adminSocial?: BuildApiAppOptions['adminSocial'];
  readonly adminSocialGraph?: BuildApiAppOptions['adminSocialGraph'];
  readonly adminCooperativeActivities?: BuildApiAppOptions['adminCooperativeActivities'];
  readonly economy?: BuildApiAppOptions['economy'];
  readonly progression?: BuildApiAppOptions['progression'];
  readonly housing?: BuildApiAppOptions['housing'];
  readonly adminAvatar?: BuildApiAppOptions['adminAvatar'];
  readonly adminCosmetics?: BuildApiAppOptions['adminCosmetics'];
  readonly worldGameTest?: BuildApiAppOptions['worldGameTest'];
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
  adminRealtime,
  adminChat,
  adminSocial,
  adminSocialGraph,
  adminCooperativeActivities,
  economy,
  progression,
  housing,
  adminAvatar,
  adminCosmetics,
  worldGameTest,
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
    ...(adminRealtime === undefined ? {} : { adminRealtime }),
    ...(adminChat === undefined ? {} : { adminChat }),
    ...(adminSocial === undefined ? {} : { adminSocial }),
    ...(adminSocialGraph === undefined ? {} : { adminSocialGraph }),
    ...(adminCooperativeActivities === undefined ? {} : { adminCooperativeActivities }),
    ...(economy === undefined ? {} : { economy }),
    ...(progression === undefined ? {} : { progression }),
    ...(housing === undefined ? {} : { housing }),
    ...(adminAvatar === undefined ? {} : { adminAvatar }),
    ...(adminCosmetics === undefined ? {} : { adminCosmetics }),
    ...(worldGameTest === undefined ? {} : { worldGameTest }),
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
