import type { EnvironmentName } from '@starville/shared-types';

export type { LogContext, StructuredLogger as ServiceLogger } from '@starville/logger';

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export interface WorkerRuntimeConfig {
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly healthPort: number;
  readonly concurrency: number;
  readonly retry: RetryPolicy;
}
