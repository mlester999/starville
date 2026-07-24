import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { isModuleEnabled, type PlatformModuleKey } from '@starville/platform-configuration';
import type { AdminAuthGateway, ApiRuntimeConfig, ServiceLogger } from './contracts.js';
import { formatApiError, formatNotFoundError, PublicApiError } from './errors.js';
import { resolveRequestId } from './request-id.js';
import { registerHealthRoutes, type ApiReadinessArchitecture } from './routes/health.js';
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
import type { RealtimeTicketService } from './realtime/contracts.js';
import type { AdminRealtimeGateway } from './realtime/admin-gateway.js';
import { registerAdminRealtimeRoutes } from './routes/admin-realtime.js';
import { registerAdminChatRoutes } from './routes/admin-chat.js';
import type { AdminChatGateway } from './realtime/chat-admin-gateway.js';
import type { AdminSocialGateway } from './realtime/social-admin-gateway.js';
import { registerAdminSocialRoutes } from './routes/admin-social.js';
import type { AdminSocialGraphGateway } from './realtime/social-graph-admin-gateway.js';
import { registerAdminSocialGraphRoutes } from './routes/admin-social-graph.js';
import type { AdminCooperativeActivityGateway } from './realtime/cooperative-activity-admin-gateway.js';
import { registerAdminCooperativeActivityRoutes } from './routes/admin-cooperative-activities.js';
import type { EconomyGateway } from './economy/gateway.js';
import { registerEconomyRoutes } from './routes/economy.js';
import type { AvatarService } from './avatar/contracts.js';
import type { AdminAvatarGateway } from './avatar/admin-gateway.js';
import { registerAvatarRoutes } from './routes/avatar.js';
import { registerAdminAvatarRoutes } from './routes/admin-avatar.js';
import type {
  CosmeticGateway,
  CosmeticService,
  AdminCosmeticGateway,
} from './cosmetics/contracts.js';
import { registerCosmeticRoutes } from './routes/cosmetics.js';
import { registerAdminCosmeticRoutes } from './routes/admin-cosmetics.js';
import type { WorldGameTestService } from './world/game-test-contracts.js';
import { registerWorldGameTestRoutes } from './routes/world-game-test.js';
import type { ProgressionGateway } from './progression/gateway.js';
import { registerProgressionRoutes } from './routes/progression.js';
import type { HousingGateway } from './housing/gateway.js';
import { registerHousingRoutes } from './routes/housing.js';
import type { HomeVisitGateway } from './home-visits/gateway.js';
import { registerHomeVisitRoutes } from './routes/home-visits.js';
import type { PlayerExperienceGateway } from './player-experience/gateway.js';
import { registerPlayerExperienceRoutes } from './routes/player-experience.js';
import type { GameplayAssetOverrideService } from './player/asset-override-contracts.js';
import type { SupabaseRealtimeAuthorizationService } from './realtime/supabase-contracts.js';

export interface ApiTokenAccessOptions {
  readonly service: TokenAccessService;
  readonly cookieHashSecret: string;
  readonly cookieSecure: boolean;
  readonly cookieMaxAgeSeconds: number;
  readonly playerService?: PlayerService;
  readonly worldService?: PlayerWorldService;
  readonly cozyGameplayService?: CozyGameplayService;
  readonly realtimeTicketService?: RealtimeTicketService;
  readonly supabaseRealtimeService?: SupabaseRealtimeAuthorizationService;
  readonly avatarService?: AvatarService;
  readonly cosmeticService?: CosmeticService;
  readonly cosmeticGateway?: CosmeticGateway;
  readonly assetOverrideService?: GameplayAssetOverrideService;
}

export interface BuildApiAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly adminAuthGateway: AdminAuthGateway;
  readonly adminSessionTtlMinutes: number;
  readonly readiness?: {
    readonly architecture: ApiReadinessArchitecture;
    readonly checkProviderDependencies?: () => Promise<void>;
  };
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
  readonly adminAssets?: {
    readonly service: AdminAssetService;
    readonly remoteWritesApproved: boolean;
  };
  readonly platformConfiguration?: { readonly service: PlatformConfigurationService };
  readonly adminRealtime?: { readonly gateway: AdminRealtimeGateway };
  readonly adminChat?: { readonly gateway: AdminChatGateway };
  readonly adminSocial?: { readonly gateway: AdminSocialGateway };
  readonly adminSocialGraph?: { readonly gateway: AdminSocialGraphGateway };
  readonly adminCooperativeActivities?: { readonly gateway: AdminCooperativeActivityGateway };
  readonly economy?: { readonly gateway: EconomyGateway };
  readonly progression?: { readonly gateway: ProgressionGateway };
  readonly housing?: { readonly gateway: HousingGateway };
  readonly homeVisits?: { readonly gateway: HomeVisitGateway };
  readonly playerExperience?: { readonly gateway: PlayerExperienceGateway };
  readonly adminAvatar?: { readonly gateway: AdminAvatarGateway };
  readonly adminCosmetics?: { readonly gateway: AdminCosmeticGateway };
  readonly worldGameTest?: {
    readonly service: WorldGameTestService;
    readonly cookieSecure: boolean;
    readonly cookieMaxAgeSeconds: number;
  };
}

function requestPath(url: string): string {
  return url.split('?', 1)[0] ?? '/';
}

const MODULE_PATHS: readonly [string, PlatformModuleKey][] = [
  ['/api/v1/admin/avatar-content', 'avatar_customization'],
  ['/api/v1/token-access/player/avatar', 'avatar_customization'],
  ['/api/v1/token-access/player/cosmetics', 'wardrobe'],
  ['/api/v1/admin/cosmetics', 'wardrobe'],
  ['/api/v1/token-access/player/economy', 'offchain_economy'],
  ['/api/v1/token-access/player/progression', 'cozy_gameplay'],
  ['/api/v1/token-access/player/housing', 'cozy_gameplay'],
  ['/api/v1/token-access/player/home-visits', 'cozy_gameplay'],
  ['/api/v1/token-access/player/experience', 'cozy_gameplay'],
  ['/api/v1/admin/live-operations', 'operations'],
  ['/api/v1/admin/realtime', 'operations'],
  ['/api/v1/admin/multiplayer-chat', 'operations'],
  ['/api/v1/admin/social-interactions', 'operations'],
  ['/api/v1/admin/social-graph', 'social_graph'],
  ['/api/v1/admin/cooperative-activities', 'cooperative_activities'],
  ['/api/v1/admin/economy/simulations', 'economy_simulation'],
  ['/api/v1/admin/economy', 'offchain_economy'],
  ['/api/v1/admin/progression', 'content_management'],
  ['/api/v1/admin/housing', 'content_management'],
  ['/api/v1/admin/home-visits', 'operations'],
  ['/api/v1/admin/player-experience', 'operations'],
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
  adminRealtime,
  adminChat,
  adminSocial,
  adminSocialGraph,
  adminCooperativeActivities,
  economy,
  progression,
  housing,
  homeVisits,
  playerExperience,
  adminAvatar,
  adminCosmetics,
  worldGameTest,
  readiness,
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
    void reply.header('cache-control', 'no-store');
    void reply.header(
      'content-security-policy',
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    void reply.header(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    void reply.header('referrer-policy', 'no-referrer');
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('x-frame-options', 'DENY');
    if (config.environment === 'production') {
      void reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
  });

  if (platformConfiguration !== undefined) {
    app.addHook('preHandler', async (request) => {
      const path = requestPath(request.url);
      const module = MODULE_PATHS.find(([prefix]) => path.startsWith(prefix))?.[1];
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
      durationMs: Math.round(reply.elapsedTime),
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const details = formatApiError(error, request.id);
    const requestLogger = logger.child({ requestId: request.id });
    const requestContext = {
      method: request.method,
      path: requestPath(request.url),
      statusCode: details.statusCode,
      errorCode: details.body.error.code,
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

  registerHealthRoutes(
    app,
    config,
    logger,
    readiness?.architecture,
    tokenAccess === undefined
      ? undefined
      : async () => {
          await tokenAccess.service.getPublicConfig();
          await readiness?.checkProviderDependencies?.();
        },
  );
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
    if (adminRealtime !== undefined) {
      registerAdminRealtimeRoutes(app, {
        adminGateway: adminAuthGateway,
        realtimeGateway: adminRealtime.gateway,
        logger,
      });
    }
    if (adminCozy !== undefined) {
      registerAdminCozyGameplayRoutes(app, {
        adminGateway: adminAuthGateway,
        service: adminCozy.service,
        logger,
        readLimiter,
        allowedOrigins,
      });
    }
  }

  if (adminChat !== undefined) {
    registerAdminChatRoutes(app, {
      adminGateway: adminAuthGateway,
      chatGateway: adminChat.gateway,
      logger,
      allowedOrigins,
    });
  }

  if (adminSocial !== undefined) {
    registerAdminSocialRoutes(app, {
      adminGateway: adminAuthGateway,
      socialGateway: adminSocial.gateway,
      logger,
    });
  }

  if (adminSocialGraph !== undefined) {
    registerAdminSocialGraphRoutes(app, {
      adminGateway: adminAuthGateway,
      socialGraphGateway: adminSocialGraph.gateway,
      logger,
      allowedOrigins,
    });
  }

  if (adminCooperativeActivities !== undefined) {
    registerAdminCooperativeActivityRoutes(app, {
      adminGateway: adminAuthGateway,
      activityGateway: adminCooperativeActivities.gateway,
      logger,
      allowedOrigins,
    });
  }

  if (adminAvatar !== undefined) {
    registerAdminAvatarRoutes(app, {
      adminGateway: adminAuthGateway,
      avatarGateway: adminAvatar.gateway,
      logger,
      allowedOrigins,
    });
  }

  if (adminCosmetics !== undefined) {
    registerAdminCosmeticRoutes(app, {
      adminGateway: adminAuthGateway,
      cosmeticGateway: adminCosmetics.gateway,
      logger,
      allowedOrigins,
    });
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

  if (worldGameTest !== undefined) {
    registerWorldGameTestRoutes(app, {
      service: worldGameTest.service,
      adminGateway: adminAuthGateway,
      logger,
      allowedOrigins,
      cookie: {
        secure: worldGameTest.cookieSecure,
        maxAgeSeconds: worldGameTest.cookieMaxAgeSeconds,
      },
      adminMutationLimiter: new FixedWindowAdminRateLimiter(30, 60_000),
      gameReadLimiter: new FixedWindowPlayerRateLimiter(120, 60_000),
      gameMutationLimiter: new FixedWindowPlayerRateLimiter(30, 60_000),
    });
  }

  if (adminAssets !== undefined) {
    registerAdminAssetRoutes(app, {
      adminGateway: adminAuthGateway,
      service: adminAssets.service,
      logger,
      allowedOrigins,
      remoteWritesApproved: adminAssets.remoteWritesApproved,
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
        ...(tokenAccess.realtimeTicketService === undefined
          ? {}
          : { realtimeTicketService: tokenAccess.realtimeTicketService }),
        ...(tokenAccess.supabaseRealtimeService === undefined
          ? {}
          : { supabaseRealtimeService: tokenAccess.supabaseRealtimeService }),
        ...(tokenAccess.assetOverrideService === undefined
          ? {}
          : { assetOverrideService: tokenAccess.assetOverrideService }),
        ...(liveOperations === undefined ? {} : { liveOperationsService: liveOperations.service }),
      });
      if (tokenAccess.avatarService !== undefined) {
        registerAvatarRoutes(app, {
          service: tokenAccess.avatarService,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          cookieHashSecret: tokenAccess.cookieHashSecret,
          allowedOrigins,
        });
      }
      if (tokenAccess.cosmeticService !== undefined && tokenAccess.cosmeticGateway !== undefined) {
        registerCosmeticRoutes(app, {
          service: tokenAccess.cosmeticService,
          gateway: tokenAccess.cosmeticGateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          cookieHashSecret: tokenAccess.cookieHashSecret,
          allowedOrigins,
        });
      }
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
      if (economy !== undefined) {
        registerEconomyRoutes(app, {
          gateway: economy.gateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          adminGateway: adminAuthGateway,
          logger,
          allowedOrigins,
        });
      }
      if (progression !== undefined) {
        registerProgressionRoutes(app, {
          gateway: progression.gateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          adminGateway: adminAuthGateway,
          logger,
          allowedOrigins,
        });
      }
      if (housing !== undefined) {
        registerHousingRoutes(app, {
          gateway: housing.gateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          adminGateway: adminAuthGateway,
          logger,
          allowedOrigins,
        });
      }
      if (homeVisits !== undefined) {
        registerHomeVisitRoutes(app, {
          gateway: homeVisits.gateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          adminGateway: adminAuthGateway,
          logger,
          allowedOrigins,
        });
      }
      if (playerExperience !== undefined) {
        registerPlayerExperienceRoutes(app, {
          gateway: playerExperience.gateway,
          playerService: tokenAccess.playerService,
          tokenAccessService: tokenAccess.service,
          cookie: {
            secure: tokenAccess.cookieSecure,
            maxAgeSeconds: tokenAccess.cookieMaxAgeSeconds,
          },
          adminGateway: adminAuthGateway,
          logger,
          allowedOrigins,
        });
      }
    }
  }

  return app;
}
