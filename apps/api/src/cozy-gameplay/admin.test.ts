import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createAdminCozyService } from './admin.js';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};
const playerId = '33333333-3333-4333-8333-333333333333';

describe('administrator cozy gameplay service', () => {
  it('passes only trusted administrator identity and bounded pagination to economy RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'loaded',
        initialized: false,
        account: null,
        items: [],
        pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 },
      },
      error: null,
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);

    await expect(
      service.getEconomy(identity, playerId, { page: '2', pageSize: '50' }),
    ).resolves.toEqual(expect.objectContaining({ initialized: false, account: null }));
    expect(rpc).toHaveBeenCalledWith('get_admin_player_economy', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_player_profile_id: playerId,
      p_page: 2,
      p_page_size: 50,
    });
  });

  it('maps an authoritative missing-player result without widening access', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'not_found' }, error: null }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);

    await expect(service.getCozy(identity, playerId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PLAYER_NOT_FOUND',
    });
  });
});
