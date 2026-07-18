import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  adminSocialGraphAuditListSchema,
  adminSocialGraphListSchema,
  adminSocialGraphPartyDetailSchema,
  socialGraphSettingsViewSchema,
  type AdminSocialGraphAuditList,
  type AdminSocialGraphList,
  type AdminSocialGraphPartyDetail,
  type SocialGraphSettingsView,
  type UpdateSocialGraphSettingsInput,
} from '@starville/realtime';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const adminSocialGraphQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 10,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
    status: z.enum(['all', 'active', 'disbanded', 'expired']).default('all'),
    search: z.string().trim().max(80).default(''),
  })
  .strict();
export type AdminSocialGraphQuery = z.infer<typeof adminSocialGraphQuerySchema>;

export const adminSocialGraphAuditQuerySchema = adminSocialGraphQuerySchema.pick({
  page: true,
  pageSize: true,
  search: true,
});
export type AdminSocialGraphAuditQuery = z.infer<typeof adminSocialGraphAuditQuerySchema>;

export interface AdminSocialGraphGateway {
  list(
    identity: AdminDatabaseIdentity,
    query: AdminSocialGraphQuery,
  ): Promise<AdminSocialGraphList>;
  party(
    identity: AdminDatabaseIdentity,
    publicPartyId: string,
  ): Promise<AdminSocialGraphPartyDetail | undefined>;
  audit(
    identity: AdminDatabaseIdentity,
    query: AdminSocialGraphAuditQuery,
  ): Promise<AdminSocialGraphAuditList>;
  settings(identity: AdminDatabaseIdentity): Promise<SocialGraphSettingsView>;
  updateSettings(
    identity: AdminDatabaseIdentity,
    input: UpdateSocialGraphSettingsInput,
    requestId: string,
  ): Promise<SocialGraphSettingsView>;
}

export class AdminSocialGraphPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Social graph persistence is unavailable.');
    this.name = 'AdminSocialGraphPersistenceError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

async function rpc(client: SupabaseClient, operation: string, parameters: Record<string, unknown>) {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) {
    if (error.code === 'P0002') return undefined;
    throw new AdminSocialGraphPersistenceError(operation);
  }
  return data;
}

export function createSupabaseAdminSocialGraphGateway(
  client: SupabaseClient,
): AdminSocialGraphGateway {
  return {
    async list(identity, query) {
      const data = await rpc(client, 'get_admin_social_graph', {
        ...identityParameters(identity),
        p_status: query.status,
        p_search: query.search,
        p_page: query.page,
        p_page_size: query.pageSize,
      });
      return adminSocialGraphListSchema.parse(data);
    },
    async party(identity, publicPartyId) {
      const data = await rpc(client, 'get_admin_social_graph_party', {
        ...identityParameters(identity),
        p_public_party_id: publicPartyId,
      });
      return data === undefined ? undefined : adminSocialGraphPartyDetailSchema.parse(data);
    },
    async audit(identity, query) {
      const data = await rpc(client, 'get_admin_social_graph_audit', {
        ...identityParameters(identity),
        p_search: query.search,
        p_page: query.page,
        p_page_size: query.pageSize,
      });
      return adminSocialGraphAuditListSchema.parse(data);
    },
    async settings(identity) {
      return socialGraphSettingsViewSchema.parse(
        await rpc(client, 'get_admin_social_graph_settings', identityParameters(identity)),
      );
    },
    async updateSettings(identity, input, requestId) {
      return socialGraphSettingsViewSchema.parse(
        await rpc(client, 'update_admin_social_graph_settings', {
          ...identityParameters(identity),
          p_expected_version: input.expectedVersion,
          p_maximum_friends: input.maximumFriends,
          p_party_capacity: input.partyCapacity,
          p_friend_request_expiry_seconds: input.friendRequestExpirySeconds,
          p_party_invitation_expiry_seconds: input.partyInvitationExpirySeconds,
          p_ready_check_expiry_seconds: input.readyCheckExpirySeconds,
          p_leader_reconnect_grace_seconds: input.leaderReconnectGraceSeconds,
          p_party_dormant_timeout_seconds: input.partyDormantTimeoutSeconds,
          p_nearby_invitations_enabled: input.nearbyInvitationsEnabled,
          p_party_chat_enabled: input.partyChatEnabled,
          p_friend_location_visibility_enabled: input.friendLocationVisibilityEnabled,
          p_request_id: requestId,
        }),
      );
    },
  };
}
