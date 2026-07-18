import 'server-only';

import { getVerifiedAccessToken } from './auth/api-session';
import { parseAdminPublicConfig } from './public-config';
import { createAdminServerClient } from './supabase/server';

export class AdminApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super('The trusted administrator request did not complete.');
    this.name = 'AdminApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readErrorCode(value: unknown): string {
  if (!isRecord(value) || !isRecord(value['error']) || typeof value['error']['code'] !== 'string') {
    return 'ADMIN_REQUEST_FAILED';
  }
  return value['error']['code'];
}

export async function callTrustedAdminApi<Data>(options: {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly pathname: string;
  readonly parser: (value: unknown) => Data;
  readonly body?: unknown;
  readonly requestId?: string;
}): Promise<Data> {
  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);
  if (accessToken === undefined) throw new AdminApiError(401, 'AUTHENTICATION_REQUIRED');

  const config = parseAdminPublicConfig(process.env);
  let response: Response;
  try {
    response = await fetch(new URL(options.pathname, config.apiUrl), {
      method: options.method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        origin: config.appOrigin,
        ...(options.requestId === undefined ? {} : { 'x-request-id': options.requestId }),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError(503, 'ADMIN_SERVICE_UNAVAILABLE');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminApiError(response.status, 'INVALID_ADMIN_RESPONSE');
  }

  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    throw new AdminApiError(response.status, readErrorCode(payload));
  }

  try {
    return options.parser(payload['data']);
  } catch {
    throw new AdminApiError(502, 'INVALID_ADMIN_RESPONSE');
  }
}
