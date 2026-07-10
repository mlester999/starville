export const APPLICATION_NAMES = [
  'landing',
  'game-client',
  'admin-portal',
  'api',
  'realtime-server',
  'worker',
] as const;

export type ApplicationName = (typeof APPLICATION_NAMES)[number];

export const ENVIRONMENT_NAMES = ['development', 'test', 'production'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface ServiceHealth {
  readonly service: ApplicationName;
  readonly environment: EnvironmentName;
  readonly status: 'ok' | 'degraded' | 'unavailable';
  readonly version: string;
  readonly timestamp: string;
  readonly uptimeSeconds?: number;
}

export interface ApiSuccessResponse<Data> {
  readonly success: true;
  readonly data: Data;
  readonly requestId: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly requestId: string;
}

export interface RequestContext {
  readonly requestId: string;
  readonly application: ApplicationName;
  readonly startedAt: string;
}
