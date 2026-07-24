import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseRealtimeAuthorizationViewSchema } from '@starville/realtime';

import type {
  SupabaseRealtimeAuthorizationPersistenceResult,
  SupabaseRealtimeGateway,
} from './supabase-contracts.js';

const authorizationResultSchema = z.discriminatedUnion('status', [
  supabaseRealtimeAuthorizationViewSchema.extend({ status: z.literal('authorized') }),
  z
    .object({
      status: z.enum([
        'auth_identity_invalid',
        'environment_mismatch',
        'access_revoked',
        'profile_required',
        'player_suspended',
        'rename_required',
        'maintenance',
        'world_unavailable',
        'channel_unavailable',
        'channel_full',
      ]),
    })
    .strict(),
]);
const playerIdentityPreparationSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('eligible'),
      email: z.email(),
    })
    .strict(),
  z
    .object({
      status: z.enum([
        'access_revoked',
        'profile_required',
        'player_suspended',
        'rename_required',
        'maintenance',
        'world_unavailable',
      ]),
    })
    .strict(),
]);
const playerIdentityBindingSchema = z
  .object({
    status: z.enum(['bound', 'auth_identity_invalid', 'auth_identity_conflict']),
  })
  .strict();

export class SupabaseRealtimePersistenceError extends Error {
  public constructor() {
    super('Supabase Realtime authorization persistence failed.');
    this.name = 'SupabaseRealtimePersistenceError';
  }
}

export function createSupabaseRealtimeAuthorizationGateway(
  client: SupabaseClient,
): SupabaseRealtimeGateway {
  return {
    async issuePlayerSession(input) {
      const preparedResult = await client.rpc('prepare_supabase_realtime_player_identity', {
        p_access_session_token_hash: input.accessSessionTokenHash,
        p_request_id: input.requestId,
      });
      if (preparedResult.error !== null) throw new SupabaseRealtimePersistenceError();
      const prepared = playerIdentityPreparationSchema.parse(preparedResult.data);
      if (prepared.status !== 'eligible') return prepared;

      const generated = await client.auth.admin.generateLink({
        type: 'magiclink',
        email: prepared.email,
        options: {
          data: {
            starville_identity: 'player',
          },
        },
      });
      if (
        generated.error !== null ||
        generated.data.user === null ||
        generated.data.properties === null
      ) {
        throw new SupabaseRealtimePersistenceError();
      }
      const boundResult = await client.rpc('bind_supabase_realtime_player_identity', {
        p_auth_user_id: generated.data.user.id,
        p_access_session_token_hash: input.accessSessionTokenHash,
        p_request_id: input.requestId,
      });
      if (boundResult.error !== null) throw new SupabaseRealtimePersistenceError();
      const bound = playerIdentityBindingSchema.parse(boundResult.data);
      if (bound.status === 'auth_identity_invalid' || bound.status === 'auth_identity_conflict') {
        return { status: bound.status };
      }
      return {
        status: 'issued',
        tokenHash: generated.data.properties.hashed_token,
        tokenType: 'magiclink',
      };
    },
    async verifyPlayerIdentity(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error !== null || data.user === null || data.user.is_anonymous === true) {
        return undefined;
      }
      return data.user.id;
    },
    async authorize(input): Promise<SupabaseRealtimeAuthorizationPersistenceResult> {
      const { data, error } = await client.rpc('authorize_supabase_realtime_player', {
        p_auth_user_id: input.authUserId,
        p_access_session_token_hash: input.accessSessionTokenHash,
        p_environment_key: input.environment,
        p_requested_channel_id: input.requestedChannelId ?? null,
        p_request_id: input.requestId,
      });
      if (error !== null) throw new SupabaseRealtimePersistenceError();
      return authorizationResultSchema.parse(data);
    },
    async close(input) {
      const { data, error } = await client.rpc('close_supabase_realtime_membership', {
        p_auth_user_id: input.authUserId,
        p_membership_id: input.membershipId,
        p_request_id: input.requestId,
      });
      if (error !== null || typeof data !== 'boolean') {
        throw new SupabaseRealtimePersistenceError();
      }
      return data;
    },
  };
}
