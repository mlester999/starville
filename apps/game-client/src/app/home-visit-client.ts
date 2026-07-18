import { z } from 'zod';
import {
  admissionsRequestSchema,
  homeAppreciationRequestSchema,
  homeGuestbookWriteRequestSchema,
  homeHelperWaterRequestSchema,
  homeVisitInteractionRequestSchema,
  homeVisitInvitationRequestSchema,
  homeVisitModerationRequestSchema,
  homeVisitReportRequestSchema,
  homeVisitWorkspaceSchema,
  joinHomeVisitRequestSchema,
  leaveHomeVisitRequestSchema,
  ownerGuestbookModerationRequestSchema,
  revokeHomeVisitInvitationRequestSchema,
  sessionRevisionRequestSchema,
  startHomeVisitRequestSchema,
  updateHomeSocialSettingsRequestSchema,
  type HomeVisitWorkspace,
} from '@starville/housing';

import { PlayerRequestError, requestPlayerApi } from './player-client';

const PREFIX = '/home-visits';
const mutationResultSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => typeof value['status'] === 'string');

function parse<Data>(schema: z.ZodType<Data>, value: unknown): Data {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PlayerRequestError(502, 'INVALID_HOME_VISIT_RESPONSE');
  return parsed.data;
}
export function homeVisitIdempotencyKey(operation: string) {
  return `home-visit-${operation}-${crypto.randomUUID()}`;
}
export async function loadHomeVisits(apiUrl: string): Promise<HomeVisitWorkspace> {
  return parse(homeVisitWorkspaceSchema, await requestPlayerApi(apiUrl, PREFIX, { method: 'GET' }));
}
export async function loadHomeVisitGameTest(apiUrl: string): Promise<HomeVisitWorkspace> {
  return parse(
    homeVisitWorkspaceSchema,
    await requestPlayerApi(apiUrl, `${PREFIX}/game-test`, { method: 'GET' }),
  );
}
async function mutation(
  apiUrl: string,
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' = 'POST',
) {
  return parse(
    mutationResultSchema,
    await requestPlayerApi(apiUrl, `${PREFIX}${path}`, { method, body }),
  );
}
export const updateHomeVisitSettings = (
  apiUrl: string,
  body: z.input<typeof updateHomeSocialSettingsRequestSchema>,
) => mutation(apiUrl, '/settings', updateHomeSocialSettingsRequestSchema.parse(body), 'PATCH');
export const startHomeVisit = (apiUrl: string, body: z.input<typeof startHomeVisitRequestSchema>) =>
  mutation(apiUrl, '/sessions', startHomeVisitRequestSchema.parse(body));
export const setHomeVisitAdmissions = (
  apiUrl: string,
  body: z.input<typeof admissionsRequestSchema>,
) => mutation(apiUrl, '/sessions/admissions', admissionsRequestSchema.parse(body), 'PATCH');
export const stopHomeVisit = (apiUrl: string, body: z.input<typeof sessionRevisionRequestSchema>) =>
  mutation(apiUrl, '/sessions/stop', sessionRevisionRequestSchema.parse(body));
export const createHomeVisitInvitation = (
  apiUrl: string,
  body: z.input<typeof homeVisitInvitationRequestSchema>,
) => mutation(apiUrl, '/invitations', homeVisitInvitationRequestSchema.parse(body));
export const revokeHomeVisitInvitation = (
  apiUrl: string,
  body: z.input<typeof revokeHomeVisitInvitationRequestSchema>,
) => mutation(apiUrl, '/invitations/revoke', revokeHomeVisitInvitationRequestSchema.parse(body));
export const joinHomeVisit = (apiUrl: string, body: z.input<typeof joinHomeVisitRequestSchema>) =>
  mutation(apiUrl, '/join', joinHomeVisitRequestSchema.parse(body));
export const leaveHomeVisit = (apiUrl: string, body: z.input<typeof leaveHomeVisitRequestSchema>) =>
  mutation(apiUrl, '/leave', leaveHomeVisitRequestSchema.parse(body));
export const performHomeVisitInteraction = (
  apiUrl: string,
  body: z.input<typeof homeVisitInteractionRequestSchema>,
) => mutation(apiUrl, '/interactions', homeVisitInteractionRequestSchema.parse(body));
export const writeHomeGuestbook = (
  apiUrl: string,
  body: z.input<typeof homeGuestbookWriteRequestSchema>,
) => mutation(apiUrl, '/guestbook', homeGuestbookWriteRequestSchema.parse(body));
export const appreciateHome = (
  apiUrl: string,
  body: z.input<typeof homeAppreciationRequestSchema>,
) => mutation(apiUrl, '/appreciation', homeAppreciationRequestSchema.parse(body));
export const helpWaterHomeCrop = (
  apiUrl: string,
  body: z.input<typeof homeHelperWaterRequestSchema>,
) => mutation(apiUrl, '/helpers/water', homeHelperWaterRequestSchema.parse(body));
export const moderateHomeVisitor = (
  apiUrl: string,
  body: z.input<typeof homeVisitModerationRequestSchema>,
) => mutation(apiUrl, '/moderation', homeVisitModerationRequestSchema.parse(body));
export const reportHomeVisit = (
  apiUrl: string,
  body: z.input<typeof homeVisitReportRequestSchema>,
) => mutation(apiUrl, '/reports', homeVisitReportRequestSchema.parse(body));
export const moderateHomeGuestbook = (
  apiUrl: string,
  body: z.input<typeof ownerGuestbookModerationRequestSchema>,
) => mutation(apiUrl, '/guestbook/moderation', ownerGuestbookModerationRequestSchema.parse(body));
