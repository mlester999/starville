'use server';

import { announcementMutationSchema } from '@starville/live-operations';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { AdminApiError } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  changeAnnouncementStatus,
  saveAnnouncement,
  updateMaintenance,
} from '../../lib/live-operations/api';
import {
  parseMaintenanceFormData,
  type MaintenanceActionState,
} from '../../lib/live-operations/maintenance-form';

const uuid = z.uuid();
const text = (data: FormData, key: string) =>
  typeof data.get(key) === 'string' ? String(data.get(key)).trim() : '';
const nullable = (value: string) => (value === '' ? null : value);
const iso = (value: string) => {
  if (value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
};

function maintenanceApiMessage(error: AdminApiError): string {
  if (error.status === 403) {
    return 'Your current administrator role cannot manage live operations.';
  }
  if (error.status === 409 || error.code === 'LIVE_OPERATIONS_VERSION_CONFLICT') {
    return 'Maintenance configuration changed. Refresh and review the latest state.';
  }
  if (error.status === 422) {
    return 'The maintenance change could not be validated by the trusted service.';
  }
  if (error.status === 429) {
    return 'Too many live-operations requests were made. Wait briefly and try again.';
  }
  return 'The trusted live-operations service is temporarily unavailable.';
}

export async function updateMaintenanceAction(
  _previousState: MaintenanceActionState,
  data: FormData,
): Promise<MaintenanceActionState> {
  // Redirects for unauthorized callers (do not catch — Next.js redirect throws).
  await requireAuthorizedAdmin('live_operations.manage');

  const parsed = parseMaintenanceFormData(data);
  if (!parsed.success) {
    return {
      outcome: 'error',
      message: parsed.message,
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    await updateMaintenance(parsed.data, parsed.requestId);
  } catch (error) {
    return {
      outcome: 'error',
      message:
        error instanceof AdminApiError
          ? maintenanceApiMessage(error)
          : 'The trusted service could not save this change. Wait a moment and try again.',
      fieldErrors:
        error instanceof AdminApiError && error.status === 409
          ? {
              expectedRevision:
                'Someone else updated maintenance. Refresh the page, then review and submit again.',
            }
          : {},
    };
  }

  // Do not redirect() from useActionState actions — Next.js treats that throw as a render error
  // and the app error boundary incorrectly reports "Secure access unavailable".
  revalidatePath('/operations/live');
  revalidatePath('/operations');
  return {
    outcome: 'success',
    message: parsed.data.enabled
      ? parsed.data.scheduledStartAt === null
        ? 'Maintenance is now active. New player entry is blocked until an authorized administrator disables it.'
        : 'Maintenance is scheduled. The game remains playable until the configured start time.'
      : 'Maintenance is disabled. Normal token, session, suspension, and rename checks still apply.',
    notice: parsed.data.enabled
      ? parsed.data.scheduledStartAt === null
        ? 'maintenance-enabled'
        : 'maintenance-scheduled'
      : 'maintenance-disabled',
  };
}

export async function saveAnnouncementAction(data: FormData): Promise<never> {
  await requireAuthorizedAdmin('announcements.manage');
  const parsed = announcementMutationSchema.safeParse({
    ...(text(data, 'id') === '' ? {} : { id: text(data, 'id') }),
    expectedRevision: Number(text(data, 'expectedRevision')),
    internalTitle: text(data, 'internalTitle'),
    message: text(data, 'message'),
    severity: text(data, 'severity'),
    presentation: text(data, 'presentation'),
    priority: Number(text(data, 'priority')),
    startsAt: iso(text(data, 'startsAt')),
    endsAt: iso(text(data, 'endsAt')),
    dismissible: data.get('dismissible') === 'on',
    ctaLabel: nullable(text(data, 'ctaLabel')),
    ctaUrl: nullable(text(data, 'ctaUrl')),
    reason: text(data, 'reason'),
  });
  const requestId = uuid.safeParse(text(data, 'requestId'));
  if (!parsed.success || !requestId.success)
    redirect('/operations/live?notice=invalid-announcement');
  await saveAnnouncement(parsed.data, requestId.data);
  revalidatePath('/operations/live');
  redirect('/operations/live?notice=announcement-saved');
}

export async function announcementStatusAction(data: FormData): Promise<never> {
  await requireAuthorizedAdmin('announcements.manage');
  const id = uuid.safeParse(text(data, 'id'));
  const requestId = uuid.safeParse(text(data, 'requestId'));
  const action = z.enum(['publish', 'deactivate', 'archive']).safeParse(text(data, 'action'));
  const reason = text(data, 'reason');
  const expectedRevision = Number(text(data, 'expectedRevision'));
  if (
    !id.success ||
    !requestId.success ||
    !action.success ||
    reason.length < 12 ||
    !Number.isInteger(expectedRevision)
  )
    redirect('/operations/live?notice=invalid-status');
  await changeAnnouncementStatus(
    id.data,
    action.data,
    { expectedRevision, reason },
    requestId.data,
  );
  revalidatePath('/operations/live');
  redirect('/operations/live?notice=announcement-updated');
}
