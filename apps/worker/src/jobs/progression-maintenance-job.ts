import type { WorkerJob } from './job.js';

export interface ProgressionMaintenanceResult {
  readonly status: 'processed';
  readonly rewardsProcessed: number;
  readonly reconciliationResolved: number;
  readonly manualReview: number;
  readonly automaticXpCorrections: 0;
  readonly requestId: string;
}

export interface ProgressionMaintenanceGateway {
  execute(limit: number): Promise<ProgressionMaintenanceResult>;
}

export class ProgressionMaintenanceJob implements WorkerJob<ProgressionMaintenanceResult> {
  public readonly name = 'progression-reward-retry-and-reconciliation';

  public constructor(
    private readonly gateway: ProgressionMaintenanceGateway,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Progression maintenance limit must be between 1 and 500.');
    }
  }

  public execute(): Promise<ProgressionMaintenanceResult> {
    return this.gateway.execute(this.limit);
  }
}
