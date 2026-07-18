import type { SupabaseClient } from '@supabase/supabase-js';
import { housingLocalFixture } from '@starville/housing';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseHousingGateway } from './gateway.js';

const wallet = '11111111111111111111111111111111';

describe('housing gateway', () => {
  it('strictly loads the owner workspace through the narrow RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'loaded', workspace: housingLocalFixture },
      error: null,
    }));
    const gateway = createSupabaseHousingGateway({ rpc } as unknown as SupabaseClient);
    await expect(gateway.workspace(wallet, 'housing-workspace-request')).resolves.toEqual(
      housingLocalFixture,
    );
    expect(rpc).toHaveBeenCalledWith('get_player_housing_workspace', {
      p_wallet_address: wallet,
      p_request_id: 'housing-workspace-request',
    });
  });

  it('forwards canonical identities and every optimistic save revision', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'saved',
        workspace: housingLocalFixture,
        replayed: false,
        announcement: 'Home layout revision saved.',
      },
      error: null,
    }));
    const gateway = createSupabaseHousingGateway({ rpc } as unknown as SupabaseClient);
    await gateway.saveLayout(
      wallet,
      {
        homeId: housingLocalFixture.home.id,
        expectedLayoutRevision: 1,
        expectedLayoutHeadStateVersion: 2,
        expectedHomeStateVersion: 3,
        expectedInventoryStateVersion: 3,
        expectedStorageStateVersion: 1,
        placements: [],
        restorationSourceRevisionId: null,
        idempotencyKey: 'housing-layout-save-test-0001',
      },
      'housing-layout-save-request',
    );
    expect(rpc).toHaveBeenCalledWith(
      'save_player_home_layout',
      expect.objectContaining({
        p_home_id: housingLocalFixture.home.id,
        p_expected_layout_revision: 1,
        p_expected_layout_head_state_version: 2,
        p_expected_home_state_version: 3,
        p_expected_inventory_state_version: 3,
        p_expected_storage_state_version: 1,
        p_idempotency_key: 'housing-layout-save-test-0001',
      }),
    );
  });

  it('returns owner-safe failures without accepting a malformed success payload', async () => {
    const failedRpc = vi.fn(async () => ({ data: { status: 'layout_conflict' }, error: null }));
    const failedGateway = createSupabaseHousingGateway({
      rpc: failedRpc,
    } as unknown as SupabaseClient);
    await expect(
      failedGateway.validateLayout(
        wallet,
        {
          homeId: housingLocalFixture.home.id,
          expectedLayoutRevision: 1,
          expectedLayoutHeadStateVersion: 1,
          placements: [],
        },
        'housing-conflict-request',
      ),
    ).resolves.toBe('layout_conflict');

    const malformedRpc = vi.fn(async () => ({ data: { status: 'loaded' }, error: null }));
    const malformedGateway = createSupabaseHousingGateway({
      rpc: malformedRpc,
    } as unknown as SupabaseClient);
    await expect(malformedGateway.workspace(wallet, 'housing-malformed-request')).rejects.toThrow();
  });

  it('keeps Game Test and simulations entirely outside persistence', () => {
    const rpc = vi.fn();
    const gateway = createSupabaseHousingGateway({ rpc } as unknown as SupabaseClient);
    const preview = gateway.gameTest();
    const simulation = gateway.simulate(
      {
        userId: '10000000-0000-4000-8000-000000000001',
        authSessionId: '10000000-0000-4000-8000-000000000002',
        assuranceLevel: 'aal2',
        authenticationMethods: ['password', 'totp'],
      },
      {
        tierOneFurnitureCapacity: 8,
        tierTwoFurnitureCapacity: 12,
        tierOneStorageCapacity: 16,
        tierTwoStorageCapacity: 24,
        upgradeDustCost: 250,
        playerDustBalance: 500,
        placementCount: 8,
        storageSlotsUsed: 15,
        layoutPayloadBytes: 8_192,
        replayCount: 2,
        gameTest: true,
      },
    );
    expect(preview.gameTest).toBe(true);
    expect(simulation.persistentWrites).toBe(0);
    expect(simulation.autoActivatesTuning).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
