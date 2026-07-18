import type { WorkerJob } from './job.js';

export interface SocialInteractionCleanupResult {
  readonly processed: number;
  readonly reservationsReleased: number;
}

export interface SocialInteractionCleanupGateway {
  cleanup(batchSize: number): Promise<SocialInteractionCleanupResult>;
}

export class SocialInteractionCleanupJob implements WorkerJob<SocialInteractionCleanupResult> {
  public readonly name = 'social-interaction-expiry-cleanup';

  public constructor(
    private readonly gateway: SocialInteractionCleanupGateway,
    private readonly batchSize = 1_000,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
      throw new RangeError('Social interaction cleanup batch size must be between 1 and 10000.');
    }
  }

  public execute(): Promise<SocialInteractionCleanupResult> {
    return this.gateway.cleanup(this.batchSize);
  }
}
