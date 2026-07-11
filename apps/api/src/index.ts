import {
  loadAdminSecurityConfig,
  loadApiConfig,
  loadPrivateSupabaseConfig,
  loadTokenAccessServerConfig,
} from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createSolanaTokenVerifier } from '@starville/solana';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { createSupabaseAdminAuthGateway } from './admin-auth-gateway.js';
import { createApiService } from './service.js';
import { createSupabaseTokenAccessGateway } from './token-access/gateway.js';
import { createTokenAccessService } from './token-access/service.js';

const config = loadApiConfig(process.env);
const adminSecurity = loadAdminSecurityConfig(process.env);
const supabaseConfig = loadPrivateSupabaseConfig(process.env);
const tokenAccessConfig = loadTokenAccessServerConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const privilegedSupabase = createSupabaseServiceRoleClient({
  url: supabaseConfig.url,
  serviceRoleKey: supabaseConfig.serviceRoleKey,
});
const adminAuthGateway = createSupabaseAdminAuthGateway(privilegedSupabase);
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
