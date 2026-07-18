import {
  housingGameTestWorkspaceSchema,
  type HousingDraftPlacement,
  type HousingGameTestWorkspace,
} from './contracts';

export interface HousingGameTestMutation {
  readonly workspace: HousingGameTestWorkspace;
  readonly persisted: false;
  readonly announcement: string;
}

export function simulateGameTestLayout(
  workspace: HousingGameTestWorkspace,
  placements: readonly HousingDraftPlacement[],
): HousingGameTestMutation {
  const furnitureById = new Map(
    workspace.ownedPlaceables.map((entry) => [entry.furniture.id, entry.furniture] as const),
  );
  const now = workspace.serverTime;
  const projected = placements.map((placement, index) => {
    const definition = furnitureById.get(placement.furnitureDefinitionId);
    if (definition === undefined) throw new Error('Game Test furniture definition is unavailable.');
    return {
      instanceId:
        placement.instanceId ?? `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      furnitureDefinitionId: definition.id,
      furnitureKey: definition.key,
      itemDefinitionId: definition.itemDefinitionId,
      zoneId: placement.zoneId,
      zoneKey: placement.zoneKey,
      x: placement.x,
      y: placement.y,
      layer: placement.layer,
      rotation: placement.rotation,
      effectiveScale: 1,
      stateVersion: 1,
      placementState: 'placed' as const,
      createdAt: now,
      updatedAt: now,
    };
  });
  const current = workspace.layout.activeRevision;
  const nextWorkspace = housingGameTestWorkspaceSchema.parse({
    ...workspace,
    layout: {
      ...workspace.layout,
      activeRevision: {
        ...current,
        revisionNumber: current.revisionNumber + 1,
        furnitureCount: projected.length,
        changeSummary: ['Temporary Game Test layout simulated'],
        createdAt: now,
      },
      placements: projected,
    },
  });
  return {
    workspace: nextWorkspace,
    persisted: false,
    announcement: 'Temporary Game Test layout simulated. No player state was saved.',
  };
}

export function simulateGameTestStorageTransfer(
  workspace: HousingGameTestWorkspace,
  operation: 'deposit' | 'withdrawal',
  itemDefinitionId: string,
): HousingGameTestMutation {
  const owned = workspace.ownedPlaceables.find(
    (entry) => entry.furniture.itemDefinitionId === itemDefinitionId,
  );
  const stored = workspace.storage.stacks.find(
    (entry) => entry.itemDefinitionId === itemDefinitionId,
  );
  if (owned === undefined) throw new Error('Game Test item is unavailable.');
  if (operation === 'deposit' && owned.availableQuantity < 1) {
    throw new Error('Game Test inventory has no available item.');
  }
  if (operation === 'withdrawal' && (stored === undefined || stored.quantity < 1)) {
    throw new Error('Game Test storage has no matching item.');
  }
  const delta = operation === 'deposit' ? -1 : 1;
  const storedQuantity = (stored?.quantity ?? 0) - delta;
  const stacks = workspace.storage.stacks
    .filter((entry) => entry.itemDefinitionId !== itemDefinitionId)
    .concat(
      storedQuantity === 0
        ? []
        : [
            {
              id: stored?.id ?? '00000000-0000-4000-8000-000000000901',
              itemDefinitionId,
              itemSlug: owned.furniture.itemSlug,
              itemName: owned.furniture.displayName,
              category: 'furniture' as const,
              quantity: storedQuantity,
              maxStackSize: 1,
              stateVersion: (stored?.stateVersion ?? 0) + 1,
            },
          ],
    );
  const nextWorkspace = housingGameTestWorkspaceSchema.parse({
    ...workspace,
    inventoryStateVersion: workspace.inventoryStateVersion + 1,
    ownedPlaceables: workspace.ownedPlaceables.map((entry) =>
      entry.furniture.itemDefinitionId === itemDefinitionId
        ? { ...entry, availableQuantity: entry.availableQuantity + delta }
        : entry,
    ),
    storage: {
      ...workspace.storage,
      stacks,
      usedSlots: stacks.length,
      stateVersion: workspace.storage.stateVersion + 1,
    },
  });
  return {
    workspace: nextWorkspace,
    persisted: false,
    announcement: `Temporary Game Test ${operation} simulated. No player state was saved.`,
  };
}

export function simulateGameTestUpgrade(
  workspace: HousingGameTestWorkspace,
  upgradeVersionId: string,
): HousingGameTestMutation {
  const upgrade = workspace.upgrades.find((entry) => entry.versionId === upgradeVersionId);
  if (upgrade === undefined || !upgrade.eligible || upgrade.owned) {
    throw new Error('Game Test upgrade is unavailable.');
  }
  if (workspace.dust.balance < upgrade.dustCost) {
    throw new Error('Game Test DUST balance is insufficient.');
  }
  const nextWorkspace = housingGameTestWorkspaceSchema.parse({
    ...workspace,
    home: {
      ...workspace.home,
      homeTier: upgrade.targetTier,
      furnitureCapacity: upgrade.furnitureCapacity,
      storageCapacity: upgrade.storageCapacity,
      indoorFoundationEnabled:
        workspace.home.indoorFoundationEnabled || upgrade.roomUnlock === 'indoor_foundation',
      stateVersion: workspace.home.stateVersion + 1,
    },
    storage: {
      ...workspace.storage,
      capacity: upgrade.storageCapacity,
      stateVersion: workspace.storage.stateVersion + 1,
    },
    dust: {
      balance: workspace.dust.balance - upgrade.dustCost,
      stateVersion: workspace.dust.stateVersion + 1,
    },
    upgrades: workspace.upgrades.map((entry) =>
      entry.versionId === upgradeVersionId ? { ...entry, eligible: false, owned: true } : entry,
    ),
  });
  return {
    workspace: nextWorkspace,
    persisted: false,
    announcement: 'Temporary Game Test home upgrade simulated. No player state was saved.',
  };
}
