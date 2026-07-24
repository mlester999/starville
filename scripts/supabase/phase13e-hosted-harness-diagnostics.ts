export type HostedHarnessErrorCategory =
  | 'auth'
  | 'cleanup'
  | 'database'
  | 'non-error'
  | 'provider'
  | 'realtime'
  | 'timeout'
  | 'validation';

export interface HostedHarnessSafeDetails {
  readonly channelStatus?: string;
  readonly expectedStatus?: string;
  readonly httpStatus?: number;
  readonly receivedStatus?: string;
  readonly retryable?: boolean;
  readonly timeoutMilliseconds?: number;
}

export interface SanitizedHostedHarnessError {
  readonly stage: string;
  readonly category: HostedHarnessErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly causeCategory?: HostedHarnessErrorCategory;
  readonly channelStatus?: string;
  readonly expectedStatus?: string;
  readonly httpStatus?: number;
  readonly receivedStatus?: string;
  readonly timeoutMilliseconds?: number;
}

export interface HostedHarnessCleanupFailure {
  readonly stage: string;
  readonly error: unknown;
}

export interface SanitizedHostedHarnessFailure {
  readonly status: 'failed';
  readonly harness: 'phase13e-realtime';
  readonly primary: SanitizedHostedHarnessError | null;
  readonly cleanup: {
    readonly began: boolean;
    readonly completed: boolean;
    readonly status: 'failed' | 'not-started' | 'ok';
    readonly failures: readonly SanitizedHostedHarnessError[];
  };
}

const STAGE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SAFE_STATUS_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;

function safeStage(stage: string): string {
  return STAGE_PATTERN.test(stage) ? stage : 'invalid-stage';
}

function safeStatus(value: string | undefined): string | undefined {
  return value !== undefined && SAFE_STATUS_PATTERN.test(value) ? value : undefined;
}

function safeHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function errorRecord(error: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof error === 'object' && error !== null
    ? (error as Readonly<Record<string, unknown>>)
    : undefined;
}

function rawErrorCategory(error: unknown): HostedHarnessErrorCategory {
  if (error instanceof HostedHarnessStageError) return error.category;
  if (typeof error === 'string') return 'non-error';
  const record = errorRecord(error);
  const name =
    error instanceof Error
      ? error.name
      : typeof record?.['name'] === 'string'
        ? record['name']
        : '';
  if (name.startsWith('Auth') || name.includes('AuthApi')) return 'auth';
  if (name.includes('Realtime') || name.includes('WebSocket')) return 'realtime';
  if (typeof record?.['code'] === 'string') return 'database';
  return error instanceof Error ? 'validation' : 'non-error';
}

export class HostedHarnessStageError extends Error {
  public readonly stage: string;
  public readonly category: HostedHarnessErrorCategory;
  public readonly code: string;
  public readonly safeDetails: HostedHarnessSafeDetails;

  public constructor(
    stage: string,
    category: HostedHarnessErrorCategory,
    code: string,
    safeDetails: HostedHarnessSafeDetails = {},
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'HostedHarnessStageError';
    this.stage = safeStage(stage);
    this.category = category;
    this.code = safeStatus(code) ?? 'INVALID_INTERNAL_CODE';
    this.safeDetails = safeDetails;
  }
}

export class HostedHarnessRunError extends Error {
  public readonly primaryFailure: unknown;
  public readonly cleanupFailures: readonly HostedHarnessCleanupFailure[];
  public readonly cleanupCompleted: boolean;

  public constructor(
    primaryFailure: unknown,
    cleanupFailures: readonly HostedHarnessCleanupFailure[],
    cleanupCompleted: boolean,
  ) {
    super('PHASE13E_HOSTED_VALIDATION_FAILED');
    this.name = 'HostedHarnessRunError';
    this.primaryFailure = primaryFailure;
    this.cleanupFailures = cleanupFailures;
    this.cleanupCompleted = cleanupCompleted;
  }
}

export function hostedHarnessStageError(
  stage: string,
  category: HostedHarnessErrorCategory,
  code: string,
  safeDetails: HostedHarnessSafeDetails = {},
  cause?: unknown,
): HostedHarnessStageError {
  return new HostedHarnessStageError(stage, category, code, safeDetails, cause);
}

export async function runHostedHarnessStage<T>(
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HostedHarnessStageError) throw error;
    const category = rawErrorCategory(error);
    const record = errorRecord(error);
    const httpStatus = safeHttpStatus(record?.['status']);
    throw hostedHarnessStageError(
      stage,
      category,
      category === 'auth'
        ? 'SUPABASE_AUTH_ERROR'
        : category === 'database'
          ? 'SUPABASE_DATABASE_ERROR'
          : category === 'realtime'
            ? 'REALTIME_CLIENT_ERROR'
            : category === 'non-error'
              ? 'NON_ERROR_THROWN'
              : 'UNEXPECTED_ERROR',
      {
        ...(httpStatus === undefined ? {} : { httpStatus }),
        retryable: httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500),
      },
      error,
    );
  }
}

export function sanitizeHostedHarnessError(
  error: unknown,
  fallbackStage = 'top-level',
): SanitizedHostedHarnessError {
  if (error instanceof HostedHarnessStageError) {
    const causeCategory = error.cause === undefined ? undefined : rawErrorCategory(error.cause);
    const channelStatus = safeStatus(error.safeDetails.channelStatus);
    const expectedStatus = safeStatus(error.safeDetails.expectedStatus);
    const httpStatus = safeHttpStatus(error.safeDetails.httpStatus);
    const receivedStatus = safeStatus(error.safeDetails.receivedStatus);
    return {
      stage: error.stage,
      category: error.category,
      code: error.code,
      retryable: error.safeDetails.retryable ?? false,
      ...(causeCategory === undefined ? {} : { causeCategory }),
      ...(channelStatus === undefined ? {} : { channelStatus }),
      ...(expectedStatus === undefined ? {} : { expectedStatus }),
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(receivedStatus === undefined ? {} : { receivedStatus }),
      ...(typeof error.safeDetails.timeoutMilliseconds !== 'number' ||
      !Number.isInteger(error.safeDetails.timeoutMilliseconds) ||
      error.safeDetails.timeoutMilliseconds < 0
        ? {}
        : { timeoutMilliseconds: error.safeDetails.timeoutMilliseconds }),
    };
  }

  const category = rawErrorCategory(error);
  const record = errorRecord(error);
  const httpStatus = safeHttpStatus(record?.['status']);
  return {
    stage: safeStage(fallbackStage),
    category,
    code:
      category === 'auth'
        ? 'SUPABASE_AUTH_ERROR'
        : category === 'database'
          ? 'SUPABASE_DATABASE_ERROR'
          : category === 'realtime'
            ? 'REALTIME_CLIENT_ERROR'
            : category === 'non-error'
              ? 'NON_ERROR_THROWN'
              : 'UNEXPECTED_ERROR',
    retryable: httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500),
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

export async function runWithCriticalCleanup(
  validation: () => Promise<void>,
  cleanup: () => Promise<readonly HostedHarnessCleanupFailure[]>,
): Promise<void> {
  let primaryFailure: unknown;
  try {
    await validation();
  } catch (error) {
    primaryFailure = error;
  }

  let cleanupCompleted = false;
  let cleanupFailures: readonly HostedHarnessCleanupFailure[] = [];
  try {
    cleanupFailures = await cleanup();
    cleanupCompleted = true;
  } catch (error) {
    cleanupFailures = [{ stage: 'cleanup-verification', error }];
  }

  if (primaryFailure !== undefined || cleanupFailures.length > 0) {
    throw new HostedHarnessRunError(primaryFailure, cleanupFailures, cleanupCompleted);
  }
}

export function sanitizeHostedHarnessFailure(error: unknown): SanitizedHostedHarnessFailure {
  if (error instanceof HostedHarnessRunError) {
    const failures = error.cleanupFailures.map((failure) =>
      sanitizeHostedHarnessError(failure.error, failure.stage),
    );
    return {
      status: 'failed',
      harness: 'phase13e-realtime',
      primary:
        error.primaryFailure === undefined
          ? null
          : sanitizeHostedHarnessError(error.primaryFailure, 'behavioral-validation'),
      cleanup: {
        began: true,
        completed: error.cleanupCompleted,
        status: failures.length === 0 ? 'ok' : 'failed',
        failures,
      },
    };
  }

  return {
    status: 'failed',
    harness: 'phase13e-realtime',
    primary: sanitizeHostedHarnessError(error),
    cleanup: {
      began: false,
      completed: false,
      status: 'not-started',
      failures: [],
    },
  };
}
