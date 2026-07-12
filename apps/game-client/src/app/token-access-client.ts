import {
  tokenAccessSessionViewSchema,
  type TokenAccessSessionView,
} from '@starville/wallet-access';

export type TrustedTokenAccess = TokenAccessSessionView;
export type GateScreen =
  'checking' | 'granted' | 'required' | 'expired' | 'revoked' | 'unavailable';

export function screenForAccess(access: TrustedTokenAccess): GateScreen {
  switch (access.access) {
    case 'granted':
      return 'granted';
    case 'expired':
      return 'expired';
    case 'revoked':
    case 'configuration_changed':
      return 'revoked';
    case 'none':
    case 'insufficient_balance':
      return 'required';
  }
}

export class GameAccessRequestError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super('Trusted Starville access could not be loaded.');
    this.name = 'GameAccessRequestError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTrustedTokenAccess(value: unknown): TrustedTokenAccess {
  const parsed = tokenAccessSessionViewSchema.safeParse(value);

  if (!parsed.success) {
    throw new GameAccessRequestError(502);
  }

  return parsed.data;
}

async function requestAccess(
  apiUrl: string,
  pathname: '/api/v1/token-access/me' | '/api/v1/token-access/recheck',
  method: 'GET' | 'POST',
  signal?: AbortSignal,
): Promise<TrustedTokenAccess> {
  let response: Response;

  try {
    response = await fetch(new URL(pathname, apiUrl), {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new GameAccessRequestError(503);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GameAccessRequestError(response.status);
  }

  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    throw new GameAccessRequestError(response.status);
  }

  return parseTrustedTokenAccess(payload['data']);
}

export function loadTrustedTokenAccess(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<TrustedTokenAccess> {
  return requestAccess(apiUrl, '/api/v1/token-access/me', 'GET', signal);
}

export function recheckTrustedTokenAccess(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<TrustedTokenAccess> {
  return requestAccess(apiUrl, '/api/v1/token-access/recheck', 'POST', signal);
}

export async function revokeTrustedTokenAccess(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(new URL('/api/v1/token-access/session', apiUrl), {
      method: 'DELETE',
      credentials: 'include',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new GameAccessRequestError(503);
  }

  if (!response.ok) throw new GameAccessRequestError(response.status);
}

export function shortenWalletAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-5)}`;
}

export function formatTokenAmount(amount: string): string {
  const [whole = amount, fraction] = amount.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return fraction === undefined ? groupedWhole : `${groupedWhole}.${fraction}`;
}
