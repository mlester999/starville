'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AdminApiError } from '../../lib/admin-api';
import { applyAssetVersionOperation, saveAssetVersionDraft } from '../../lib/world-assets/api';
import {
  requireAssetManagerPermission,
  type AssetManagerPermission,
} from '../../lib/world-assets/authorization';
import { assetDraftConfigurationSchema } from '../../lib/world-assets/contracts';

export interface WorldAssetActionState {
  readonly outcome: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly editVersion?: number;
  readonly lifecycleStatus?: string;
  readonly validationStatus?: string;
}

const uuidSchema = z.uuid();
const operationSchema = z.enum([
  'validate',
  'submit-review',
  'request-changes',
  'reject',
  'approve',
  'activate',
  'deprecate',
  'archive',
]);

type AssetOperation = z.infer<typeof operationSchema>;

const OPERATION_PERMISSIONS = {
  validate: 'assets.validate',
  'submit-review': 'assets.edit',
  'request-changes': 'assets.review',
  reject: 'assets.review',
  approve: 'assets.approve',
  activate: 'assets.activate',
  deprecate: 'assets.deprecate',
  archive: 'assets.deprecate',
} as const satisfies Readonly<Record<AssetOperation, AssetManagerPermission>>;

function readString(formData: FormData, key: string, maximum: number): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.length <= maximum ? value.trim() : undefined;
}

function readUuid(formData: FormData, key: string): string | undefined {
  const parsed = uuidSchema.safeParse(readString(formData, key, 64));
  return parsed.success ? parsed.data : undefined;
}

function readPositiveInteger(formData: FormData, key: string): number | undefined {
  const value = Number(readString(formData, key, 16));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function safeReason(value: string | undefined): value is string {
  if (value === undefined || value.length < 12 || value.length > 500) return false;
  return !/[<>\p{Cc}]/u.test(value);
}

function messageForError(error: unknown): string {
  if (!(error instanceof AdminApiError)) return 'The asset operation did not complete.';
  if (error.status === 403) return 'Your current administrator role cannot perform this action.';
  if (error.status === 404) return 'This asset or version no longer exists.';
  if (error.status === 409) return 'This asset changed in another session. Reload before retrying.';
  if (error.status === 422) return 'The trusted asset validator rejected this configuration.';
  if (error.status === 429) return 'Too many asset operations were attempted. Wait briefly.';
  return 'The trusted asset service is temporarily unavailable.';
}

function revalidateAsset(assetId: string, versionId: string): void {
  revalidatePath('/world-assets');
  revalidatePath('/world-assets/review');
  revalidatePath('/world-assets/audit');
  revalidatePath(`/world-assets/${assetId}`);
  revalidatePath(`/world-assets/${assetId}/versions/${versionId}`);
}

export async function saveWorldAssetDraftAction(
  _previous: WorldAssetActionState,
  formData: FormData,
): Promise<WorldAssetActionState> {
  await requireAssetManagerPermission('assets.edit');
  const assetId = readUuid(formData, 'assetId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedRevision = readPositiveInteger(formData, 'expectedRevision');
  const serialized = readString(formData, 'configuration', 32_768);
  if (
    assetId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    expectedRevision === undefined ||
    serialized === undefined ||
    formData.get('confirmed') !== 'yes'
  ) {
    return { outcome: 'error', message: 'The asset draft request is incomplete.' };
  }

  let unknownConfiguration: unknown;
  try {
    unknownConfiguration = JSON.parse(serialized);
  } catch {
    return { outcome: 'error', message: 'The structured asset configuration could not be read.' };
  }
  const configuration = assetDraftConfigurationSchema.safeParse(unknownConfiguration);
  if (!configuration.success) {
    return { outcome: 'error', message: 'Fix the highlighted asset fields before saving.' };
  }

  try {
    const result = await saveAssetVersionDraft(assetId, versionId, {
      expectedRevision,
      configuration: configuration.data,
      requestId,
    });
    revalidateAsset(assetId, versionId);
    return {
      outcome: 'success',
      message: 'Asset version draft saved. Approved versions were not changed.',
      ...(result.version === null
        ? {}
        : {
            editVersion: result.version.editVersion,
            lifecycleStatus: result.version.lifecycleStatus,
            validationStatus: result.version.validationStatus,
          }),
    };
  } catch (error) {
    return { outcome: 'error', message: messageForError(error) };
  }
}

export async function worldAssetOperationAction(
  _previous: WorldAssetActionState,
  formData: FormData,
): Promise<WorldAssetActionState> {
  const operation = operationSchema.safeParse(readString(formData, 'operation', 32));
  if (!operation.success) return { outcome: 'error', message: 'Unknown asset operation.' };
  await requireAssetManagerPermission(OPERATION_PERMISSIONS[operation.data]);
  if (operation.data === 'approve') {
    await requireAssetManagerPermission('assets.review');
  }

  const assetId = readUuid(formData, 'assetId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedRevision = readPositiveInteger(formData, 'expectedRevision');
  const expectedAssetRevision = readPositiveInteger(formData, 'expectedAssetRevision');
  const reason = readString(formData, 'reason', 500);
  const confirmation = readString(formData, 'typedConfirmation', 40);
  const requiresReason = operation.data !== 'validate';
  if (
    assetId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    expectedRevision === undefined ||
    (requiresReason && !safeReason(reason)) ||
    (['activate', 'deprecate', 'archive'].includes(operation.data) &&
      expectedAssetRevision === undefined) ||
    (operation.data === 'activate' && confirmation !== 'ACTIVATE ASSET') ||
    formData.get('confirmed') !== 'yes'
  ) {
    return {
      outcome: 'error',
      message:
        operation.data === 'activate'
          ? 'Provide a reason and type ACTIVATE ASSET exactly.'
          : requiresReason
            ? 'Provide a clear reason of at least 12 characters.'
            : 'The validation request is incomplete.',
    };
  }

  const endpointOperation = ['request-changes', 'reject', 'approve'].includes(operation.data)
    ? 'review'
    : operation.data;
  const decision =
    operation.data === 'request-changes'
      ? 'request_changes'
      : operation.data === 'reject' || operation.data === 'approve'
        ? operation.data
        : undefined;

  try {
    const mutationBody =
      operation.data === 'validate'
        ? { expectedEditVersion: expectedRevision, idempotencyKey: requestId }
        : operation.data === 'deprecate' || operation.data === 'archive'
          ? {
              expectedAssetRevision,
              reason,
              idempotencyKey: requestId,
              confirmed: true,
            }
          : {
              expectedEditVersion: expectedRevision,
              idempotencyKey: requestId,
              confirmed: true,
              ...(reason === undefined ? {} : { reason }),
              ...(decision === undefined ? {} : { action: decision }),
              ...(operation.data === 'activate'
                ? {
                    expectedAssetRevision,
                    typedConfirmation: confirmation,
                  }
                : {}),
            };
    const result = await applyAssetVersionOperation(
      assetId,
      versionId,
      endpointOperation as
        'validate' | 'submit-review' | 'review' | 'activate' | 'deprecate' | 'archive',
      mutationBody,
    );
    revalidateAsset(assetId, versionId);
    return {
      outcome: 'success',
      message: `Asset operation completed: ${result.status.replaceAll('_', ' ')}.`,
      ...(result.version === null
        ? {}
        : {
            editVersion: result.version.editVersion,
            lifecycleStatus: result.version.lifecycleStatus,
            validationStatus: result.version.validationStatus,
          }),
    };
  } catch (error) {
    return { outcome: 'error', message: messageForError(error) };
  }
}
