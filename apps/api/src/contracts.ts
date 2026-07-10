import type { EnvironmentName } from '@starville/shared-types';

export type { LogContext, StructuredLogger as ServiceLogger } from '@starville/logger';

export interface ApiRuntimeConfig {
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly corsAllowedOrigins: readonly string[];
}
