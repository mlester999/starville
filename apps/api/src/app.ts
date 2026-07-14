import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { isModuleEnabled, type PlatformModuleKey } from '@starville/platform-configuration';
import type { AdminAuthGateway, ApiRuntimeConfig, ServiceLogger } from './contracts.js';
import { formatApiError, formatNotFoundError, PublicApiError } from './errors.js';
import { resolveRequestId } from './request-id.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminTokenGateRoutes } from './routes/admin-token-gate.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerTokenAccessRoutes } from './routes/token-access.js';
import { registerPlayerRoutes } from './routes/player.js';
import type { PlayerService } from './player/contracts.js';
import type { AdminOperationsService } from './admin-operations/contracts.js';
import { FixedWindowAdminRateLimiter } from './admin-operations/rate-limit.js';
import { registerAdminPlayerRoutes } from './routes/admin-players.js';
import { registerAdminOperationsRoutes } from './routes/admin-operations.js';
import type { TokenAccessService } from './token-access/contracts.js';
import type { PlayerWorldService } from './world/player-contracts.js';
import { registerPlayerWorldRoutes } from './routes/world.js';
import type { AdminWorldService } from './world/admin-contracts.js';
import { registerAdminWorldRoutes } from './routes/admin-worlds.js';
import type { LiveOperationsService } from './live-operations/contracts.js';
import { registerLiveOperationsRoutes } from './routes/live-operations.js';
import type { CozyGameplayService } from './cozy-gameplay/contracts.js';
import { FixedWindowPlayerRateLimiter } from './cozy-gameplay/rate-limit.js';
import { registerCozyGameplayRoutes } from './routes/cozy-gameplay.js';
import type { AdminCozyService } from './cozy-gameplay/admin.js';
import { registerAdminCozyGameplayRoutes } from './routes/admin-cozy-gameplay.js';
import type { AdminAssetService } from './asset-management/contracts.js';
import { registerAdminAssetRoutes } from './routes/admin-assets.js';
import type { PlatformConfigurationService } from './platform-configuration/contracts.js';
import { registerPlatformConfigurationRoutes } from './routes/platform-configuration.js';

export interface ApiTokenAccessOptions {
  readonly service: TokenAccessService;
  readonly cookieHashSecret: string;
  readonly cookieSecure: boolean;
  readonly cookieMaxAgeSeconds: number;
  readonly playerService?: PlayerService;
  readonly worldService?: PlayerWorldService;
  readonly cozyGameplayService?: CozyGameplayService;
}

export interface BuildApiAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly adminAuthGateway: AdminAuthGateway;
  readonly adminSessionTtlMinutes: number;
  readonly tokenAccess?: ApiTokenAccessOptions;
  readonly adminOperations?: {
    readonly service: AdminOperationsService;
    readonly readRateLimit?: number;
  };
  readonly adminWorld?: {
    readonly service: AdminWorldService;
    readonly manifestMaximumBytes: number;
  };
  readonly liveOperations?: { readonly service: LiveOperationsService };
  readonly adminCozy?: { readonly service: AdminCozyService };
  readonly adminAssets?: { readonly service: AdminAssetService };
  readonly platformConfiguration?: { readonly service: PlatformConfigurationService };
}

function requestPath(url: string): string {
  return url.split('?', 1)[0] ?? '/';
}

const ADMIN_MODULE_PATHS: readonly [string, PlatformModuleKey][] = [
  ['/api/v1/admin/live-operations', 'operations'],
  ['/api/v1/admin/players', 'players'],
  ['/api/v1/admin/token-gate', 'blockchain'],
  ['/api/v1/admin/worlds', 'world_management'],
  ['/api/v1/admin/world-assets', 'world_assets'],
  ['/api/v1/admin/game-content', 'content_management'],
  ['/api/v1/admin/platform-configuration', 'platform_configuration'],
];

export function buildApiApp({
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
}: BuildApiAppOptions): FastifyInstance {
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  const app = Fastify({
    logger: false,
    genReqId: resolveRequestId,
    trustProxy: config.trustedProxyCidrs.length === 0 ? false : [...config.trustedProxyCidrs],
  });

  void app.register(cookie);
  if (adminAssets !== undefined) {
    void app.register(multipart, {
      limits: {
        files: 1,
        fields: 1,
        parts: 2,
      },
    });
  }
  void app.register(cors, {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  if (platformConfiguration !== undefined) {
    app.addHook('preHandler', async (request) => {
      const path = requestPath(request.url);
      const module = ADMIN_MODULE_PATHS.find(([prefix]) => path.startsWith(prefix))?.[1];
      if (module === undefined) return;
      const active = await platformConfiguration.service.getActive('starville', request.id);
      if (!isModuleEnabled(active.configuration, module)) {
        throw new PublicApiError(404, 'MODULE_DISABLED');
      }
    });
  }

  app.addHook('onResponse', async (request, reply) => {
    logger.child({ requestId: request.id }).info('api.request.completed', {
      method: request.method,
      path: requestPath(request.url),
      statusCode: reply.statusCode,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const details = formatApiError(error, request.id);
    const requestLogger = logger.child({ requestId: request.id });
    const requestContext = {
      method: request.method,
      path: requestPath(request.url),
      statusCode: details.statusCode,
    };

    if (details.statusCode >= 500) {
      requestLogger.error('api.request.failed', { ...requestContext, error });
    } else {
      requestLogger.warn('api.request.rejected', requestContext);
    }

    void reply.status(details.statusCode).send(details.body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send(formatNotFoundError(request.id));
  });

  registerHealthRoutes(app, config);
  registerStatusRoutes(app);
  if (platformConfiguration !== undefined) {
    registerPlatformConfigurationRoutes(app, {
      service: platformConfiguration.service,
      adminGateway: adminAuthGateway,
      logger,
      allowedOrigins,
    });
  }
  if (liveOperations !== undefined) {
    registerLiveOperationsRoutes(app, {
      service: liveOperations.service,
      adminGateway: adminAuthGateway,
      logger,
      allowedOrigins,
    });
  }
  registerAdminRoutes(app, {
    gateway: adminAuthGateway,
    logger,
    sessionTtlMinutes: adminSessionTtlMinutes,
  });

  if (adminOperations !== undefined) {
    const readLimiter = new FixedWindowAdminRateLimiter(
      adminOperations.readRateLimit ?? 120,
      60_000,
    );
    registerAdminPlayerRoutes(app, {
      adminGateway: adminAuthGateway,
      service: adminOperations.service,
      logger,
      allowedOrigins,
      readLimiter,
    });
    registerAdminOperationsRoutes(app, {
      adminGateway: adminAuthGateway,
      service: adminOperations.service,
      logger,
      readLimiter,
    });
    if (adminCozy !== undefined) {
      registerAdminCozyGameplayRoutes(app, {
        adminGateway: adminAuthGateway,
        service: adminCozy.service,
        logger,
        readLimiter,
      });
    }
  }

  if (adminWorld !== undefined) {
    registerAdminWorldRoutes(app, {
      adminGateway: adminAuthGateway,
      service: adminWorld.service,
      logger,
      allowedOrigins,
      manifestMaximumBytes: adminWorld.manifestMaximumBytes,
      includeLegacyAssetDirectory: adminAssets === undefined,
    });
  }

  if (adminAssets !== undefined) {
    registerAdminAssetRoutes(app, {
      adminGateway: adminAuthGateway,
      service: adminAssets.service,
      logger,
      allowedOrigins,
    });
  }

  if (tokenAccess !== undefined) {
    registerTokenAccessRoutes(app, {
      service: tokenAccess.service,
      cookieHashSecret: tokenAccess.cookieHashSecret,
      cookie: {
        secure: tokenAccess.cookieSecure,
        maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
      },
      allowedOrigins,
    });
    registerAdminTokenGateRoutes(app, {
      adminGateway: adminAuthGateway,
      service: tokenAccess.service,
      logger,
    });
    if (tokenAccess.playerService !== undefined) {
      registerPlayerRoutes(app, {
        playerService: tokenAccess.playerService,
        tokenAccessService: tokenAccess.service,
        cookie: {
          secure: tokenAccess.cookieSecure,
          maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
        },
        allowedOrigins,
        ...(liveOperations === undefined ? {} : { liveOperationsService: liveOperations.service }),
      });
      if (tokenAccess.worldService !== undefined) {
        registerPlayerWorldRoutes(app, {
          worldService: tokenAccess.worldService,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          allowedOrigins,
        });
      }
      if (tokenAccess.cozyGameplayService !== undefined) {
        registerCozyGameplayRoutes(app, {
          service: tokenAccess.cozyGameplayService,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          allowedOrigins,
          readLimiter: new FixedWindowPlayerRateLimiter(120, 60_000),
          mutationLimiter: new FixedWindowPlayerRateLimiter(30, 60_000),
          ...(liveOperations === undefined
            ? {}
            : { liveOperationsService: liveOperations.service }),
        });
      }
    }
  }

  return app;
}
