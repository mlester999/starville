import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseRealtimeAuthorizationGateway } from './supabase-gateway.js';

describe('Supabase Realtime authorization gateway', () => {
  it('issues a one-use non-anonymous player token with the generated verification type', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          status: 'eligible',
          email: 'player-11111111-1111-4111-8111-111111111111@auth.starville.game',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'bound' }, error: null });
    const generateLink = vi.fn(async () => ({
      data: {
        user: { id: '22222222-2222-4222-8222-222222222222' },
        properties: { hashed_token: 'h'.repeat(64), verification_type: 'signup' },
      },
      error: null,
    }));
    const gateway = createSupabaseRealtimeAuthorizationGateway({
      rpc,
      auth: { admin: { generateLink } },
    } as unknown as SupabaseClient);

    await expect(
      gateway.issuePlayerSession({
        accessSessionTokenHash: 'a'.repeat(64),
        requestId: 'session-request',
      }),
    ).resolves.toEqual({
      status: 'issued',
      tokenHash: 'h'.repeat(64),
      tokenType: 'signup',
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'player-11111111-1111-4111-8111-111111111111@auth.starville.game',
      options: { data: { starville_identity: 'player' } },
    });
    expect(rpc).toHaveBeenLastCalledWith('bind_supabase_realtime_player_identity', {
      p_auth_user_id: '22222222-2222-4222-8222-222222222222',
      p_access_session_token_hash: 'a'.repeat(64),
      p_request_id: 'session-request',
    });
  });

  it('accepts only non-anonymous signed Auth users before the database binding check', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          user: { id: '33333333-3333-4333-8333-333333333333', is_anonymous: true },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: '44444444-4444-4444-8444-444444444444', is_anonymous: false },
        },
        error: null,
      });
    const gateway = createSupabaseRealtimeAuthorizationGateway({
      auth: { getUser },
    } as unknown as SupabaseClient);

    await expect(gateway.verifyPlayerIdentity('anonymous-token')).resolves.toBeUndefined();
    await expect(gateway.verifyPlayerIdentity('player-token')).resolves.toBe(
      '44444444-4444-4444-8444-444444444444',
    );
  });
});
