import {
  loadAdminSecurityConfig,
  loadApiConfig,
  loadHostedWriteSafetyConfig,
  loadPrivateSupabaseConfig,
  loadOperationsHealthConfig,
  loadServiceArchitectureConfig,
  loadTokenAccessServerConfig,
  loadWorldManagementConfig,
} from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createSolanaTokenVerifier } from '@starville/solana';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { createSupabaseAdminAuthGateway } from './admin-auth-gateway.js';
import { createApiService } from './service.js';
import { createSupabasePlayerGateway } from './player/gateway.js';
import { createPlayerService } from './player/service.js';
import { createSupabaseTokenAccessGateway } from './token-access/gateway.js';
import { createTokenAccessService } from './token-access/service.js';
import { createSupabaseAdminOperationsGateway } from './admin-operations/gateway.js';
import { createOperationsHealthReader } from './admin-operations/health.js';
import { createAdminOperationsService } from './admin-operations/service.js';
import { createSupabasePlayerWorldGateway } from './world/player-gateway.js';
import { createPlayerWorldService } from './world/player-service.js';
import { createSupabaseAdminWorldGateway } from './world/admin-gateway.js';
import { createAdminWorldService } from './world/admin-service.js';
import { createSupabaseLiveOperationsGateway } from './live-operations/gateway.js';
import { createLiveOperationsService } from './live-operations/service.js';
import { createAdminCozyService } from './cozy-gameplay/admin.js';
import { createSupabaseCozyGameplayGateway } from './cozy-gameplay/gateway.js';
import { createCozyGameplayService } from './cozy-gameplay/service.js';
import { createSupabaseAdminAssetGateway } from './asset-management/gateway.js';
import { createAdminAssetService } from './asset-management/service.js';
import { createSupabaseAssetStorage } from './asset-management/storage.js';
import { createSupabasePlatformConfigurationGateway } from './platform-configuration/gateway.js';
import { createPlatformConfigurationService } from './platform-configuration/service.js';
import { createSupabaseRealtimeTicketGateway } from './realtime/gateway.js';
import { createRealtimeTicketService } from './realtime/service.js';
import { createSupabaseAdminRealtimeGateway } from './realtime/admin-gateway.js';
import { createSupabaseAdminChatGateway } from './realtime/chat-admin-gateway.js';
import { createSupabaseAdminSocialGateway } from './realtime/social-admin-gateway.js';
import { createSupabaseAdminSocialGraphGateway } from './realtime/social-graph-admin-gateway.js';
import { createSupabaseAdminCooperativeActivityGateway } from './realtime/cooperative-activity-admin-gateway.js';
import { createSupabaseEconomyGateway } from './economy/gateway.js';
import { createSupabaseProgressionGateway } from './progression/gateway.js';
import { createSupabaseHousingGateway } from './housing/gateway.js';
import { createSupabaseHomeVisitGateway } from './home-visits/gateway.js';
import { createSupabasePlayerExperienceGateway } from './player-experience/gateway.js';
import { createSupabaseAvatarGateway } from './avatar/gateway.js';
import { createAvatarService } from './avatar/service.js';
import { createSupabaseAdminAvatarGateway } from './avatar/admin-gateway.js';
import {
  createSupabaseAdminCosmeticGateway,
  createSupabaseCosmeticGateway,
} from './cosmetics/gateway.js';
import { createCosmeticService } from './cosmetics/service.js';
import { createSupabaseWorldGameTestGateway } from './world/game-test-gateway.js';
import { createWorldGameTestService } from './world/game-test-service.js';
import { createSupabaseGameplayAssetOverrideGateway } from './player/asset-override-gateway.js';
import { createGameplayAssetOverrideService } from './player/asset-override-service.js';
import { createSupabaseRealtimeAuthorizationGateway } from './realtime/supabase-gateway.js';
import { createSupabaseRealtimeAuthorizationService } from './realtime/supabase-service.js';

const config = loadApiConfig(process.env);
const adminSecurity = loadAdminSecurityConfig(process.env);
const supabaseConfig = loadPrivateSupabaseConfig(process.env);
const tokenAccessConfig = loadTokenAccessServerConfig(process.env);
const operationsConfig = loadOperationsHealthConfig(process.env);
const architectureConfig = loadServiceArchitectureConfig(process.env);
const worldConfig = loadWorldManagementConfig(process.env);
const hostedWriteSafety = loadHostedWriteSafetyConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const privilegedSupabase = createSupabaseServiceRoleClient({
  url: supabaseConfig.url,
  serviceRoleKey: supabaseConfig.serviceRoleKey,
});
const liveOperationsService = createLiveOperationsService({
  gateway: createSupabaseLiveOperationsGateway(privilegedSupabase),
  logger,
});
const adminAuthGateway = createSupabaseAdminAuthGateway(privilegedSupabase);
const assetStorage = createSupabaseAssetStorage(privilegedSupabase);
const playerWorldGateway = createSupabasePlayerWorldGateway(privilegedSupabase);
const playerWorldService = createPlayerWorldService({
  gateway: playerWorldGateway,
  logger,
  manifestReadRateLimit: worldConfig.playerManifestReadRateLimit,
  transitionRateLimit: worldConfig.playerTransitionRateLimit,
  publicAssetUrl: (path) => assetStorage.publicUrl(path),
});
const playerService = createPlayerService({
  gateway: createSupabasePlayerGateway(privilegedSupabase),
  logger,
  worldManifestLoader: async (walletAddress, mapId, requestId) => {
    const world = await playerWorldService.loadPublishedManifest(walletAddress, mapId, requestId);
    return world.manifest;
  },
});
const cozyGameplayService = createCozyGameplayService({
  gateway: createSupabaseCozyGameplayGateway(privilegedSupabase),
  logger,
});
const assetOverrideService = createGameplayAssetOverrideService({
  gateway: createSupabaseGameplayAssetOverrideGateway(privilegedSupabase),
  logger,
  publicAssetUrl: (path) => assetStorage.publicUrl(path),
});
const adminCozyService = createAdminCozyService(privilegedSupabase);
const tokenAccessService = createTokenAccessService({
  environment: config.environment,
  config: tokenAccessConfig,
  gateway: createSupabaseTokenAccessGateway(privilegedSupabase),
  verifier: createSolanaTokenVerifier({
    rpcUrl: tokenAccessConfig.rpcUrl,
    network: tokenAccessConfig.network,
    commitment: tokenAccessConfig.commitment,
    timeoutMs: tokenAccessConfig.rpcTimeoutMs,
    maximumAttempts: tokenAccessConfig.rpcMaximumAttempts,
  }),
  logger,
});
const operationsHealthReader = createOperationsHealthReader(operationsConfig);
const adminOperationsService = createAdminOperationsService({
  gateway: createSupabaseAdminOperationsGateway(privilegedSupabase, {
    environmentKey: config.environment,
    network: tokenAccessConfig.network,
  }),
  healthReader: operationsHealthReader,
  logger,
  actionRateLimit: operationsConfig.playerActionRateLimit,
});
const adminWorldService = createAdminWorldService({
  gateway: createSupabaseAdminWorldGateway(privilegedSupabase),
  logger,
  manifestMaximumBytes: worldConfig.manifestMaximumBytes,
  readRateLimit: worldConfig.adminReadRateLimit,
  draftWriteRateLimit: worldConfig.adminDraftWriteRateLimit,
  validationRateLimit: worldConfig.adminValidationRateLimit,
  publishRateLimit: worldConfig.adminPublishRateLimit,
  deriveRateLimit: worldConfig.adminDeriveRateLimit,
});
const adminAssetService = createAdminAssetService({
  gateway: createSupabaseAdminAssetGateway(privilegedSupabase),
  storage: assetStorage,
  logger,
  readRateLimit: worldConfig.adminReadRateLimit,
  mutationRateLimit: worldConfig.adminDraftWriteRateLimit,
});
const platformConfigurationService = createPlatformConfigurationService({
  gateway: createSupabasePlatformConfigurationGateway(privilegedSupabase),
  logger,
  publicAssetUrl: (path) => assetStorage.publicUrl(path),
});
const realtimeTicketService =
  architectureConfig.realtimeProvider === 'custom'
    ? createRealtimeTicketService({
        gateway: createSupabaseRealtimeTicketGateway(privilegedSupabase),
        accessTokenSecret: tokenAccessConfig.cookieSecret,
        ticketSecret: process.env['REALTIME_TICKET_SECRET'] ?? tokenAccessConfig.cookieSecret,
      })
    : undefined;
const supabaseRealtimeService =
  architectureConfig.realtimeProvider === 'supabase'
    ? createSupabaseRealtimeAuthorizationService({
        gateway: createSupabaseRealtimeAuthorizationGateway(privilegedSupabase),
        environment: config.environment,
        accessTokenSecret: tokenAccessConfig.cookieSecret,
      })
    : undefined;
const avatarService = createAvatarService({
  gateway: createSupabaseAvatarGateway(privilegedSupabase),
  logger,
});
const cosmeticGateway = createSupabaseCosmeticGateway(privilegedSupabase);
const cosmeticService = createCosmeticService(cosmeticGateway);
const worldGameTestService = createWorldGameTestService({
  gateway: createSupabaseWorldGameTestGateway(privilegedSupabase),
  logger,
  environment: config.environment,
  publicAssetUrl: (path) => assetStorage.publicUrl(path),
  ttlMinutes: 20,
  adminRateLimit: worldConfig.adminValidationRateLimit,
});
const service = createApiService({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes: adminSecurity.sessionTtlMinutes,
  readiness: {
    architecture: architectureConfig,
    checkProviderDependencies: async () => {
      const statuses = await operationsHealthReader.read('api-readiness');
      if (statuses.some((status) => status.service !== 'api' && status.status !== 'healthy')) {
        throw new Error('DEPENDENCY_UNAVAILABLE');
      }
    },
  },
  tokenAccess: {
    service: tokenAccessService,
    cookieHashSecret: tokenAccessConfig.cookieSecret,
    cookieSecure: config.environment === 'production',
    cookieMaxAgeSeconds: tokenAccessConfig.sessionTtlSeconds,
    playerService,
    worldService: playerWorldService,
    cozyGameplayService,
    ...(realtimeTicketService === undefined ? {} : { realtimeTicketService }),
    ...(supabaseRealtimeService === undefined ? {} : { supabaseRealtimeService }),
    avatarService,
    cosmeticService,
    cosmeticGateway,
    assetOverrideService,
  },
  adminOperations: {
    service: adminOperationsService,
    readRateLimit: operationsConfig.operationsReadRateLimit,
  },
  adminWorld: {
    service: adminWorldService,
    manifestMaximumBytes: worldConfig.manifestMaximumBytes,
  },
  liveOperations: { service: liveOperationsService },
  adminCozy: { service: adminCozyService },
  adminAssets: {
    service: adminAssetService,
    remoteWritesApproved: hostedWriteSafety.remoteWritesApproved,
  },
  platformConfiguration: { service: platformConfigurationService },
  adminRealtime: { gateway: createSupabaseAdminRealtimeGateway(privilegedSupabase) },
  adminChat: { gateway: createSupabaseAdminChatGateway(privilegedSupabase) },
  adminSocial: { gateway: createSupabaseAdminSocialGateway(privilegedSupabase) },
  adminSocialGraph: { gateway: createSupabaseAdminSocialGraphGateway(privilegedSupabase) },
  adminCooperativeActivities: {
    gateway: createSupabaseAdminCooperativeActivityGateway(privilegedSupabase),
  },
  economy: { gateway: createSupabaseEconomyGateway(privilegedSupabase) },
  progression: { gateway: createSupabaseProgressionGateway(privilegedSupabase) },
  housing: { gateway: createSupabaseHousingGateway(privilegedSupabase) },
  homeVisits: { gateway: createSupabaseHomeVisitGateway(privilegedSupabase) },
  playerExperience: { gateway: createSupabasePlayerExperienceGateway(privilegedSupabase) },
  adminAvatar: { gateway: createSupabaseAdminAvatarGateway(privilegedSupabase) },
  adminCosmetics: { gateway: createSupabaseAdminCosmeticGateway(privilegedSupabase) },
  worldGameTest: {
    service: worldGameTestService,
    cookieSecure: config.environment === 'production',
    cookieMaxAgeSeconds: 20 * 60,
  },
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('api.shutdown.started', { signal });

  try {
    await service.stop();
  } catch (error) {
    logger.error('api.shutdown.failed', { error, signal });
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await service.start();
} catch (error) {
  logger.error('api.startup.failed', { error });
  process.exitCode = 1;
}
