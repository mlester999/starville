import type { ApiErrorResponse } from '@starville/shared-types';

interface ErrorDetails {
  readonly statusCode: number;
  readonly body: ApiErrorResponse;
}

const SAFE_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  ADMIN_ACCESS_DENIED: 'Access is denied.',
  ORIGIN_NOT_ALLOWED: 'The request origin is not allowed.',
  INVALID_REQUEST: 'The request is invalid.',
  INVALID_WALLET_ADDRESS: 'The wallet address is invalid.',
  NETWORK_MISMATCH: 'The configured Solana network is required.',
  TOKEN_GATE_UNAVAILABLE: 'Token access is not configured yet.',
  CHALLENGE_EXPIRED: 'The wallet challenge has expired. Request a new challenge.',
  CHALLENGE_INVALID: 'The wallet challenge is invalid or has already been used.',
  SIGNATURE_INVALID: 'The wallet signature could not be verified.',
  INSUFFICIENT_TOKEN_BALANCE: 'This wallet does not meet the token requirement.',
  TOKEN_ACCESS_REQUIRED: 'A valid token-access session is required.',
  TOKEN_ACCESS_EXPIRED: 'The token-access session has expired.',
  TOKEN_ACCESS_REVOKED: 'The token-access session is no longer valid.',
  RATE_LIMITED: 'Too many requests. Please wait before trying again.',
  RPC_UNAVAILABLE: 'Token balance verification is temporarily unavailable.',
  CONFIG_VERSION_CONFLICT: 'The token-access configuration changed. Reload and try again.',
  PERSISTENCE_UNAVAILABLE: 'The token-access service is temporarily unavailable.',
} as const;

export type SafeApiErrorCode = keyof typeof SAFE_ERROR_MESSAGES;

export class PublicApiError extends Error {
  readonly code: SafeApiErrorCode;
  readonly statusCode: 400 | 401 | 403 | 409 | 422 | 429 | 503;

  constructor(statusCode: PublicApiError['statusCode'], code: SafeApiErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = 'PublicApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function readProperty(value: unknown, property: string): unknown {
  return typeof value === 'object' && value !== null && property in value
    ? Reflect.get(value, property)
    : undefined;
}

function resolveStatusCode(error: unknown): number {
  const candidate = readProperty(error, 'statusCode');

  return typeof candidate === 'number' && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

export function formatApiError(error: unknown, requestId: string): ErrorDetails {
  const statusCode = resolveStatusCode(error);
  const isServerError = statusCode >= 500;
  const providedCode = readProperty(error, 'code');
  const safeCode =
    typeof providedCode === 'string' && providedCode in SAFE_ERROR_MESSAGES
      ? (providedCode as SafeApiErrorCode)
      : undefined;
  const exposeSafeServerError = isServerError && error instanceof PublicApiError;

  return {
    statusCode,
    body: {
      success: false,
      error: {
        code: isServerError
          ? exposeSafeServerError && safeCode !== undefined
            ? safeCode
            : 'INTERNAL_SERVER_ERROR'
          : (safeCode ?? 'REQUEST_ERROR'),
        message: isServerError
          ? exposeSafeServerError && safeCode !== undefined
            ? SAFE_ERROR_MESSAGES[safeCode]
            : 'An unexpected error occurred.'
          : safeCode === undefined
            ? 'The request could not be completed.'
            : SAFE_ERROR_MESSAGES[safeCode],
      },
      requestId,
    },
  };
}

export function formatNotFoundError(requestId: string): ApiErrorResponse {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
    requestId,
  };
}
