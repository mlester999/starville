import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CozyGameplay } from './CozyGameplay';

const fixtures = vi.hoisted(() => {
  const now = '2026-07-13T04:00:00.000Z';
  const tool = {
    id: '71000000-0000-4000-8000-000000000021',
    slug: 'starter-watering-can',
    name: 'Starter Watering Can',
    description: 'A permanent village tool.',
    category: 'permanent_tool' as const,
    stackable: false,
    maxStackSize: 1,
    buyEligible: false,
    sellEligible: false,
    giftable: false,
    tradable: false,
    accountBound: true,
    permanentTool: true,
    minimumTransferQuantity: 1,
    maximumTransferQuantity: 1,
    defaultBuyPrice: null,
    defaultSellPrice: null,
    assetRef: 'phase7-dev-starter-watering-can',
    assetReadiness: 'development_marker' as const,
    active: true,
    contentVersion: 1,
    metadata: { kind: 'permanent_tool' as const, toolType: 'watering_can' as const },
  };
  const furniture = {
    id: '71000000-0000-4000-8000-000000000015',
    slug: 'willow-chair',
    name: 'Willow Chair',
    description: 'A cozy starter chair.',
    category: 'furniture' as const,
    stackable: false,
    maxStackSize: 1,
    buyEligible: true,
    sellEligible: true,
    giftable: true,
    tradable: true,
    accountBound: false,
    permanentTool: false,
    minimumTransferQuantity: 1,
    maximumTransferQuantity: 99,
    defaultBuyPrice: 48,
    defaultSellPrice: 12,
    assetRef: 'phase7-dev-willow-chair',
    assetReadiness: 'development_marker' as const,
    active: true,
    contentVersion: 1,
    metadata: { kind: 'furniture' as const, furnitureSlug: 'willow-chair' },
  };
  const stack = {
    id: '11111111-1111-4111-8111-111111111111',
    item: tool,
    quantity: 1,
    acquiredAt: now,
    updatedAt: now,
    stateVersion: 1,
  };
  const furnitureStack = {
    id: '22222222-2222-4222-8222-222222222222',
    item: furniture,
    quantity: 1,
    acquiredAt: now,
    updatedAt: now,
    stateVersion: 1,
  };
  const quickbar = {
    assignments: Array.from({ length: 8 }, (_, index) => ({
      slot: index + 1,
      inventoryStackId: index === 0 ? stack.id : null,
      assignedItemSlug: index === 0 ? tool.slug : null,
    })),
    stateVersion: 1,
  };
  const inventory = {
    capacity: { capacity: 24, usedSlots: 2, stateVersion: 1 },
    stacks: [stack, furnitureStack],
  };
  const objectives = [
    ['meet_guide', 'Speak with Willow Guide', 0, 1],
    ['receive_starter_kit', 'Receive the starter farming kit', 0, 1],
    ['enter_home_plot', 'Enter your private home plot', 0, 1],
    ['prepare_soil', 'Prepare two garden tiles', 0, 2],
    ['plant_crops', 'Plant two Moonbean seeds', 0, 2],
    ['water_crops', 'Water both crops', 0, 2],
    ['harvest_crop', 'Harvest one mature Moonbean crop', 0, 1],
    ['deliver_produce', 'Deliver two Moonbeans', 0, 1],
    ['receive_reward', 'Receive the tutorial DUST reward', 0, 1],
  ] as const;
  const verticalSlice = {
    contentVersion: 2,
    plot: {
      id: '33333333-3333-4333-8333-333333333333',
      ownerPlayerId: '22222222-2222-4222-8222-222222222222',
      lifecycle: 'active' as const,
      templateId: '44444444-4444-4444-8444-444444444444',
      templateSlug: 'starter-cottage-interior',
      templateVersion: 1,
      instanceKey: 'personal-home:33333333-3333-4333-8333-333333333333',
      workstations: [],
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
      spawn: { x: 5, y: 6 },
      exit: { x: 5, y: 7 },
      currentPosition: { x: 5, y: 6 },
      location: 'lantern_square' as const,
      tiles: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          tileKey: 'garden-one',
          slot: 1,
          x: 3,
          y: 3,
          state: 'empty' as const,
          preparedAt: null,
          crop: null,
          stateVersion: 1,
          updatedAt: now,
        },
      ],
      farmingStateVersion: 1,
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    inventory,
    quickbar,
    quest: {
      definitionId: '77777777-7777-4777-8777-777777777777',
      versionId: '88888888-8888-4888-8888-888888888888',
      instanceId: null,
      slug: 'first-moonbean-harvest',
      name: 'Your First Moonbean Harvest',
      description: 'Grow Moonbeans and bring a small delivery back to Willow Guide.',
      status: 'available' as const,
      objectives: objectives.map(([key, label, current, required]) => ({
        key,
        label,
        current,
        required,
        completed: false,
      })),
      starterSeedQuantity: 4,
      deliveryQuantity: 2,
      rewardDust: 25,
      stateVersion: 0,
      acceptedAt: null,
      completedAt: null,
      rewardReceiptId: null,
    },
    npc: {
      id: '99999999-9999-4999-8999-999999999999',
      slug: 'willow-guide',
      name: 'Willow Guide',
      introduction: 'Let us prepare your first home garden.',
      worldId: 'lantern-square',
      x: 12,
      y: 10.5,
      interactionRange: 2,
      active: true,
    },
    liveOps: {
      plantingEnabled: true,
      harvestingEnabled: true,
      plotProvisioningEnabled: true,
      starterQuestEnabled: true,
      tutorialRewardsEnabled: true,
      maintenanceMessage: null,
      configurationRevision: 1,
    },
    realtimeChannel: 'private-home:33333333-3333-4333-8333-333333333333',
    serverTime: now,
  };
  const workstationInstanceId = 'b1100000-0000-4000-8000-000000000101';
  const recipeVersionId = 'b1100000-0000-4000-8000-000000000211';
  const readyJob = {
    id: 'b1100000-0000-4000-8000-000000000301',
    workstationInstanceId,
    workstationDefinitionId: 'b1100000-0000-4000-8000-000000000001',
    recipeDefinitionId: 'b1100000-0000-4000-8000-000000000201',
    recipeVersionId,
    recipeKey: 'garden-soup',
    recipeName: 'Garden Soup',
    recipeCategory: 'cooking' as const,
    workstationType: 'cooking_hearth' as const,
    quantity: 1,
    status: 'ready' as const,
    startedAt: now,
    completesAt: '2026-07-13T04:00:30.000Z',
    collectedAt: null,
    ingredients: [
      {
        itemId: '71000000-0000-4000-8000-000000000002',
        itemSlug: 'moonbean',
        itemName: 'Moonbean',
        quantity: 2,
        consumed: true as const,
      },
    ],
    output: { itemSlug: 'garden-soup', itemName: 'Garden Soup', quantity: 1 },
    durationSeconds: 30,
    remainingSeconds: 0,
    progress: 1,
    dustFee: 0,
    stateVersion: 2,
    failureCode: null,
    updatedAt: '2026-07-13T04:00:30.000Z',
  };
  const workstationWorkspace = {
    workstation: {
      id: workstationInstanceId,
      homeId: verticalSlice.plot.id,
      worldObjectId: 'starter-cooking-hearth',
      definition: {
        id: 'b1100000-0000-4000-8000-000000000001',
        key: 'starter-cooking-hearth',
        name: 'Cooking Hearth',
        description: 'Prepare warm recipes at home.',
        type: 'cooking_hearth' as const,
        allowedRecipeCategories: ['cooking' as const],
        queueCapacity: 2,
        simultaneousJobPolicy: 'bounded_owner_queue' as const,
        interactionRadius: 1.75,
        enabled: true,
        assetRef: null,
        assetReadiness: 'development_marker' as const,
        pinnedAssetVersionId: null,
        fallbackMarker: 'H',
        animationConfig: {},
        soundConfig: {},
        configurationRevision: 1,
      },
      position: { x: 2, y: 2 },
      interactionPoint: { x: 2.5, y: 2.5 },
      enabled: true,
      stateVersion: 2,
      queue: { capacity: 2, occupied: 1, running: 0, ready: 1, remainingSlots: 1 },
    },
    recipes: [
      {
        definitionId: 'b1100000-0000-4000-8000-000000000201',
        versionId: recipeVersionId,
        versionNumber: 1,
        key: 'garden-soup',
        name: 'Garden Soup',
        description: 'A simple home-cooked bowl made from tutorial produce.',
        category: 'cooking' as const,
        workstationType: 'cooking_hearth' as const,
        ingredients: [
          {
            itemId: '71000000-0000-4000-8000-000000000002',
            itemSlug: 'moonbean',
            itemName: 'Moonbean',
            quantityPerBatch: 2,
            ownedQuantity: 4,
          },
        ],
        output: {
          itemId: '71000000-0000-4000-8000-000000000023',
          itemSlug: 'garden-soup',
          itemName: 'Garden Soup',
          quantityPerBatch: 1,
          assetRef: null,
          assetReadiness: 'development_marker' as const,
        },
        productionDurationSeconds: 300,
        localDurationSeconds: 3,
        dustFee: 0,
        unlockRule: 'phase11a_complete' as const,
        discoveryPolicy: 'visible_requirement' as const,
        unlocked: true,
        lockedReason: null,
        tutorialEligible: true,
        repeatable: true,
        maximumBatchQuantity: 5,
        maximumStartable: 2,
        enabled: true,
        configurationRevision: 1,
      },
    ],
    jobs: [readyJob],
    inventory,
    dust: {
      playerId: '22222222-2222-4222-8222-222222222222',
      balance: 250,
      stateVersion: 1,
      starterGrantAppliedAt: now,
      updatedAt: now,
    },
    tutorial: {
      definitionId: 'b1100000-0000-4000-8000-000000000401',
      versionId: 'b1100000-0000-4000-8000-000000000411',
      instanceId: 'b1100000-0000-4000-8000-000000000421',
      key: 'hearth-and-hands',
      name: 'Hearth and Hands',
      description: 'Cook, craft, and return to Willow Guide.',
      eligible: true,
      status: 'active' as const,
      objectives: [
        'speak_with_guide',
        'unlock_cooking_recipe',
        'collect_cooked_item',
        'unlock_crafting_recipe',
        'collect_crafted_item',
        'return_to_guide',
        'receive_reward',
      ].map((key) => ({
        key,
        label: key.replaceAll('_', ' '),
        current: 0,
        required: 1,
        completed: false,
      })),
      rewardDust: 20,
      stateVersion: 1,
      acceptedAt: now,
      completedAt: null,
      rewardReceiptId: null,
    },
    liveOps: {
      cookingStartsEnabled: true,
      craftingStartsEnabled: true,
      collectionEnabled: true,
      tutorialUnlocksEnabled: true,
      tutorialRewardsEnabled: true,
      dustFeesEnabled: true,
      useLocalDurations: true,
      maintenanceMessage: null,
      configurationRevision: 1,
    },
    serverTime: now,
  };
  return {
    now,
    tool,
    furniture,
    stack,
    furnitureStack,
    quickbar,
    inventory,
    verticalSlice,
    workstationInstanceId,
    recipeVersionId,
    readyJob,
    workstationWorkspace,
  };
});

vi.mock('../app/cozy-gameplay-client', () => ({
  bootstrapCozyGameplay: vi.fn(async () => ({
    contentVersion: 1,
    dust: {
      playerId: '22222222-2222-4222-8222-222222222222',
      balance: 250,
      stateVersion: 1,
      starterGrantAppliedAt: fixtures.now,
      updatedAt: fixtures.now,
    },
    inventory: fixtures.inventory,
    quickbar: fixtures.quickbar,
    generatedAt: fixtures.now,
  })),
  loadCozyInventory: vi.fn(async () => ({
    inventory: fixtures.inventory,
    quickbar: fixtures.quickbar,
  })),
  loadFarmPlots: vi.fn(async () => ({
    contentVersion: 1,
    plots: [],
    generatedAt: fixtures.now,
  })),
  loadItemCatalog: vi.fn(async () => ({
    contentVersion: 1,
    generatedAt: fixtures.now,
    items: [fixtures.tool, fixtures.furniture],
  })),
  loadPlayerHome: vi.fn(async () => ({
    location: 'public_world',
    home: {
      id: '33333333-3333-4333-8333-333333333333',
      ownerPlayerId: '22222222-2222-4222-8222-222222222222',
      template: {
        id: '44444444-4444-4444-8444-444444444444',
        slug: 'starter-cottage-interior',
        name: 'Starter Cottage',
        templateVersion: 1,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
        spawn: { x: 5, y: 6 },
        exit: { x: 5, y: 7 },
        blockedCells: [],
        developmentArt: true,
        active: true,
      },
      placements: [],
      returnDestination: {
        mapId: 'lantern-square',
        mapVersionId: '55555555-5555-4555-8555-555555555555',
        x: 12,
        y: 8,
        facingDirection: 'south',
      },
      stateVersion: 1,
      createdAt: fixtures.now,
      updatedAt: fixtures.now,
    },
  })),
  loadDustLedger: vi.fn(async () => ({
    account: {
      playerId: '22222222-2222-4222-8222-222222222222',
      balance: 250,
      stateVersion: 1,
      starterGrantAppliedAt: fixtures.now,
      updatedAt: fixtures.now,
    },
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  loadRecipeCatalog: vi.fn(),
  loadShopCatalog: vi.fn(),
  loadPlayableVerticalSlice: vi.fn(async () => fixtures.verticalSlice),
  acceptStarterFarmingQuest: vi.fn(async () => ({
    view: {
      ...fixtures.verticalSlice,
      quest: { ...fixtures.verticalSlice.quest, status: 'active' },
    },
    replayed: false,
    announcement: 'Starter farming kit received.',
  })),
  mutateHomeFarm: vi.fn(),
  deliverStarterFarmingQuest: vi.fn(),
  loadWorkstationWorkspace: vi.fn(async () => fixtures.workstationWorkspace),
  startWorkstationJob: vi.fn(async () => ({
    job: fixtures.readyJob,
    workspace: fixtures.workstationWorkspace,
    replayed: false,
    announcement: 'Cooking started.',
  })),
  collectWorkstationJob: vi.fn(async () => ({
    job: { ...fixtures.readyJob, status: 'collected', collectedAt: fixtures.now },
    workspace: {
      ...fixtures.workstationWorkspace,
      jobs: [{ ...fixtures.readyJob, status: 'collected', collectedAt: fixtures.now }],
    },
    replayed: false,
    announcement: 'Output collected.',
  })),
  acceptWorkstationTutorial: vi.fn(),
  turnInWorkstationTutorial: vi.fn(),
  updateQuickbar: vi.fn(),
  mutateFarm: vi.fn(),
  executeRecipe: vi.fn(),
  executeShopTransaction: vi.fn(),
  changeHomeAccess: vi.fn(),
  placeFurniture: vi.fn(),
  updateFurniture: vi.fn(),
}));

vi.mock('../app/economy-client', () => ({
  acceptGeneralStoreTutorial: vi.fn(),
  loadGeneralStore: vi.fn(),
  loadGeneralStoreEvents: vi.fn(),
  loadGeneralStoreReceipt: vi.fn(),
  loadEconomyShop: vi.fn(),
  loadPlayerEconomy: vi.fn(),
  purchaseEconomyShop: vi.fn(),
  transactGeneralStore: vi.fn(),
  turnInGeneralStoreTutorial: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('CozyGameplay accessible HUD', () => {
  it('owns the initial DUST load and exposes a narrow explicit retry state without a duplicate ledger read', async () => {
    const { bootstrapCozyGameplay, loadDustLedger } = await import('../app/cozy-gameplay-client');
    const onDustBalanceChange = vi.fn();
    const onDustLoadState = vi.fn();
    const baseProps = {
      apiUrl: 'http://localhost:4000',
      interaction: null,
      onAccessInvalid: vi.fn(),
      onInteractionClose: vi.fn(),
      onOpenChange: vi.fn(),
      onDustBalanceChange,
      onDustLoadState,
    } as const;

    await act(async () => {
      root.render(<CozyGameplay {...baseProps} externalDustRefreshRequest={0} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bootstrapCozyGameplay).toHaveBeenCalledTimes(1);
    expect(loadDustLedger).not.toHaveBeenCalled();
    expect(onDustLoadState).toHaveBeenCalledWith('loading');
    expect(onDustLoadState).toHaveBeenCalledWith('ready');
    expect(onDustBalanceChange).toHaveBeenCalledWith(250);

    vi.mocked(loadDustLedger).mockResolvedValueOnce({
      account: {
        playerId: '22222222-2222-4222-8222-222222222222',
        balance: 0,
        stateVersion: 2,
        starterGrantAppliedAt: fixtures.now,
        updatedAt: fixtures.now,
      },
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    await act(async () => {
      root.render(<CozyGameplay {...baseProps} externalDustRefreshRequest={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadDustLedger).toHaveBeenCalledTimes(1);
    expect(onDustBalanceChange).toHaveBeenLastCalledWith(0);
  });

  it('shows the authoritative DUST balance and opens inventory without touching Phaser', async () => {
    const onOpenChange = vi.fn();
    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={onOpenChange}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('250 DUST');
    const inventoryButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inventory',
    );
    await act(async () => inventoryButton?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Inventory & Quickbar',
    );
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('selects slots 1–8 but ignores number keys while a form field has focus', async () => {
    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    expect(container.querySelector('[aria-label^="Quickbar Slot 2"]')?.className).toContain(
      'selected',
    );

    const input = document.createElement('input');
    container.append(input);
    input.focus();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })));
    expect(container.querySelector('[aria-label^="Quickbar Slot 2"]')?.className).toContain(
      'selected',
    );
    expect(container.querySelector('[aria-label^="Quickbar Slot 3"]')?.className).not.toContain(
      'selected',
    );
  });

  it('explains quickbar Slot 2 with beginner-friendly inventory copy', async () => {
    const { updateQuickbar } = await import('../app/cozy-gameplay-client');
    vi.mocked(updateQuickbar).mockResolvedValue({
      quickbar: {
        assignments: Array.from({ length: 8 }, (_, index) => ({
          slot: index + 1,
          inventoryStackId: index === 1 ? fixtures.stack.id : null,
          assignedItemSlug: index === 1 ? fixtures.tool.slug : null,
        })),
        stateVersion: 2,
      },
      replayed: false,
    });

    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const inventoryButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inventory',
    );
    await act(async () => inventoryButton?.click());

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Editing Slot 1');
    expect(dialog?.textContent).toContain('Press 1 during gameplay');
    expect(dialog?.querySelectorAll('[aria-label^="Quickbar Slot "]')).toHaveLength(8);
    expect(dialog?.textContent).not.toContain('displayed state was refreshed from the server');
    expect(dialog?.textContent).not.toContain('Select a stack for quickbar');

    const slot2 = [...dialog!.querySelectorAll('button')].find((button) =>
      button.getAttribute('aria-label')?.startsWith('Quickbar Slot 2'),
    );
    await act(async () => slot2?.click());
    expect(dialog?.textContent).toContain('Editing Slot 2');
    expect(dialog?.textContent).toContain('Press 2 during gameplay to select this quickbar slot.');
    expect(dialog?.textContent).toContain('Slot 2 is currently empty.');
    expect(dialog?.textContent).toContain('Move shortcut to Slot 2');
    expect(dialog?.textContent).toContain('Remove item from Slot 2');
    expect(dialog?.textContent).toContain('Currently assigned to Slot 1');
    expect(dialog?.textContent).toContain(
      'Furniture is placed from inside your home and cannot be assigned to the quickbar.',
    );
    expect(dialog?.textContent).toContain(
      'Quickbar items are shortcuts. Assigning an item does not duplicate or remove it from your inventory.',
    );

    const moveButton = [...dialog!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Move shortcut to Slot 2',
    );
    await act(async () => {
      moveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateQuickbar).toHaveBeenCalled();
    expect(dialog?.textContent).toContain('Quickbar updated');
    expect(dialog?.textContent).toMatch(
      /Starter Watering Can (is now available|replaced the previous item) in Slot 2/,
    );
    expect(dialog?.textContent).not.toContain('displayed state');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('routes confirmed shop buying through the canonical interaction transaction contract', async () => {
    const { executeShopTransaction } = await import('../app/cozy-gameplay-client');
    const { loadGeneralStore, purchaseEconomyShop, transactGeneralStore } =
      await import('../app/economy-client');
    const workspace = {
      shop: {
        shopId: '74000000-0000-4000-8000-000000000001',
        interactionId: 'phase7-general-store',
        worldObjectId: 'phase7-general-store-object',
        slug: 'lantern-general-store',
        name: 'Lantern General Store',
        description: 'Seeds and ordinary village supplies.',
        shopType: 'npc_general_store' as const,
        shopkeeper: {
          id: '11c00000-0000-4000-8000-000000000001',
          slug: 'mira',
          name: 'Mira',
          introduction: 'Welcome to the General Store.',
        },
        worldId: 'lantern-square',
        worldRevisionId: '11c00000-0000-4000-8000-000000000002',
        x: 5,
        y: 5.7,
        interactionRadius: 1.5,
        assetRef: 'phase7-dev-general-store',
        assetVersionId: null,
        artworkReadiness: 'development_marker' as const,
      },
      catalog: {
        catalogId: '11c00000-0000-4000-8000-000000000010',
        catalogKey: 'general-store',
        publicName: 'General Store',
        versionId: '11c00000-0000-4000-8000-000000000011',
        versionNumber: 2,
        revision: 1,
        status: 'published' as const,
        publishedAt: fixtures.now,
      },
      availability: {
        accessEnabled: true,
        buyingEnabled: true,
        sellingEnabled: true,
        message: null,
        serverTime: fixtures.now,
      },
      dust: { balance: 250, stateVersion: 1 },
      inventory: { stateVersion: 1, capacity: 24, usedSlots: 2 },
      entries: [
        {
          entryId: '11c00000-0000-4000-8000-000000000021',
          offerId: '74000000-0000-4000-8000-000000000019',
          itemId: fixtures.furniture.id,
          itemSlug: fixtures.furniture.slug,
          itemName: fixtures.furniture.name,
          itemDescription: fixtures.furniture.description,
          itemCategory: 'furniture' as const,
          assetRef: fixtures.furniture.assetRef,
          assetReadiness: 'development_marker' as const,
          buyEnabled: true,
          sellEnabled: false,
          buyPrice: 48,
          sellPrice: null,
          currency: 'DUST' as const,
          minimumQuantity: 1,
          maximumQuantity: 20,
          ownedQuantity: 1,
          stockMode: 'global_limited' as const,
          stock: 3,
          maximumStock: 3,
          stockRevision: 1,
          nextRestockAt: null,
          playerBuyDailyLimit: 20,
          playerSellDailyLimit: 20,
          boughtToday: 0,
          soldToday: 0,
          remainingBuyToday: 20,
          remainingSellToday: 20,
          availabilityFrom: null,
          availabilityUntil: null,
          eligibilityRule: 'ordinary_gameplay' as const,
          eligible: true,
          unavailableReason: null,
          entryRevision: 1,
          displayOrder: 1,
        },
      ],
      receipts: [],
      nextReceiptCursor: null,
      tutorial: null,
      lastEventNumber: 0,
      generatedAt: fixtures.now,
    };
    vi.mocked(loadGeneralStore).mockResolvedValue(workspace);
    vi.mocked(transactGeneralStore).mockResolvedValue({
      status: 'completed',
      replayed: false,
      transactionId: '90000000-0000-4000-8000-000000000001',
      direction: 'buy',
      itemSlug: fixtures.furniture.slug,
      quantity: 1,
      dustDelta: -48,
      dustBalance: 202,
      dustStateVersion: 2,
      inventoryStateVersion: 2,
      stockRevision: 2,
      receipt: {
        receiptId: 'STORE-0123456789ABCDEF0123',
        transactionId: '90000000-0000-4000-8000-000000000001',
        shopName: 'Lantern General Store',
        itemName: fixtures.furniture.name,
        itemSlug: fixtures.furniture.slug,
        direction: 'buy',
        quantity: 1,
        unitPrice: 48,
        totalDust: 48,
        currency: 'DUST',
        status: 'completed',
        catalogVersion: 2,
        resultingInventoryQuantity: 2,
        resultingDustBalance: 202,
        dustLedgerReceiptId: 'DUST-0123456789ABCDEF0123',
        supportReference: 'STORE-0123456789ABCDEF0123',
        correctionLinked: false,
        createdAt: fixtures.now,
      },
    });
    const onAuthoritativeMutation = vi.fn();

    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={{
            id: 'phase7-general-store',
            type: 'shop',
            x: 5,
            y: 5.7,
            range: 1.5,
            title: 'Lantern General Store',
            content: 'Browse village supplies.',
            shopSlug: 'lantern-general-store',
          }}
          onAccessInvalid={vi.fn()}
          onAuthoritativeMutation={onAuthoritativeMutation}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const review = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Review buy',
    );
    await act(async () => review?.click());
    const purchase = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Confirm buy',
    );
    await act(async () => {
      purchase?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(transactGeneralStore).toHaveBeenCalledTimes(1);
    expect(transactGeneralStore).toHaveBeenCalledWith(
      'http://localhost:4000',
      'phase7-general-store',
      expect.objectContaining({
        entryId: '11c00000-0000-4000-8000-000000000021',
        expectedCatalogVersionId: '11c00000-0000-4000-8000-000000000011',
        expectedUnitPrice: 48,
        expectedStockRevision: 1,
        direction: 'buy',
        quantity: 1,
      }),
    );
    expect(purchaseEconomyShop).not.toHaveBeenCalled();
    expect(executeShopTransaction).not.toHaveBeenCalled();
    expect(onAuthoritativeMutation).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Purchase complete');
    expect(container.textContent).toContain('STORE-0123456789ABCDEF0123');
  });

  it('opens Willow Guide dialogue and accepts the starter quest without client-selected grants', async () => {
    const { acceptStarterFarmingQuest } = await import('../app/cozy-gameplay-client');
    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={{
            id: 'phase11-willow-guide',
            type: 'starter_npc',
            x: 12,
            y: 10.5,
            range: 2,
            title: 'Willow Guide',
            content: 'Begin your home-garden introduction.',
            npcSlug: 'willow-guide',
          }}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Willow Guide');
    expect(container.textContent).toContain('Your First Moonbean Harvest');
    const accept = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Accept quest and receive starter kit'),
    );
    await act(async () => {
      accept?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acceptStarterFarmingQuest).toHaveBeenCalledWith('http://localhost:4000');
    expect(container.textContent).toContain('Progress saved');
  });

  it('shows keyboard and touch farming controls only for server-owned starter items', async () => {
    const { loadCozyInventory, loadItemCatalog, loadPlayableVerticalSlice } =
      await import('../app/cozy-gameplay-client');
    const hoe = {
      ...fixtures.tool,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'starter-hoe',
      name: 'Willow Starter Hoe',
      metadata: { kind: 'permanent_tool' as const, toolType: 'hoe' as const },
    };
    const seed = {
      ...fixtures.tool,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'moonbean-seed',
      name: 'Moonbean Seed',
      category: 'seed' as const,
      stackable: true,
      maxStackSize: 99,
      giftable: true,
      tradable: true,
      accountBound: false,
      permanentTool: false,
      minimumTransferQuantity: 1,
      maximumTransferQuantity: 99,
      metadata: { kind: 'seed' as const, cropSlug: 'moonbean' },
    };
    const stacks = [
      ...fixtures.inventory.stacks,
      { ...fixtures.stack, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', item: hoe },
      { ...fixtures.stack, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', item: seed, quantity: 4 },
    ];
    vi.mocked(loadCozyInventory).mockResolvedValue({
      inventory: {
        capacity: { ...fixtures.inventory.capacity, usedSlots: 4 },
        stacks,
      },
      quickbar: fixtures.quickbar,
    });
    vi.mocked(loadItemCatalog).mockResolvedValue({
      contentVersion: 2,
      generatedAt: fixtures.now,
      items: [fixtures.tool, fixtures.furniture, hoe, seed],
    });
    vi.mocked(loadPlayableVerticalSlice).mockResolvedValue({
      ...fixtures.verticalSlice,
      inventory: { capacity: { ...fixtures.inventory.capacity, usedSlots: 4 }, stacks },
      quest: {
        ...fixtures.verticalSlice.quest,
        instanceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        status: 'active',
        stateVersion: 3,
        acceptedAt: fixtures.now,
      },
    });

    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const hotbar = container.querySelector('[aria-label="Farming hotbar"]');
    expect(hotbar).not.toBeNull();
    expect(hotbar?.textContent).toContain('Hoe');
    expect(hotbar?.textContent).toContain('Watering can');
    expect(hotbar?.textContent).toContain('Moonbean seed4');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
    expect(container.querySelector('[aria-label="Starter farming tools"]')?.textContent).toContain(
      'Selected: Willow Starter Hoe',
    );
    expect(container.querySelector('[aria-label="Starter quest progress"]')?.textContent).toContain(
      '0 / 9 steps',
    );
  });

  it('loads, starts, and collects a home workstation job by canonical server UUID', async () => {
    const { collectWorkstationJob, loadWorkstationWorkspace, startWorkstationJob } =
      await import('../app/cozy-gameplay-client');
    const interaction = {
      id: 'starter-cooking-hearth',
      type: 'cooking_station' as const,
      x: 2.5,
      y: 2.5,
      range: 1.75,
      title: 'Cooking Hearth',
      content: 'Prepare warm recipes at home.',
      stationType: 'cooking_hearth' as const,
      workstationInstanceId: fixtures.workstationInstanceId,
    };

    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={interaction}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Immutable recipe v1'));

    expect(loadWorkstationWorkspace).toHaveBeenCalledWith(
      'http://localhost:4000',
      fixtures.workstationInstanceId,
    );
    expect(container.textContent).toContain('4 owned / 2 required');
    const start = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Start Garden Soup',
    );
    await act(async () => {
      start?.click();
    });
    await vi.waitFor(() => expect(startWorkstationJob).toHaveBeenCalled());
    expect(startWorkstationJob).toHaveBeenCalledWith(
      'http://localhost:4000',
      fixtures.workstationWorkspace,
      fixtures.recipeVersionId,
      1,
    );

    const jobs = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('Jobs ('),
    );
    await act(async () => jobs?.click());
    expect(container.textContent).toContain('Ready to collect');
    expect(container.textContent).toContain('Expected');
    expect(container.textContent).toContain('Cooking Hearth');
    const collect = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Collect output',
    );
    await act(async () => {
      collect?.click();
    });
    await vi.waitFor(() => expect(collectWorkstationJob).toHaveBeenCalled());
    expect(collectWorkstationJob).toHaveBeenCalledWith(
      'http://localhost:4000',
      fixtures.workstationWorkspace,
      fixtures.readyJob,
    );
  });
});
