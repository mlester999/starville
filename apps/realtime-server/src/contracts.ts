import type { EnvironmentName } from '@starville/shared-types';

export type { LogContext, StructuredLogger as ServiceLogger } from '@starville/logger';

export interface RealtimeRuntimeConfig {
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly connectionLimit: number;
}
