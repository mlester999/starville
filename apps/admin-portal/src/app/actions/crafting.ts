'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createRecipeSuccessorInputSchema,
  requestCraftingReconciliationInputSchema,
  updateWorkstationDefinitionInputSchema,
  updateWorkstationLiveOpsInputSchema,
} from '@starville/cozy-gameplay';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  createAdminRecipeSuccessor,
  requestAdminCraftingReconciliation,
  updateAdminCraftingLiveOps,
  updateAdminWorkstation,
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

function jsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(field(formData, name)) as unknown;
  } catch {
    return undefined;
  }
}

function craftingRedirect(notice: string): never {
  redirect(`/game-content/crafting?notice=${notice}`);
}

export async function updateCraftingLiveOpsAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('crafting.liveops');
  const input = updateWorkstationLiveOpsInputSchema.safeParse({
    expectedRevision: numberField(formData, 'expectedRevision'),
    cookingStartsEnabled: booleanField(formData, 'cookingStartsEnabled'),
    craftingStartsEnabled: booleanField(formData, 'craftingStartsEnabled'),
    collectionEnabled: booleanField(formData, 'collectionEnabled'),
    tutorialUnlocksEnabled: booleanField(formData, 'tutorialUnlocksEnabled'),
    tutorialRewardsEnabled: booleanField(formData, 'tutorialRewardsEnabled'),
    dustFeesEnabled: booleanField(formData, 'dustFeesEnabled'),
    useLocalDurations: booleanField(formData, 'useLocalDurations'),
    maintenanceMessage: field(formData, 'maintenanceMessage') || null,
    reason: field(formData, 'reason'),
  });
  if (!input.success) craftingRedirect('invalid-live-ops');
  try {
    await updateAdminCraftingLiveOps(input.data, randomUUID());
  } catch {
    craftingRedirect('live-ops-update-failed');
  }
  revalidatePath('/game-content/crafting');
  craftingRedirect('live-ops-updated');
}

export async function updateWorkstationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('crafting.content_manage');
  const workstationId = field(formData, 'workstationId');
  const input = updateWorkstationDefinitionInputSchema.safeParse({
    expectedConfigurationRevision: numberField(formData, 'expectedConfigurationRevision'),
    displayName: field(formData, 'displayName'),
    description: field(formData, 'description'),
    queueCapacity: numberField(formData, 'queueCapacity'),
    interactionRadius: numberField(formData, 'interactionRadius'),
    enabled: booleanField(formData, 'enabled'),
    reason: field(formData, 'reason'),
  });
  if (!input.success || workstationId === '') craftingRedirect('invalid-workstation');
  try {
    await updateAdminWorkstation(workstationId, input.data, randomUUID());
  } catch {
    craftingRedirect('workstation-update-failed');
  }
  revalidatePath('/game-content/crafting');
  craftingRedirect('workstation-updated');
}

export async function createRecipeSuccessorAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('crafting.content_manage');
  const input = createRecipeSuccessorInputSchema.safeParse({
    recipeDefinitionId: field(formData, 'recipeDefinitionId'),
    expectedVersionId: field(formData, 'expectedVersionId'),
    expectedConfigurationRevision: numberField(formData, 'expectedConfigurationRevision'),
    name: field(formData, 'name'),
    description: field(formData, 'description'),
    workstationType: field(formData, 'workstationType'),
    outputItemId: field(formData, 'outputItemId'),
    outputQuantity: numberField(formData, 'outputQuantity'),
    productionDurationSeconds: numberField(formData, 'productionDurationSeconds'),
    localDurationSeconds: numberField(formData, 'localDurationSeconds'),
    dustFee: numberField(formData, 'dustFee'),
    unlockRule: field(formData, 'unlockRule'),
    discoveryPolicy: field(formData, 'discoveryPolicy'),
    tutorialEligible: booleanField(formData, 'tutorialEligible'),
    repeatable: booleanField(formData, 'repeatable'),
    maximumBatchQuantity: numberField(formData, 'maximumBatchQuantity'),
    enabled: booleanField(formData, 'enabled'),
    ingredients: jsonField(formData, 'ingredients'),
    reason: field(formData, 'reason'),
  });
  if (!input.success) craftingRedirect('invalid-recipe-successor');
  try {
    await createAdminRecipeSuccessor(input.data, randomUUID());
  } catch {
    craftingRedirect('recipe-successor-failed');
  }
  revalidatePath('/game-content/crafting');
  craftingRedirect('recipe-successor-created');
}

export async function requestCraftingReconciliationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('crafting.job_reconcile');
  const jobId = field(formData, 'jobId');
  const input = requestCraftingReconciliationInputSchema.safeParse({
    reason: field(formData, 'reason'),
  });
  if (!input.success || jobId === '') craftingRedirect('invalid-reconciliation');
  try {
    await requestAdminCraftingReconciliation(jobId, input.data, randomUUID());
  } catch {
    craftingRedirect('reconciliation-request-failed');
  }
  revalidatePath('/game-content/crafting');
  craftingRedirect('reconciliation-requested');
}
