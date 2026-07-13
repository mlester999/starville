'use server';

import { ADMIN_PLAYER_ACTION_PERMISSIONS } from '@starville/admin-auth';
import { revalidatePath } from 'next/cache';

import { AdminApiError } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import { performAdminPlayerAction, type AdminPlayerAction } from '../../lib/player-operations/api';

export interface PlayerOperationActionState {
  readonly outcome: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly revokedSessionCount?: number;
}

const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readString(formData: FormData, field: string, maximumLength: number): string | undefined {
  const value = formData.get(field);
  if (typeof value !== 'string' || value.length > maximumLength) return undefined;
  return value.trim();
}

function readAction(value: string | undefined): AdminPlayerAction | undefined {
  return value !== undefined && value in ADMIN_PLAYER_ACTION_PERMISSIONS
    ? (value as AdminPlayerAction)
    : undefined;
}

function containsUnsafeReasonCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || character === '<' || character === '>';
  });
}

function apiMessage(error: AdminApiError): string {
  if (error.status === 403) return 'Your current administrator role cannot perform this action.';
  if (error.code === 'PLAYER_NAME_UNAVAILABLE')
    return 'That display name is already in use or reserved.';
  if (error.code === 'PLAYER_NAME_UNCHANGED')
    return 'Choose a display name different from the current name.';
  if (error.status === 409) return 'The player state changed. Close this dialog and reload.';
  if (error.status === 429) return 'Too many player actions were attempted. Wait briefly.';
  if (error.status === 404) return 'The player record no longer exists.';
  return 'The trusted player operation is temporarily unavailable.';
}

export async function playerOperationAction(
  _previousState: PlayerOperationActionState,
  formData: FormData,
): Promise<PlayerOperationActionState> {
  const action = readAction(readString(formData, 'action', 32));
  if (action === undefined) return { outcome: 'error', message: 'The action is invalid.' };
  await requireAuthorizedAdmin(ADMIN_PLAYER_ACTION_PERMISSIONS[action]);

  const playerId = readString(formData, 'playerId', 64);
  const requestId = readString(formData, 'requestId', 64);
  const expectedVersion = Number(readString(formData, 'expectedVersion', 16));
  const reason = readString(formData, 'reason', 500);
  const displayName = readString(formData, 'displayName', 64);
  const typedConfirmation = readString(formData, 'typedConfirmation', 32);
  const requiredConfirmation =
    action === 'suspend' ? 'SUSPEND' : action === 'revoke-sessions' ? 'REVOKE' : undefined;
  if (
    playerId === undefined ||
    !PLAYER_ID_PATTERN.test(playerId) ||
    requestId === undefined ||
    !PLAYER_ID_PATTERN.test(requestId) ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    reason === undefined ||
    reason.length < 12 ||
    containsUnsafeReasonCharacters(reason) ||
    formData.get('confirmed') !== 'yes' ||
    (action === 'rename' && displayName === undefined) ||
    (requiredConfirmation !== undefined && typedConfirmation !== requiredConfirmation)
  ) {
    return {
      outcome: 'error',
      message: 'Confirm the action and provide a clear reason of at least 12 characters.',
    };
  }

  try {
    const input =
      action === 'rename' && displayName !== undefined
        ? { expectedVersion, reason, displayName }
        : { expectedVersion, reason };
    const result = await performAdminPlayerAction(playerId, action, input, requestId);
    revalidatePath(`/players/${playerId}`);
    revalidatePath('/players');
    revalidatePath('/operations');
    const completed = {
      outcome: 'success',
      message: result.replayed
        ? 'This request was already completed safely.'
        : 'The player operation completed and was added to the audit trail.',
    } as const;
    return result.replayed
      ? completed
      : { ...completed, revokedSessionCount: result.revokedSessionCount };
  } catch (error) {
    return {
      outcome: 'error',
      message:
        error instanceof AdminApiError ? apiMessage(error) : 'The operation did not complete.',
    };
  }
}
