'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  closeAdminHomeVisitSession,
  createAdminHomeVisitPolicy,
  moderateAdminHomeGuestbook,
  reconcileAdminHomeVisit,
  transitionAdminHomeVisitPolicy,
  transitionAdminHomeVisitReport,
} from '../../lib/home-visits-api';

function text(data: FormData, key: string) {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error('Invalid home-visit form.');
  return value;
}
function number(data: FormData, key: string) {
  const value = Number(text(data, key));
  if (!Number.isInteger(value)) throw new Error('Invalid home-visit revision.');
  return value;
}
function done(notice: string): never {
  redirect(`/operations/social/home-visits?notice=${encodeURIComponent(notice)}`);
}
export async function homeVisitPolicySuccessorAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.policies.manage');
  await createAdminHomeVisitPolicy(
    {
      baseVersionId: text(data, 'versionId'),
      expectedConfigurationRevision: number(data, 'expectedRevision'),
      configuration: {
        maximumVisitors: number(data, 'maximumVisitors'),
        visitsEnabled: text(data, 'visitsEnabled') === 'true',
        admissionsEnabled: text(data, 'admissionsEnabled') === 'true',
        socialInteractionsEnabled: text(data, 'socialInteractionsEnabled') === 'true',
        helperActionsEnabled: text(data, 'helperActionsEnabled') === 'true',
      },
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-visit-policy-successor-created');
}
export async function homeVisitPolicyTransitionAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.policies.manage');
  await transitionAdminHomeVisitPolicy(
    text(data, 'versionId'),
    {
      transition: text(data, 'transition'),
      expectedConfigurationRevision: number(data, 'expectedRevision'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-visit-policy-transition-complete');
}
export async function homeVisitSessionCloseAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.manage');
  await closeAdminHomeVisitSession(
    text(data, 'sessionId'),
    {
      expectedConfigurationRevision: number(data, 'expectedRevision'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-visit-session-closed');
}
export async function homeGuestbookModerationAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.guestbooks.moderate');
  await moderateAdminHomeGuestbook(
    text(data, 'entryId'),
    {
      action: text(data, 'action'),
      expectedStateVersion: number(data, 'expectedRevision'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-guestbook-moderated');
}
export async function homeVisitReconciliationAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.reconciliation.manage');
  await reconcileAdminHomeVisit(
    {
      visitSessionId: text(data, 'sessionId'),
      type: text(data, 'type'),
      priority: number(data, 'priority'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-visit-reconciliation-queued');
}
export async function homeVisitReportTransitionAction(data: FormData) {
  await requireAuthorizedAdmin('home_visits.manage');
  await transitionAdminHomeVisitReport(
    text(data, 'reportId'),
    {
      action: text(data, 'action'),
      expectedStateVersion: number(data, 'expectedRevision'),
      reason: text(data, 'reason'),
    },
    randomUUID(),
  );
  done('home-visit-report-transitioned');
}
