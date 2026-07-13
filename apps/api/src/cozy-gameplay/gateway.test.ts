import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseCozyGameplayGateway } from './gateway.js';
import {
  STACK_ID,
  WALLET_ADDRESS,
  cozyBootstrapFixture,
  dustLedgerFixture,
  farmMutationFixture,
  farmPlotListFixture,
  furnitureMutationFixture,
  homeAccessFixture,
  homeViewFixture,
  inventoryHistoryFixture,
  inventoryViewFixture,
  itemCatalogFixture,
  quickbarMutationFixture,
  recipeActionFixture,
  recipeCatalogFixture,
  shopCatalogFixture,
  shopTransactionFixture,
} from './test-fixtures.js';

describe('Supabase cozy gameplay gateway', () => {
  it('uses only the trusted wallet and idempotency context for bootstrap', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'loaded', ...cozyBootstrapFixture },
      error: null,
    }));
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await expect(
      gateway.bootstrap(WALLET_ADDRESS, 'phase7-bootstrap-0001', 'request-bootstrap'),
    ).resolves.toEqual(cozyBootstrapFixture);
    expect(rpc).toHaveBeenCalledWith('bootstrap_player_cozy_gameplay', {
      p_wallet_address: WALLET_ADDRESS,
      p_idempotency_key: 'phase7-bootstrap-0001',
      p_request_id: 'request-bootstrap',
    });
  });

  it('passes bounded page inputs to ledger and history RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'loaded', ...dustLedgerFixture }, error: null })
      .mockResolvedValueOnce({
        data: { status: 'loaded', ...inventoryHistoryFixture },
        error: null,
      });
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await gateway.getDustLedger(WALLET_ADDRESS, { cursor: 2, limit: 50 }, 'request-dust');
    await gateway.getInventoryHistory(WALLET_ADDRESS, { cursor: 3, limit: 100 }, 'request-history');

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_player_dust_ledger', {
      p_wallet_address: WALLET_ADDRESS,
      p_page: 2,
      p_page_size: 50,
      p_request_id: 'request-dust',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_player_inventory_history', {
      p_wallet_address: WALLET_ADDRESS,
      p_page: 3,
      p_page_size: 100,
      p_request_id: 'request-history',
    });
  });

  it('parses the bounded inventory and quickbar response', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'loaded', ...inventoryViewFixture },
      error: null,
    }));
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await expect(gateway.getInventory(WALLET_ADDRESS, 'request-inventory')).resolves.toEqual(
      inventoryViewFixture,
    );
    expect(rpc).toHaveBeenCalledWith('get_player_inventory', {
      p_wallet_address: WALLET_ADDRESS,
      p_request_id: 'request-inventory',
    });
  });

  it('uses the owned stack reference and optimistic version for quickbar assignment', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'replayed', quickbar: quickbarMutationFixture.quickbar },
      error: null,
    }));
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await expect(
      gateway.updateQuickbar(
        WALLET_ADDRESS,
        {
          slot: 1,
          inventoryStackId: STACK_ID,
          expectedStateVersion: 1,
          idempotencyKey: 'phase7-quickbar-0001',
        },
        'request-quickbar',
      ),
    ).resolves.toMatchObject({ replayed: true });
    expect(rpc).toHaveBeenCalledWith('update_player_quickbar', {
      p_wallet_address: WALLET_ADDRESS,
      p_slot: 1,
      p_inventory_stack_id: STACK_ID,
      p_expected_state_version: 1,
      p_idempotency_key: 'phase7-quickbar-0001',
      p_request_id: 'request-quickbar',
    });
  });

  it('returns safe persistence statuses without trusting malformed success data', async () => {
    const statusRpc = vi.fn(async () => ({ data: { status: 'state_conflict' }, error: null }));
    const statusGateway = createSupabaseCozyGameplayGateway({
      rpc: statusRpc,
    } as unknown as SupabaseClient);
    await expect(
      statusGateway.updateQuickbar(
        WALLET_ADDRESS,
        {
          slot: 1,
          inventoryStackId: null,
          expectedStateVersion: 1,
          idempotencyKey: 'phase7-quickbar-0001',
        },
        'request-conflict',
      ),
    ).resolves.toBe('state_conflict');

    const malformedRpc = vi.fn(async () => ({
      data: { status: 'loaded', ...inventoryViewFixture, privateMetadata: 'must-not-pass' },
      error: null,
    }));
    const malformedGateway = createSupabaseCozyGameplayGateway({
      rpc: malformedRpc,
    } as unknown as SupabaseClient);
    await expect(
      malformedGateway.getInventory(WALLET_ADDRESS, 'request-malformed'),
    ).rejects.toThrow();
  });

  it('uses only plot, seed, version and idempotency inputs for farming', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'loaded', ...farmPlotListFixture }, error: null })
      .mockResolvedValueOnce({ data: { status: 'updated', ...farmMutationFixture }, error: null });
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await gateway.getFarmPlots(WALLET_ADDRESS, 'request-farm');
    await gateway.plant(
      WALLET_ADDRESS,
      {
        plotId: '66666666-6666-4666-8666-666666666666',
        seedItemSlug: 'moonberry-seeds',
        expectedStateVersion: 1,
        idempotencyKey: 'phase7-plant-0001',
      },
      'request-plant',
    );

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_player_farm_plots', {
      p_wallet_address: WALLET_ADDRESS,
      p_request_id: 'request-farm',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'plant_player_farm_plot', {
      p_wallet_address: WALLET_ADDRESS,
      p_plot_id: '66666666-6666-4666-8666-666666666666',
      p_seed_item_slug: 'moonberry-seeds',
      p_expected_state_version: 1,
      p_idempotency_key: 'phase7-plant-0001',
      p_request_id: 'request-plant',
    });
  });

  it('strictly parses the safe player item catalog', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'loaded', ...itemCatalogFixture },
      error: null,
    }));
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await expect(gateway.getItemCatalog(WALLET_ADDRESS, 'request-items')).resolves.toEqual(
      itemCatalogFixture,
    );
    expect(rpc).toHaveBeenCalledWith('get_player_item_catalog', {
      p_wallet_address: WALLET_ADDRESS,
      p_request_id: 'request-items',
    });
  });

  it.each([
    ['water', 'water_player_farm_plot'],
    ['harvest', 'harvest_player_farm_plot'],
  ] as const)(
    'maps %s to its exact farm RPC without client timestamps',
    async (action, rpcName) => {
      const rpc = vi.fn(async () => ({
        data: { status: 'updated', ...farmMutationFixture },
        error: null,
      }));
      const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);
      const input = {
        plotId: '66666666-6666-4666-8666-666666666666',
        expectedStateVersion: 2,
        idempotencyKey: `phase7-${action}-0001`,
      };

      await gateway[action](WALLET_ADDRESS, input, `request-${action}`);
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        p_wallet_address: WALLET_ADDRESS,
        p_plot_id: input.plotId,
        p_expected_state_version: 2,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: `request-${action}`,
      });
    },
  );

  it('passes station identity while keeping recipe output server-defined', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'loaded', ...recipeCatalogFixture }, error: null })
      .mockResolvedValueOnce({ data: { status: 'updated', ...recipeActionFixture }, error: null });
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await gateway.getRecipeCatalog(WALLET_ADDRESS, 'cooking', 'request-recipes');
    await gateway.executeRecipe(
      WALLET_ADDRESS,
      'cooking',
      {
        recipeSlug: 'moonberry-preserves',
        stationInteractionId: 'lantern-hearth',
        quantity: 1,
        expectedInventoryStateVersion: 2,
        expectedDustStateVersion: 1,
        idempotencyKey: 'phase7-cooking-0001',
      },
      'request-cook',
    );

    expect(rpc).toHaveBeenNthCalledWith(2, 'perform_player_recipe_action', {
      p_wallet_address: WALLET_ADDRESS,
      p_kind: 'cooking',
      p_recipe_slug: 'moonberry-preserves',
      p_station_interaction_id: 'lantern-hearth',
      p_quantity: 1,
      p_expected_inventory_state_version: 2,
      p_expected_dust_state_version: 1,
      p_idempotency_key: 'phase7-cooking-0001',
      p_request_id: 'request-cook',
    });
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_output_item_slug');
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_dust_fee');
  });

  it('binds server-priced transactions to the requested shop and offer', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'loaded', ...shopCatalogFixture }, error: null })
      .mockResolvedValueOnce({
        data: { status: 'updated', ...shopTransactionFixture },
        error: null,
      });
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await gateway.getShopCatalog(WALLET_ADDRESS, 'moonpetal-general-store', 'request-shop');
    await gateway.executeShopTransaction(
      WALLET_ADDRESS,
      'moonpetal-general-store',
      {
        offerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        operation: 'buy',
        quantity: 2,
        expectedDustStateVersion: 1,
        expectedInventoryStateVersion: 2,
        idempotencyKey: 'phase7-shop-buy-0001',
      },
      'request-buy',
    );

    expect(rpc).toHaveBeenNthCalledWith(2, 'transact_player_shop', {
      p_wallet_address: WALLET_ADDRESS,
      p_shop_slug: 'moonpetal-general-store',
      p_offer_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_operation: 'buy',
      p_quantity: 2,
      p_expected_dust_state_version: 1,
      p_expected_inventory_state_version: 2,
      p_idempotency_key: 'phase7-shop-buy-0001',
      p_request_id: 'request-buy',
    });
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_price');
  });

  it('maps owner home access and furniture intent to narrow RPC parameters', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'loaded', ...homeViewFixture }, error: null })
      .mockResolvedValueOnce({ data: { status: 'updated', ...homeAccessFixture }, error: null })
      .mockResolvedValueOnce({
        data: { status: 'updated', ...furnitureMutationFixture },
        error: null,
      });
    const gateway = createSupabaseCozyGameplayGateway({ rpc } as unknown as SupabaseClient);

    await gateway.getHome(WALLET_ADDRESS, 'request-home');
    await gateway.enterHome(
      WALLET_ADDRESS,
      { expectedHomeStateVersion: 2, idempotencyKey: 'phase7-home-enter-0001' },
      'request-enter',
    );
    await gateway.placeFurniture(
      WALLET_ADDRESS,
      {
        homeId: homeViewFixture.home.id,
        inventoryStackId: STACK_ID,
        furnitureSlug: 'willow-chair',
        x: 1,
        y: 1,
        rotation: 0,
        expectedHomeStateVersion: 3,
        idempotencyKey: 'phase7-furniture-place-0001',
      },
      'request-place',
    );

    expect(rpc).toHaveBeenNthCalledWith(3, 'place_player_home_furniture', {
      p_wallet_address: WALLET_ADDRESS,
      p_home_id: homeViewFixture.home.id,
      p_inventory_stack_id: STACK_ID,
      p_furniture_slug: 'willow-chair',
      p_x: 1,
      p_y: 1,
      p_rotation: 0,
      p_expected_home_state_version: 3,
      p_idempotency_key: 'phase7-furniture-place-0001',
      p_request_id: 'request-place',
    });
    expect(rpc.mock.calls[2]?.[1]).not.toHaveProperty('p_owner_player_id');
  });
});
