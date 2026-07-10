import type { ApiErrorResponse } from '@starville/shared-types';

interface ErrorDetails {
  readonly statusCode: number;
  readonly body: ApiErrorResponse;
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
  const providedMessage = error instanceof Error ? error.message : 'The request failed.';

  return {
    statusCode,
    body: {
      success: false,
      error: {
        code:
          !isServerError && typeof providedCode === 'string'
            ? providedCode
            : isServerError
              ? 'INTERNAL_SERVER_ERROR'
              : 'REQUEST_ERROR',
        message: isServerError ? 'An unexpected error occurred.' : providedMessage,
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
