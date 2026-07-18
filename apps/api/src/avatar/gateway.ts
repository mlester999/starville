import type { SupabaseClient } from '@supabase/supabase-js';

import type { AvatarGateway } from './contracts.js';

export class AvatarPersistenceError extends Error {
  public constructor(
    public readonly operation: string,
    public readonly postgresCode: string | null = null,
  ) {
    super('Avatar persistence operation failed.');
    this.name = 'AvatarPersistenceError';
  }
}

function safePostgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(code) ? code : null;
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) {
    throw new AvatarPersistenceError(operation, safePostgresCode(error));
  }
  return data;
}

export function createSupabaseAvatarGateway(client: SupabaseClient): AvatarGateway {
  return {
    getCatalog(context) {
      return rpc(client, 'get_player_avatar_catalog', {
        p_wallet_address: context.walletAddress,
        p_access_session_token_hash: context.accessSessionTokenHash,
        p_request_id: context.requestId,
      });
    },
    getProfile(context) {
      return rpc(client, 'get_player_avatar_profile', {
        p_wallet_address: context.walletAddress,
        p_access_session_token_hash: context.accessSessionTokenHash,
        p_request_id: context.requestId,
      });
    },
    preview(context, selection) {
      return rpc(client, 'preview_player_avatar', {
        p_wallet_address: context.walletAddress,
        p_access_session_token_hash: context.accessSessionTokenHash,
        p_selection: selection,
        p_request_id: context.requestId,
      });
    },
    create(context, expectedRevision, selection) {
      return rpc(client, 'create_player_avatar_profile', {
        p_wallet_address: context.walletAddress,
        p_access_session_token_hash: context.accessSessionTokenHash,
        p_expected_revision: expectedRevision,
        p_selection: selection,
        p_request_id: context.requestId,
      });
    },
    update(context, expectedRevision, selection) {
      return rpc(client, 'update_player_avatar_profile', {
        p_wallet_address: context.walletAddress,
        p_access_session_token_hash: context.accessSessionTokenHash,
        p_expected_revision: expectedRevision,
        p_selection: selection,
        p_request_id: context.requestId,
      });
    },
    resolvePublic(appearanceId, requestId) {
      return rpc(client, 'get_resolved_public_avatar', {
        p_appearance_id: appearanceId,
        p_request_id: requestId,
      });
    },
  };
}
