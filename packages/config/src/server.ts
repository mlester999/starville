import { isIP } from 'node:net';

import { z } from 'zod';

import type { EnvironmentName } from '@starville/shared-types';
import {
  assertSecureUrlForEnvironment,
  environmentNameSchema,
  hostSchema,
  httpUrlSchema,
  logLevelSchema,
  originAllowlistSchema,
  portSchema,
  positiveIntegerSchema,
  type LogLevel,
} from '@starville/shared-validation';
import type { WalletNetwork } from '@starville/wallet-access';

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
  readonly trustedProxyCidrs: readonly string[];
  readonly logLevel: LogLevel;
}

export interface RealtimeConfig {
  readonly application: 'realtime-server';
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly connectionLimit: number;
  readonly ticketSecret: string;
  readonly authenticationTimeoutMs: number;
  readonly checkpointIntervalMs: number;
  readonly revalidationIntervalMs: number;
  readonly idleTimeoutMs: number;
  readonly chatNearbyDistance: number;
  readonly chatRateLimits: {
    readonly shortWindowMessages: number;
    readonly minuteMessages: number;
    readonly hourlyReports: number;
    readonly minuteSafetyActions: number;
    readonly malformedMessages: number;
  };
  readonly socialRateLimits: {
    readonly inspectPerMinute: number;
    readonly requestsPerMinute: number;
    readonly responsesPerMinute: number;
    readonly offersPerMinute: number;
    readonly confirmationsPerMinute: number;
    readonly cancellationsPerMinute: number;
  };
  readonly socialGraphRateLimits: {
    readonly friendRequestsPerMinute: number;
    readonly friendResponsesPerMinute: number;
    readonly friendRemovalsPerMinute: number;
    readonly partyCreationsPerHour: number;
    readonly partyInvitationsPerMinute: number;
    readonly partyResponsesPerMinute: number;
    readonly partyMembershipActionsPerMinute: number;
    readonly readyChecksPerMinute: number;
    readonly readyResponsesPerMinute: number;
  };
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

export interface AdminSecurityConfig {
  readonly sessionTtlMinutes: number;
  readonly requireMfaByDefault: boolean;
}

export interface AdminRecoveryConfig {
  readonly cookieSigningSecret: string;
}

export interface OperationsHealthConfig {
  readonly realtimeReadyUrl: string;
  readonly workerReadyUrl: string;
  readonly timeoutMs: number;
  readonly playerActionRateLimit: number;
  readonly operationsReadRateLimit: number;
}

export interface WorldManagementConfig {
  readonly manifestMaximumBytes: number;
  readonly transitionTimeoutMs: number;
  readonly playerManifestReadRateLimit: number;
  readonly playerTransitionRateLimit: number;
  readonly adminReadRateLimit: number;
  readonly adminDraftWriteRateLimit: number;
  readonly adminValidationRateLimit: number;
  readonly adminPublishRateLimit: number;
  readonly adminDeriveRateLimit: number;
}

export interface HostedSupabaseSafetyConfig {
  readonly environment: 'development' | 'production';
  readonly projectRef: string;
  readonly projectHostname: string;
  readonly remoteWritesApproved: boolean;
  readonly hostedTestsApproved: boolean;
  readonly bootstrapEnabled: boolean;
}

export interface HostedWriteSafetyConfig {
  readonly remoteWritesApproved: boolean;
}

export interface TokenAccessServerConfig {
  readonly network: WalletNetwork;
  readonly rpcUrl: string;
  readonly landingUrl: string;
  readonly gateEnabled: boolean;
  readonly mintAddress: string;
  readonly symbol: string;
  readonly requiredAmount: string;
  readonly challengeTtlSeconds: number;
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
  readonly cookieSecret: string;
  readonly commitment: 'confirmed' | 'finalized';
  readonly rpcTimeoutMs: number;
  readonly rpcMaximumAttempts: number;
  readonly rateLimits: {
    readonly challengesPerMinute: number;
    readonly verificationsPerFiveMinutes: number;
    readonly rechecksPerMinute: number;
    readonly adminValidationsPerMinute: number;
  };
}

function loadEnvironment(env: EnvironmentVariables): EnvironmentName {
  const environment = environmentNameSchema.parse(env['NODE_ENV'] ?? 'development');
  assertProductionRuntimeSafetyGatesClosed(env, environment);
  return environment;
}

function defaultLogLevel(environment: EnvironmentName): LogLevel {
  return environment === 'production' ? 'info' : 'debug';
}

const strictBooleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

function safeBoolean(value: string | undefined, variableName: string): boolean {
  try {
    return strictBooleanSchema.parse(value ?? 'false');
  } catch {
    throw new Error(`${variableName} must be either true or false`);
  }
}

export function assertProductionRuntimeSafetyGatesClosed(
  env: EnvironmentVariables,
  parsedEnvironment?: EnvironmentName,
): void {
  const environment =
    parsedEnvironment ?? environmentNameSchema.parse(env['NODE_ENV'] ?? 'development');
  if (environment !== 'production') return;

  for (const name of [
    'SUPABASE_REMOTE_WRITES_APPROVED',
    'RUN_HOSTED_SUPABASE_TESTS',
    'ADMIN_BOOTSTRAP_ENABLED',
  ] as const) {
    if (safeBoolean(env[name], name)) {
      throw new Error(`${name} must be false when a production service starts`);
    }
  }
}

const supabaseProjectRefSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{20}$/, 'Supabase project reference must be 20 lowercase characters');

function loadOrigins(
  value: string | undefined,
  environment: EnvironmentName,
  variableName: string,
): readonly string[] {
  if (value === undefined && environment === 'production') {
    throw new Error(`${variableName} is required in production`);
  }

  const origins = originAllowlistSchema.parse(value ?? DEVELOPMENT_ORIGINS);

  for (const origin of origins) {
    assertSecureUrlForEnvironment(origin, environment, variableName);
  }

  return origins;
}

function loadTrustedProxyCidrs(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') {
    return [];
  }

  const entries = [
    ...new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];

  if (entries.length > 16) {
    throw new Error('API_TRUSTED_PROXY_CIDRS must contain no more than 16 entries');
  }

  for (const entry of entries) {
    const [address, prefix, ...remainder] = entry.split('/');
    const family = address === undefined ? 0 : isIP(address);

    if (family === 0 || remainder.length > 0) {
      throw new Error('API_TRUSTED_PROXY_CIDRS must contain only explicit IP addresses or CIDRs');
    }

    if (prefix !== undefined) {
      const prefixLength = Number(prefix);
      const maximum = family === 4 ? 32 : 128;

      if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > maximum) {
        throw new Error('API_TRUSTED_PROXY_CIDRS must not contain unrestricted or invalid CIDRs');
      }
    }
  }

  return entries;
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
    trustedProxyCidrs: loadTrustedProxyCidrs(env['API_TRUSTED_PROXY_CIDRS']),
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
    ticketSecret: z
      .string()
      .min(32, 'REALTIME_TICKET_SECRET must contain at least 32 characters')
      .parse(
        env['REALTIME_TICKET_SECRET'] ??
          env['TOKEN_ACCESS_COOKIE_SECRET'] ??
          (environment === 'development' ? 'development-only-realtime-ticket-secret' : undefined),
      ),
    authenticationTimeoutMs: positiveIntegerSchema
      .min(1_000)
      .max(30_000)
      .parse(env['REALTIME_AUTH_TIMEOUT_MS'] ?? 5_000),
    checkpointIntervalMs: positiveIntegerSchema
      .min(5_000)
      .max(120_000)
      .parse(env['REALTIME_CHECKPOINT_INTERVAL_MS'] ?? 15_000),
    revalidationIntervalMs: positiveIntegerSchema
      .min(5_000)
      .max(120_000)
      .parse(env['REALTIME_REVALIDATION_INTERVAL_MS'] ?? 15_000),
    idleTimeoutMs: positiveIntegerSchema
      .min(15_000)
      .max(300_000)
      .parse(env['REALTIME_IDLE_TIMEOUT_MS'] ?? 45_000),
    chatNearbyDistance: z.coerce
      .number()
      .finite()
      .min(2)
      .max(20)
      .parse(env['REALTIME_CHAT_NEARBY_DISTANCE'] ?? 8),
    chatRateLimits: {
      shortWindowMessages: positiveIntegerSchema
        .max(10)
        .parse(env['REALTIME_CHAT_SHORT_WINDOW_LIMIT'] ?? 4),
      minuteMessages: positiveIntegerSchema.max(120).parse(env['REALTIME_CHAT_MINUTE_LIMIT'] ?? 20),
      hourlyReports: positiveIntegerSchema
        .max(30)
        .parse(env['REALTIME_CHAT_REPORT_HOURLY_LIMIT'] ?? 5),
      minuteSafetyActions: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_CHAT_SAFETY_ACTION_LIMIT'] ?? 20),
      malformedMessages: positiveIntegerSchema
        .max(50)
        .parse(env['REALTIME_CHAT_MALFORMED_LIMIT'] ?? 10),
    },
    socialRateLimits: {
      inspectPerMinute: positiveIntegerSchema
        .max(240)
        .parse(env['REALTIME_SOCIAL_INSPECT_LIMIT'] ?? 60),
      requestsPerMinute: positiveIntegerSchema
        .max(60)
        .parse(env['REALTIME_SOCIAL_REQUEST_LIMIT'] ?? 6),
      responsesPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_SOCIAL_RESPONSE_LIMIT'] ?? 12),
      offersPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_SOCIAL_OFFER_LIMIT'] ?? 30),
      confirmationsPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_SOCIAL_CONFIRM_LIMIT'] ?? 20),
      cancellationsPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_SOCIAL_CANCEL_LIMIT'] ?? 20),
    },
    socialGraphRateLimits: {
      friendRequestsPerMinute: positiveIntegerSchema
        .max(30)
        .parse(env['REALTIME_FRIEND_REQUEST_LIMIT'] ?? 4),
      friendResponsesPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_FRIEND_RESPONSE_LIMIT'] ?? 12),
      friendRemovalsPerMinute: positiveIntegerSchema
        .max(60)
        .parse(env['REALTIME_FRIEND_REMOVE_LIMIT'] ?? 10),
      partyCreationsPerHour: positiveIntegerSchema
        .max(20)
        .parse(env['REALTIME_PARTY_CREATE_HOURLY_LIMIT'] ?? 3),
      partyInvitationsPerMinute: positiveIntegerSchema
        .max(60)
        .parse(env['REALTIME_PARTY_INVITE_LIMIT'] ?? 8),
      partyResponsesPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_PARTY_RESPONSE_LIMIT'] ?? 15),
      partyMembershipActionsPerMinute: positiveIntegerSchema
        .max(60)
        .parse(env['REALTIME_PARTY_MEMBERSHIP_LIMIT'] ?? 12),
      readyChecksPerMinute: positiveIntegerSchema
        .max(20)
        .parse(env['REALTIME_PARTY_READY_CHECK_LIMIT'] ?? 4),
      readyResponsesPerMinute: positiveIntegerSchema
        .max(120)
        .parse(env['REALTIME_PARTY_READY_RESPONSE_LIMIT'] ?? 20),
    },
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

export function loadAdminSecurityConfig(env: EnvironmentVariables): AdminSecurityConfig {
  const sessionTtlMinutes = positiveIntegerSchema
    .max(60, 'Administrator session TTL must not exceed 60 minutes')
    .parse(env['ADMIN_SESSION_TTL_MINUTES'] ?? 60);

  return {
    sessionTtlMinutes,
    requireMfaByDefault: safeBoolean(
      env['ADMIN_REQUIRE_MFA_BY_DEFAULT'],
      'ADMIN_REQUIRE_MFA_BY_DEFAULT',
    ),
  };
}

export function loadAdminRecoveryConfig(env: EnvironmentVariables): AdminRecoveryConfig {
  return {
    cookieSigningSecret: z
      .string()
      .min(32, 'ADMIN_RECOVERY_COOKIE_SECRET must contain at least 32 characters')
      .parse(env['ADMIN_RECOVERY_COOKIE_SECRET']),
  };
}

export function loadOperationsHealthConfig(env: EnvironmentVariables): OperationsHealthConfig {
  const environment = loadEnvironment(env);
  const realtimeReadyUrl = httpUrlSchema.parse(
    env['REALTIME_HEALTH_URL'] ?? 'http://127.0.0.1:4001/ready',
  );
  const workerReadyUrl = httpUrlSchema.parse(
    env['WORKER_HEALTH_URL'] ?? 'http://127.0.0.1:4002/ready',
  );
  assertSecureUrlForEnvironment(realtimeReadyUrl, environment, 'REALTIME_HEALTH_URL');
  assertSecureUrlForEnvironment(workerReadyUrl, environment, 'WORKER_HEALTH_URL');

  return {
    realtimeReadyUrl,
    workerReadyUrl,
    timeoutMs: boundedInteger(250, 5_000, 'ADMIN_HEALTH_CHECK_TIMEOUT_MS').parse(
      env['ADMIN_HEALTH_CHECK_TIMEOUT_MS'] ?? 1_500,
    ),
    playerActionRateLimit: boundedInteger(1, 60, 'ADMIN_PLAYER_ACTION_RATE_LIMIT').parse(
      env['ADMIN_PLAYER_ACTION_RATE_LIMIT'] ?? 20,
    ),
    operationsReadRateLimit: boundedInteger(10, 600, 'ADMIN_OPERATIONS_READ_RATE_LIMIT').parse(
      env['ADMIN_OPERATIONS_READ_RATE_LIMIT'] ?? 120,
    ),
  };
}

export function loadWorldManagementConfig(env: EnvironmentVariables): WorldManagementConfig {
  return {
    manifestMaximumBytes: boundedInteger(16_384, 262_144, 'WORLD_MANIFEST_MAX_BYTES').parse(
      env['WORLD_MANIFEST_MAX_BYTES'] ?? 262_144,
    ),
    transitionTimeoutMs: boundedInteger(3_000, 30_000, 'WORLD_TRANSITION_TIMEOUT_MS').parse(
      env['WORLD_TRANSITION_TIMEOUT_MS'] ?? 15_000,
    ),
    playerManifestReadRateLimit: boundedInteger(10, 600, 'WORLD_PLAYER_READ_RATE_LIMIT').parse(
      env['WORLD_PLAYER_READ_RATE_LIMIT'] ?? 120,
    ),
    playerTransitionRateLimit: boundedInteger(2, 60, 'WORLD_PLAYER_TRANSITION_RATE_LIMIT').parse(
      env['WORLD_PLAYER_TRANSITION_RATE_LIMIT'] ?? 12,
    ),
    adminReadRateLimit: boundedInteger(10, 600, 'WORLD_ADMIN_READ_RATE_LIMIT').parse(
      env['WORLD_ADMIN_READ_RATE_LIMIT'] ?? 120,
    ),
    adminDraftWriteRateLimit: boundedInteger(2, 120, 'WORLD_ADMIN_DRAFT_WRITE_RATE_LIMIT').parse(
      env['WORLD_ADMIN_DRAFT_WRITE_RATE_LIMIT'] ?? 30,
    ),
    adminValidationRateLimit: boundedInteger(1, 60, 'WORLD_ADMIN_VALIDATION_RATE_LIMIT').parse(
      env['WORLD_ADMIN_VALIDATION_RATE_LIMIT'] ?? 12,
    ),
    adminPublishRateLimit: boundedInteger(1, 12, 'WORLD_ADMIN_PUBLISH_RATE_LIMIT').parse(
      env['WORLD_ADMIN_PUBLISH_RATE_LIMIT'] ?? 4,
    ),
    adminDeriveRateLimit: boundedInteger(1, 30, 'WORLD_ADMIN_DERIVE_RATE_LIMIT').parse(
      env['WORLD_ADMIN_DERIVE_RATE_LIMIT'] ?? 8,
    ),
  };
}

const privateRpcUrlSchema = z
  .string({ error: 'SOLANA_RPC_URL is required by the API' })
  .trim()
  .min(1)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);

      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        context.addIssue({
          code: 'custom',
          message: 'SOLANA_RPC_URL must be HTTP(S) and must not use URL credentials',
        });
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'SOLANA_RPC_URL must be a valid URL' });
    }
  });

const base58AddressSchema = z
  .string({ error: 'GAME_TOKEN_MINT_ADDRESS is required by the API' })
  .trim()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/u, 'GAME_TOKEN_MINT_ADDRESS must be base58 encoded');
const decimalTokenAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/u, 'GAME_TOKEN_GATE_AMOUNT must be a positive decimal string')
  .refine((value) => /[1-9]/u.test(value), 'GAME_TOKEN_GATE_AMOUNT must be greater than zero');
const boundedInteger = (minimum: number, maximum: number, label: string) =>
  positiveIntegerSchema.min(minimum, `${label} must be at least ${minimum}`).max(maximum);

export function loadTokenAccessServerConfig(env: EnvironmentVariables): TokenAccessServerConfig {
  const environment = loadEnvironment(env);
  const networkName = z.enum(['devnet', 'mainnet-beta']).parse(env['SOLANA_NETWORK']);
  const challengeTtlSeconds = boundedInteger(60, 600, 'WALLET_CHALLENGE_TTL_SECONDS').parse(
    env['WALLET_CHALLENGE_TTL_SECONDS'] ?? 300,
  );
  const sessionTtlSeconds = boundedInteger(60, 3_600, 'TOKEN_ACCESS_SESSION_TTL_SECONDS').parse(
    env['TOKEN_ACCESS_SESSION_TTL_SECONDS'] ?? 900,
  );
  const recheckIntervalSeconds = boundedInteger(30, 1_800, 'TOKEN_ACCESS_RECHECK_SECONDS').parse(
    env['TOKEN_ACCESS_RECHECK_SECONDS'] ?? 300,
  );
  const cookieSecret = z
    .string({ error: 'TOKEN_ACCESS_COOKIE_SECRET is required by the API' })
    .min(32, 'TOKEN_ACCESS_COOKIE_SECRET must contain at least 32 characters')
    .parse(env['TOKEN_ACCESS_COOKIE_SECRET']);
  const forbiddenSecretReuse = [
    env['SUPABASE_SERVICE_ROLE_KEY'],
    env['ADMIN_RECOVERY_COOKIE_SECRET'],
    env['NEXT_PUBLIC_REOWN_PROJECT_ID'],
    env['REOWN_PROJECT_ID'],
  ].filter((value): value is string => value !== undefined && value.length > 0);

  if (forbiddenSecretReuse.includes(cookieSecret)) {
    throw new Error('TOKEN_ACCESS_COOKIE_SECRET must be an independent secret');
  }

  if (recheckIntervalSeconds > sessionTtlSeconds) {
    throw new Error('TOKEN_ACCESS_RECHECK_SECONDS must not exceed the access-session TTL');
  }

  const rpcUrl = privateRpcUrlSchema.parse(env['SOLANA_RPC_URL']);
  const landingUrl = httpUrlSchema.parse(env['NEXT_PUBLIC_LANDING_URL']);
  assertSecureUrlForEnvironment(rpcUrl, environment, 'SOLANA_RPC_URL');
  assertSecureUrlForEnvironment(landingUrl, environment, 'NEXT_PUBLIC_LANDING_URL');

  return {
    network: `solana:${networkName}`,
    rpcUrl,
    landingUrl,
    gateEnabled: safeBoolean(env['TOKEN_GATE_ENABLED'] ?? 'true', 'TOKEN_GATE_ENABLED'),
    mintAddress: base58AddressSchema.parse(env['GAME_TOKEN_MINT_ADDRESS']),
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .regex(/^[A-Z0-9]+$/u)
      .parse(env['GAME_TOKEN_SYMBOL'] ?? 'STAR'),
    requiredAmount: decimalTokenAmountSchema.parse(env['GAME_TOKEN_GATE_AMOUNT'] ?? '1000'),
    challengeTtlSeconds,
    sessionTtlSeconds,
    recheckIntervalSeconds,
    cookieSecret,
    commitment: z.enum(['confirmed', 'finalized']).parse(env['SOLANA_COMMITMENT'] ?? 'confirmed'),
    rpcTimeoutMs: boundedInteger(500, 15_000, 'SOLANA_RPC_TIMEOUT_MS').parse(
      env['SOLANA_RPC_TIMEOUT_MS'] ?? 5_000,
    ),
    rpcMaximumAttempts: boundedInteger(1, 3, 'SOLANA_RPC_MAX_ATTEMPTS').parse(
      env['SOLANA_RPC_MAX_ATTEMPTS'] ?? 2,
    ),
    rateLimits: {
      challengesPerMinute: boundedInteger(1, 60, 'TOKEN_ACCESS_CHALLENGE_RATE_LIMIT').parse(
        env['TOKEN_ACCESS_CHALLENGE_RATE_LIMIT'] ?? 5,
      ),
      verificationsPerFiveMinutes: boundedInteger(1, 10, 'TOKEN_ACCESS_VERIFY_RATE_LIMIT').parse(
        env['TOKEN_ACCESS_VERIFY_RATE_LIMIT'] ?? 10,
      ),
      rechecksPerMinute: boundedInteger(1, 60, 'TOKEN_ACCESS_RECHECK_RATE_LIMIT').parse(
        env['TOKEN_ACCESS_RECHECK_RATE_LIMIT'] ?? 4,
      ),
      adminValidationsPerMinute: boundedInteger(
        1,
        60,
        'TOKEN_GATE_ADMIN_VALIDATE_RATE_LIMIT',
      ).parse(env['TOKEN_GATE_ADMIN_VALIDATE_RATE_LIMIT'] ?? 5),
    },
  };
}

export function loadHostedSupabaseSafetyConfig(
  env: EnvironmentVariables,
): HostedSupabaseSafetyConfig {
  const environment = z.enum(['development', 'production']).parse(env['SUPABASE_ENVIRONMENT']);
  const projectRef = supabaseProjectRefSchema.parse(env['SUPABASE_PROJECT_REF']);
  const url = httpUrlSchema.parse(env['NEXT_PUBLIC_SUPABASE_URL']);
  assertSecureUrlForEnvironment(url, environment, 'NEXT_PUBLIC_SUPABASE_URL');
  const parsedUrl = new URL(url);
  const expectedHostname = `${projectRef}.supabase.co`;

  if (parsedUrl.hostname !== expectedHostname) {
    throw new Error('Supabase URL hostname does not match SUPABASE_PROJECT_REF');
  }

  if (environment === 'production') {
    const deploymentTarget = z.literal('starville-prod').parse(env['STARVILLE_DEPLOYMENT_TARGET']);
    const productionProjectRef = supabaseProjectRefSchema.parse(
      env['STARVILLE_PRODUCTION_SUPABASE_PROJECT_REF'],
    );
    const developmentProjectRef = supabaseProjectRefSchema.parse(
      env['STARVILLE_DEVELOPMENT_SUPABASE_PROJECT_REF'],
    );

    if (deploymentTarget !== 'starville-prod' || projectRef !== productionProjectRef) {
      throw new Error('Supabase project reference is not the approved production target');
    }
    if (projectRef === developmentProjectRef) {
      throw new Error('Production and development Supabase project references must differ');
    }
    if (env['NODE_ENV'] !== 'production' || env['NEXT_PUBLIC_APP_ENV'] !== 'production') {
      throw new Error('Production Supabase tooling requires the production runtime identity');
    }
  } else if (env['STARVILLE_DEPLOYMENT_TARGET'] === 'starville-prod') {
    throw new Error('Production deployment target cannot use the development Supabase environment');
  }

  return {
    environment,
    projectRef,
    projectHostname: parsedUrl.hostname,
    remoteWritesApproved: safeBoolean(
      env['SUPABASE_REMOTE_WRITES_APPROVED'],
      'SUPABASE_REMOTE_WRITES_APPROVED',
    ),
    hostedTestsApproved: safeBoolean(env['RUN_HOSTED_SUPABASE_TESTS'], 'RUN_HOSTED_SUPABASE_TESTS'),
    bootstrapEnabled: safeBoolean(env['ADMIN_BOOTSTRAP_ENABLED'], 'ADMIN_BOOTSTRAP_ENABLED'),
  };
}

export function loadHostedWriteSafetyConfig(env: EnvironmentVariables): HostedWriteSafetyConfig {
  return {
    remoteWritesApproved: safeBoolean(
      env['SUPABASE_REMOTE_WRITES_APPROVED'],
      'SUPABASE_REMOTE_WRITES_APPROVED',
    ),
  };
}

export function assertRemoteMigrationWriteApproved(config: HostedSupabaseSafetyConfig): void {
  if (!config.remoteWritesApproved) {
    throw new Error(
      'Remote migration push is blocked: SUPABASE_REMOTE_WRITES_APPROVED is not true',
    );
  }
}

export function assertHostedTestsApproved(config: HostedSupabaseSafetyConfig): void {
  if (!config.hostedTestsApproved) {
    throw new Error('Hosted tests are blocked: RUN_HOSTED_SUPABASE_TESTS is not true');
  }
}

export function assertAdminBootstrapWriteApproved(config: HostedSupabaseSafetyConfig): void {
  assertRemoteMigrationWriteApproved(config);

  if (!config.bootstrapEnabled) {
    throw new Error('Bootstrap is blocked: ADMIN_BOOTSTRAP_ENABLED is not true');
  }
}

export function assertDatabaseUrlMatchesProjectRef(databaseUrl: string, projectRef: string): void {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Supabase database URL is not a valid PostgreSQL URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Supabase database URL is not a valid PostgreSQL URL');
  }
  const directHostname = `db.${projectRef}.supabase.co`;
  const isDirectProjectHost = url.hostname === directHostname;
  const isSupabasePooler =
    url.hostname === 'pooler.supabase.com' || url.hostname.endsWith('.pooler.supabase.com');
  const decodedUsername = decodeURIComponent(url.username);
  const isProjectQualifiedPoolerUser = decodedUsername === `postgres.${projectRef}`;

  if (!isDirectProjectHost && !(isSupabasePooler && isProjectQualifiedPoolerUser)) {
    throw new Error('Supabase database URL does not match the verified project reference');
  }
}

const privateSupabaseConfigSchema = z
  .object({
    url: z.string({ error: 'NEXT_PUBLIC_SUPABASE_URL is required by the API' }).pipe(httpUrlSchema),
    serviceRoleKey: z
      .string({ error: 'SUPABASE_SERVICE_ROLE_KEY is required by the API' })
      .trim()
      .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required by the API'),
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
  assertSecureUrlForEnvironment(parsed.url, loadEnvironment(env), 'NEXT_PUBLIC_SUPABASE_URL');

  return parsed.databaseUrl === undefined
    ? { url: parsed.url, serviceRoleKey: parsed.serviceRoleKey }
    : {
        url: parsed.url,
        serviceRoleKey: parsed.serviceRoleKey,
        databaseUrl: parsed.databaseUrl,
      };
}
