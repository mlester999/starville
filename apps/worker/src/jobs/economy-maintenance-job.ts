import type { WorkerJob } from './job.js';

export interface EconomyMaintenanceResult {
  readonly reconciliation: {
    readonly checkedCount: number;
    readonly mismatchCount: number;
    readonly autoCorrected: false;
  };
  readonly risk: { readonly signalsCreated: number; readonly automaticPlayerActions: 0 };
  readonly metrics: { readonly metricDate: string };
  readonly activation: {
    readonly policiesActivated: number;
    readonly shopsActivated: number;
    readonly publishedOnly: true;
  };
  readonly shop: {
    readonly restocked: number;
    readonly reconciled: number;
    readonly manualReview: number;
    readonly automaticBalanceCorrections: 0;
  };
}

export interface EconomyMaintenanceGateway {
  execute(
    reconciliationBatchSize: number,
    riskBatchSize: number,
  ): Promise<EconomyMaintenanceResult>;
}

export class EconomyMaintenanceJob implements WorkerJob<EconomyMaintenanceResult> {
  public readonly name = 'economy-reconciliation-risk-metrics-and-approved-activation';

  public constructor(
    private readonly gateway: EconomyMaintenanceGateway,
    private readonly reconciliationBatchSize = 10_000,
    private readonly riskBatchSize = 500,
  ) {
    if (
      !Number.isInteger(reconciliationBatchSize) ||
      reconciliationBatchSize < 1 ||
      reconciliationBatchSize > 10_000
    )
      throw new RangeError('Economy reconciliation batch size must be between 1 and 10,000.');
    if (!Number.isInteger(riskBatchSize) || riskBatchSize < 1 || riskBatchSize > 1_000)
      throw new RangeError('Economy risk batch size must be between 1 and 1,000.');
  }

  public execute(): Promise<EconomyMaintenanceResult> {
    return this.gateway.execute(this.reconciliationBatchSize, this.riskBatchSize);
  }
}
