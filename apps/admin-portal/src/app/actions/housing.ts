'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  applyHousingCorrection,
  createHousingUpgradeSuccessor,
  requestHousingCorrection,
  requestHousingReconciliation,
  simulateHousing,
  transitionHousingUpgrade,
  updateHousingLiveOps,
} from '../../lib/housing-api';

function stringValue(data: FormData, key: string) {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error('Invalid housing form.');
  return value;
}
function numberValue(data: FormData, key: string) {
  const value = Number(stringValue(data, key));
  if (!Number.isFinite(value)) throw new Error('Invalid housing number.');
  return value;
}
function jsonValue(data: FormData, key: string) {
  const value = JSON.parse(stringValue(data, key)) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Housing JSON must be an object.');
  return value as Record<string, unknown>;
}
function done(notice: string): never {
  redirect(`/game-content/housing?notice=${encodeURIComponent(notice)}`);
}
export async function housingUpgradeSuccessorAction(data: FormData) {
  await requireAuthorizedAdmin('housing.upgrades.manage');
  await createHousingUpgradeSuccessor(
    stringValue(data, 'versionId'),
    {
      expectedConfigurationRevision: numberValue(data, 'expectedRevision'),
      configuration: jsonValue(data, 'configuration'),
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('upgrade-successor-created');
}
export async function housingUpgradeTransitionAction(data: FormData) {
  await requireAuthorizedAdmin('housing.upgrades.manage');
  await transitionHousingUpgrade(
    stringValue(data, 'versionId'),
    {
      expectedConfigurationRevision: numberValue(data, 'expectedRevision'),
      transition: stringValue(data, 'transition') as 'validate' | 'activate' | 'archive',
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('upgrade-transition-complete');
}
export async function housingLiveOpsAction(data: FormData) {
  await requireAuthorizedAdmin('housing.live_ops.manage');
  await updateHousingLiveOps(
    {
      expectedConfigurationRevision: numberValue(data, 'expectedRevision'),
      settings: jsonValue(data, 'settings'),
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('housing-live-ops-updated');
}
export async function housingReconciliationAction(data: FormData) {
  await requireAuthorizedAdmin('housing.reconciliation.manage');
  await requestHousingReconciliation(
    {
      wallet: stringValue(data, 'wallet'),
      type: stringValue(data, 'type'),
      priority: numberValue(data, 'priority'),
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('housing-reconciliation-requested');
}
export async function housingCorrectionAction(data: FormData) {
  await requireAuthorizedAdmin('housing.corrections.manage');
  await requestHousingCorrection(
    {
      wallet: stringValue(data, 'wallet'),
      type: stringValue(data, 'type'),
      expectedHomeStateVersion: numberValue(data, 'expectedRevision'),
      impactPreview: jsonValue(data, 'impactPreview'),
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('housing-correction-requested');
}
export async function housingCorrectionApplyAction(data: FormData) {
  await requireAuthorizedAdmin('housing.corrections.manage');
  await applyHousingCorrection(
    stringValue(data, 'correctionId'),
    {
      expectedCorrectionStateVersion: numberValue(data, 'expectedRevision'),
      reason: stringValue(data, 'reason'),
    },
    randomUUID(),
  );
  done('housing-correction-reviewed');
}
export async function housingSimulationAction(data: FormData) {
  await requireAuthorizedAdmin('housing.upgrades.inspect');
  await simulateHousing(
    {
      tierOneFurnitureCapacity: numberValue(data, 'tier1Furniture'),
      tierTwoFurnitureCapacity: numberValue(data, 'tier2Furniture'),
      tierOneStorageCapacity: numberValue(data, 'tier1Storage'),
      tierTwoStorageCapacity: numberValue(data, 'tier2Storage'),
      upgradeDustCost: numberValue(data, 'dustCost'),
      playerDustBalance: numberValue(data, 'averageDust'),
      placementCount: numberValue(data, 'placements'),
      storageSlotsUsed: numberValue(data, 'storageUsed'),
      layoutPayloadBytes: numberValue(data, 'payloadBytes'),
      replayCount: numberValue(data, 'replays'),
      gameTest: stringValue(data, 'gameTest') === 'true',
    },
    randomUUID(),
  );
  done('housing-simulation-complete');
}
