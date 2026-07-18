import type { WorkerJob } from './job.js';

export interface CooperativeActivityCleanupResult {
  readonly processed: number;
  readonly failed: number;
  readonly reconnectsExpired: number;
  readonly pendingRewardsClaimed: number;
}

export interface CooperativeActivityCleanupGateway {
  cleanup(batchSize: number): Promise<CooperativeActivityCleanupResult>;
}

export class CooperativeActivityCleanupJob implements WorkerJob<CooperativeActivityCleanupResult> {
  public readonly name = 'cooperative-activity-lifecycle-cleanup';

  public constructor(
    private readonly gateway: CooperativeActivityCleanupGateway,
    private readonly batchSize = 250,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new RangeError('Cooperative activity cleanup batch size must be between 1 and 500.');
    }
  }

  public execute(): Promise<CooperativeActivityCleanupResult> {
    return this.gateway.cleanup(this.batchSize);
  }
}
