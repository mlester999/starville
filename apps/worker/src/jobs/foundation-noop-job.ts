import type { JobExecutionContext, WorkerJob } from './job.js';

export class FoundationNoopJob implements WorkerJob {
  readonly name = 'phase-1-foundation-noop';

  async execute({ logger }: JobExecutionContext): Promise<void> {
    logger.debug('worker.foundation_noop.completed');
  }
}
