import type { WorkerJob } from './job.js';

export interface SocialGraphCleanupResult {
  readonly expiredFriendRequests: number;
  readonly expiredInvitations: number;
  readonly expiredReadyChecks: number;
  readonly leadersTransferred: number;
  readonly partiesExpired: number;
  readonly notificationsRemoved: number;
  readonly idempotencyRemoved: number;
  readonly auditRemoved: number;
}

export interface SocialGraphCleanupGateway {
  cleanup(batchSize: number): Promise<SocialGraphCleanupResult>;
}

export class SocialGraphCleanupJob implements WorkerJob<SocialGraphCleanupResult> {
  public readonly name = 'friends-parties-social-graph-cleanup';

  public constructor(
    private readonly gateway: SocialGraphCleanupGateway,
    private readonly batchSize = 1_000,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
      throw new RangeError('Social graph cleanup batch size must be between 1 and 10000.');
    }
  }

  public execute(): Promise<SocialGraphCleanupResult> {
    return this.gateway.cleanup(this.batchSize);
  }
}
