'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { adminChatReportActionSchema } from '@starville/realtime';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import { performChatModerationAction } from '../../lib/realtime/chat-api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function chatModerationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('multiplayer_chat.moderate');
  const reportId = field(formData, 'reportId');
  const action = field(formData, 'action');
  const reason = field(formData, 'reason');
  const expectedRevision = Number(field(formData, 'expectedRevision'));
  const muteValue = field(formData, 'muteDurationMinutes');
  if (!UUID_PATTERN.test(reportId)) redirect('/operations/chat?notice=invalid-report');
  const parsed = adminChatReportActionSchema.safeParse({
    action,
    reason,
    expectedRevision,
    requestId: randomUUID(),
    ...(muteValue === '' ? {} : { muteDurationMinutes: Number(muteValue) }),
  });
  if (!parsed.success) redirect(`/operations/chat/${reportId}?notice=invalid-action`);
  try {
    await performChatModerationAction(reportId, parsed.data);
  } catch {
    redirect(`/operations/chat/${reportId}?notice=action-failed`);
  }
  revalidatePath('/operations/chat');
  revalidatePath(`/operations/chat/${reportId}`);
  redirect(`/operations/chat/${reportId}?notice=action-applied`);
}
