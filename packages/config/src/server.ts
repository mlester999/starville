import { z } from 'zod';

import type { EnvironmentName } from '@starville/shared-types';
import {
  environmentNameSchema,
  hostSchema,
  httpUrlSchema,
  logLevelSchema,
  originAllowlistSchema,
  portSchema,
  positiveIntegerSchema,
  type LogLevel,
} from '@starville/shared-validation';

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
] as const;

export interface ApiConfig {
  readonly application: 'api';
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly corsAllowedOrigins: readonly string[];
  readonly logLevel: LogLevel;
}

export interface RealtimeConfig {
  readonly application: 'realtime-server';
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly connectionLimit: number;
  readonly logLevel: LogLevel;
}

export interface WorkerConfig {
  readonly application: 'worker';
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly healthPort: number;
  readonly concurrency: number;
  readonly retry: {
    readonly maxAttempts: number;
    readonly baseDelayMs: number;
  };
  readonly logLevel: LogLevel;
}

export interface PrivateSupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly databaseUrl?: string;
}

function loadEnvironment(env: EnvironmentVariables): EnvironmentName {
  return environmentNameSchema.parse(env['NODE_ENV'] ?? 'development');
}

function defaultLogLevel(environment: EnvironmentName): LogLevel {
  return environment === 'production' ? 'info' : 'debug';
}

function loadOrigins(
  value: string | undefined,
  environment: EnvironmentName,
  variableName: string,
): readonly string[] {
  if (value === undefined && environment === 'production') {
    throw new Error(`${variableName} is required in production`);
  }

  return originAllowlistSchema.parse(value ?? DEVELOPMENT_ORIGINS);
}

export function loadApiConfig(env: EnvironmentVariables): ApiConfig {
  const environment = loadEnvironment(env);

  return {
    application: 'api',
    environment,
    host: hostSchema.parse(env['API_HOST'] ?? '127.0.0.1'),
    port: portSchema.parse(env['API_PORT'] ?? 4000),
    corsAllowedOrigins: loadOrigins(
      env['CORS_ALLOWED_ORIGINS'],
      environment,
      'CORS_ALLOWED_ORIGINS',
    ),
    logLevel: logLevelSchema.parse(env['LOG_LEVEL'] ?? defaultLogLevel(environment)),
  };
}

export function loadRealtimeConfig(env: EnvironmentVariables): RealtimeConfig {
  const environment = loadEnvironment(env);

  return {
    application: 'realtime-server',
    environment,
    host: hostSchema.parse(env['REALTIME_HOST'] ?? '127.0.0.1'),
    port: portSchema.parse(env['REALTIME_PORT'] ?? 4001),
    allowedOrigins: loadOrigins(
      env['REALTIME_ALLOWED_ORIGINS'] ?? env['CORS_ALLOWED_ORIGINS'],
      environment,
      'REALTIME_ALLOWED_ORIGINS or CORS_ALLOWED_ORIGINS',
    ),
    connectionLimit: positiveIntegerSchema.parse(env['REALTIME_MAX_CONNECTIONS'] ?? 100),
    logLevel: logLevelSchema.parse(env['LOG_LEVEL'] ?? defaultLogLevel(environment)),
  };
}

export function loadWorkerConfig(env: EnvironmentVariables): WorkerConfig {
  const environment = loadEnvironment(env);

  return {
    application: 'worker',
    environment,
    host: hostSchema.parse(env['WORKER_HOST'] ?? '127.0.0.1'),
    healthPort: portSchema.parse(env['WORKER_HEALTH_PORT'] ?? 4002),
    concurrency: positiveIntegerSchema.parse(env['WORKER_CONCURRENCY'] ?? 1),
    retry: {
      maxAttempts: positiveIntegerSchema.parse(env['WORKER_MAX_ATTEMPTS'] ?? 3),
      baseDelayMs: positiveIntegerSchema.parse(env['WORKER_RETRY_BASE_DELAY_MS'] ?? 1000),
    },
    logLevel: logLevelSchema.parse(env['LOG_LEVEL'] ?? defaultLogLevel(environment)),
  };
}

const privateSupabaseConfigSchema = z
  .object({
    url: httpUrlSchema,
    serviceRoleKey: z.string().trim().min(1, 'Supabase service-role key is required'),
    databaseUrl: z
      .string()
      .trim()
      .refine(
        (value) => {
          try {
            const protocol = new URL(value).protocol;
            return protocol === 'postgres:' || protocol === 'postgresql:';
          } catch {
            return false;
          }
        },
        { message: 'Supabase database URL must be a valid PostgreSQL URL' },
      )
      .optional(),
  })
  .strict();

export function loadPrivateSupabaseConfig(env: EnvironmentVariables): PrivateSupabaseConfig {
  const parsed = privateSupabaseConfigSchema.parse({
    url: env['NEXT_PUBLIC_SUPABASE_URL'],
    serviceRoleKey: env['SUPABASE_SERVICE_ROLE_KEY'],
    databaseUrl: env['SUPABASE_DATABASE_URL'],
  });

  return parsed.databaseUrl === undefined
    ? { url: parsed.url, serviceRoleKey: parsed.serviceRoleKey }
    : {
        url: parsed.url,
        serviceRoleKey: parsed.serviceRoleKey,
        databaseUrl: parsed.databaseUrl,
      };
}
