import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseAvatarGateway } from './gateway.js';
import type { AvatarPersistenceError } from './gateway.js';

const context = {
  walletAddress: '11111111111111111111111111111111',
  accessSessionTokenHash: 'a'.repeat(64),
  requestId: '11111111-1111-4111-8111-111111111111',
};

function client(data: unknown = { status: 'not_found' }, error: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

describe('avatar persistence gateway', () => {
  it('passes only trusted wallet and server-hashed access-session identity to player reads', async () => {
    const supabase = client();
    const gateway = createSupabaseAvatarGateway(supabase as unknown as SupabaseClient);
    await gateway.getCatalog(context);
    await gateway.getProfile(context);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'get_player_avatar_catalog', {
      p_wallet_address: context.walletAddress,
      p_access_session_token_hash: context.accessSessionTokenHash,
      p_request_id: context.requestId,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'get_player_avatar_profile', {
      p_wallet_address: context.walletAddress,
      p_access_session_token_hash: context.accessSessionTokenHash,
      p_request_id: context.requestId,
    });
  });

  it('uses the exact expected-revision and bounded-selection mutation RPCs', async () => {
    const supabase = client();
    const gateway = createSupabaseAvatarGateway(supabase as unknown as SupabaseClient);
    const selection = { bodyPresetKey: 'moss', accessoryKeys: [] };
    await gateway.create(context, 0, selection);
    await gateway.update(context, 3, selection);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'create_player_avatar_profile', {
      p_wallet_address: context.walletAddress,
      p_access_session_token_hash: context.accessSessionTokenHash,
      p_expected_revision: 0,
      p_selection: selection,
      p_request_id: context.requestId,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'update_player_avatar_profile', {
      p_wallet_address: context.walletAddress,
      p_access_session_token_hash: context.accessSessionTokenHash,
      p_expected_revision: 3,
      p_selection: selection,
      p_request_id: context.requestId,
    });
  });

  it('resolves public appearance by opaque appearance id without player identity', async () => {
    const supabase = client();
    const gateway = createSupabaseAvatarGateway(supabase as unknown as SupabaseClient);
    await gateway.resolvePublic('22222222-2222-4222-8222-222222222222', context.requestId);
    expect(supabase.rpc).toHaveBeenCalledWith('get_resolved_public_avatar', {
      p_appearance_id: '22222222-2222-4222-8222-222222222222',
      p_request_id: context.requestId,
    });
  });

  it('surfaces only the safe operation and PostgreSQL code on RPC failure', async () => {
    const gateway = createSupabaseAvatarGateway(
      client(null, {
        code: 'PGRST202',
        message: 'service role and postgresql://secret must not escape',
      }) as unknown as SupabaseClient,
    );
    await expect(gateway.getProfile(context)).rejects.toEqual(
      expect.objectContaining({
        name: 'AvatarPersistenceError',
        operation: 'get_player_avatar_profile',
        postgresCode: 'PGRST202',
      } satisfies Partial<AvatarPersistenceError>),
    );
    try {
      await gateway.getProfile(context);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('postgresql://');
      expect(JSON.stringify(error)).not.toContain('service role');
    }
  });
});
