'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createFarmingPlotTemplateSuccessorInputSchema,
  createStarterQuestSuccessorInputSchema,
  updateFarmingCropInputSchema,
  updateFarmingItemInputSchema,
  updateFarmingLiveOpsInputSchema,
} from '@starville/cozy-gameplay';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  createAdminFarmingPlotTemplateSuccessor,
  createAdminStarterQuestSuccessor,
  updateAdminFarmingCrop,
  updateAdminFarmingItem,
  updateAdminFarmingLiveOps,
} from '../../lib/cozy-gameplay/api';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(formData: FormData, name: string): number {
  return Number(field(formData, name));
}

function booleanField(formData: FormData, name: string): boolean {
  return field(formData, name) === 'true';
}

function nullableNumberField(formData: FormData, name: string): number | null {
  const value = field(formData, name);
  return value === '' ? null : Number(value);
}

function jsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(field(formData, name)) as unknown;
  } catch {
    return undefined;
  }
}

function farmingRedirect(notice: string): never {
  redirect(`/game-content/farming?notice=${notice}`);
}

export async function updateFarmingLiveOpsAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('farming.liveops');
  const input = updateFarmingLiveOpsInputSchema.safeParse({
    expectedRevision: numberField(formData, 'expectedRevision'),
    plantingEnabled: booleanField(formData, 'plantingEnabled'),
    harvestingEnabled: booleanField(formData, 'harvestingEnabled'),
    plotProvisioningEnabled: booleanField(formData, 'plotProvisioningEnabled'),
    starterQuestEnabled: booleanField(formData, 'starterQuestEnabled'),
    tutorialRewardsEnabled: booleanField(formData, 'tutorialRewardsEnabled'),
    maintenanceMessage: field(formData, 'maintenanceMessage') || null,
    reason: field(formData, 'reason'),
  });
  if (!input.success) farmingRedirect('invalid-live-ops');
  try {
    await updateAdminFarmingLiveOps(input.data, randomUUID());
  } catch {
    farmingRedirect('live-ops-update-failed');
  }
  revalidatePath('/game-content/farming');
  farmingRedirect('live-ops-updated');
}

export async function updateFarmingItemAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('farming.content_manage');
  const itemId = field(formData, 'itemId');
  const input = updateFarmingItemInputSchema.safeParse({
    expectedContentVersion: numberField(formData, 'expectedContentVersion'),
    definition: {
      name: field(formData, 'name'),
      description: field(formData, 'description'),
      category: field(formData, 'category'),
      stackable: booleanField(formData, 'stackable'),
      maxStackSize: numberField(formData, 'maxStackSize'),
      buyEligible: booleanField(formData, 'buyEligible'),
      sellEligible: booleanField(formData, 'sellEligible'),
      giftable: booleanField(formData, 'giftable'),
      tradable: booleanField(formData, 'tradable'),
      accountBound: booleanField(formData, 'accountBound'),
      permanentTool: booleanField(formData, 'permanentTool'),
      minimumTransferQuantity: numberField(formData, 'minimumTransferQuantity'),
      maximumTransferQuantity: numberField(formData, 'maximumTransferQuantity'),
      defaultBuyPrice: nullableNumberField(formData, 'defaultBuyPrice'),
      defaultSellPrice: nullableNumberField(formData, 'defaultSellPrice'),
      assetRef: field(formData, 'assetRef') || null,
      assetReadiness: field(formData, 'assetReadiness'),
      active: booleanField(formData, 'active'),
      metadata: jsonField(formData, 'metadata'),
    },
    reason: field(formData, 'reason'),
  });
  if (!input.success || itemId === '') farmingRedirect('invalid-item-update');
  try {
    await updateAdminFarmingItem(itemId, input.data, randomUUID());
  } catch {
    farmingRedirect('item-update-failed');
  }
  revalidatePath('/game-content/farming');
  farmingRedirect('item-updated');
}

export async function updateFarmingCropAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('farming.content_manage');
  const cropId = field(formData, 'cropId');
  const input = updateFarmingCropInputSchema.safeParse({
    expectedConfigurationRevision: numberField(formData, 'expectedConfigurationRevision'),
    definition: {
      name: field(formData, 'name'),
      description: field(formData, 'description'),
      seedItemId: field(formData, 'seedItemId'),
      produceItemId: field(formData, 'produceItemId'),
      productionGrowthDurationSeconds: numberField(formData, 'productionGrowthDurationSeconds'),
      localGrowthDurationSeconds: numberField(formData, 'localGrowthDurationSeconds'),
      growthStageCount: numberField(formData, 'growthStageCount'),
      deterministicYield: numberField(formData, 'deterministicYield'),
      wateringPolicy: field(formData, 'wateringPolicy'),
      tutorialEligible: booleanField(formData, 'tutorialEligible'),
      assetRef: field(formData, 'assetRef') || null,
      assetReadiness: field(formData, 'assetReadiness'),
      active: booleanField(formData, 'active'),
    },
    reason: field(formData, 'reason'),
  });
  if (!input.success || cropId === '') farmingRedirect('invalid-crop-update');
  try {
    await updateAdminFarmingCrop(cropId, input.data, randomUUID());
  } catch {
    farmingRedirect('crop-update-failed');
  }
  revalidatePath('/game-content/farming');
  farmingRedirect('crop-updated');
}

export async function createFarmingPlotTemplateSuccessorAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('farming.content_manage');
  const input = createFarmingPlotTemplateSuccessorInputSchema.safeParse({
    expectedTemplateId: field(formData, 'expectedTemplateId'),
    expectedTemplateVersion: numberField(formData, 'expectedTemplateVersion'),
    name: field(formData, 'name'),
    bounds: jsonField(formData, 'bounds'),
    spawn: jsonField(formData, 'spawn'),
    exit: jsonField(formData, 'exit'),
    blockedCells: jsonField(formData, 'blockedCells'),
    developmentArt: booleanField(formData, 'developmentArt'),
    tiles: jsonField(formData, 'tiles'),
    reason: field(formData, 'reason'),
  });
  if (!input.success) farmingRedirect('invalid-template-successor');
  try {
    await createAdminFarmingPlotTemplateSuccessor(input.data, randomUUID());
  } catch {
    farmingRedirect('template-successor-failed');
  }
  revalidatePath('/game-content/farming');
  farmingRedirect('template-successor-created');
}

export async function createStarterQuestSuccessorAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('farming.content_manage');
  const input = createStarterQuestSuccessorInputSchema.safeParse({
    expectedVersionId: field(formData, 'expectedVersionId'),
    expectedVersionNumber: numberField(formData, 'expectedVersionNumber'),
    name: field(formData, 'name'),
    description: field(formData, 'description'),
    starterSeedQuantity: numberField(formData, 'starterSeedQuantity'),
    deliveryQuantity: numberField(formData, 'deliveryQuantity'),
    rewardDust: numberField(formData, 'rewardDust'),
    starterHoeItemId: field(formData, 'starterHoeItemId'),
    starterWateringCanItemId: field(formData, 'starterWateringCanItemId'),
    starterSeedItemId: field(formData, 'starterSeedItemId'),
    deliveryItemId: field(formData, 'deliveryItemId'),
    objectives: jsonField(formData, 'objectives'),
    reason: field(formData, 'reason'),
  });
  if (!input.success) farmingRedirect('invalid-quest-successor');
  try {
    await createAdminStarterQuestSuccessor(input.data, randomUUID());
  } catch {
    farmingRedirect('quest-successor-failed');
  }
  revalidatePath('/game-content/farming');
  farmingRedirect('quest-successor-created');
}
