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
  INVALID_PLAYER_PROFILE: 'The player profile is invalid.',
  INVALID_PLAYER_STATE: 'The player state is invalid.',
  INVALID_PLAYER_OPERATION: 'The player operation request is invalid.',
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
  PLAYER_PROFILE_REQUIRED: 'Create a player profile before entering Starville.',
  PLAYER_PROFILE_NOT_FOUND: 'The player profile could not be found.',
  PLAYER_NOT_FOUND: 'The player could not be found.',
  PLAYER_SUSPENDED: 'This player is suspended from entering Starville.',
  PLAYER_RENAME_REQUIRED: 'A replacement display name is required before entering Starville.',
  PLAYER_NAME_UNCHANGED: 'Choose a display name that is different from the current name.',
  PLAYER_STATE_VERSION_CONFLICT: 'The saved player state changed and must be reloaded.',
  PLAYER_VERSION_CONFLICT: 'The player record changed. Reload and try again.',
  PLAYER_OPERATION_CONFLICT: 'The requested action is not valid for the current player state.',
  UNSAFE_PLAYER_POSITION: 'The requested player position is not safe to save.',
  RATE_LIMITED: 'Too many requests. Please wait before trying again.',
  RPC_UNAVAILABLE: 'Token balance verification is temporarily unavailable.',
  CONFIG_VERSION_CONFLICT: 'The token-access configuration changed. Reload and try again.',
  PERSISTENCE_UNAVAILABLE: 'The token-access service is temporarily unavailable.',
  PLAYER_PERSISTENCE_UNAVAILABLE: 'The player service is temporarily unavailable.',
  OPERATIONS_UNAVAILABLE: 'The operations service is temporarily unavailable.',
  INVALID_WORLD_REQUEST: 'The world request is invalid.',
  INVALID_WORLD_TRANSITION: 'This map transition is not available.',
  WORLD_NOT_FOUND: 'The requested published map could not be found.',
  WORLD_VERSION_CONFLICT: 'The world state changed and must be reloaded.',
  WORLD_UNAVAILABLE: 'The published world is temporarily unavailable.',
  WORLD_CONTENT_INVALID: 'The published world did not pass server validation.',
  INVALID_WORLD_ADMIN_REQUEST: 'The world-management request is invalid.',
  WORLD_DRAFT_NOT_FOUND: 'The requested world draft could not be found.',
  WORLD_DRAFT_CONFLICT: 'The world draft changed. Reload and try again.',
  WORLD_VALIDATION_FAILED: 'The world draft did not pass validation.',
  WORLD_PUBLISH_CONFLICT: 'The active world version changed. Reload and try again.',
  WORLD_MANAGEMENT_UNAVAILABLE: 'World management is temporarily unavailable.',
} as const;

export type SafeApiErrorCode = keyof typeof SAFE_ERROR_MESSAGES;

export class PublicApiError extends Error {
  readonly code: SafeApiErrorCode;
  readonly statusCode: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503;

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
