'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AdminApiError } from '../../lib/admin-api';
import {
  applyAssetVersionOperation,
  createAssetVersionFromExisting,
  loadAssetVersionDetail,
  restoreAssetBundledDefault,
  saveAssetVersionDraft,
} from '../../lib/world-assets/api';
import {
  requireAssetManagerPermission,
  type AssetManagerPermission,
} from '../../lib/world-assets/authorization';
import { assetDraftConfigurationSchema } from '../../lib/world-assets/contracts';
import { parseBundledDefaultRestoreForm } from '../../lib/world-assets/bundled-restore';

export interface WorldAssetActionState {
  readonly outcome: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly errorKind?:
    | 'validation'
    | 'revision_conflict'
    | 'actual_concurrent_change'
    | 'same_session_stale'
    | 'stale_revision'
    | 'already_approved'
    | 'request_conflict'
    | 'permission'
    | 'temporary'
    | 'incomplete';
  readonly requestId?: string;
  readonly savedAt?: string;
  readonly editVersion?: number;
  readonly lifecycleStatus?: string;
  readonly validationStatus?: string;
  readonly createdVersionId?: string;
  readonly createdVersionNumber?: number;
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
  if (error.status === 409) return 'The current asset state must be refreshed before retrying.';
  if (error.status === 422) return 'The trusted asset validator rejected this configuration.';
  if (error.status === 429) return 'Too many asset operations were attempted. Wait briefly.';
  return 'The trusted asset service is temporarily unavailable.';
}

async function classifyOperationFailure(input: {
  readonly error: unknown;
  readonly operation: AssetOperation;
  readonly assetId: string;
  readonly versionId: string;
  readonly expectedRevision: number;
  readonly administratorUserId: string;
  readonly requestId: string;
}): Promise<Pick<WorldAssetActionState, 'errorKind' | 'message'>> {
  if (!(input.error instanceof AdminApiError)) {
    return {
      errorKind: 'temporary',
      message:
        'The operation could not be confirmed. The lifecycle state is unchanged or requires refresh.',
    };
  }
  if (input.error.code === 'ASSET_REQUEST_CONFLICT') {
    return {
      errorKind: 'request_conflict',
      message:
        'This request identifier was previously used for different asset-operation intent. Start a new request.',
    };
  }
  if (input.error.status !== 409) {
    return { errorKind: errorKindForError(input.error), message: messageForError(input.error) };
  }

  try {
    const current = await loadAssetVersionDetail(input.assetId, input.versionId, input.requestId);
    if (input.operation === 'approve' && current.version.lifecycleStatus === 'approved') {
      return {
        errorKind: 'already_approved',
        message: `Version ${String(current.version.versionNumber)} is already approved. No duplicate approval was created. Continue to activation review.`,
      };
    }
    if (input.error.code === 'ASSET_VERSION_CONFLICT') {
      const latestReview = current.reviews[0];
      if (
        input.operation === 'approve' &&
        current.version.lifecycleStatus === 'in_review' &&
        current.version.editVersion === input.expectedRevision + 1 &&
        latestReview?.action === 'submitted' &&
        latestReview.administratorUserId === input.administratorUserId
      ) {
        return {
          errorKind: 'same_session_stale',
          message:
            'The previous lifecycle action completed, but this page needs the latest revision before continuing.',
        };
      }
      if (
        latestReview !== undefined &&
        latestReview.administratorUserId !== input.administratorUserId
      ) {
        return {
          errorKind: 'actual_concurrent_change',
          message:
            'This version changed after you opened the page. Review the latest state before approving.',
        };
      }
      return {
        errorKind: 'stale_revision',
        message:
          'The version revision no longer matches this operation form. Reload the latest state.',
      };
    }
  } catch {
    // Preserve a safe conflict response when the follow-up read is temporarily unavailable.
  }
  return {
    errorKind: 'stale_revision',
    message: 'The current lifecycle no longer accepts this operation. Refresh before continuing.',
  };
}

function errorKindForError(error: unknown): Exclude<WorldAssetActionState['errorKind'], undefined> {
  if (!(error instanceof AdminApiError)) return 'temporary';
  if (error.status === 403) return 'permission';
  if (error.status === 409) return 'revision_conflict';
  if (error.status === 422) return 'validation';
  return 'temporary';
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
    return {
      outcome: 'error',
      errorKind: 'incomplete',
      message: 'The asset draft request is incomplete.',
    };
  }

  let unknownConfiguration: unknown;
  try {
    unknownConfiguration = JSON.parse(serialized);
  } catch {
    return {
      outcome: 'error',
      errorKind: 'incomplete',
      message: 'The structured asset configuration could not be read.',
      requestId,
    };
  }
  const configuration = assetDraftConfigurationSchema.safeParse(unknownConfiguration);
  if (!configuration.success) {
    return {
      outcome: 'error',
      errorKind: 'validation',
      message: 'Fix the highlighted asset fields before saving.',
      requestId,
    };
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
      requestId,
      savedAt: new Date().toISOString(),
      ...(result.version === null
        ? {}
        : {
            editVersion: result.version.editVersion,
            lifecycleStatus: result.version.lifecycleStatus,
            validationStatus: result.version.validationStatus,
          }),
    };
  } catch (error) {
    return {
      outcome: 'error',
      errorKind: errorKindForError(error),
      message: messageForError(error),
      requestId,
    };
  }
}

export async function worldAssetOperationAction(
  _previous: WorldAssetActionState,
  formData: FormData,
): Promise<WorldAssetActionState> {
  const operation = operationSchema.safeParse(readString(formData, 'operation', 32));
  if (!operation.success) return { outcome: 'error', message: 'Unknown asset operation.' };
  const context = await requireAssetManagerPermission(OPERATION_PERMISSIONS[operation.data]);
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
      message:
        result.status === 'replayed'
          ? `This ${operation.data.replaceAll('-', ' ')} request was already completed.`
          : operation.data === 'approve'
            ? 'Approval confirmed. The candidate is approved but not active; world references and publication are unchanged.'
            : operation.data === 'activate'
              ? 'Activation confirmed. The canonical active pointer changed; pinned world references and publication are unchanged.'
              : `Asset operation completed: ${result.status.replaceAll('_', ' ')}.`,
      requestId,
      ...(result.version === null
        ? {}
        : {
            editVersion: result.version.editVersion,
            lifecycleStatus: result.version.lifecycleStatus,
            validationStatus: result.version.validationStatus,
          }),
    };
  } catch (error) {
    const failure = await classifyOperationFailure({
      error,
      operation: operation.data,
      assetId,
      versionId,
      expectedRevision,
      administratorUserId: context.userId,
      requestId,
    });
    return { outcome: 'error', ...failure, requestId };
  }
}

export async function createWorldAssetVersionFromExistingAction(
  _previous: WorldAssetActionState,
  formData: FormData,
): Promise<WorldAssetActionState> {
  await requireAssetManagerPermission('assets.upload');
  const assetId = readUuid(formData, 'assetId');
  const sourceVersionId = readUuid(formData, 'sourceVersionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedAssetRevision = readPositiveInteger(formData, 'expectedAssetRevision');
  const reason = readString(formData, 'reason', 500);
  const configurationMode = z
    .enum(['copy', 'defaults'])
    .safeParse(readString(formData, 'configurationMode', 16));
  if (
    assetId === undefined ||
    sourceVersionId === undefined ||
    requestId === undefined ||
    expectedAssetRevision === undefined ||
    !safeReason(reason) ||
    !configurationMode.success ||
    formData.get('confirmed') !== 'yes'
  ) {
    return {
      outcome: 'error',
      errorKind: 'incomplete',
      message: 'Choose a starting point and provide a clear reason of at least 12 characters.',
      ...(requestId === undefined ? {} : { requestId }),
    };
  }
  try {
    const result = await createAssetVersionFromExisting(assetId, {
      sourceVersionId,
      configurationMode: configurationMode.data,
      expectedAssetRevision,
      reason,
      idempotencyKey: requestId,
    });
    revalidatePath('/world-assets');
    revalidatePath('/world-assets/review');
    revalidatePath('/world-assets/audit');
    revalidatePath(`/world-assets/${assetId}`);
    if (result.version !== null) {
      revalidatePath(`/world-assets/${assetId}/versions/${result.version.id}`);
    }
    return {
      outcome: 'success',
      message: 'The successor draft was created. The source and active versions remain unchanged.',
      requestId,
      ...(result.version === null
        ? {}
        : {
            createdVersionId: result.version.id,
            createdVersionNumber: result.version.versionNumber,
          }),
    };
  } catch (error) {
    return {
      outcome: 'error',
      errorKind: errorKindForError(error),
      message: messageForError(error),
      requestId,
    };
  }
}

export async function restoreWorldAssetBundledDefaultAction(
  _previous: WorldAssetActionState,
  formData: FormData,
): Promise<WorldAssetActionState> {
  await requireAssetManagerPermission('assets.activate');
  await requireAssetManagerPermission('assets.deprecate');
  const parsed = parseBundledDefaultRestoreForm(formData);
  if (!parsed.success) {
    return {
      outcome: 'error',
      errorKind: 'incomplete',
      message:
        'Provide the current asset revision, a reason of at least 12 characters, and type RESTORE BUNDLED DEFAULT exactly.',
    };
  }

  const { assetId, ...action } = parsed.data;
  try {
    const result = await restoreAssetBundledDefault(assetId, action);
    revalidatePath('/world-assets');
    revalidatePath('/world-assets/review');
    revalidatePath('/world-assets/audit');
    revalidatePath('/world-assets/coverage');
    revalidatePath(`/world-assets/${assetId}`);
    if (result.version !== null) {
      revalidatePath(`/world-assets/${assetId}/versions/${result.version.id}`);
    }
    return {
      outcome: 'success',
      message:
        result.status === 'replayed'
          ? 'This restore request was already completed. No duplicate lifecycle transition was created.'
          : 'Bundled Default restored. The uploaded active pointer was deprecated; pinned worlds, draft pins, immutable history, and published maps were not rewritten.',
      requestId: action.idempotencyKey,
    };
  } catch (error) {
    const mfaRequired = error instanceof AdminApiError && error.code === 'MFA_REQUIRED';
    const requestConflict =
      error instanceof AdminApiError && error.code === 'ASSET_REQUEST_CONFLICT';
    const revisionConflict = error instanceof AdminApiError && error.status === 409;
    return {
      outcome: 'error',
      errorKind: requestConflict
        ? 'request_conflict'
        : revisionConflict
          ? 'revision_conflict'
          : errorKindForError(error),
      message: mfaRequired
        ? 'A current AAL2 administrator session is required. Complete multi-factor authentication, then start a new restore request.'
        : requestConflict
          ? 'This request identifier was already bound to different restore intent. Refresh before retrying.'
          : revisionConflict
            ? 'The asset revision changed before restore. Refresh and compare the current active source again.'
            : messageForError(error),
      requestId: action.idempotencyKey,
    };
  }
}
