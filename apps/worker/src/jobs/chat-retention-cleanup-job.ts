import type { WorkerJob } from './job.js';

export interface ChatRetentionCleanupResult {
  readonly removedMessages: number;
  readonly expiredMutes: number;
}

export interface ChatRetentionCleanupGateway {
  cleanup(limit: number): Promise<ChatRetentionCleanupResult>;
}

export class ChatRetentionCleanupJob implements WorkerJob<ChatRetentionCleanupResult> {
  public readonly name = 'multiplayer-chat-retention-cleanup';

  public constructor(
    private readonly gateway: ChatRetentionCleanupGateway,
    private readonly batchLimit = 1_000,
  ) {
    if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 10_000) {
      throw new RangeError('Chat cleanup batch limit must be between 1 and 10000.');
    }
  }

  public execute(): Promise<ChatRetentionCleanupResult> {
    return this.gateway.cleanup(this.batchLimit);
  }
}
