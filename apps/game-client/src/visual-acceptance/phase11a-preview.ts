import type {
  FarmView,
  HomeView,
  ItemCatalog,
  PlayableVerticalSlice,
  WorkstationWorkspace,
} from '../app/cozy-gameplay-client';
import type { Phase7ABootstrap } from '@starville/cozy-gameplay';

const now = '2026-07-17T04:00:00.000Z';
const playerId = '21111111-1111-4111-8111-111111111111';
const homeId = '23333333-3333-4333-8333-333333333333';

const hoe = {
  id: 'a1100000-0000-4000-8000-000000000001',
  slug: 'starter-hoe',
  name: 'Willow Starter Hoe',
  description: 'A light account-bound hoe for preparing soil.',
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
  assetRef: 'phase11a-dev-starter-hoe',
  assetReadiness: 'development_marker' as const,
  active: true,
  contentVersion: 2,
  metadata: { kind: 'permanent_tool' as const, toolType: 'hoe' as const },
};

const wateringCan = {
  ...hoe,
  id: '71000000-0000-4000-8000-000000000021',
  slug: 'starter-watering-can',
  name: 'Starter Watering Can',
  description: 'A permanent watering can for the home garden.',
  assetRef: 'phase7-dev-starter-watering-can',
  contentVersion: 1,
  metadata: { kind: 'permanent_tool' as const, toolType: 'watering_can' as const },
};

const seed = {
  id: '71000000-0000-4000-8000-000000000001',
  slug: 'moonbean-seed',
  name: 'Moonbean Seed',
  description: 'A gentle starter seed for Moonbeans.',
  category: 'seed' as const,
  stackable: true,
  maxStackSize: 99,
  buyEligible: false,
  sellEligible: false,
  giftable: false,
  tradable: false,
  accountBound: true,
  permanentTool: false,
  minimumTransferQuantity: 1,
  maximumTransferQuantity: 1,
  defaultBuyPrice: null,
  defaultSellPrice: null,
  assetRef: 'phase7-dev-moonbean-seed',
  assetReadiness: 'development_marker' as const,
  active: true,
  contentVersion: 2,
  metadata: { kind: 'seed' as const, cropSlug: 'moonbean' },
};

const produce = {
  ...seed,
  id: '71000000-0000-4000-8000-000000000004',
  slug: 'moonbean',
  name: 'Moonbean',
  description: 'A freshly harvested Moonbean.',
  category: 'crop' as const,
  assetRef: 'phase7-dev-moonbean',
  metadata: { kind: 'crop' as const, cropSlug: 'moonbean' },
};

const stacks = [
  { id: '31111111-1111-4111-8111-111111111111', item: hoe, quantity: 1 },
  { id: '32222222-2222-4222-8222-222222222222', item: wateringCan, quantity: 1 },
  { id: '33333333-3333-4333-8333-333333333333', item: seed, quantity: 2 },
  { id: '34444444-4444-4444-8444-444444444444', item: produce, quantity: 4 },
].map((stack) => ({ ...stack, acquiredAt: now, updatedAt: now, stateVersion: 1 }));

const inventory = {
  capacity: { capacity: 24, usedSlots: stacks.length, stateVersion: 3 },
  stacks,
};

const quickbar = {
  assignments: Array.from({ length: 8 }, (_, index) => ({
    slot: index + 1,
    inventoryStackId: stacks[index]?.id ?? null,
    assignedItemSlug: stacks[index]?.item.slug ?? null,
  })),
  stateVersion: 3,
};

const cropSnapshot = {
  definitionId: '72000000-0000-4000-8000-000000000001',
  cropSlug: 'moonbean',
  cropName: 'Moonbean',
  seedItemSlug: seed.slug,
  produceItemSlug: produce.slug,
  configurationRevision: 3,
  growthDurationSeconds: 420,
  growthStageCount: 4,
  deterministicYield: 3,
  wateringPolicy: 'water_once_to_start' as const,
};

function tile(slot: number, state: 'empty' | 'prepared' | 'planted' | 'growing' | 'mature') {
  const crop =
    state === 'planted'
      ? {
          id: `43333333-3333-4333-8333-33333333333${slot}`,
          tileId: `42222222-2222-4222-8222-22222222222${slot}`,
          state,
          snapshot: cropSnapshot,
          plantedAt: now,
          wateredAt: null,
          growthStartedAt: null,
          maturesAt: null,
          growthProgress: 0,
          growthStage: 1,
          stateVersion: 1,
          updatedAt: now,
        }
      : state === 'growing' || state === 'mature'
        ? {
            id: `43333333-3333-4333-8333-33333333333${slot}`,
            tileId: `42222222-2222-4222-8222-22222222222${slot}`,
            state,
            snapshot: cropSnapshot,
            plantedAt: '2026-07-17T03:50:00.000Z',
            wateredAt: '2026-07-17T03:51:00.000Z',
            growthStartedAt: '2026-07-17T03:51:00.000Z',
            maturesAt: '2026-07-17T03:58:00.000Z',
            growthProgress: state === 'mature' ? 1 : 0.58,
            growthStage: state === 'mature' ? 4 : 3,
            stateVersion: 2,
            updatedAt: now,
          }
        : null;
  return {
    id: `42222222-2222-4222-8222-22222222222${slot}`,
    tileKey: `garden-${slot}`,
    slot,
    x: 2 + ((slot - 1) % 4),
    y: 3 + Math.floor((slot - 1) / 4),
    state,
    preparedAt: state === 'empty' ? null : '2026-07-17T03:48:00.000Z',
    crop,
    stateVersion: crop === null ? 1 : crop.stateVersion,
    updatedAt: now,
  };
}

const objectives = [
  ['meet_guide', 'Speak with Willow Guide', 1, 1],
  ['receive_starter_kit', 'Receive the starter farming kit', 1, 1],
  ['enter_home_plot', 'Enter your private home plot', 1, 1],
  ['prepare_soil', 'Prepare two garden tiles', 2, 2],
  ['plant_crops', 'Plant two Moonbean seeds', 2, 2],
  ['water_crops', 'Water both crops', 1, 2],
  ['harvest_crop', 'Harvest one mature Moonbean crop', 0, 1],
  ['deliver_produce', 'Deliver two Moonbeans', 0, 1],
  ['receive_reward', 'Receive the tutorial DUST reward', 0, 1],
] as const;

const workstationTutorialObjectives = [
  ['speak_with_guide', 'Speak with Willow Guide', 1, 1],
  ['unlock_cooking_recipe', 'Unlock Garden Soup', 1, 1],
  ['collect_cooked_item', 'Collect one cooked item', 0, 1],
  ['unlock_crafting_recipe', 'Unlock Garden Twine', 0, 1],
  ['collect_crafted_item', 'Collect one crafted item', 0, 1],
  ['return_to_guide', 'Return to Willow Guide', 0, 1],
  ['receive_reward', 'Receive 20 DUST', 0, 1],
] as const;

const workstationTutorial = {
  definitionId: 'b1100000-0000-4000-8000-000000000401',
  versionId: 'b1100000-0000-4000-8000-000000000411',
  instanceId: 'b1100000-0000-4000-8000-000000000421',
  key: 'hearth-and-hands',
  name: 'Hearth and Hands',
  description: 'Cook, craft, and return to Willow Guide.',
  eligible: true,
  status: 'active' as const,
  objectives: workstationTutorialObjectives.map(([key, label, current, required]) => ({
    key,
    label,
    current,
    required,
    completed: current >= required,
  })),
  rewardDust: 20,
  stateVersion: 3,
  acceptedAt: now,
  completedAt: null,
  rewardReceiptId: null,
};

const cookingHearth = {
  id: 'b1100000-0000-4000-8000-000000000101',
  homeId,
  worldObjectId: 'starter-cooking-hearth',
  definition: {
    id: 'b1100000-0000-4000-8000-000000000001',
    key: 'starter-cooking-hearth',
    name: 'Cooking Hearth',
    description: 'Prepare warm recipes in your private home.',
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
  stateVersion: 4,
  queue: { capacity: 2, occupied: 2, running: 1, ready: 1, remainingSlots: 0 },
};

const craftingWorkbench = {
  ...cookingHearth,
  id: 'b1100000-0000-4000-8000-000000000102',
  worldObjectId: 'starter-crafting-workbench',
  definition: {
    ...cookingHearth.definition,
    id: 'b1100000-0000-4000-8000-000000000002',
    key: 'starter-crafting-workbench',
    name: 'Crafting Workbench',
    description: 'Shape useful home materials from gathered ingredients.',
    type: 'crafting_workbench' as const,
    allowedRecipeCategories: ['crafting' as const],
    fallbackMarker: 'W',
  },
  position: { x: 7, y: 2 },
  interactionPoint: { x: 6.5, y: 2.5 },
  stateVersion: 1,
  queue: { capacity: 2, occupied: 0, running: 0, ready: 0, remainingSlots: 2 },
};

export const phase11aPreviewSlice = {
  contentVersion: 3,
  plot: {
    id: homeId,
    ownerPlayerId: playerId,
    lifecycle: 'active',
    templateId: '76000000-0000-4000-8000-000000000001',
    templateSlug: 'starter-cottage-interior',
    templateVersion: 1,
    instanceKey: `personal-home:${homeId}`,
    workstations: [cookingHearth, craftingWorkbench],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
    spawn: { x: 5, y: 6 },
    exit: { x: 5, y: 7 },
    currentPosition: { x: 4, y: 4 },
    location: 'personal_home',
    tiles: [
      tile(1, 'empty'),
      tile(2, 'prepared'),
      tile(3, 'planted'),
      tile(4, 'growing'),
      tile(5, 'mature'),
      tile(6, 'empty'),
      tile(7, 'empty'),
      tile(8, 'empty'),
    ],
    farmingStateVersion: 8,
    stateVersion: 4,
    createdAt: now,
    updatedAt: now,
  },
  inventory,
  quickbar,
  quest: {
    definitionId: 'a1100000-0000-4000-8000-000000000031',
    versionId: 'a1100000-0000-4000-8000-000000000032',
    instanceId: 'a1100000-0000-4000-8000-000000000050',
    slug: 'first-moonbean-harvest',
    name: 'Your First Moonbean Harvest',
    description: 'Grow Moonbeans and bring a small delivery back to Willow Guide.',
    status: 'active',
    objectives: objectives.map(([key, label, current, required]) => ({
      key,
      label,
      current,
      required,
      completed: current >= required,
    })),
    starterSeedQuantity: 4,
    deliveryQuantity: 2,
    rewardDust: 25,
    stateVersion: 6,
    acceptedAt: now,
    completedAt: null,
    rewardReceiptId: null,
  },
  workstationTutorial,
  npc: {
    id: 'a1100000-0000-4000-8000-000000000021',
    slug: 'willow-guide',
    name: 'Willow Guide',
    introduction: 'Let us prepare your first home garden.',
    worldId: 'lantern-square',
    x: 12,
    y: 10.5,
    interactionRange: 2.5,
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
  realtimeChannel: `private-home:${homeId}`,
  serverTime: now,
} satisfies PlayableVerticalSlice;

const home = {
  id: homeId,
  ownerPlayerId: playerId,
  template: {
    id: phase11aPreviewSlice.plot.templateId,
    slug: phase11aPreviewSlice.plot.templateSlug,
    name: 'Starter Cottage Interior',
    templateVersion: 1,
    bounds: phase11aPreviewSlice.plot.bounds,
    spawn: phase11aPreviewSlice.plot.spawn,
    exit: phase11aPreviewSlice.plot.exit,
    blockedCells: [],
    developmentArt: true,
    active: true,
  },
  placements: [],
  returnDestination: {
    mapId: 'lantern-square',
    mapVersionId: '79000000-0000-4000-8000-000000000001',
    x: 12,
    y: 10.5,
    facingDirection: 'south' as const,
  },
  stateVersion: 4,
  createdAt: now,
  updatedAt: now,
};

const bootstrap = {
  contentVersion: 3,
  dust: {
    playerId,
    balance: 250,
    stateVersion: 1,
    starterGrantAppliedAt: now,
    updatedAt: now,
  },
  inventory,
  quickbar,
  generatedAt: now,
} satisfies Phase7ABootstrap;

const itemCatalog = {
  contentVersion: 3,
  generatedAt: now,
  items: [hoe, wateringCan, seed, produce],
} satisfies ItemCatalog;

const farm = { contentVersion: 3, plots: [], generatedAt: now } satisfies FarmView;
const homeView = { location: 'personal_home', home } satisfies HomeView;

const gardenSoupRecipe = {
  definitionId: 'b1100000-0000-4000-8000-000000000201',
  versionId: 'b1100000-0000-4000-8000-000000000211',
  versionNumber: 1,
  key: 'garden-soup',
  name: 'Garden Soup',
  description: 'A simple home-cooked bowl made from tutorial Moonbeans.',
  category: 'cooking' as const,
  workstationType: 'cooking_hearth' as const,
  ingredients: [
    {
      itemId: produce.id,
      itemSlug: produce.slug,
      itemName: produce.name,
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
};

function workstationJob(
  id: string,
  status: 'running' | 'ready',
  startedAt: string,
  completesAt: string,
) {
  return {
    id,
    workstationInstanceId: cookingHearth.id,
    workstationDefinitionId: cookingHearth.definition.id,
    recipeDefinitionId: gardenSoupRecipe.definitionId,
    recipeVersionId: gardenSoupRecipe.versionId,
    recipeKey: gardenSoupRecipe.key,
    recipeName: gardenSoupRecipe.name,
    recipeCategory: gardenSoupRecipe.category,
    workstationType: gardenSoupRecipe.workstationType,
    quantity: 1,
    status,
    startedAt,
    completesAt,
    collectedAt: null,
    ingredients: [
      {
        itemId: produce.id,
        itemSlug: produce.slug,
        itemName: produce.name,
        quantity: 2,
        consumed: true as const,
      },
    ],
    output: { itemSlug: 'garden-soup', itemName: 'Garden Soup', quantity: 1 },
    durationSeconds: 300,
    remainingSeconds: status === 'ready' ? 0 : 180,
    progress: status === 'ready' ? 1 : 0.4,
    dustFee: 0,
    stateVersion: status === 'ready' ? 2 : 1,
    failureCode: null,
    updatedAt: now,
  };
}

export const phase11bWorkstationWorkspace = {
  workstation: cookingHearth,
  recipes: [gardenSoupRecipe],
  jobs: [
    workstationJob(
      'b1100000-0000-4000-8000-000000000301',
      'running',
      new Date(Date.now() - 120_000).toISOString(),
      new Date(Date.now() + 180_000).toISOString(),
    ),
    workstationJob(
      'b1100000-0000-4000-8000-000000000302',
      'ready',
      '2026-07-17T03:50:00.000Z',
      '2026-07-17T03:55:00.000Z',
    ),
  ],
  inventory,
  dust: bootstrap.dust,
  tutorial: workstationTutorial,
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
} satisfies WorkstationWorkspace;

export const PHASE11A_PREVIEW_API_PREFIX = '/api/v1/token-access/player/cozy';

export function phase11aPreviewApi(pathname: string, method: string): unknown | undefined {
  if (!pathname.startsWith(PHASE11A_PREVIEW_API_PREFIX)) return undefined;
  const path = pathname.slice(PHASE11A_PREVIEW_API_PREFIX.length);
  if (path === '/bootstrap' && method === 'POST') return bootstrap;
  if (path === '/inventory' && method === 'GET') return { inventory, quickbar };
  if (path === '/farm' && method === 'GET') return farm;
  if (path === '/items' && method === 'GET') return itemCatalog;
  if (path === '/home' && method === 'GET') return homeView;
  if (path === '/vertical-slice' && method === 'GET') return phase11aPreviewSlice;
  if (path === `/workstations/${cookingHearth.id}` && method === 'GET') {
    return phase11bWorkstationWorkspace;
  }
  return undefined;
}
