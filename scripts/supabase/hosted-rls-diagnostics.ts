const DEFAULT_HOSTED_HTTP_TIMEOUT_MS = 20_000;
const DEFAULT_HOSTED_CLEANUP_TIMEOUT_MS = 20_000;
const UUID_PATH_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/giu;
type HostedFetchInput = Parameters<typeof globalThis.fetch>[0];

class HostedCleanupTimeoutError extends Error {
  readonly code = 'HOSTED_CLEANUP_TIMEOUT';
}

export interface HostedApiLogDiagnostic {
  readonly errorCode: string | null;
  readonly level: 'error' | 'fatal' | 'warn';
  readonly message: string;
  readonly method: string | null;
  readonly path: string | null;
  readonly requestId: string | null;
  readonly statusCode: number | null;
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function safeDiagnosticCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_-]{1,80}$/u.test(value) ? value : null;
}

function safeDiagnosticRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9:._-]{1,160}$/u.test(value) ? value : null;
}

export function safeHostedEndpoint(url: URL): string {
  return url.pathname.replace(UUID_PATH_SEGMENT, '/:id');
}

export function safeHostedTransportCode(error: unknown): string | null {
  const directCode =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  const cause =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'cause') : undefined;
  const causeCode =
    typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : undefined;
  const candidate = typeof directCode === 'string' ? directCode : causeCode;
  return typeof candidate === 'string' && /^[A-Z0-9_-]{1,80}$/u.test(candidate) ? candidate : null;
}

async function bufferedHostedFetch(
  operation: string,
  input: HostedFetchInput,
  diagnosticUrl: URL,
  requestId: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_HOSTED_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let responseStatus: number | null = null;
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    responseStatus = response.status;
    const responseBody = await response.arrayBuffer();
    const replayBody = [204, 205, 304].includes(response.status) ? null : responseBody;
    return new Response(replayBody, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    throw new Error(
      `Hosted request failed: ${JSON.stringify({
        operation,
        endpoint: safeHostedEndpoint(diagnosticUrl),
        status: responseStatus,
        code: timedOut ? 'HOSTED_HTTP_TIMEOUT' : 'HOSTED_HTTP_CONNECTION_FAILURE',
        transportCode: safeHostedTransportCode(error),
        requestId,
        failureKind: timedOut ? 'timeout' : 'connection',
      })}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function hostedFetch(
  operation: string,
  url: URL,
  requestId: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_HOSTED_HTTP_TIMEOUT_MS,
): Promise<Response> {
  return bufferedHostedFetch(operation, url, url, requestId, init, timeoutMs);
}

export function createHostedFetch(
  operation: string,
  requestId: string,
  timeoutMs = DEFAULT_HOSTED_HTTP_TIMEOUT_MS,
): typeof globalThis.fetch {
  return async (input, init) => {
    const diagnosticUrl =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    return bufferedHostedFetch(operation, input, diagnosticUrl, requestId, init, timeoutMs);
  };
}

export function hostedResponseFailure(
  operation: string,
  url: URL,
  response: Response,
  requestId: string,
): string {
  return `Hosted response assertion failed: ${JSON.stringify({
    operation,
    endpoint: safeHostedEndpoint(url),
    status: response.status,
    code: 'HOSTED_HTTP_STATUS',
    requestId,
    failureKind: 'http',
  })}`;
}

export function hostedApiResponseFailure(
  operation: string,
  url: URL,
  statusCode: number,
  responseBody: string,
  fallbackRequestId: string,
  apiLog: HostedApiLogDiagnostic | null,
): string {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(responseBody) as unknown;
  } catch {
    parsedBody = null;
  }
  const responseCode = safeDiagnosticCode(property(property(parsedBody, 'error'), 'code'));
  const responseRequestId = safeDiagnosticRequestId(property(parsedBody, 'requestId'));

  return `Hosted API assertion failed: ${JSON.stringify({
    operation,
    endpoint: safeHostedEndpoint(url),
    status: statusCode,
    code: responseCode ?? (statusCode >= 400 ? 'HOSTED_API_ERROR' : 'HOSTED_RESPONSE_ASSERTION'),
    requestId: responseRequestId ?? safeDiagnosticRequestId(fallbackRequestId),
    apiLog,
  })}`;
}

export async function decodeHostedJson<T>(
  operation: string,
  url: URL,
  response: Response,
  requestId: string,
): Promise<T> {
  try {
    return JSON.parse(await response.text()) as T;
  } catch {
    throw new Error(
      `Hosted response decode failed: ${JSON.stringify({
        operation,
        endpoint: safeHostedEndpoint(url),
        status: response.status,
        code: 'HOSTED_RESPONSE_DECODE',
        requestId,
        failureKind: 'decode',
      })}`,
    );
  }
}

export async function withHostedCleanupTimeout<T>(
  task: () => Promise<T>,
  timeoutMs = DEFAULT_HOSTED_CLEANUP_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new HostedCleanupTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
