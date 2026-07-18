import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type admissionsRequestSchema,
  type homeAppreciationRequestSchema,
  type homeGuestbookWriteRequestSchema,
  type homeHelperWaterRequestSchema,
  homeVisitGameTestFixture,
  type homeVisitInteractionRequestSchema,
  type homeVisitInvitationRequestSchema,
  type homeVisitModerationRequestSchema,
  type homeVisitReportRequestSchema,
  homeVisitWorkspaceSchema,
  type joinHomeVisitRequestSchema,
  type leaveHomeVisitRequestSchema,
  type ownerGuestbookModerationRequestSchema,
  type revokeHomeVisitInvitationRequestSchema,
  type sessionRevisionRequestSchema,
  type startHomeVisitRequestSchema,
  type updateHomeSocialSettingsRequestSchema,
  type HomeVisitWorkspace,
} from '@starville/housing';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const homeVisitPersistenceStatusSchema = z.enum([
  'home_visit_not_found',
  'home_visit_disabled',
  'home_visit_not_hosting',
  'home_visit_owner_absent',
  'home_visit_private',
  'home_visit_friend_required',
  'home_visit_invitation_required',
  'home_visit_invitation_invalid',
  'home_visit_invitation_disabled',
  'home_visit_blocked',
  'home_visit_full',
  'home_visit_already_joined',
  'home_visit_permission_denied',
  'home_visit_interaction_disabled',
  'home_visit_helpers_disabled',
  'home_visit_session_closing',
  'home_visit_decoration_conflict',
  'home_visit_conflict',
  'home_visitor_not_found',
  'home_seat_not_found',
  'home_seat_occupied',
  'home_photo_area_not_found',
  'home_photo_area_full',
  'home_guestbook_disabled',
  'home_guestbook_rate_limited',
  'home_guestbook_message_invalid',
  'home_appreciation_disabled',
  'home_appreciation_rate_limited',
  'home_helper_action_not_allowed',
  'home_helper_limit_reached',
  'home_helper_target_invalid',
  'home_helper_too_far',
  'home_helper_state_conflict',
  'crop_not_waterable',
  'home_visit_target_invalid',
  'home_visit_policy_not_found',
  'home_visit_policy_transition_invalid',
  'request_already_processed',
  'rate_limited',
]);
export type HomeVisitPersistenceStatus = z.infer<typeof homeVisitPersistenceStatusSchema>;

export const adminHomeVisitQuerySchema = z
  .object({
    search: z.string().trim().max(128).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const adminHomeVisitPolicySuccessorSchema = z
  .object({
    baseVersionId: z.uuid(),
    expectedConfigurationRevision: z.number().int().positive(),
    configuration: z
      .object({
        maximumVisitors: z.number().int().min(1).max(10).optional(),
        ownerDisconnectGraceSeconds: z.number().int().min(15).max(300).optional(),
        visitorReconnectGraceSeconds: z.number().int().min(10).max(120).optional(),
        invitationExpirySeconds: z.number().int().min(300).max(86_400).optional(),
        guestbookCooldownSeconds: z.number().int().min(60).max(86_400).optional(),
        guestbookDailyLimit: z.number().int().min(1).max(20).optional(),
        visitsEnabled: z.boolean().optional(),
        publicDiscoveryEnabled: z.boolean().optional(),
        invitationsEnabled: z.boolean().optional(),
        admissionsEnabled: z.boolean().optional(),
        socialInteractionsEnabled: z.boolean().optional(),
        guestbookWritesEnabled: z.boolean().optional(),
        appreciationEnabled: z.boolean().optional(),
        helperActionsEnabled: z.boolean().optional(),
        maintenanceMessage: z.string().trim().min(1).max(280).nullable().optional(),
      })
      .strict(),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const adminHomeVisitPolicyTransitionSchema = z
  .object({
    transition: z.enum(['validate', 'activate', 'archive']),
    expectedConfigurationRevision: z.number().int().positive(),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const adminHomeVisitSessionCloseSchema = z
  .object({
    expectedConfigurationRevision: z.number().int().positive(),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const adminHomeGuestbookModerationSchema = z
  .object({
    action: z.enum(['hide', 'restore', 'remove']),
    expectedStateVersion: z.number().int().positive(),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const adminHomeVisitReconciliationSchema = z
  .object({
    visitSessionId: z.uuid(),
    type: z.enum([
      'active_session_owner_presence',
      'visitor_count',
      'duplicate_participant',
      'stale_seat',
      'stale_invitation',
      'blocked_participant',
      'helper_evidence',
      'appreciation_uniqueness',
      'guestbook_eligibility',
      'preview_exclusion',
    ]),
    priority: z.number().int().min(1).max(100),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();
export const adminHomeVisitReportTransitionSchema = z
  .object({
    action: z.enum(['start_review', 'action', 'dismiss']),
    expectedStateVersion: z.number().int().positive(),
    reason: z.string().trim().min(20).max(500),
  })
  .strict();

export class HomeVisitPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Home visit persistence is unavailable.');
    this.name = 'HomeVisitPersistenceError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

function failure(value: unknown): HomeVisitPersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const result = homeVisitPersistenceStatusSchema.safeParse(value.status);
  return result.success ? result.data : undefined;
}

export interface HomeVisitGateway {
  workspace(
    wallet: string,
    requestId: string,
  ): Promise<HomeVisitWorkspace | HomeVisitPersistenceStatus>;
  gameTest(): HomeVisitWorkspace;
  settings(
    wallet: string,
    input: z.infer<typeof updateHomeSocialSettingsRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  start(
    wallet: string,
    input: z.infer<typeof startHomeVisitRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  admissions(
    wallet: string,
    input: z.infer<typeof admissionsRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  stop(
    wallet: string,
    input: z.infer<typeof sessionRevisionRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  invite(
    wallet: string,
    input: z.infer<typeof homeVisitInvitationRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  revokeInvitation(
    wallet: string,
    input: z.infer<typeof revokeHomeVisitInvitationRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  join(
    wallet: string,
    input: z.infer<typeof joinHomeVisitRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  leave(
    wallet: string,
    input: z.infer<typeof leaveHomeVisitRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  interact(
    wallet: string,
    input: z.infer<typeof homeVisitInteractionRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  guestbook(
    wallet: string,
    input: z.infer<typeof homeGuestbookWriteRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  appreciate(
    wallet: string,
    input: z.infer<typeof homeAppreciationRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  helpWater(
    wallet: string,
    input: z.infer<typeof homeHelperWaterRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  moderateVisitor(
    wallet: string,
    input: z.infer<typeof homeVisitModerationRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  report(
    wallet: string,
    input: z.infer<typeof homeVisitReportRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  moderateGuestbook(
    wallet: string,
    input: z.infer<typeof ownerGuestbookModerationRequestSchema>,
    requestId: string,
  ): Promise<unknown | HomeVisitPersistenceStatus>;
  adminWorkspace(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof adminHomeVisitQuerySchema>,
    requestId: string,
  ): Promise<unknown>;
  adminPolicySuccessor(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof adminHomeVisitPolicySuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminPolicyTransition(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: z.infer<typeof adminHomeVisitPolicyTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminCloseSession(
    identity: AdminDatabaseIdentity,
    sessionId: string,
    input: z.infer<typeof adminHomeVisitSessionCloseSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminModerateGuestbook(
    identity: AdminDatabaseIdentity,
    entryId: string,
    input: z.infer<typeof adminHomeGuestbookModerationSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminTransitionReport(
    identity: AdminDatabaseIdentity,
    reportId: string,
    input: z.infer<typeof adminHomeVisitReportTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  adminReconcile(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof adminHomeVisitReconciliationSchema>,
    requestId: string,
  ): Promise<unknown>;
}

export function createSupabaseHomeVisitGateway(client: SupabaseClient): HomeVisitGateway {
  async function rpc(operation: string, parameters: Record<string, unknown>) {
    const { data, error } = await client.rpc(operation, parameters);
    if (error !== null) throw new HomeVisitPersistenceError(operation);
    return data;
  }
  async function result(operation: string, parameters: Record<string, unknown>) {
    const value = await rpc(operation, parameters);
    return failure(value) ?? value;
  }
  return {
    async workspace(wallet, requestId) {
      const value = await rpc('get_player_home_visit_workspace', {
        p_wallet_address: wallet,
        p_request_id: requestId,
      });
      const failed = failure(value);
      if (failed !== undefined) return failed;
      return homeVisitWorkspaceSchema.parse(
        z
          .object({ status: z.literal('loaded'), workspace: homeVisitWorkspaceSchema })
          .strict()
          .parse(value).workspace,
      );
    },
    gameTest: () => homeVisitGameTestFixture,
    settings: (wallet, input, requestId) =>
      result('update_player_home_social_settings', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_visibility: input.visibility,
        p_interaction_mode: input.interactionMode,
        p_public_discovery_enabled: input.publicDiscoveryEnabled,
        p_friend_invitations_enabled: input.friendInvitationsEnabled,
        p_party_invitations_enabled: input.partyInvitationsEnabled,
        p_guestbook_enabled: input.guestbookEnabled,
        p_appreciation_enabled: input.appreciationEnabled,
        p_helper_actions_enabled: input.helperActionsEnabled,
        p_join_notifications_enabled: input.joinNotificationsEnabled,
        p_leave_notifications_enabled: input.leaveNotificationsEnabled,
        p_default_visitor_muted: input.defaultVisitorMuted,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    start: (wallet, input, requestId) =>
      result('start_player_home_visit_session', {
        p_wallet_address: wallet,
        p_home_id: input.homeId,
        p_expected_settings_revision: input.expectedSettingsRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    admissions: (wallet, input, requestId) =>
      result('set_player_home_visit_admissions', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_open: input.open,
        p_expected_session_revision: input.expectedSessionRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    stop: (wallet, input, requestId) =>
      result('stop_player_home_visit_session', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_expected_session_revision: input.expectedSessionRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    invite: (wallet, input, requestId) =>
      result('create_player_home_visit_invitation', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_invitee_player_profile_id: input.inviteePlayerProfileId,
        p_invitation_type: input.invitationType,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    revokeInvitation: (wallet, input, requestId) =>
      result('revoke_player_home_visit_invitation', {
        p_wallet_address: wallet,
        p_invitation_id: input.invitationId,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    join: (wallet, input, requestId) =>
      result('join_player_home_visit', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_invitation_id: input.invitationId,
        p_expected_session_revision: input.expectedSessionRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    leave: (wallet, input, requestId) =>
      result('leave_player_home_visit', {
        p_wallet_address: wallet,
        p_participant_id: input.participantId,
        p_expected_participant_revision: input.expectedParticipantRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    interact: (wallet, input, requestId) =>
      result('perform_player_home_visit_interaction', {
        p_wallet_address: wallet,
        p_participant_id: input.participantId,
        p_action: input.action,
        p_target_id: input.targetId,
        p_interaction_key: input.interactionKey,
        p_expected_participant_revision: input.expectedParticipantRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    guestbook: (wallet, input, requestId) =>
      result('write_player_home_guestbook_entry', {
        p_wallet_address: wallet,
        p_participant_id: input.participantId,
        p_message: input.message,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    appreciate: (wallet, input, requestId) =>
      result('change_player_home_appreciation', {
        p_wallet_address: wallet,
        p_participant_id: input.participantId,
        p_reaction_key: input.reaction,
        p_expected_state_version: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    helpWater: (wallet, input, requestId) =>
      result('help_water_player_home_crop', {
        p_wallet_address: wallet,
        p_participant_id: input.participantId,
        p_crop_instance_id: input.cropInstanceId,
        p_expected_crop_state_version: input.expectedCropStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    moderateVisitor: (wallet, input, requestId) =>
      result('moderate_player_home_visitor', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_target_participant_id: input.visitorParticipantId,
        p_action: input.action,
        p_reason: input.reason,
        p_expected_session_revision: input.expectedSessionRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    report: (wallet, input, requestId) =>
      result('report_player_home_visit', {
        p_wallet_address: wallet,
        p_visit_session_id: input.visitSessionId,
        p_reported_participant_id: input.reportedParticipantId,
        p_guestbook_entry_id: input.guestbookEntryId,
        p_category: input.category,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    moderateGuestbook: (wallet, input, requestId) =>
      result('moderate_player_home_guestbook_entry', {
        p_wallet_address: wallet,
        p_entry_id: input.guestbookEntryId,
        p_action: input.action === 'hide' ? 'owner_hide' : 'owner_restore',
        p_reason: input.reason,
        p_expected_state_version: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      }),
    adminWorkspace: (identity, input, requestId) =>
      rpc('get_admin_home_visit_workspace', {
        ...identityParameters(identity),
        p_search: input.search,
        p_limit: input.limit,
        p_offset: input.offset,
        p_request_id: requestId,
      }),
    adminPolicySuccessor: (identity, input, requestId) =>
      rpc('create_admin_home_visit_policy_successor', {
        ...identityParameters(identity),
        p_base_version_id: input.baseVersionId,
        p_configuration: input.configuration,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminPolicyTransition: (identity, versionId, input, requestId) =>
      rpc('transition_admin_home_visit_policy', {
        ...identityParameters(identity),
        p_version_id: versionId,
        p_transition: input.transition,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminCloseSession: (identity, sessionId, input, requestId) =>
      rpc('close_admin_home_visit_session', {
        ...identityParameters(identity),
        p_visit_session_id: sessionId,
        p_expected_configuration_revision: input.expectedConfigurationRevision,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminModerateGuestbook: (identity, entryId, input, requestId) =>
      rpc('moderate_admin_home_guestbook_entry', {
        ...identityParameters(identity),
        p_entry_id: entryId,
        p_action: input.action,
        p_expected_state_version: input.expectedStateVersion,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminTransitionReport: (identity, reportId, input, requestId) =>
      rpc('transition_admin_home_visit_report', {
        ...identityParameters(identity),
        p_report_id: reportId,
        p_action: input.action,
        p_expected_state_version: input.expectedStateVersion,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
    adminReconcile: (identity, input, requestId) =>
      rpc('request_admin_home_visit_reconciliation', {
        ...identityParameters(identity),
        p_visit_session_id: input.visitSessionId,
        p_reconciliation_type: input.type,
        p_priority: input.priority,
        p_reason: input.reason,
        p_request_id: requestId,
      }),
  };
}
