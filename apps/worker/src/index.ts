import { loadPrivateSupabaseConfig, loadWorkerConfig } from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { createWorkerRuntime } from './runtime.js';
import { ChatRetentionCleanupJob } from './jobs/chat-retention-cleanup-job.js';
import { createChatRetentionCleanupGateway } from './jobs/chat-retention-persistence.js';
import { SocialInteractionCleanupJob } from './jobs/social-interaction-cleanup-job.js';
import { createSocialInteractionCleanupGateway } from './jobs/social-interaction-cleanup-persistence.js';
import { SocialGraphCleanupJob } from './jobs/social-graph-cleanup-job.js';
import { createSocialGraphCleanupGateway } from './jobs/social-graph-cleanup-persistence.js';
import { CooperativeActivityCleanupJob } from './jobs/cooperative-activity-cleanup-job.js';
import { createCooperativeActivityCleanupGateway } from './jobs/cooperative-activity-cleanup-persistence.js';
import { EconomyMaintenanceJob } from './jobs/economy-maintenance-job.js';
import { createEconomyMaintenanceGateway } from './jobs/economy-maintenance-persistence.js';
import { FarmingReconciliationJob } from './jobs/farming-reconciliation-job.js';
import { createFarmingReconciliationGateway } from './jobs/farming-reconciliation-persistence.js';
import { CraftingReconciliationJob } from './jobs/crafting-reconciliation-job.js';
import { createCraftingReconciliationGateway } from './jobs/crafting-reconciliation-persistence.js';
import { ProgressionMaintenanceJob } from './jobs/progression-maintenance-job.js';
import { createProgressionMaintenanceGateway } from './jobs/progression-maintenance-persistence.js';
import { HousingMaintenanceJob } from './jobs/housing-maintenance-job.js';
import { createHousingMaintenanceGateway } from './jobs/housing-maintenance-persistence.js';

const config = loadWorkerConfig(process.env);
const supabaseConfig = loadPrivateSupabaseConfig(process.env);
const logger = createLogger({
  service: config.application,
  environment: config.environment,
  level: config.logLevel,
});
const privilegedSupabase = createSupabaseServiceRoleClient({
  url: supabaseConfig.url,
  serviceRoleKey: supabaseConfig.serviceRoleKey,
});
const runtime = createWorkerRuntime({
  config,
  logger,
  jobs: [
    new ChatRetentionCleanupJob(createChatRetentionCleanupGateway(privilegedSupabase)),
    new SocialInteractionCleanupJob(createSocialInteractionCleanupGateway(privilegedSupabase)),
    new SocialGraphCleanupJob(createSocialGraphCleanupGateway(privilegedSupabase)),
    new CooperativeActivityCleanupJob(createCooperativeActivityCleanupGateway(privilegedSupabase)),
    new EconomyMaintenanceJob(createEconomyMaintenanceGateway(privilegedSupabase)),
    new FarmingReconciliationJob(createFarmingReconciliationGateway(privilegedSupabase)),
    new CraftingReconciliationJob(createCraftingReconciliationGateway(privilegedSupabase)),
    new ProgressionMaintenanceJob(createProgressionMaintenanceGateway(privilegedSupabase)),
    new HousingMaintenanceJob(createHousingMaintenanceGateway(privilegedSupabase)),
  ],
});

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
