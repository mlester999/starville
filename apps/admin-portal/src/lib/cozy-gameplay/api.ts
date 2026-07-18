import 'server-only';

import {
  adminFarmingContentSchema,
  adminPlayerFarmingSchema,
  adminPlayerCozyViewSchema,
  adminPlayerEconomyViewSchema,
  adminPlayerInventoryViewSchema,
  createFarmingPlotTemplateSuccessorInputSchema,
  createFarmingPlotTemplateSuccessorResultSchema,
  createStarterQuestSuccessorInputSchema,
  createStarterQuestSuccessorResultSchema,
  gameplayContentInspectionSchema,
  updateFarmingLiveOpsInputSchema,
  updateFarmingLiveOpsResultSchema,
  updateFarmingCropInputSchema,
  updateFarmingCropResultSchema,
  updateFarmingItemInputSchema,
  updateFarmingItemResultSchema,
  type AdminFarmingContent,
  type AdminPlayerFarming,
  type AdminPlayerCozyView,
  type AdminPlayerEconomyView,
  type AdminPlayerInventoryView,
  type CreateFarmingPlotTemplateSuccessorInput,
  type CreateFarmingPlotTemplateSuccessorResult,
  type CreateStarterQuestSuccessorInput,
  type CreateStarterQuestSuccessorResult,
  type GameplayContentInspection,
  type UpdateFarmingLiveOpsInput,
  type UpdateFarmingLiveOpsResult,
  type UpdateFarmingCropInput,
  type UpdateFarmingCropResult,
  type UpdateFarmingItemInput,
  type UpdateFarmingItemResult,
  adminPlayerCraftingSchema,
  createRecipeSuccessorInputSchema,
  createRecipeSuccessorResultSchema,
  requestCraftingReconciliationInputSchema,
  requestCraftingReconciliationResultSchema,
  updateWorkstationDefinitionInputSchema,
  updateWorkstationDefinitionResultSchema,
  updateWorkstationLiveOpsInputSchema,
  updateWorkstationLiveOpsResultSchema,
  workstationAdminSummarySchema,
  type AdminPlayerCrafting,
  type CreateRecipeSuccessorInput,
  type CreateRecipeSuccessorResult,
  type RequestCraftingReconciliationInput,
  type RequestCraftingReconciliationResult,
  type UpdateWorkstationDefinitionInput,
  type UpdateWorkstationDefinitionResult,
  type UpdateWorkstationLiveOpsInput,
  type UpdateWorkstationLiveOpsResult,
  type WorkstationAdminSummary,
} from '@starville/cozy-gameplay';

import { callTrustedAdminApi } from '../admin-api';

interface PageQuery {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
}

function playerPath(playerId: string, resource: string, query?: PageQuery): string {
  const suffix =
    query === undefined
      ? ''
      : `?${new URLSearchParams({
          page: String(query.page),
          pageSize: String(query.pageSize),
        }).toString()}`;
  return `/api/v1/admin/players/${encodeURIComponent(playerId)}/${resource}${suffix}`;
}

export function loadAdminPlayerEconomy(
  playerId: string,
  query: PageQuery,
): Promise<AdminPlayerEconomyView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'economy', query),
    parser: (value) => adminPlayerEconomyViewSchema.parse(value),
  });
}

export function loadAdminPlayerInventory(
  playerId: string,
  query: PageQuery,
): Promise<AdminPlayerInventoryView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'inventory', query),
    parser: (value) => adminPlayerInventoryViewSchema.parse(value),
  });
}

export function loadAdminPlayerCozy(playerId: string): Promise<AdminPlayerCozyView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'cozy-gameplay'),
    parser: (value) => adminPlayerCozyViewSchema.parse(value),
  });
}

export function loadAdminGameplayContent(): Promise<GameplayContentInspection> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/game-content',
    parser: (value) => gameplayContentInspectionSchema.parse(value),
  });
}

export function loadAdminFarmingContent(): Promise<AdminFarmingContent> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/farming',
    parser: (value) => adminFarmingContentSchema.parse(value),
  });
}

export function loadAdminPlayerFarming(playerId: string): Promise<AdminPlayerFarming> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'farming'),
    parser: (value) => adminPlayerFarmingSchema.parse(value),
  });
}

export function updateAdminFarmingLiveOps(
  input: UpdateFarmingLiveOpsInput,
  requestId: string,
): Promise<UpdateFarmingLiveOpsResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/farming/live-ops',
    body: updateFarmingLiveOpsInputSchema.parse(input),
    requestId,
    parser: (value) => updateFarmingLiveOpsResultSchema.parse(value),
  });
}

export function updateAdminFarmingItem(
  itemId: string,
  input: UpdateFarmingItemInput,
  requestId: string,
): Promise<UpdateFarmingItemResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/farming/items/${encodeURIComponent(itemId)}`,
    body: updateFarmingItemInputSchema.parse(input),
    requestId,
    parser: (value) => updateFarmingItemResultSchema.parse(value),
  });
}

export function updateAdminFarmingCrop(
  cropId: string,
  input: UpdateFarmingCropInput,
  requestId: string,
): Promise<UpdateFarmingCropResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/farming/crops/${encodeURIComponent(cropId)}`,
    body: updateFarmingCropInputSchema.parse(input),
    requestId,
    parser: (value) => updateFarmingCropResultSchema.parse(value),
  });
}

export function createAdminFarmingPlotTemplateSuccessor(
  input: CreateFarmingPlotTemplateSuccessorInput,
  requestId: string,
): Promise<CreateFarmingPlotTemplateSuccessorResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/farming/plot-template/successor',
    body: createFarmingPlotTemplateSuccessorInputSchema.parse(input),
    requestId,
    parser: (value) => createFarmingPlotTemplateSuccessorResultSchema.parse(value),
  });
}

export function createAdminStarterQuestSuccessor(
  input: CreateStarterQuestSuccessorInput,
  requestId: string,
): Promise<CreateStarterQuestSuccessorResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/farming/starter-quest/successor',
    body: createStarterQuestSuccessorInputSchema.parse(input),
    requestId,
    parser: (value) => createStarterQuestSuccessorResultSchema.parse(value),
  });
}

export function loadAdminCraftingContent(): Promise<WorkstationAdminSummary> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/crafting',
    parser: (value) => workstationAdminSummarySchema.parse(value),
  });
}

export function loadAdminPlayerCrafting(playerId: string): Promise<AdminPlayerCrafting> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'crafting'),
    parser: (value) => adminPlayerCraftingSchema.parse(value),
  });
}

export function updateAdminCraftingLiveOps(
  input: UpdateWorkstationLiveOpsInput,
  requestId: string,
): Promise<UpdateWorkstationLiveOpsResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/crafting/live-ops',
    body: updateWorkstationLiveOpsInputSchema.parse(input),
    requestId,
    parser: (value) => updateWorkstationLiveOpsResultSchema.parse(value),
  });
}

export function updateAdminWorkstation(
  workstationId: string,
  input: UpdateWorkstationDefinitionInput,
  requestId: string,
): Promise<UpdateWorkstationDefinitionResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/crafting/workstations/${encodeURIComponent(workstationId)}`,
    body: updateWorkstationDefinitionInputSchema.parse(input),
    requestId,
    parser: (value) => updateWorkstationDefinitionResultSchema.parse(value),
  });
}

export function createAdminRecipeSuccessor(
  input: CreateRecipeSuccessorInput,
  requestId: string,
): Promise<CreateRecipeSuccessorResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/crafting/recipes/successor',
    body: createRecipeSuccessorInputSchema.parse(input),
    requestId,
    parser: (value) => createRecipeSuccessorResultSchema.parse(value),
  });
}

export function requestAdminCraftingReconciliation(
  jobId: string,
  input: RequestCraftingReconciliationInput,
  requestId: string,
): Promise<RequestCraftingReconciliationResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/crafting/jobs/${encodeURIComponent(jobId)}/reconcile`,
    body: requestCraftingReconciliationInputSchema.parse(input),
    requestId,
    parser: (value) => requestCraftingReconciliationResultSchema.parse(value),
  });
}
