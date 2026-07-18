'use server';

import { revalidatePath } from 'next/cache';

import {
  adminCosmeticGrantInputSchema,
  adminCosmeticRevocationInputSchema,
} from '@starville/cosmetics';
import { z } from 'zod';

import { callTrustedAdminApi } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';

const mutationResultSchema = z
  .object({
    status: z.enum(['granted', 'revoked']),
    receiptId: z.uuid(),
  })
  .passthrough();

export async function grantCosmeticAction(formData: FormData) {
  await requireAuthorizedAdmin('cosmetics.grant');
  const input = adminCosmeticGrantInputSchema.parse({
    playerProfileId: formData.get('playerProfileId'),
    cosmeticKey: formData.get('cosmeticKey'),
    reasonCategory: formData.get('reasonCategory'),
    explanation: formData.get('explanation'),
    expectedState: formData.get('expectedState'),
    requestId: crypto.randomUUID(),
  });
  await callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/cosmetics/grants',
    requestId: input.requestId,
    body: input,
    parser: (value) => mutationResultSchema.parse(value),
  });
  revalidatePath('/game-content/cosmetics');
  revalidatePath('/game-content/cosmetics/grants');
  revalidatePath('/game-content/cosmetics/audit');
}

export async function revokeCosmeticAction(formData: FormData) {
  await requireAuthorizedAdmin('cosmetics.revoke');
  const input = adminCosmeticRevocationInputSchema.parse({
    playerProfileId: formData.get('playerProfileId'),
    cosmeticKey: formData.get('cosmeticKey'),
    reasonCategory: formData.get('reasonCategory'),
    explanation: formData.get('explanation'),
    expectedState: 'owned',
    requestId: crypto.randomUUID(),
  });
  await callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/cosmetics/revocations',
    requestId: input.requestId,
    body: input,
    parser: (value) => mutationResultSchema.parse(value),
  });
  revalidatePath('/game-content/cosmetics');
  revalidatePath('/game-content/cosmetics/revocations');
  revalidatePath('/game-content/cosmetics/audit');
}
