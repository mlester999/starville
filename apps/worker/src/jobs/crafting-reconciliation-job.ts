import type { WorkerJob } from './job.js';

export interface CraftingReconciliationResult {
  readonly status: 'completed';
  readonly processed: number;
  readonly readied: number;
  readonly resolved: number;
  readonly failed: number;
  readonly manualReview: number;
  readonly perJobTimersScheduled: false;
}

export interface CraftingReconciliationGateway {
  reconcile(batchSize: number): Promise<CraftingReconciliationResult>;
}

export class CraftingReconciliationJob implements WorkerJob<CraftingReconciliationResult> {
  public readonly name = 'phase11b-crafting-bounded-reconciliation';

  public constructor(
    private readonly gateway: CraftingReconciliationGateway,
    private readonly batchSize = 100,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new RangeError('Crafting reconciliation batch size must be between 1 and 100.');
    }
  }

  public execute(): Promise<CraftingReconciliationResult> {
    return this.gateway.reconcile(this.batchSize);
  }
}
