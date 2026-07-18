import type { WorkerJob } from './job.js';

export interface HousingMaintenanceResult {
  readonly status: 'processed';
  readonly expiredSessions: number;
  readonly reconciliationResolved: number;
  readonly manualReview: number;
  readonly failed: number;
  readonly capacityRepaired: number;
  readonly automaticItemCorrections: 0;
  readonly automaticDustCorrections: 0;
  readonly requestId: string;
}
export interface HousingMaintenanceGateway {
  execute(limit: number): Promise<HousingMaintenanceResult>;
}
export class HousingMaintenanceJob implements WorkerJob<HousingMaintenanceResult> {
  public readonly name = 'housing-reconciliation-and-session-cleanup';
  public constructor(
    private readonly gateway: HousingMaintenanceGateway,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new RangeError('Housing maintenance limit must be between 1 and 500.');
  }
  public execute(): Promise<HousingMaintenanceResult> {
    return this.gateway.execute(this.limit);
  }
}
