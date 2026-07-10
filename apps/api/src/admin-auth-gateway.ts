import { adminAuthorizationResultSchema, readAuthenticationMethods } from '@starville/admin-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  AdminAuthGateway,
  AdminAuthorizationDenialReason,
  VerifiedSupabaseIdentity,
} from './contracts.js';

const uuidSchema = z.uuid();

function assertRpcSucceeded(error: unknown, operation: string): void {
  if (error !== null) {
    throw new Error(`Trusted administrator ${operation} failed`);
  }
}

export function createSupabaseAdminAuthGateway(client: SupabaseClient): AdminAuthGateway {
  return {
    async verifyBearer(accessToken) {
      const claimsResult = await client.auth.getClaims(accessToken);

      if (claimsResult.error || claimsResult.data === null) {
        return undefined;
      }

      const userResult = await client.auth.getUser(accessToken);
      const claims = claimsResult.data.claims as Readonly<Record<string, unknown>>;
      const userId = uuidSchema.safeParse(claims['sub']);
      const sessionId = uuidSchema.safeParse(claims['session_id']);

      if (
        userResult.error ||
        !userId.success ||
        !sessionId.success ||
        userResult.data.user.id !== userId.data
      ) {
        return undefined;
      }

      return {
        userId: userId.data,
        authSessionId: sessionId.data,
        assuranceLevel: claims['aal'] === 'aal2' ? 'aal2' : 'aal1',
        authenticationMethods: readAuthenticationMethods(claims['amr']),
      };
    },

    async loadAuthorization(identity) {
      const { data, error } = await client.rpc('get_admin_authorization_for_verified_session', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_assurance_level: identity.assuranceLevel,
      });
      assertRpcSucceeded(error, 'authorization lookup');
      return adminAuthorizationResultSchema.parse(data);
    },

    async createSession(identity, expiresAt, requestId) {
      const { data, error } = await client.rpc('create_admin_session', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_expires_at: expiresAt.toISOString(),
        p_assurance_level: identity.assuranceLevel,
        p_request_id: requestId,
      });
      assertRpcSucceeded(error, 'session creation');
      return adminAuthorizationResultSchema.parse(data);
    },

    async revokeCurrentSession(identity, requestId) {
      const { data, error } = await client.rpc('revoke_current_admin_session', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_request_id: requestId,
        p_reason: 'logout',
      });
      assertRpcSucceeded(error, 'session revocation');
      return z.boolean().parse(data);
    },

    async recordDenial(
      identity: VerifiedSupabaseIdentity,
      requestId: string,
      reason: AdminAuthorizationDenialReason,
    ) {
      const { error } = await client.rpc('record_admin_authorization_denial', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_request_id: requestId,
        p_reason_code: reason,
      });
      assertRpcSucceeded(error, 'denial audit');
    },
  };
}
