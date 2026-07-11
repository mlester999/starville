import {
  tokenAccessChallengeSchema,
  tokenAccessPublicConfigSchema,
  tokenAccessSessionViewSchema,
  type TokenAccessChallenge,
  type TokenAccessChallengeRequest,
  type TokenAccessPublicConfig,
  type TokenAccessSessionView,
  type TokenAccessVerifyRequest,
} from '@starville/wallet-access';

export type PublicTokenAccessConfig = TokenAccessPublicConfig;
export type WalletChallenge = TokenAccessChallenge;
export type TokenAccessView = TokenAccessSessionView;

interface ApiSuccessEnvelope<Data> {
  readonly success: true;
  readonly data: Data;
  readonly requestId: string;
}

interface ApiErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly requestId: string;
}

export class TokenAccessClientError extends Error {
  public readonly code: string | undefined;
  public readonly status: number;

  public constructor(status: number, code?: string) {
    super('The Starville access request did not complete.');
    this.name = 'TokenAccessClientError';
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeString(value: unknown, maximumLength = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function parsePublicConfig(value: unknown): PublicTokenAccessConfig {
  const parsed = tokenAccessPublicConfigSchema.safeParse(value);

  if (!parsed.success) {
    throw new TokenAccessClientError(502, 'INVALID_API_RESPONSE');
  }

  return parsed.data;
}

function parseChallenge(value: unknown): WalletChallenge {
  const parsed = tokenAccessChallengeSchema.safeParse(value);

  if (!parsed.success) {
    throw new TokenAccessClientError(502, 'INVALID_API_RESPONSE');
  }

  return parsed.data;
}

function parseAccessView(value: unknown): TokenAccessView {
  const parsed = tokenAccessSessionViewSchema.safeParse(value);

  if (!parsed.success) {
    throw new TokenAccessClientError(502, 'INVALID_API_RESPONSE');
  }

  return parsed.data;
}

function parseErrorEnvelope(value: unknown): ApiErrorEnvelope | undefined {
  if (!isRecord(value) || value['success'] !== false || !isRecord(value['error'])) {
    return undefined;
  }

  const code = value['error']['code'];
  const message = value['error']['message'];
  const requestId = value['requestId'];

  if (!isSafeString(code, 100) || !isSafeString(message, 500) || !isSafeString(requestId, 128)) {
    return undefined;
  }

  return value as unknown as ApiErrorEnvelope;
}

async function request<Data>(
  apiUrl: string,
  pathname: string,
  parser: (value: unknown) => Data,
  init: RequestInit = {},
): Promise<Data> {
  const endpoint = new URL(pathname, apiUrl);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new TokenAccessClientError(503, 'TOKEN_ACCESS_RPC_UNAVAILABLE');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new TokenAccessClientError(response.status, 'INVALID_API_RESPONSE');
  }

  if (!response.ok) {
    throw new TokenAccessClientError(response.status, parseErrorEnvelope(payload)?.error.code);
  }

  if (
    !isRecord(payload) ||
    payload['success'] !== true ||
    !isSafeString(payload['requestId'], 128)
  ) {
    throw new TokenAccessClientError(502, 'INVALID_API_RESPONSE');
  }

  const envelope = payload as unknown as ApiSuccessEnvelope<unknown>;
  return parser(envelope.data);
}

export function fetchPublicTokenAccessConfig(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<PublicTokenAccessConfig> {
  return request(apiUrl, '/api/v1/token-access/config', parsePublicConfig, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function fetchTokenAccessSession(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<TokenAccessView> {
  return request(apiUrl, '/api/v1/token-access/me', parseAccessView, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createWalletChallenge(
  apiUrl: string,
  body: TokenAccessChallengeRequest,
  signal?: AbortSignal,
): Promise<WalletChallenge> {
  return request(apiUrl, '/api/v1/token-access/challenge', parseChallenge, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

export function verifyWalletAccess(
  apiUrl: string,
  body: TokenAccessVerifyRequest,
  signal?: AbortSignal,
): Promise<TokenAccessView> {
  return request(apiUrl, '/api/v1/token-access/verify', parseAccessView, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

export function recheckTokenAccess(apiUrl: string, signal?: AbortSignal): Promise<TokenAccessView> {
  return request(apiUrl, '/api/v1/token-access/recheck', parseAccessView, {
    method: 'POST',
    body: JSON.stringify({}),
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function revokeTokenAccess(apiUrl: string, signal?: AbortSignal): Promise<void> {
  await request(
    apiUrl,
    '/api/v1/token-access/session',
    (value) => {
      if (!isRecord(value) || typeof value['revoked'] !== 'boolean') {
        throw new TokenAccessClientError(502, 'INVALID_API_RESPONSE');
      }

      return value;
    },
    { method: 'DELETE', ...(signal === undefined ? {} : { signal }) },
  );
}

export function encodeSignatureBase64(signature: Uint8Array): string {
  let binary = '';

  for (const byte of signature) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

export function shortenWalletAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

export function formatTokenAmount(amount: string): string {
  const [whole = amount, fraction] = amount.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return fraction === undefined ? groupedWhole : `${groupedWhole}.${fraction}`;
}
