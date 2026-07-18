import type { WorkerJob } from './job.js';

export interface PlayerExperienceReconciliationResult {
  readonly status: 'completed';
  readonly processed: number;
  readonly resolved: number;
  readonly investigationRequired: number;
  readonly reconciledStates: number;
  readonly driftRepaired: number;
  readonly lockedObjectives: number;
  readonly missingGuidanceTargets: number;
  readonly requestId: string;
}

export interface PlayerExperienceReconciliationGateway {
  execute(limit: number): Promise<PlayerExperienceReconciliationResult>;
}

export class PlayerExperienceReconciliationJob implements WorkerJob<PlayerExperienceReconciliationResult> {
  public readonly name = 'player-experience-evidence-reconciliation';

  public constructor(
    private readonly gateway: PlayerExperienceReconciliationGateway,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Player experience reconciliation limit must be between 1 and 100.');
    }
  }

  public execute(): Promise<PlayerExperienceReconciliationResult> {
    return this.gateway.execute(this.limit);
  }
}
