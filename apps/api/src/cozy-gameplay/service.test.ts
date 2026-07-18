import { describe, expect, it, vi } from 'vitest';

import type { LogContext, ServiceLogger } from '../contracts.js';
import type { CozyGameplayGateway } from './contracts.js';
import { createCozyGameplayService } from './service.js';
import {
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
  playableVerticalSliceFixture,
  verticalSliceMutationFixture,
  workstationJobMutationFixture,
  workstationTutorialMutationFixture,
  workstationWorkspaceFixture,
} from './test-fixtures.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

function gateway(): CozyGameplayGateway {
  return {
    bootstrap: vi.fn(async () => cozyBootstrapFixture),
    getDustLedger: vi.fn(async () => dustLedgerFixture),
    getInventory: vi.fn(async () => inventoryViewFixture),
    getInventoryHistory: vi.fn(async () => inventoryHistoryFixture),
    updateQuickbar: vi.fn(async () => quickbarMutationFixture),
    getFarmPlots: vi.fn(async () => farmPlotListFixture),
    getItemCatalog: vi.fn(async () => itemCatalogFixture),
    plant: vi.fn(async () => farmMutationFixture),
    water: vi.fn(async () => farmMutationFixture),
    harvest: vi.fn(async () => farmMutationFixture),
    getRecipeCatalog: vi.fn(async () => recipeCatalogFixture),
    executeRecipe: vi.fn(async () => recipeActionFixture),
    getShopCatalog: vi.fn(async () => shopCatalogFixture),
    executeShopTransaction: vi.fn(async () => shopTransactionFixture),
    getHome: vi.fn(async () => homeViewFixture),
    enterHome: vi.fn(async () => homeAccessFixture),
    exitHome: vi.fn(async () => ({ ...homeAccessFixture, location: 'public_world' as const })),
    placeFurniture: vi.fn(async () => furnitureMutationFixture),
    moveFurniture: vi.fn(async () => furnitureMutationFixture),
    rotateFurniture: vi.fn(async () => furnitureMutationFixture),
    removeFurniture: vi.fn(async () => furnitureMutationFixture),
    getPlayableVerticalSlice: vi.fn(async () => playableVerticalSliceFixture),
    acceptStarterQuest: vi.fn(async () => verticalSliceMutationFixture),
    prepareHomeSoil: vi.fn(async () => verticalSliceMutationFixture),
    plantHomeCrop: vi.fn(async () => verticalSliceMutationFixture),
    waterHomeCrop: vi.fn(async () => verticalSliceMutationFixture),
    harvestHomeCrop: vi.fn(async () => verticalSliceMutationFixture),
    deliverStarterQuest: vi.fn(async () => verticalSliceMutationFixture),
    getWorkstationWorkspace: vi.fn(async () => workstationWorkspaceFixture),
    startWorkstationJob: vi.fn(async () => workstationJobMutationFixture),
    collectWorkstationJob: vi.fn(async () => workstationJobMutationFixture),
    acceptWorkstationTutorial: vi.fn(async () => workstationTutorialMutationFixture),
    turnInWorkstationTutorial: vi.fn(async () => workstationTutorialMutationFixture),
  };
}

describe('cozy gameplay service', () => {
  it('validates an idempotent bootstrap before calling persistence', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(
      service.bootstrap(
        WALLET_ADDRESS,
        { idempotencyKey: 'phase7-bootstrap-0001' },
        'request-bootstrap',
      ),
    ).resolves.toEqual(cozyBootstrapFixture);
    expect(persistence.bootstrap).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'phase7-bootstrap-0001',
      'request-bootstrap',
    );
  });

  it.each([
    {},
    { idempotencyKey: 'short' },
    { idempotencyKey: 'phase7-bootstrap-0001', balance: 999_999 },
  ])('rejects invalid bootstrap input without persistence', async (body) => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(service.bootstrap(WALLET_ADDRESS, body, 'request-invalid')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }),
    );
    expect(persistence.bootstrap).not.toHaveBeenCalled();
  });

  it('normalizes bounded ledger and inventory-history pagination', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await service.getDustLedger(WALLET_ADDRESS, {}, 'request-dust');
    await service.getInventoryHistory(
      WALLET_ADDRESS,
      { cursor: '3', limit: '50' },
      'request-history',
    );

    expect(persistence.getDustLedger).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      { cursor: 1, limit: 20 },
      'request-dust',
    );
    expect(persistence.getInventoryHistory).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      { cursor: 3, limit: 50 },
      'request-history',
    );
  });

  it.each([
    { cursor: '0', limit: '20' },
    { cursor: '1', limit: '500' },
    { cursor: '1', limit: '20', playerId: 'attacker' },
  ])('rejects unbounded or excessive pagination', async (query) => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(service.getDustLedger(WALLET_ADDRESS, query, 'request-invalid')).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }),
    );
    expect(persistence.getDustLedger).not.toHaveBeenCalled();
  });

  it('validates slot, ownership reference, version, and idempotency for quickbar writes', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await service.updateQuickbar(
      WALLET_ADDRESS,
      '2',
      {
        inventoryStackId: null,
        expectedStateVersion: 1,
        idempotencyKey: 'phase7-quickbar-0001',
      },
      'request-quickbar',
    );
    expect(persistence.updateQuickbar).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      {
        slot: 2,
        inventoryStackId: null,
        expectedStateVersion: 1,
        idempotencyKey: 'phase7-quickbar-0001',
      },
      'request-quickbar',
    );
  });

  it.each([
    ['state_conflict', 'GAMEPLAY_STATE_CONFLICT', 409],
    ['item_unavailable', 'ITEM_UNAVAILABLE', 409],
    ['request_already_processed', 'REQUEST_ALREADY_PROCESSED', 409],
    ['rate_limited', 'RATE_LIMITED', 429],
    ['suspended', 'PLAYER_SUSPENDED', 403],
    ['rename_required', 'PLAYER_RENAME_REQUIRED', 409],
  ] as const)('maps %s to the safe public error %s', async (status, code, statusCode) => {
    const persistence = gateway();
    vi.mocked(persistence.updateQuickbar).mockResolvedValueOnce(status);
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(
      service.updateQuickbar(
        WALLET_ADDRESS,
        1,
        {
          inventoryStackId: null,
          expectedStateVersion: 1,
          idempotencyKey: 'phase7-quickbar-0001',
        },
        'request-status',
      ),
    ).rejects.toEqual(expect.objectContaining({ code, statusCode }));
  });

  it('hides persistence failures behind a safe service error', async () => {
    const persistence = gateway();
    vi.mocked(persistence.getInventory).mockRejectedValueOnce(
      new Error('private inventory database detail'),
    );
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(service.getInventory(WALLET_ADDRESS, 'request-failure')).rejects.toEqual(
      expect.objectContaining({ code: 'COZY_GAMEPLAY_UNAVAILABLE', statusCode: 503 }),
    );
  });

  it('accepts only server-resolved farm action references and concurrency context', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    const input = {
      plotId: '66666666-6666-4666-8666-666666666666',
      seedItemSlug: 'moonberry-seeds',
      expectedStateVersion: 1,
      idempotencyKey: 'phase7-plant-0001',
    };

    await expect(service.plant(WALLET_ADDRESS, input, 'request-plant')).resolves.toEqual(
      farmMutationFixture,
    );
    expect(persistence.plant).toHaveBeenCalledWith(WALLET_ADDRESS, input, 'request-plant');

    await expect(
      service.plant(
        WALLET_ADDRESS,
        { ...input, readyAt: '2099-01-01T00:00:00.000Z', yield: 999 },
        'request-client-authority',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });

  it('validates recipe kind and never accepts client output or fee fields', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    const input = {
      recipeSlug: 'moonberry-preserves',
      stationInteractionId: 'lantern-hearth',
      quantity: 1,
      expectedInventoryStateVersion: 2,
      expectedDustStateVersion: 1,
      idempotencyKey: 'phase7-cooking-0001',
    };

    await service.executeRecipe(WALLET_ADDRESS, 'cooking', input, 'request-cook');
    expect(persistence.executeRecipe).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'cooking',
      input,
      'request-cook',
    );
    await expect(
      service.executeRecipe(
        WALLET_ADDRESS,
        'cooking',
        { ...input, outputItemSlug: 'attacker-item', dustFee: -100 },
        'request-invalid-recipe',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });

  it('validates shop identity, operation, quantity and versions without accepting a price', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    const body = {
      offerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      quantity: 2,
      expectedDustStateVersion: 1,
      expectedInventoryStateVersion: 2,
      idempotencyKey: 'phase7-shop-buy-0001',
    };

    await service.executeShopTransaction(
      WALLET_ADDRESS,
      'moonpetal-general-store',
      'buy',
      body,
      'request-buy',
    );
    expect(persistence.executeShopTransaction).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      'moonpetal-general-store',
      { ...body, operation: 'buy' },
      'request-buy',
    );
    await expect(
      service.executeShopTransaction(
        WALLET_ADDRESS,
        'moonpetal-general-store',
        'buy',
        { ...body, buyPrice: 1 },
        'request-price',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });

  it.each([
    ['not_found', 'GAMEPLAY_STATE_CONFLICT'],
    ['plot_occupied', 'PLOT_OCCUPIED'],
    ['plot_not_ready', 'PLOT_NOT_READY'],
    ['plot_does_not_need_water', 'PLOT_DOES_NOT_NEED_WATER'],
    ['inventory_full', 'INVENTORY_FULL'],
    ['recipe_unavailable', 'RECIPE_UNAVAILABLE'],
    ['missing_ingredients', 'MISSING_INGREDIENTS'],
    ['shop_offer_unavailable', 'SHOP_OFFER_UNAVAILABLE'],
    ['insufficient_dust', 'INSUFFICIENT_DUST'],
    ['invalid_quantity', 'INVALID_QUANTITY'],
  ] as const)('maps Phase 7B status %s to %s', async (status, code) => {
    const persistence = gateway();
    vi.mocked(persistence.harvest).mockResolvedValueOnce(status);
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(
      service.harvest(
        WALLET_ADDRESS,
        {
          plotId: '66666666-6666-4666-8666-666666666666',
          expectedStateVersion: 2,
          idempotencyKey: 'phase7-harvest-0001',
        },
        'request-status',
      ),
    ).rejects.toEqual(expect.objectContaining({ code }));
  });

  it('validates home access and owned furniture intent without accepting ownership fields', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    await expect(service.getHome(WALLET_ADDRESS, 'request-home')).resolves.toEqual(homeViewFixture);
    await expect(
      service.enterHome(
        WALLET_ADDRESS,
        { expectedHomeStateVersion: 2, idempotencyKey: 'phase7-home-enter-0001' },
        'request-enter',
      ),
    ).resolves.toEqual(homeAccessFixture);
    await expect(
      service.placeFurniture(
        WALLET_ADDRESS,
        {
          homeId: homeViewFixture.home.id,
          inventoryStackId: '22222222-2222-4222-8222-222222222222',
          furnitureSlug: 'willow-chair',
          x: 1,
          y: 1,
          rotation: 0,
          expectedHomeStateVersion: 3,
          idempotencyKey: 'phase7-furniture-place-0001',
          ownerPlayerId: WALLET_ADDRESS,
        },
        'request-place',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });

  it.each([
    ['home_access_denied', 'HOME_ACCESS_DENIED'],
    ['invalid_placement', 'INVALID_FURNITURE_PLACEMENT'],
  ] as const)('maps Phase 7C status %s to %s', async (status, code) => {
    const persistence = gateway();
    vi.mocked(persistence.enterHome).mockResolvedValueOnce(status);
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    await expect(
      service.enterHome(
        WALLET_ADDRESS,
        { expectedHomeStateVersion: 2, idempotencyKey: 'phase7-home-status-0001' },
        'request-home-status',
      ),
    ).rejects.toEqual(expect.objectContaining({ code }));
  });

  it('validates personal-plot farming intent without accepting owner, maturity, yield, or reward fields', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    const prepare = {
      tileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      expectedTileStateVersion: 1,
      idempotencyKey: 'phase11-prepare-0001',
    };

    await expect(
      service.getPlayableVerticalSlice(WALLET_ADDRESS, 'request-vertical-slice'),
    ).resolves.toEqual(playableVerticalSliceFixture);
    await expect(
      service.prepareHomeSoil(WALLET_ADDRESS, prepare, 'request-prepare'),
    ).resolves.toEqual(verticalSliceMutationFixture);
    expect(persistence.prepareHomeSoil).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      prepare,
      'request-prepare',
    );

    await expect(
      service.prepareHomeSoil(
        WALLET_ADDRESS,
        { ...prepare, ownerPlayerId: 'attacker', yield: 999, mature: true },
        'request-forged-prepare',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }));
    await expect(
      service.deliverStarterQuest(
        WALLET_ADDRESS,
        {
          expectedQuestStateVersion: 9,
          idempotencyKey: 'phase11-delivery-0001',
          rewardDust: 1000,
        },
        'request-forged-reward',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }));
  });

  it.each([
    ['tool_action_too_far', 'TOOL_ACTION_TOO_FAR', 409],
    ['tool_not_owned', 'TOOL_NOT_OWNED', 409],
    ['crop_not_mature', 'CROP_NOT_MATURE', 409],
    ['farming_tile_conflict', 'FARMING_TILE_CONFLICT', 409],
    ['inventory_full', 'INVENTORY_FULL', 409],
    ['economy_settlement_failed', 'ECONOMY_SETTLEMENT_FAILED', 503],
  ] as const)('maps Phase 11A status %s to a safe %s error', async (status, code, statusCode) => {
    const persistence = gateway();
    vi.mocked(persistence.prepareHomeSoil).mockResolvedValueOnce(status);
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    await expect(
      service.prepareHomeSoil(
        WALLET_ADDRESS,
        {
          tileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          expectedTileStateVersion: 1,
          idempotencyKey: 'phase11-status-0001',
        },
        'request-phase11-status',
      ),
    ).rejects.toEqual(expect.objectContaining({ code, statusCode }));
  });

  it('accepts only canonical workstation-job intent and rejects client-authored settlement', async () => {
    const persistence = gateway();
    vi.mocked(persistence.startWorkstationJob).mockResolvedValueOnce('crafting_queue_full');
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });
    const input = {
      workstationInstanceId: 'b1100000-0000-4000-8000-000000000101',
      recipeVersionId: 'b1100000-0000-4000-8000-000000000211',
      quantity: 1,
      expectedInventoryStateVersion: 2,
      expectedDustStateVersion: 1,
      expectedWorkstationStateVersion: 1,
      idempotencyKey: 'phase11b-start-route-0001',
    };

    await expect(
      service.startWorkstationJob(WALLET_ADDRESS, input, 'request-workstation-start'),
    ).rejects.toEqual(expect.objectContaining({ code: 'CRAFTING_QUEUE_FULL', statusCode: 409 }));
    expect(persistence.startWorkstationJob).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      input,
      'request-workstation-start',
    );

    await expect(
      service.startWorkstationJob(
        WALLET_ADDRESS,
        {
          ...input,
          outputItemSlug: 'attacker-output',
          outputQuantity: 999,
          completesAt: '2099-01-01T00:00:00.000Z',
          durationSeconds: 0,
          dustFee: -100,
        },
        'request-forged-workstation-start',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }));
    expect(persistence.startWorkstationJob).toHaveBeenCalledTimes(1);
  });

  it('validates workstation and job UUID ownership references before persistence', async () => {
    const persistence = gateway();
    const service = createCozyGameplayService({ gateway: persistence, logger: new SilentLogger() });

    await expect(
      service.getWorkstationWorkspace(WALLET_ADDRESS, 'not-a-uuid', 'request-invalid-station'),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }));
    await expect(
      service.collectWorkstationJob(
        WALLET_ADDRESS,
        {
          workstationInstanceId: 'b1100000-0000-4000-8000-000000000101',
          craftingJobId: 'version-2',
          expectedJobStateVersion: 1,
          expectedInventoryStateVersion: 2,
          expectedWorkstationStateVersion: 1,
          idempotencyKey: 'phase11b-collect-route-0001',
        },
        'request-invalid-job',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400 }));

    expect(persistence.getWorkstationWorkspace).not.toHaveBeenCalled();
    expect(persistence.collectWorkstationJob).not.toHaveBeenCalled();
  });
});
