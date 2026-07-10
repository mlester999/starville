import { loadApiConfig } from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createApiService } from './service.js';

const config = loadApiConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const service = createApiService({ config, logger });

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
