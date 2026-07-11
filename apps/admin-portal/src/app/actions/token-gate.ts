'use server';

import { walletAddressSchema, walletNetworkSchema } from '@starville/wallet-access';
import { revalidatePath } from 'next/cache';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  AdminTokenGateApiError,
  updateAdminTokenGateConfig,
  validateAdminTokenMint,
} from '../../lib/token-access/api';
import type { TokenGateActionState } from '../../lib/token-access/contracts';

function readString(formData: FormData, field: string, maximumLength: number): string | undefined {
  const value = formData.get(field);

  if (typeof value !== 'string' || value.length > maximumLength) {
    return undefined;
  }

  return value.trim();
}

function readInteger(
  formData: FormData,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const raw = readString(formData, field, 20);
  const value = raw === undefined ? Number.NaN : Number(raw);

  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function messageForApiError(error: AdminTokenGateApiError): string {
  if (error.status === 403) {
    return 'Your current administrator role cannot change token access.';
  }

  if (error.status === 409) {
    return 'The configuration changed in another session. Refresh before trying again.';
  }

  if (error.status === 400 || error.status === 422) {
    return 'The proposed token configuration could not be validated.';
  }

  if (error.status === 429) {
    return 'Too many validation requests were made. Wait briefly before trying again.';
  }

  return 'The trusted token-access service is temporarily unavailable.';
}

export async function validateTokenGateAction(
  _previousState: TokenGateActionState,
  formData: FormData,
): Promise<TokenGateActionState> {
  await requireAuthorizedAdmin('token_gate.configure');

  const network = walletNetworkSchema.safeParse(readString(formData, 'network', 32));
  const mintAddress = walletAddressSchema.safeParse(readString(formData, 'mintAddress', 64));
  const commitment = readString(formData, 'commitment', 16);

  if (
    !network.success ||
    !mintAddress.success ||
    !['confirmed', 'finalized'].includes(commitment ?? '')
  ) {
    return { outcome: 'error', message: 'Enter a valid Solana mint address before validation.' };
  }

  try {
    const validation = await validateAdminTokenMint({
      network: network.data,
      mintAddress: mintAddress.data,
      commitment: commitment as 'confirmed' | 'finalized',
    });

    return {
      outcome: 'success',
      message: 'The mint exists on the configured network and its metadata was verified.',
      validation,
    };
  } catch (error) {
    return {
      outcome: 'error',
      message:
        error instanceof AdminTokenGateApiError
          ? messageForApiError(error)
          : 'The proposed mint could not be validated.',
    };
  }
}

export async function updateTokenGateAction(
  _previousState: TokenGateActionState,
  formData: FormData,
): Promise<TokenGateActionState> {
  await requireAuthorizedAdmin('token_gate.configure');

  const network = walletNetworkSchema.safeParse(readString(formData, 'network', 32));
  const mintAddress = walletAddressSchema.safeParse(readString(formData, 'mintAddress', 64));
  const symbol = readString(formData, 'symbol', 16)?.toUpperCase();
  const requiredAmount = readString(formData, 'requiredAmount', 100);
  const commitment = readString(formData, 'commitment', 16);
  const sessionTtlSeconds = readInteger(formData, 'sessionTtlSeconds', 60, 3_600);
  const recheckIntervalSeconds = readInteger(formData, 'recheckIntervalSeconds', 30, 1_800);
  const expectedConfigVersion = readInteger(formData, 'expectedConfigVersion', 1, 2_147_483_647);
  const reason = readString(formData, 'reason', 500);
  const confirmed = formData.get('confirmed') === 'on';

  if (
    !network.success ||
    !mintAddress.success ||
    symbol === undefined ||
    !/^[A-Z0-9]{1,16}$/u.test(symbol) ||
    requiredAmount === undefined ||
    !/^\d+(?:\.\d+)?$/u.test(requiredAmount) ||
    !['confirmed', 'finalized'].includes(commitment ?? '') ||
    sessionTtlSeconds === undefined ||
    recheckIntervalSeconds === undefined ||
    recheckIntervalSeconds > sessionTtlSeconds ||
    expectedConfigVersion === undefined
  ) {
    return { outcome: 'error', message: 'Review the configuration fields and try again.' };
  }

  if (reason === undefined || reason.length < 12) {
    return { outcome: 'error', message: 'Provide a clear reason of at least 12 characters.' };
  }

  if (!confirmed) {
    return {
      outcome: 'error',
      message: 'Confirm that current access sessions may be invalidated.',
    };
  }

  try {
    await updateAdminTokenGateConfig({
      enabled: formData.get('enabled') === 'on',
      network: network.data,
      mintAddress: mintAddress.data,
      symbol,
      requiredAmount,
      commitment: commitment as 'confirmed' | 'finalized',
      sessionTtlSeconds,
      recheckIntervalSeconds,
      expectedConfigVersion,
      reason,
    });
    revalidatePath('/token-access');

    return {
      outcome: 'success',
      message: 'Token access was updated and the change was sent to the administrator audit trail.',
    };
  } catch (error) {
    return {
      outcome: 'error',
      message:
        error instanceof AdminTokenGateApiError
          ? messageForApiError(error)
          : 'The token-access update did not complete.',
    };
  }
}
