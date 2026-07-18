import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseAdminCosmeticGateway, createSupabaseCosmeticGateway } from './gateway.js';

const context = {
  walletAddress: '11111111111111111111111111111111',
  accessSessionTokenHash: 'a'.repeat(64),
  requestId: '11111111-1111-4111-8111-111111111111',
};
const selection = {
  body: 'meadow-frame',
  skinTone: 'warm-tone',
  face: 'soft-face',
  eyes: 'bright-eyes',
  eyebrows: 'soft-brows',
  hair: 'meadow-hair',
  hairColor: 'chestnut-color',
  top: 'lantern-top',
  bottom: 'meadow-bottom',
  footwear: 'trail-shoes',
  accessories: ['cozy-scarf'],
};

function client(data: unknown = { status: 'loaded' }, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) };
}

describe('cosmetic persistence gateways', () => {
  it('persists a bounded loadout through trusted identity and the canonical avatar conversion', async () => {
    const supabase = client();
    const gateway = createSupabaseCosmeticGateway(supabase as unknown as SupabaseClient);
    await gateway.saveLoadout(context, {
      slot: 5,
      name: 'Lantern walk',
      selection,
      expectedRevision: 0,
      requestId: context.requestId,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('save_player_cosmetic_loadout', {
      p_wallet_address: context.walletAddress,
      p_access_session_token_hash: context.accessSessionTokenHash,
      p_slot: 5,
      p_display_name: 'Lantern walk',
      p_selection: {
        bodyPresetKey: 'meadow-frame',
        skinPaletteKey: 'warm-tone',
        faceKey: 'soft-face',
        eyesKey: 'bright-eyes',
        eyebrowsKey: 'soft-brows',
        hairKey: 'meadow-hair',
        hairPaletteKey: 'chestnut-color',
        topKey: 'lantern-top',
        bottomKey: 'meadow-bottom',
        footwearKey: 'trail-shoes',
        accessoryKeys: ['cozy-scarf'],
        presetKey: null,
      },
      p_expected_revision: 0,
      p_request_id: context.requestId,
    });
  });

  it('passes expected state and bounded reason metadata to one-cosmetic admin RPCs', async () => {
    const supabase = client();
    const gateway = createSupabaseAdminCosmeticGateway(supabase as unknown as SupabaseClient);
    const identity = {
      userId: '22222222-2222-4222-8222-222222222222',
      authSessionId: '33333333-3333-4333-8333-333333333333',
      assuranceLevel: 'aal2' as const,
      authenticationMethods: ['password', 'totp'] as const,
    };
    await gateway.grant(
      identity,
      '44444444-4444-4444-8444-444444444444',
      'lantern-top',
      'development_test',
      'One-player local entitlement correction.',
      'not_owned',
      context.requestId,
    );
    expect(supabase.rpc).toHaveBeenCalledWith('grant_admin_player_cosmetic', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: 'aal2',
      p_player_profile_id: '44444444-4444-4444-8444-444444444444',
      p_cosmetic_key: 'lantern-top',
      p_reason_category: 'development_test',
      p_explanation: 'One-player local entitlement correction.',
      p_expected_state: 'not_owned',
      p_request_id: context.requestId,
    });
  });

  it('does not expose database details when an RPC fails', async () => {
    const gateway = createSupabaseCosmeticGateway(
      client(null, {
        code: 'PGRST202',
        message: 'postgresql://secret',
      }) as unknown as SupabaseClient,
    );
    await expect(gateway.wardrobe(context)).rejects.toMatchObject({
      name: 'CosmeticPersistenceError',
      operation: 'get_player_cosmetic_wardrobe',
    });
    try {
      await gateway.wardrobe(context);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('postgresql://');
    }
  });
});
