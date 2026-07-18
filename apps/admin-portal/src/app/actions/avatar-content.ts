'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { AdminPermissionKey } from '@starville/admin-auth';
import {
  AVATAR_CONTENT_LAYERS,
  AVATAR_KEY_MAX_LENGTH,
  AVATAR_KEY_MIN_LENGTH,
} from '@starville/avatar';

import { callTrustedAdminApi } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';

const stableKeyInputSchema = z
  .string()
  .trim()
  .min(AVATAR_KEY_MIN_LENGTH)
  .max(AVATAR_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);

const lifecycleReasonSchema = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .refine((value) => !/[<>\p{Cc}]/u.test(value), 'Reason contains unsupported characters');

const lifecycleOperationSchema = z
  .object({
    definitionId: z.uuid(),
    versionId: z.uuid(),
    expectedRevision: z.coerce.number().int().positive(),
    reason: lifecycleReasonSchema.optional(),
  })
  .strict();

async function lifecycleAction(
  formData: FormData,
  operation: 'validate' | 'submit' | 'review' | 'approve' | 'activate' | 'supersede',
  permission: AdminPermissionKey,
  extra?: Readonly<Record<string, string>>,
) {
  await requireAuthorizedAdmin(permission);
  const parsed = lifecycleOperationSchema.parse({
    definitionId: formData.get('definitionId'),
    versionId: formData.get('versionId'),
    expectedRevision: formData.get('expectedRevision'),
    reason: formData.get('reason') || undefined,
  });
  const reason = operation === 'validate' ? undefined : lifecycleReasonSchema.parse(parsed.reason);
  const requestId = crypto.randomUUID();
  await callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/avatar-content/versions/${parsed.versionId}/${operation}`,
    requestId,
    body: {
      definitionId: parsed.definitionId,
      versionId: parsed.versionId,
      expectedRevision: parsed.expectedRevision,
      ...(reason === undefined ? {} : { reason }),
      ...extra,
      requestId,
    },
    parser: (value) =>
      z
        .object({ status: z.string().min(1).max(40) })
        .passthrough()
        .parse(value),
  });
  revalidatePath(`/game-content/avatars/catalog/${parsed.definitionId}`);
  revalidatePath('/game-content/avatars');
  revalidatePath('/game-content/avatars/review');
}

export async function validateAvatarVersionAction(formData: FormData) {
  return lifecycleAction(formData, 'validate', 'avatar_content.edit');
}

export async function submitAvatarVersionAction(formData: FormData) {
  return lifecycleAction(formData, 'submit', 'avatar_content.edit');
}

export async function reviewAvatarVersionAction(formData: FormData) {
  const decision = z
    .enum(['accept', 'changes_requested', 'reject'])
    .parse(formData.get('decision'));
  return lifecycleAction(formData, 'review', 'avatar_content.review', { decision });
}

export async function approveAvatarVersionAction(formData: FormData) {
  return lifecycleAction(formData, 'approve', 'avatar_content.approve');
}

export async function activateAvatarVersionAction(formData: FormData) {
  return lifecycleAction(formData, 'activate', 'avatar_content.activate');
}

export async function supersedeAvatarVersionAction(formData: FormData) {
  return lifecycleAction(formData, 'supersede', 'avatar_content.activate');
}

const draftUpdateSchema = z
  .object({
    definitionId: z.uuid(),
    versionId: z.uuid(),
    expectedRevision: z.coerce.number().int().positive(),
    publicName: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(500),
    renderOrder: z.coerce.number().int().min(-100).max(100),
    anchorX: z.coerce.number().min(0).max(1),
    anchorY: z.coerce.number().min(0).max(1),
    offsetX: z.coerce.number().min(-256).max(256),
    offsetY: z.coerce.number().min(-256).max(256),
    fallbackKey: stableKeyInputSchema.nullable(),
    directions: z.array(
      z.enum([
        'north',
        'northeast',
        'east',
        'southeast',
        'south',
        'southwest',
        'west',
        'northwest',
      ]),
    ),
    animationStates: z.array(z.enum(['idle', 'walk', 'jog'])),
  })
  .strict();

export async function updateAvatarDraftAction(formData: FormData) {
  await requireAuthorizedAdmin('avatar_content.edit');
  const fallback = String(formData.get('fallbackKey') ?? '').trim();
  const parsed = draftUpdateSchema.parse({
    definitionId: formData.get('definitionId'),
    versionId: formData.get('versionId'),
    expectedRevision: formData.get('expectedRevision'),
    publicName: formData.get('publicName'),
    description: formData.get('description'),
    renderOrder: formData.get('renderOrder'),
    anchorX: formData.get('anchorX'),
    anchorY: formData.get('anchorY'),
    offsetX: formData.get('offsetX'),
    offsetY: formData.get('offsetY'),
    fallbackKey: fallback === '' ? null : fallback,
    directions: formData.getAll('directions'),
    animationStates: formData.getAll('animationStates'),
  });
  const requestId = crypto.randomUUID();
  await callTrustedAdminApi({
    method: 'PATCH',
    pathname: `/api/v1/admin/avatar-content/versions/${parsed.versionId}`,
    requestId,
    body: { ...parsed, requestId },
    parser: (value) =>
      z
        .object({ status: z.string().min(1).max(40) })
        .passthrough()
        .parse(value),
  });
  revalidatePath(`/game-content/avatars/catalog/${parsed.definitionId}`);
}

const createDraftSchema = z
  .object({
    stableKey: stableKeyInputSchema,
    publicName: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(500),
    category: stableKeyInputSchema,
    layer: z.enum(AVATAR_CONTENT_LAYERS),
  })
  .strict();

export async function createAvatarDraftAction(formData: FormData) {
  await requireAuthorizedAdmin('avatar_content.edit');
  const parsed = createDraftSchema.parse({
    stableKey: formData.get('stableKey'),
    publicName: formData.get('publicName'),
    description: formData.get('description'),
    category: formData.get('category'),
    layer: formData.get('layer'),
  });
  const requestId = crypto.randomUUID();
  await callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/avatar-content/catalog',
    requestId,
    body: { ...parsed, expectedRevision: 0, requestId },
    parser: (value) =>
      z
        .object({ status: z.string().min(1).max(40), definitionId: z.uuid() })
        .passthrough()
        .parse(value),
  });
  revalidatePath('/game-content/avatars');
  revalidatePath('/game-content/avatars/catalog');
}

const settingsUpdateSchema = z
  .object({
    expectedRevision: z.coerce.number().int().positive(),
    customizationEnabled: z.boolean(),
    creatorRequiredForNewPlayers: z.boolean(),
    maintenanceMode: z.boolean(),
    maximumAccessories: z.coerce.number().int().min(0).max(4),
    fallbackPresetKey: stableKeyInputSchema,
  })
  .strict();

export async function updateAvatarSettingsAction(formData: FormData) {
  await requireAuthorizedAdmin('avatar_content.settings.edit');
  const parsed = settingsUpdateSchema.parse({
    expectedRevision: formData.get('expectedRevision'),
    customizationEnabled: formData.get('customizationEnabled') === 'on',
    creatorRequiredForNewPlayers: formData.get('creatorRequiredForNewPlayers') === 'on',
    maintenanceMode: formData.get('maintenanceMode') === 'on',
    maximumAccessories: formData.get('maximumAccessories'),
    fallbackPresetKey: formData.get('fallbackPresetKey'),
  });
  const requestId = crypto.randomUUID();
  await callTrustedAdminApi({
    method: 'PATCH',
    pathname: '/api/v1/admin/avatar-content/settings',
    requestId,
    body: { ...parsed, requestId },
    parser: (value) =>
      z
        .object({ status: z.string().min(1).max(40) })
        .passthrough()
        .parse(value),
  });
  revalidatePath('/game-content/avatars/settings');
}

const presetPublicationSchema = z
  .object({
    presetId: z.uuid(),
    expectedRevision: z.coerce.number().int().positive(),
    reason: lifecycleReasonSchema,
  })
  .strict();

export async function publishAvatarPresetAction(formData: FormData) {
  await requireAuthorizedAdmin('avatar_content.activate');
  const parsed = presetPublicationSchema.parse({
    presetId: formData.get('presetId'),
    expectedRevision: formData.get('expectedRevision'),
    reason: formData.get('reason'),
  });
  const requestId = crypto.randomUUID();
  await callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/avatar-content/presets/${parsed.presetId}/publish`,
    requestId,
    body: { ...parsed, requestId },
    parser: (value) =>
      z
        .object({ status: z.string().min(1).max(40) })
        .passthrough()
        .parse(value),
  });
  revalidatePath('/game-content/avatars/presets');
}
