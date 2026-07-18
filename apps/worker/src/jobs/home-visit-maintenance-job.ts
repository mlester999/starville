import type { WorkerJob } from './job.js';

export interface HomeVisitMaintenanceResult {
  readonly status: 'completed';
  readonly expiredInvitations: number;
  readonly closedSessions: number;
  readonly releasedParticipants: number;
  readonly reconciledCounts: number;
}
export interface HomeVisitMaintenanceGateway {
  execute(limit: number): Promise<HomeVisitMaintenanceResult>;
}
export class HomeVisitMaintenanceJob implements WorkerJob<HomeVisitMaintenanceResult> {
  public readonly name = 'home-visit-expiry-reconnect-and-reconciliation';
  public constructor(
    private readonly gateway: HomeVisitMaintenanceGateway,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Home visit maintenance limit must be between 1 and 500.');
    }
  }
  public execute() {
    return this.gateway.execute(this.limit);
  }
}
