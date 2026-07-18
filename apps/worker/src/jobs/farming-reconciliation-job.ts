import type { WorkerJob } from './job.js';

export interface FarmingReconciliationResult {
  readonly status: 'completed';
  readonly processed: number;
  readonly resolved: number;
  readonly failed: number;
  readonly perCropTimersScheduled: false;
}

export interface FarmingReconciliationGateway {
  reconcile(batchSize: number): Promise<FarmingReconciliationResult>;
}

export class FarmingReconciliationJob implements WorkerJob<FarmingReconciliationResult> {
  public readonly name = 'phase11-farming-bounded-reconciliation';

  public constructor(
    private readonly gateway: FarmingReconciliationGateway,
    private readonly batchSize = 100,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new RangeError('Farming reconciliation batch size must be between 1 and 100.');
    }
  }

  public execute(): Promise<FarmingReconciliationResult> {
    return this.gateway.reconcile(this.batchSize);
  }
}
