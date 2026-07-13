import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseAdminOperationsGateway } from './gateway.js';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};

function phase6PlayerDetail() {
  return {
    status: 'loaded',
    profile: {
      id: '44444444-4444-4444-8444-444444444444',
      displayName: 'Luna Vale',
      walletAddress: '11111111111111111111111111111111',
      appearancePreset: 'moonberry',
      mapId: 'lantern-square',
      mapVersionId: '55555555-5555-4555-8555-555555555555',
      x: 12,
      y: 7.5,
      facingDirection: 'south',
      gameStateVersion: 2,
      stateVersion: 2,
      lastTransitionAt: null,
      createdAt: '2026-07-11T09:00:00.000Z',
      updatedAt: '2026-07-12T09:00:00.000Z',
      lastEnteredAt: '2026-07-12T09:00:00.000Z',
    },
    moderation: {
      status: 'active',
      suspensionReason: null,
      suspendedAt: null,
      suspendedByAdminId: null,
      restoredAt: null,
      restoredByAdminId: null,
      restorationReason: null,
      renameRequired: false,
      renameReason: null,
      renameRequiredAt: null,
      renameRequiredByAdminId: null,
      version: 1,
      updatedAt: '2026-07-12T09:00:00.000Z',
    },
    access: { activeSessions: 0, latestSessionStatus: null, latestSessionAt: null },
  } as const;
}

describe('Supabase administrator operations gateway', () => {
  it('parses Phase 5 player detail after Phase 6 multi-map fields are added', async () => {
    const rpc = vi.fn(async () => ({ data: phase6PlayerDetail(), error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    const gateway = createSupabaseAdminOperationsGateway(client, {
      environmentKey: 'development',
      network: 'solana:mainnet-beta',
    });

    const detail = await gateway.getPlayer(identity, '44444444-4444-4444-8444-444444444444');

    expect(detail).not.toBe('not_found');
    if (detail === 'not_found') return;
    expect(detail.profile).toMatchObject({
      displayName: 'Luna Vale',
      mapId: 'lantern-square',
      mapVersionId: '55555555-5555-4555-8555-555555555555',
      gameStateVersion: 2,
      stateVersion: 2,
      lastTransitionAt: null,
    });
    expect(detail.moderation.status).toBe('active');
    expect(detail.access.activeSessions).toBe(0);
    expect(rpc).toHaveBeenCalledWith('get_admin_player_detail', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_environment_key: 'development',
      p_network: 'solana:mainnet-beta',
      p_player_profile_id: '44444444-4444-4444-8444-444444444444',
    });
  });
});
