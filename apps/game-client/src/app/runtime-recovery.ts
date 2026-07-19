export type RuntimeDependency =
  'player_api' | 'realtime' | 'player_persistence' | 'world_manifest' | 'asset_registry';

export interface RuntimeRetryPolicy {
  readonly maximumAutomaticAttempts: number;
  readonly baseDelayMs: number;
  readonly maximumDelayMs: number;
}

export const RUNTIME_RETRY_POLICIES: Readonly<Record<RuntimeDependency, RuntimeRetryPolicy>> = {
  player_api: { maximumAutomaticAttempts: 3, baseDelayMs: 500, maximumDelayMs: 4_000 },
  realtime: { maximumAutomaticAttempts: 6, baseDelayMs: 500, maximumDelayMs: 10_000 },
  player_persistence: { maximumAutomaticAttempts: 0, baseDelayMs: 750, maximumDelayMs: 3_000 },
  world_manifest: { maximumAutomaticAttempts: 3, baseDelayMs: 500, maximumDelayMs: 4_000 },
  asset_registry: { maximumAutomaticAttempts: 2, baseDelayMs: 1_000, maximumDelayMs: 5_000 },
};

export interface RuntimeFailure {
  readonly dependency: RuntimeDependency;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly cachedVisualsAllowed: boolean;
  readonly mutationsAllowed: boolean;
}

interface ErrorLike {
  readonly code?: unknown;
  readonly requestId?: unknown;
  readonly status?: unknown;
}

function errorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
}

export function runtimeFailure(dependency: RuntimeDependency, error: unknown): RuntimeFailure {
  const candidate = errorLike(error);
  const code = typeof candidate.code === 'string' ? candidate.code : 'SERVICE_UNAVAILABLE';
  const requestId =
    typeof candidate.requestId === 'string' && candidate.requestId.length <= 128
      ? candidate.requestId
      : undefined;
  const status = typeof candidate.status === 'number' ? candidate.status : 503;
  const accessInvalid =
    status === 401 ||
    status === 403 ||
    [
      'ACCESS_REVOKED',
      'PLAYER_SUSPENDED',
      'PLAYER_RENAME_REQUIRED',
      'PLAYER_STATE_VERSION_CONFLICT',
      'SESSION_EXPIRED',
    ].includes(code);
  return {
    dependency,
    code,
    ...(requestId === undefined ? {} : { requestId }),
    retryable: !accessInvalid && (status >= 500 || status === 408 || status === 429),
    cachedVisualsAllowed: !accessInvalid,
    mutationsAllowed:
      !accessInvalid &&
      !['player_api', 'player_persistence', 'world_manifest'].includes(dependency),
  };
}

export function automaticRetryAvailable(
  dependency: RuntimeDependency,
  completedAttempts: number,
): boolean {
  return (
    Number.isInteger(completedAttempts) &&
    completedAttempts >= 0 &&
    completedAttempts < RUNTIME_RETRY_POLICIES[dependency].maximumAutomaticAttempts
  );
}

export function runtimeRetryDelay(
  dependency: RuntimeDependency,
  completedAttempts: number,
  random: () => number = Math.random,
): number {
  const policy = RUNTIME_RETRY_POLICIES[dependency];
  const exponent = Math.min(Math.max(0, completedAttempts), 8);
  const bounded = Math.min(policy.baseDelayMs * 2 ** exponent, policy.maximumDelayMs);
  const jitter = 0.8 + Math.min(1, Math.max(0, random())) * 0.4;
  return Math.round(bounded * jitter);
}
