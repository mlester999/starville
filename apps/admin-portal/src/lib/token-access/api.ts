import 'server-only';

import {
  tokenAccessAvailabilitySchema,
  walletAddressSchema,
  walletNetworkSchema,
} from '@starville/wallet-access';

import { getVerifiedAccessToken } from '../auth/api-session';
import { parseAdminPublicConfig } from '../public-config';
import { createAdminServerClient } from '../supabase/server';
import type { AdminMintValidation, AdminTokenGateConfig, AdminTokenGateUpdate } from './contracts';

export class AdminTokenGateApiError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super('The trusted token-access administration request did not complete.');
    this.name = 'AdminTokenGateApiError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maximumLength = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || (isString(value, 64) && !Number.isNaN(Date.parse(value)));
}

export function parseAdminTokenGateConfig(value: unknown): AdminTokenGateConfig {
  if (!isRecord(value)) {
    throw new AdminTokenGateApiError(502);
  }

  const availability = tokenAccessAvailabilitySchema.safeParse(value['availability']);
  const network = walletNetworkSchema.safeParse(value['network']);
  const mintAddress =
    value['mintAddress'] === null
      ? { success: true as const, data: null }
      : walletAddressSchema.safeParse(value['mintAddress']);

  if (
    typeof value['enabled'] !== 'boolean' ||
    !availability.success ||
    !network.success ||
    !mintAddress.success ||
    !(
      value['tokenProgram'] === null ||
      ['spl-token', 'spl-token-2022'].includes(String(value['tokenProgram']))
    ) ||
    !isString(value['symbol'], 16) ||
    !(
      value['decimals'] === null ||
      (Number.isInteger(value['decimals']) &&
        Number(value['decimals']) >= 0 &&
        Number(value['decimals']) <= 18)
    ) ||
    !(
      value['requiredAmountRaw'] === null ||
      (isString(value['requiredAmountRaw'], 100) && /^\d+$/u.test(value['requiredAmountRaw']))
    ) ||
    !isString(value['requiredAmount'], 100) ||
    !/^\d+(?:\.\d+)?$/u.test(value['requiredAmount']) ||
    !['confirmed', 'finalized'].includes(String(value['commitment'])) ||
    !isPositiveInteger(value['sessionTtlSeconds']) ||
    !isPositiveInteger(value['recheckIntervalSeconds']) ||
    !isPositiveInteger(value['configVersion']) ||
    !isNullableDate(value['lastValidatedAt']) ||
    !(
      value['lastValidatedSlot'] === null ||
      (isString(value['lastValidatedSlot'], 32) && /^\d+$/u.test(value['lastValidatedSlot']))
    )
  ) {
    throw new AdminTokenGateApiError(502);
  }

  return {
    enabled: value['enabled'],
    availability: availability.data,
    network: network.data,
    mintAddress: mintAddress.data,
    tokenProgram: value['tokenProgram'] as AdminTokenGateConfig['tokenProgram'],
    symbol: value['symbol'],
    decimals: value['decimals'] as number | null,
    requiredAmountRaw: value['requiredAmountRaw'],
    requiredAmount: value['requiredAmount'],
    commitment: value['commitment'] as 'confirmed' | 'finalized',
    sessionTtlSeconds: value['sessionTtlSeconds'],
    recheckIntervalSeconds: value['recheckIntervalSeconds'],
    configVersion: value['configVersion'],
    lastValidatedAt: value['lastValidatedAt'],
    lastValidatedSlot: value['lastValidatedSlot'],
  };
}

function parseMintValidation(value: unknown): AdminMintValidation {
  if (!isRecord(value)) {
    throw new AdminTokenGateApiError(502);
  }

  const network = walletNetworkSchema.safeParse(value['network']);
  const mintAddress = walletAddressSchema.safeParse(value['mintAddress']);

  if (
    !network.success ||
    !mintAddress.success ||
    !isString(value['tokenProgram'], 128) ||
    !Number.isInteger(value['decimals']) ||
    Number(value['decimals']) < 0 ||
    Number(value['decimals']) > 18 ||
    !isString(value['slot'], 32) ||
    !['confirmed', 'finalized'].includes(String(value['commitment']))
  ) {
    throw new AdminTokenGateApiError(502);
  }

  return {
    network: network.data,
    mintAddress: mintAddress.data,
    tokenProgram: value['tokenProgram'],
    decimals: value['decimals'] as number,
    slot: value['slot'],
    commitment: value['commitment'] as 'confirmed' | 'finalized',
  };
}

async function callTrustedAdminTokenGate<Data>(
  method: 'GET' | 'PATCH' | 'POST',
  pathname: '/api/v1/admin/token-gate' | '/api/v1/admin/token-gate/validate',
  parser: (value: unknown) => Data,
  body?: unknown,
): Promise<Data> {
  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);

  if (accessToken === undefined) {
    throw new AdminTokenGateApiError(401);
  }

  const endpoint = new URL(pathname, parseAdminPublicConfig(process.env).apiUrl);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    throw new AdminTokenGateApiError(503);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new AdminTokenGateApiError(response.status);
  }

  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    throw new AdminTokenGateApiError(response.status);
  }

  return parser(payload['data']);
}

export function loadAdminTokenGateConfig(): Promise<AdminTokenGateConfig> {
  return callTrustedAdminTokenGate('GET', '/api/v1/admin/token-gate', parseAdminTokenGateConfig);
}

export function updateAdminTokenGateConfig(
  update: AdminTokenGateUpdate,
): Promise<AdminTokenGateConfig> {
  return callTrustedAdminTokenGate(
    'PATCH',
    '/api/v1/admin/token-gate',
    parseAdminTokenGateConfig,
    update,
  );
}

export function validateAdminTokenMint(input: {
  readonly network: AdminTokenGateUpdate['network'];
  readonly mintAddress: string;
  readonly commitment: 'confirmed' | 'finalized';
}): Promise<AdminMintValidation> {
  return callTrustedAdminTokenGate(
    'POST',
    '/api/v1/admin/token-gate/validate',
    parseMintValidation,
    input,
  );
}
