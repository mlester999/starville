'use server';

import { MAX_MAP_MANIFEST_BYTES, mapManifestSchema } from '@starville/game-core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { AdminApiError } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import type { WorldValidationResult } from '../../lib/worlds/contracts';
import {
  createWorldDraft,
  deriveWorldVersion,
  publishWorldDraft,
  reviewWorldPublication,
  rollbackWorldRevision,
  saveWorldDraft,
  validateWorldDraft,
} from '../../lib/worlds/api';

export interface WorldActionState {
  readonly outcome: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly versionId?: string;
  readonly editVersion?: number;
  readonly checksum?: string | null;
  readonly validation?: WorldValidationResult;
}

const uuidSchema = z.uuid();
const MAX_MANIFEST_BYTES = MAX_MAP_MANIFEST_BYTES;

function readString(formData: FormData, field: string, maximumLength: number): string | undefined {
  const value = formData.get(field);
  if (typeof value !== 'string' || value.length > maximumLength) return undefined;
  return value.trim();
}

function readPositiveInteger(formData: FormData, field: string): number | undefined {
  const value = Number(readString(formData, field, 16));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function readUuid(formData: FormData, field: string): string | undefined {
  const parsed = uuidSchema.safeParse(readString(formData, field, 64));
  return parsed.success ? parsed.data : undefined;
}

function readNullableUuid(formData: FormData, field: string): string | null | undefined {
  const raw = readString(formData, field, 64);
  if (raw === '') return null;
  const parsed = uuidSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function safeReason(value: string | undefined): value is string {
  if (value === undefined || value.length < 12 || value.length > 500) return false;
  return ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || character === '<' || character === '>';
  });
}

function messageForApiError(error: AdminApiError): string {
  if (error.status === 403) return 'Your current administrator role cannot perform this action.';
  if (error.status === 404) return 'The selected world record no longer exists.';
  if (error.status === 409 || error.code === 'VERSION_CONFLICT') {
    return 'This world version changed in another session. Reload before applying more edits.';
  }
  if (error.status === 422) return 'The trusted world validator rejected this draft.';
  if (error.status === 429) return 'Too many world operations were attempted. Wait briefly.';
  return 'The trusted world-management service is temporarily unavailable.';
}

function errorState(error: unknown): WorldActionState {
  return {
    outcome: 'error',
    message:
      error instanceof AdminApiError ? messageForApiError(error) : 'The action did not complete.',
  };
}

function revalidateWorld(mapId: string): void {
  revalidatePath('/worlds');
  revalidatePath(`/worlds/${mapId}`);
  revalidatePath(`/worlds/${mapId}/editor`);
  revalidatePath(`/worlds/${mapId}/preview`);
  revalidatePath('/world-audit');
}

export async function createWorldDraftAction(formData: FormData): Promise<never> {
  await requireAuthorizedAdmin('maps.edit');
  const mapId = readUuid(formData, 'mapId');
  const requestId = readUuid(formData, 'requestId');
  const expectedRecordVersion = readPositiveInteger(formData, 'expectedRecordVersion');
  if (mapId === undefined || requestId === undefined || expectedRecordVersion === undefined) {
    redirect('/worlds?notice=invalid-draft-request');
  }

  try {
    const draft = await createWorldDraft(mapId, { expectedRecordVersion }, requestId);
    revalidateWorld(mapId);
    redirect(`/worlds/${mapId}/editor?version=${draft.version.id}`);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) {
      redirect(`/worlds/${mapId}?notice=version-conflict`);
    }
    redirect(`/worlds/${mapId}?notice=draft-unavailable`);
  }
}

export async function saveWorldDraftAction(
  _previousState: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  await requireAuthorizedAdmin('maps.edit');
  const mapId = readUuid(formData, 'mapId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedEditVersion = readPositiveInteger(formData, 'expectedEditVersion');
  const expectedChecksum = readString(formData, 'expectedChecksum', 128) || null;
  const serializedManifest = readString(formData, 'manifest', MAX_MANIFEST_BYTES);
  if (
    mapId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    expectedEditVersion === undefined ||
    serializedManifest === undefined ||
    formData.get('confirmed') !== 'yes'
  ) {
    return { outcome: 'error', message: 'The draft save request is incomplete.' };
  }

  let input: unknown;
  try {
    input = JSON.parse(serializedManifest);
  } catch {
    return { outcome: 'error', message: 'The structured editor state could not be read.' };
  }
  const manifest = mapManifestSchema.safeParse(input);
  if (!manifest.success) {
    return {
      outcome: 'error',
      message: 'Fix the highlighted manifest fields before saving this draft.',
    };
  }

  try {
    const result = await saveWorldDraft(
      mapId,
      versionId,
      {
        expectedEditVersion,
        expectedChecksum,
        manifest: manifest.data,
        confirmed: true,
      },
      requestId,
    );
    revalidateWorld(mapId);
    return {
      outcome: 'success',
      message:
        result.version.validationResult?.valid === false
          ? 'Draft saved. Trusted validation found blockers that must be corrected.'
          : 'Draft saved with optimistic version protection.',
      versionId: result.version.id,
      editVersion: result.version.editVersion,
      checksum: result.version.checksum,
      ...(result.version.validationResult === null
        ? {}
        : { validation: result.version.validationResult }),
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function validateWorldDraftAction(
  _previousState: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  await requireAuthorizedAdmin('maps.edit');
  const mapId = readUuid(formData, 'mapId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedEditVersion = readPositiveInteger(formData, 'expectedEditVersion');
  const expectedChecksum = readString(formData, 'expectedChecksum', 128) || null;
  if (
    mapId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    expectedEditVersion === undefined
  ) {
    return { outcome: 'error', message: 'Save the current draft before validation.' };
  }

  try {
    const result = await validateWorldDraft(
      mapId,
      versionId,
      { expectedEditVersion, expectedChecksum },
      requestId,
    );
    revalidateWorld(mapId);
    return {
      outcome: result.status === 'validated' ? 'success' : 'error',
      message:
        result.status === 'validated'
          ? 'The trusted validator approved this exact draft version.'
          : 'Validation found blocking issues. The draft was not published.',
      versionId: result.version.id,
      editVersion: result.version.editVersion,
      checksum: result.version.checksum,
      validation: result.validationResult,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function publishWorldDraftAction(
  _previousState: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  await requireAuthorizedAdmin('maps.publish');
  const mapId = readUuid(formData, 'mapId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const reviewRequestId = readUuid(formData, 'reviewRequestId');
  const expectedEditVersion = readPositiveInteger(formData, 'expectedEditVersion');
  const expectedActiveVersionId = readNullableUuid(formData, 'expectedActiveVersionId');
  const expectedChecksum = readString(formData, 'expectedChecksum', 128);
  const reason = readString(formData, 'reason', 500);
  if (
    mapId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    reviewRequestId === undefined ||
    expectedEditVersion === undefined ||
    expectedActiveVersionId === undefined ||
    expectedChecksum === undefined ||
    !safeReason(reason) ||
    formData.get('impactAcknowledged') !== 'yes' ||
    formData.get('confirmed') !== 'yes'
  ) {
    return {
      outcome: 'error',
      message: 'Confirm publication and provide a clear reason of at least 12 characters.',
    };
  }

  try {
    const review = await reviewWorldPublication(
      mapId,
      versionId,
      {
        expectedActiveVersionId,
        operation: 'publish',
        acknowledged: true,
      },
      reviewRequestId,
    );
    const result = await publishWorldDraft(mapId, versionId, {
      expectedEditVersion,
      expectedActiveVersionId,
      expectedChecksum,
      reviewId: review.reviewId,
      reason,
      requestId,
      confirmed: true,
    });
    revalidateWorld(mapId);
    return {
      outcome: 'success',
      message: `Version ${result.version.versionNumber} is now the immutable active publication.`,
      versionId: result.version.id,
      editVersion: result.version.editVersion,
      checksum: result.version.checksum,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function rollbackWorldVersionAction(
  _previousState: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  await requireAuthorizedAdmin('maps.rollback');
  const mapId = readUuid(formData, 'mapId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const reviewRequestId = readUuid(formData, 'reviewRequestId');
  const expectedActiveVersionId = readUuid(formData, 'expectedActiveVersionId');
  const reason = readString(formData, 'reason', 500);
  if (
    mapId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    reviewRequestId === undefined ||
    expectedActiveVersionId === undefined ||
    !safeReason(reason) ||
    formData.get('impactAcknowledged') !== 'yes' ||
    formData.get('confirmed') !== 'yes'
  ) {
    return {
      outcome: 'error',
      message: 'Acknowledge rollback impact and provide a clear reason of at least 12 characters.',
    };
  }

  try {
    const review = await reviewWorldPublication(
      mapId,
      versionId,
      {
        expectedActiveVersionId,
        operation: 'rollback',
        acknowledged: true,
      },
      reviewRequestId,
    );
    const result = await rollbackWorldRevision(
      mapId,
      versionId,
      {
        expectedActiveVersionId,
        reviewId: review.reviewId,
        reason,
        confirmed: true,
      },
      requestId,
    );
    revalidateWorld(mapId);
    return {
      outcome: 'success',
      message: `Rollback publication ${result.version.versionNumber} now serves the reviewed historical content.`,
      versionId: result.version.id,
      editVersion: result.version.editVersion,
      checksum: result.version.checksum,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function deriveWorldVersionAction(
  _previousState: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  await requireAuthorizedAdmin('maps.edit');
  const mapId = readUuid(formData, 'mapId');
  const versionId = readUuid(formData, 'versionId');
  const requestId = readUuid(formData, 'requestId');
  const expectedRecordVersion = readPositiveInteger(formData, 'expectedRecordVersion');
  const reason = readString(formData, 'reason', 500);
  if (
    mapId === undefined ||
    versionId === undefined ||
    requestId === undefined ||
    expectedRecordVersion === undefined ||
    !safeReason(reason) ||
    formData.get('confirmed') !== 'yes'
  ) {
    return {
      outcome: 'error',
      message: 'Confirm derivation and provide a clear reason of at least 12 characters.',
    };
  }

  try {
    const result = await deriveWorldVersion(
      mapId,
      versionId,
      { expectedRecordVersion, reason, confirmed: true },
      requestId,
    );
    revalidateWorld(mapId);
    return {
      outcome: 'success',
      message: `Draft version ${result.version.versionNumber} was derived without mutating history.`,
      versionId: result.version.id,
      editVersion: result.version.editVersion,
      checksum: result.version.checksum,
    };
  } catch (error) {
    return errorState(error);
  }
}
