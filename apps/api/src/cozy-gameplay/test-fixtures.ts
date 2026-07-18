import type {
  CozyBootstrap,
  DustLedgerView,
  FarmMutationResult,
  FarmPlotList,
  FurnitureMutationResult,
  HomeAccessResult,
  HomeView,
  InventoryHistoryView,
  InventoryView,
  ItemCatalog,
  QuickbarMutationResult,
  RecipeActionResult,
  RecipeCatalog,
  ShopCatalog,
  ShopTransactionResult,
  PlayableVerticalSlice,
  VerticalSliceMutationResult,
  WorkstationJobMutationResponse,
  WorkstationTutorialMutationResponse,
  WorkstationWorkspace,
} from './contracts.js';
import type { Inventory, ItemDefinition, Quickbar } from '@starville/cozy-gameplay';

export const WALLET_ADDRESS = '11111111111111111111111111111111';
export const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
export const STACK_ID = '22222222-2222-4222-8222-222222222222';
export const ITEM_ID = '33333333-3333-4333-8333-333333333333';
export const NOW = '2026-07-13T01:00:00.000Z';

const dust = {
  playerId: PLAYER_ID,
  balance: 250,
  stateVersion: 1,
  starterGrantAppliedAt: NOW,
  updatedAt: NOW,
} as const;

const starterTool: ItemDefinition = {
  id: ITEM_ID,
  slug: 'starter-watering-can',
  name: 'Starter Watering Can',
  description: 'A permanent watering tool for the first garden plots.',
  category: 'permanent_tool',
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
  assetRef: null,
  assetReadiness: 'development_marker',
  active: true,
  contentVersion: 1,
  metadata: { kind: 'permanent_tool', toolType: 'watering_can' },
};

const inventory: Inventory = {
  capacity: { capacity: 24, usedSlots: 1, stateVersion: 1 },
  stacks: [
    {
      id: STACK_ID,
      item: starterTool,
      quantity: 1,
      acquiredAt: NOW,
      updatedAt: NOW,
      stateVersion: 1,
    },
  ],
};

const quickbar: Quickbar = {
  assignments: Array.from({ length: 8 }, (_, index) => ({
    slot: index + 1,
    inventoryStackId: index === 0 ? STACK_ID : null,
    assignedItemSlug: index === 0 ? starterTool.slug : null,
  })),
  stateVersion: 1,
};

export const cozyBootstrapFixture: CozyBootstrap = {
  contentVersion: 1,
  dust,
  inventory,
  quickbar,
  generatedAt: NOW,
};

export const dustLedgerFixture: DustLedgerView = {
  account: dust,
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      delta: 250,
      resultingBalance: 250,
      reason: 'starter_grant',
      referenceType: 'player_bootstrap',
      referenceId: PLAYER_ID,
      requestId: 'phase7-bootstrap-request',
      createdAt: NOW,
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

export const inventoryViewFixture: InventoryView = { inventory, quickbar };

export const itemCatalogFixture: ItemCatalog = {
  contentVersion: 1,
  generatedAt: NOW,
  items: [starterTool],
};

export const inventoryHistoryFixture: InventoryHistoryView = {
  items: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      itemSlug: starterTool.slug,
      delta: 1,
      resultingQuantity: 1,
      reason: 'starter_grant',
      referenceId: PLAYER_ID,
      createdAt: NOW,
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

export const quickbarMutationFixture: QuickbarMutationResult = {
  quickbar,
  replayed: false,
};

export const PLOT_ID = '66666666-6666-4666-8666-666666666666';
export const MAP_VERSION_ID = '77777777-7777-4777-8777-777777777777';
export const RECIPE_ID = '88888888-8888-4888-8888-888888888888';
export const SHOP_ID = '99999999-9999-4999-8999-999999999999';
export const OFFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const emptyPlot = {
  id: PLOT_ID,
  anchorId: 'moonpetal-farm-one',
  mapVersionId: MAP_VERSION_ID,
  slot: 1,
  state: 'empty' as const,
  cropSlug: null,
  plantedAt: null,
  wateredAt: null,
  growthStartedAt: null,
  readyAt: null,
  growthProgress: 0,
  stateVersion: 1,
  updatedAt: NOW,
};

export const farmPlotListFixture: FarmPlotList = {
  contentVersion: 1,
  plots: [emptyPlot],
  generatedAt: NOW,
};

export const farmMutationFixture: FarmMutationResult = {
  plot: {
    ...emptyPlot,
    state: 'needs_water',
    cropSlug: 'moonberry',
    plantedAt: NOW,
    stateVersion: 2,
  },
  inventoryStateVersion: 2,
  replayed: false,
};

export const recipeCatalogFixture: RecipeCatalog = {
  contentVersion: 1,
  recipes: [
    {
      recipe: {
        id: RECIPE_ID,
        slug: 'moonberry-preserves',
        name: 'Moonberry Preserves',
        description: 'A simple jar of softly sweet moonberry preserves.',
        ingredients: [{ itemSlug: 'moonberry', quantity: 2 }],
        outputItemSlug: 'moonberry-preserves',
        outputQuantity: 1,
        dustFee: 0,
        active: true,
        contentVersion: 1,
        kind: 'cooking',
        stationType: 'cooking_hearth',
      },
      maximumCraftable: 2,
      disabledReason: null,
    },
  ],
};

export const recipeActionFixture: RecipeActionResult = {
  recipeSlug: 'moonberry-preserves',
  quantity: 1,
  outputItemSlug: 'moonberry-preserves',
  outputQuantity: 1,
  dustBalance: 250,
  inventoryStateVersion: 3,
  replayed: false,
};

export const shopCatalogFixture: ShopCatalog = {
  shop: {
    id: SHOP_ID,
    slug: 'moonpetal-general-store',
    name: 'Moonpetal General Store',
    description: 'Seeds and simple village provisions sold for DUST.',
    active: true,
    contentVersion: 1,
  },
  offers: [
    {
      id: OFFER_ID,
      shopSlug: 'moonpetal-general-store',
      itemSlug: 'moonberry-seeds',
      buyPrice: 15,
      sellPrice: null,
      minimumQuantity: 1,
      maximumQuantity: 20,
      active: true,
      availableFrom: null,
      availableUntil: null,
      contentVersion: 1,
    },
  ],
  generatedAt: NOW,
};

export const shopTransactionFixture: ShopTransactionResult = {
  transactionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  operation: 'buy',
  itemSlug: 'moonberry-seeds',
  quantity: 2,
  dustDelta: -30,
  dustBalance: 220,
  dustStateVersion: 2,
  inventoryStateVersion: 3,
  replayed: false,
};

export const HOME_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const home = {
  id: HOME_ID,
  ownerPlayerId: PLAYER_ID,
  template: {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    slug: 'starter-cottage-interior',
    name: 'Starter Cottage',
    templateVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
    spawn: { x: 5, y: 6 },
    exit: { x: 5, y: 7 },
    blockedCells: [
      { x: 0, y: 0 },
      { x: 9, y: 7 },
    ],
    developmentArt: true,
    active: true,
  },
  placements: [],
  returnDestination: {
    mapId: 'lantern-square',
    mapVersionId: MAP_VERSION_ID,
    x: 19,
    y: 8,
    facingDirection: 'north' as const,
  },
  stateVersion: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

export const homeViewFixture: HomeView = { home, location: 'public_world' };
export const homeAccessFixture: HomeAccessResult = {
  home: { ...home, stateVersion: 3 },
  location: 'personal_home',
  replayed: false,
};
export const furnitureMutationFixture: FurnitureMutationResult = {
  home: { ...home, stateVersion: 3 },
  inventoryStateVersion: 4,
  replayed: false,
};

export const HOME_FARM_TILE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const STARTER_QUEST_DEFINITION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
export const STARTER_QUEST_VERSION_ID = '12121212-1212-4212-8212-121212121212';
export const STARTER_NPC_ID = '13131313-1313-4313-8313-131313131313';

export const playableVerticalSliceFixture: PlayableVerticalSlice = {
  contentVersion: 1,
  plot: {
    id: HOME_ID,
    ownerPlayerId: PLAYER_ID,
    lifecycle: 'active',
    templateId: home.template.id,
    templateSlug: home.template.slug,
    templateVersion: home.template.templateVersion,
    instanceKey: `personal-home:${HOME_ID}`,
    bounds: home.template.bounds,
    spawn: home.template.spawn,
    exit: home.template.exit,
    currentPosition: home.template.spawn,
    location: 'personal_home',
    tiles: [
      {
        id: HOME_FARM_TILE_ID,
        tileKey: 'garden-one',
        slot: 1,
        x: 3,
        y: 4,
        state: 'empty',
        preparedAt: null,
        crop: null,
        stateVersion: 1,
        updatedAt: NOW,
      },
    ],
    workstations: [],
    farmingStateVersion: 1,
    stateVersion: 3,
    createdAt: NOW,
    updatedAt: NOW,
  },
  inventory,
  quickbar,
  quest: {
    definitionId: STARTER_QUEST_DEFINITION_ID,
    versionId: STARTER_QUEST_VERSION_ID,
    instanceId: null,
    slug: 'a-place-to-grow',
    name: 'A Place to Grow',
    description: 'Meet Willow Guide and grow the first Moonbean crop at home.',
    status: 'available',
    objectives: [
      { key: 'meet_guide', label: 'Meet Willow Guide', current: 0, required: 1, completed: false },
      {
        key: 'receive_starter_kit',
        label: 'Receive the starter kit',
        current: 0,
        required: 1,
        completed: false,
      },
      {
        key: 'enter_home_plot',
        label: 'Enter the personal home plot',
        current: 0,
        required: 1,
        completed: false,
      },
      {
        key: 'prepare_soil',
        label: 'Prepare one soil tile',
        current: 0,
        required: 1,
        completed: false,
      },
      {
        key: 'plant_crops',
        label: 'Plant two Moonbean seeds',
        current: 0,
        required: 2,
        completed: false,
      },
      {
        key: 'water_crops',
        label: 'Water two Moonbean crops',
        current: 0,
        required: 2,
        completed: false,
      },
      {
        key: 'harvest_crop',
        label: 'Harvest one mature crop',
        current: 0,
        required: 1,
        completed: false,
      },
      {
        key: 'deliver_produce',
        label: 'Deliver two Moonbeans',
        current: 0,
        required: 2,
        completed: false,
      },
      {
        key: 'receive_reward',
        label: 'Receive the DUST reward',
        current: 0,
        required: 1,
        completed: false,
      },
    ],
    starterSeedQuantity: 2,
    deliveryQuantity: 2,
    rewardDust: 25,
    stateVersion: 0,
    acceptedAt: null,
    completedAt: null,
    rewardReceiptId: null,
  },
  npc: {
    id: STARTER_NPC_ID,
    slug: 'willow-guide',
    name: 'Willow Guide',
    introduction: 'A patient village guide who helps new residents begin a home garden.',
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
  realtimeChannel: `private-home:${HOME_ID}`,
  serverTime: NOW,
};

export const verticalSliceMutationFixture: VerticalSliceMutationResult = {
  view: playableVerticalSliceFixture,
  replayed: false,
  announcement: 'Personal home plot updated.',
};

export const workstationWorkspaceFixture = {} as WorkstationWorkspace;
export const workstationJobMutationFixture = {} as WorkstationJobMutationResponse;
export const workstationTutorialMutationFixture = {} as WorkstationTutorialMutationResponse;
