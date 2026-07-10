import { loadWorkerConfig } from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createWorkerRuntime } from './runtime.js';

const config = loadWorkerConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const runtime = createWorkerRuntime({ config, logger });

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('worker.shutdown.started', { signal });

  try {
    await runtime.stop();
  } catch (error) {
    logger.error('worker.shutdown.failed', { error, signal });
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await runtime.start();
} catch (error) {
  logger.error('worker.startup.failed', { error });
  process.exitCode = 1;
}
