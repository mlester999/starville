import {
  loadAdminSecurityConfig,
  loadApiConfig,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { createSupabaseAdminAuthGateway } from './admin-auth-gateway.js';
import { createApiService } from './service.js';

const config = loadApiConfig(process.env);
const adminSecurity = loadAdminSecurityConfig(process.env);
const supabaseConfig = loadPrivateSupabaseConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const adminAuthGateway = createSupabaseAdminAuthGateway(
  createSupabaseServiceRoleClient({
    url: supabaseConfig.url,
    serviceRoleKey: supabaseConfig.serviceRoleKey,
  }),
);
const service = createApiService({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes: adminSecurity.sessionTtlMinutes,
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
