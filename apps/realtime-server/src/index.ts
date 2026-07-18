import { loadPrivateSupabaseConfig, loadRealtimeConfig } from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { createSupabaseRealtimePersistenceGateway } from './persistence/gateway.js';
import { createRealtimeService } from './service.js';

const config = loadRealtimeConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const supabase = loadPrivateSupabaseConfig(process.env);
const privilegedSupabase = createSupabaseServiceRoleClient({
  url: supabase.url,
  serviceRoleKey: supabase.serviceRoleKey,
});
const service = createRealtimeService({
  config,
  logger,
  persistence: createSupabaseRealtimePersistenceGateway(privilegedSupabase),
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('realtime.shutdown.started', { signal });

  try {
    await service.stop();
  } catch (error) {
    logger.error('realtime.shutdown.failed', { error, signal });
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await service.start();
} catch (error) {
  logger.error('realtime.startup.failed', { error });
  process.exitCode = 1;
}
