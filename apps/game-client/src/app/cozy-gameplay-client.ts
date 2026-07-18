import { z } from 'zod';

import {
  dustLedgerPageSchema,
  dustAccountSchema,
  farmMutationResponseSchema,
  farmPlotSchema,
  furnitureMutationResponseSchema,
  homeAccessResponseSchema,
  homeViewSchema,
  inventoryMovementPageSchema,
  inventorySchema,
  itemCatalogSchema,
  paginationMetaSchema,
  playableVerticalSliceSchema,
  phase7ABootstrapSchema,
  quickbarSchema,
  recipeActionResponseSchema,
  recipeCatalogSchema,
  shopCatalogSchema,
  shopTransactionResponseSchema,
  verticalSliceMutationResponseSchema,
  workstationJobMutationResponseSchema,
  workstationTutorialMutationResponseSchema,
  workstationWorkspaceSchema,
  type FarmPlot,
  type HomeAccessResponse,
  type HomeView,
  type Inventory,
  type ItemCatalog,
  type PlayableVerticalSlice,
  type Quickbar,
  type RecipeDefinition,
  type ShopOffer,
  type CraftingJob,
  type WorkstationTutorial,
  type WorkstationWorkspace,
} from '@starville/cozy-gameplay';

import { PlayerRequestError, requestPlayerApi } from './player-client';

const invalidResponse = () => new PlayerRequestError(502, 'INVALID_COZY_GAMEPLAY_RESPONSE');

function parsed<Data>(
  result: { readonly success: true; readonly data: Data } | { readonly success: false },
): Data {
  if (!result.success) throw invalidResponse();
  return result.data;
}

export function createCozyIdempotencyKey(): string {
  return `cozy-${crypto.randomUUID()}`;
}

const inventoryViewSchema = z
  .object({ inventory: inventorySchema, quickbar: quickbarSchema })
  .strict();
const farmViewSchema = z
  .object({
    contentVersion: z.number().int().positive(),
    plots: z.array(farmPlotSchema).max(64),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const quickbarResultSchema = z.object({ quickbar: quickbarSchema, replayed: z.boolean() }).strict();

export type CozyBootstrap = z.infer<typeof phase7ABootstrapSchema>;
export type FarmView = z.infer<typeof farmViewSchema>;
export type RecipeCatalog = z.infer<typeof recipeCatalogSchema>;
export type ShopCatalog = z.infer<typeof shopCatalogSchema>;
export type { FarmPlot, HomeAccessResponse, HomeView, Inventory, ItemCatalog, Quickbar };
export type { PlayableVerticalSlice };
export type RecipeAvailability = RecipeCatalog['recipes'][number];
export type { RecipeDefinition, ShopOffer };
export type { CraftingJob, WorkstationTutorial, WorkstationWorkspace };

async function cozyRequest(
  apiUrl: string,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown,
) {
  return requestPlayerApi(apiUrl, `/cozy${path}`, {
    method,
    ...(body === undefined ? {} : { body }),
  });
}

export async function bootstrapCozyGameplay(apiUrl: string): Promise<CozyBootstrap> {
  return parsed(
    phase7ABootstrapSchema.safeParse(
      await cozyRequest(apiUrl, '/bootstrap', 'POST', {
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function loadCozyInventory(apiUrl: string) {
  return parsed(inventoryViewSchema.safeParse(await cozyRequest(apiUrl, '/inventory', 'GET')));
}

export async function loadCozyInventoryHistory(apiUrl: string, page = 1) {
  return parsed(
    inventoryMovementPageSchema.safeParse(
      await cozyRequest(apiUrl, `/inventory/history?cursor=${page}&limit=20`, 'GET'),
    ),
  );
}

export async function loadDustLedger(apiUrl: string, page = 1) {
  const value = await cozyRequest(apiUrl, `/dust?cursor=${page}&limit=20`, 'GET');
  const schema = z.object({
    account: dustAccountSchema,
    items: dustLedgerPageSchema.shape.items,
    pagination: paginationMetaSchema,
  });
  return parsed(schema.strict().safeParse(value));
}

export async function loadFarmPlots(apiUrl: string): Promise<FarmView> {
  return parsed(farmViewSchema.safeParse(await cozyRequest(apiUrl, '/farm', 'GET')));
}

export async function loadItemCatalog(apiUrl: string): Promise<ItemCatalog> {
  return parsed(itemCatalogSchema.safeParse(await cozyRequest(apiUrl, '/items', 'GET')));
}

export async function loadRecipeCatalog(
  apiUrl: string,
  kind: 'cooking' | 'crafting',
): Promise<RecipeCatalog> {
  return parsed(
    recipeCatalogSchema.safeParse(await cozyRequest(apiUrl, `/recipes/${kind}`, 'GET')),
  );
}

export async function loadShopCatalog(apiUrl: string, shopSlug: string): Promise<ShopCatalog> {
  return parsed(
    shopCatalogSchema.safeParse(
      await cozyRequest(apiUrl, `/shops/${encodeURIComponent(shopSlug)}`, 'GET'),
    ),
  );
}

export async function loadPlayerHome(apiUrl: string): Promise<HomeView> {
  return parsed(homeViewSchema.safeParse(await cozyRequest(apiUrl, '/home', 'GET')));
}

export async function loadPlayableVerticalSlice(apiUrl: string): Promise<PlayableVerticalSlice> {
  return parsed(
    playableVerticalSliceSchema.safeParse(await cozyRequest(apiUrl, '/vertical-slice', 'GET')),
  );
}

export async function acceptStarterFarmingQuest(apiUrl: string) {
  return parsed(
    verticalSliceMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/quest/accept', 'POST', {
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function mutateHomeFarm(
  apiUrl: string,
  operation: 'prepare' | 'plant' | 'water' | 'harvest',
  tile: PlayableVerticalSlice['plot']['tiles'][number],
  seedItemSlug?: string,
) {
  return parsed(
    verticalSliceMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, `/home-plot/${operation}`, 'POST', {
        tileId: tile.id,
        expectedTileStateVersion: tile.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
        ...(operation === 'plant' ? { seedItemSlug } : {}),
        ...(operation === 'water' || operation === 'harvest'
          ? {
              cropInstanceId: tile.crop?.id,
              expectedCropStateVersion: tile.crop?.stateVersion,
            }
          : {}),
      }),
    ),
  );
}

export async function deliverStarterFarmingQuest(
  apiUrl: string,
  quest: PlayableVerticalSlice['quest'],
) {
  return parsed(
    verticalSliceMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/quest/deliver', 'POST', {
        expectedQuestStateVersion: quest.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function loadWorkstationWorkspace(
  apiUrl: string,
  workstationInstanceId: string,
): Promise<WorkstationWorkspace> {
  return parsed(
    workstationWorkspaceSchema.safeParse(
      await cozyRequest(
        apiUrl,
        `/workstations/${encodeURIComponent(workstationInstanceId)}`,
        'GET',
      ),
    ),
  );
}

export async function startWorkstationJob(
  apiUrl: string,
  workspace: WorkstationWorkspace,
  recipeVersionId: string,
  quantity: number,
) {
  return parsed(
    workstationJobMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/workstation-jobs/start', 'POST', {
        workstationInstanceId: workspace.workstation.id,
        recipeVersionId,
        quantity,
        expectedInventoryStateVersion: workspace.inventory.capacity.stateVersion,
        expectedDustStateVersion: workspace.dust.stateVersion,
        expectedWorkstationStateVersion: workspace.workstation.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function collectWorkstationJob(
  apiUrl: string,
  workspace: WorkstationWorkspace,
  job: CraftingJob,
) {
  return parsed(
    workstationJobMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/workstation-jobs/collect', 'POST', {
        workstationInstanceId: workspace.workstation.id,
        craftingJobId: job.id,
        expectedJobStateVersion: job.stateVersion,
        expectedInventoryStateVersion: workspace.inventory.capacity.stateVersion,
        expectedWorkstationStateVersion: workspace.workstation.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function acceptWorkstationTutorial(apiUrl: string) {
  return parsed(
    workstationTutorialMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/quest/workstations/accept', 'POST', {
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function turnInWorkstationTutorial(apiUrl: string, tutorial: WorkstationTutorial) {
  return parsed(
    workstationTutorialMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/quest/workstations/turn-in', 'POST', {
        expectedQuestStateVersion: tutorial.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function updateQuickbar(
  apiUrl: string,
  slot: number,
  input: { readonly inventoryStackId: string | null; readonly expectedStateVersion: number },
) {
  return parsed(
    quickbarResultSchema.safeParse(
      await cozyRequest(apiUrl, `/quickbar/${slot}`, 'PUT', {
        ...input,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function mutateFarm(
  apiUrl: string,
  operation: 'plant' | 'water' | 'harvest',
  plot: FarmPlot,
  seedItemSlug?: string,
) {
  return parsed(
    farmMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, `/farm/${operation}`, 'POST', {
        plotId: plot.id,
        expectedStateVersion: plot.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
        ...(operation === 'plant' ? { seedItemSlug } : {}),
      }),
    ),
  );
}

export async function executeRecipe(
  apiUrl: string,
  kind: 'cooking' | 'crafting',
  recipeSlug: string,
  stationInteractionId: string,
  state: { readonly inventory: number; readonly dust: number },
) {
  return parsed(
    recipeActionResponseSchema.safeParse(
      await cozyRequest(apiUrl, kind === 'cooking' ? '/cook' : '/craft', 'POST', {
        recipeSlug,
        stationInteractionId,
        quantity: 1,
        expectedInventoryStateVersion: state.inventory,
        expectedDustStateVersion: state.dust,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function executeShopTransaction(
  apiUrl: string,
  shopSlug: string,
  operation: 'buy' | 'sell',
  offerId: string,
  state: { readonly inventory: number; readonly dust: number },
) {
  return parsed(
    shopTransactionResponseSchema.safeParse(
      await cozyRequest(apiUrl, `/shops/${encodeURIComponent(shopSlug)}/${operation}`, 'POST', {
        offerId,
        quantity: 1,
        expectedInventoryStateVersion: state.inventory,
        expectedDustStateVersion: state.dust,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function changeHomeAccess(
  apiUrl: string,
  operation: 'enter' | 'exit',
  home: HomeView['home'],
): Promise<HomeAccessResponse> {
  return parsed(
    homeAccessResponseSchema.safeParse(
      await cozyRequest(apiUrl, `/home/${operation}`, 'POST', {
        expectedHomeStateVersion: home.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
      }),
    ),
  );
}

export async function placeFurniture(
  apiUrl: string,
  home: HomeView['home'],
  input: {
    readonly inventoryStackId: string;
    readonly furnitureSlug: string;
    readonly x: number;
    readonly y: number;
  },
) {
  return parsed(
    furnitureMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, '/home/furniture/place', 'POST', {
        homeId: home.id,
        expectedHomeStateVersion: home.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
        rotation: 0,
        ...input,
      }),
    ),
  );
}

export async function updateFurniture(
  apiUrl: string,
  operation: 'move' | 'rotate' | 'remove',
  home: HomeView['home'],
  placement: HomeView['home']['placements'][number],
  input: { readonly x?: number; readonly y?: number; readonly rotation?: 0 | 90 | 180 | 270 } = {},
) {
  return parsed(
    furnitureMutationResponseSchema.safeParse(
      await cozyRequest(apiUrl, `/home/furniture/${operation}`, 'POST', {
        homeId: home.id,
        placementId: placement.id,
        expectedHomeStateVersion: home.stateVersion,
        expectedPlacementStateVersion: placement.stateVersion,
        idempotencyKey: createCozyIdempotencyKey(),
        ...input,
      }),
    ),
  );
}
