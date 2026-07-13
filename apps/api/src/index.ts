import {
  loadAdminSecurityConfig,
  loadApiConfig,
  loadPrivateSupabaseConfig,
  loadOperationsHealthConfig,
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

const config = loadApiConfig(process.env);
const adminSecurity = loadAdminSecurityConfig(process.env);
const supabaseConfig = loadPrivateSupabaseConfig(process.env);
const tokenAccessConfig = loadTokenAccessServerConfig(process.env);
const operationsConfig = loadOperationsHealthConfig(process.env);
const worldConfig = loadWorldManagementConfig(process.env);
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
const adminOperationsService = createAdminOperationsService({
  gateway: createSupabaseAdminOperationsGateway(privilegedSupabase, {
    environmentKey: config.environment,
    network: tokenAccessConfig.network,
  }),
  healthReader: createOperationsHealthReader(operationsConfig),
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
const service = createApiService({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes: adminSecurity.sessionTtlMinutes,
  tokenAccess: {
    service: tokenAccessService,
    cookieHashSecret: tokenAccessConfig.cookieSecret,
    cookieSecure: config.environment === 'production',
    cookieMaxAgeSeconds: tokenAccessConfig.sessionTtlSeconds,
    playerService,
    worldService: playerWorldService,
    cozyGameplayService,
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
  adminAssets: { service: adminAssetService },
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
