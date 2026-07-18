import type {
  HousingDraftPlacement,
  HousingLayoutRevisionInspection,
  HousingWorkspace,
} from './contracts';
import type { HousingFurnitureCategory } from './types';

export interface HousingLocalDraft {
  readonly baseRevision: number;
  readonly placements: readonly HousingDraftPlacement[];
  readonly undo: readonly (readonly HousingDraftPlacement[])[];
  readonly redo: readonly (readonly HousingDraftPlacement[])[];
  readonly restorationSourceRevisionId: string | null;
}

export interface HousingRestorationOmission {
  readonly furnitureDefinitionId: string;
  readonly reason: 'definition_unavailable' | 'furniture_not_owned' | 'zone_unavailable';
}

export interface HousingRestorationDraft {
  readonly draft: HousingLocalDraft;
  readonly omissions: readonly HousingRestorationOmission[];
}

function snapshot(placements: readonly HousingDraftPlacement[]): readonly HousingDraftPlacement[] {
  return placements.map((placement) => ({ ...placement }));
}

export function createHousingLocalDraft(workspace: HousingWorkspace): HousingLocalDraft {
  return {
    baseRevision: workspace.layout.activeRevision.revisionNumber,
    placements: workspace.layout.placements.map((placement) => ({
      instanceId: placement.instanceId,
      inventoryStackId: null,
      furnitureDefinitionId: placement.furnitureDefinitionId,
      furnitureKey: placement.furnitureKey,
      zoneId: placement.zoneId,
      zoneKey: placement.zoneKey,
      x: placement.x,
      y: placement.y,
      layer: placement.layer,
      rotation: placement.rotation,
    })),
    undo: [],
    redo: [],
    restorationSourceRevisionId: null,
  };
}

export function createHousingRestorationDraft(
  workspace: HousingWorkspace,
  inspection: HousingLayoutRevisionInspection,
): HousingRestorationDraft {
  const omissions: HousingRestorationOmission[] = [];
  const inventoryUsage = new Map<string, number>();
  const placements: HousingDraftPlacement[] = [];

  for (const historical of inspection.placements) {
    const active = workspace.layout.placements.find(
      (placement) =>
        placement.instanceId === historical.instanceId &&
        placement.furnitureDefinitionId === historical.furnitureDefinitionId,
    );
    const placeable = workspace.ownedPlaceables.find(
      (entry) => entry.furniture.id === historical.furnitureDefinitionId,
    );
    const zone = workspace.zones.find((entry) => entry.id === historical.zoneId);

    if (placeable === undefined && active === undefined) {
      omissions.push({
        furnitureDefinitionId: historical.furnitureDefinitionId,
        reason: 'definition_unavailable',
      });
      continue;
    }
    if (zone === undefined) {
      omissions.push({
        furnitureDefinitionId: historical.furnitureDefinitionId,
        reason: 'zone_unavailable',
      });
      continue;
    }

    const instanceId: string | null = active?.instanceId ?? null;
    let inventoryStackId: string | null = null;
    if (instanceId === null) {
      if (placeable === undefined) {
        omissions.push({
          furnitureDefinitionId: historical.furnitureDefinitionId,
          reason: 'furniture_not_owned',
        });
        continue;
      }
      const used = inventoryUsage.get(placeable.inventoryStackId) ?? 0;
      if (used >= placeable.availableQuantity) {
        omissions.push({
          furnitureDefinitionId: historical.furnitureDefinitionId,
          reason: 'furniture_not_owned',
        });
        continue;
      }
      inventoryUsage.set(placeable.inventoryStackId, used + 1);
      inventoryStackId = placeable.inventoryStackId;
    }

    placements.push({
      instanceId,
      inventoryStackId,
      furnitureDefinitionId: historical.furnitureDefinitionId,
      furnitureKey: active?.furnitureKey ?? placeable!.furniture.key,
      zoneId: historical.zoneId,
      zoneKey: zone.key,
      x: historical.x,
      y: historical.y,
      layer: historical.layer,
      rotation: historical.rotation,
    });
  }

  return {
    draft: {
      baseRevision: workspace.layout.activeRevision.revisionNumber,
      placements,
      undo: [],
      redo: [],
      restorationSourceRevisionId: inspection.revision.id,
    },
    omissions,
  };
}

export function updateHousingDraft(
  draft: HousingLocalDraft,
  placements: readonly HousingDraftPlacement[],
): HousingLocalDraft {
  return {
    ...draft,
    placements: snapshot(placements),
    undo: [...draft.undo, snapshot(draft.placements)].slice(-50),
    redo: [],
  };
}

export function undoHousingDraft(draft: HousingLocalDraft): HousingLocalDraft {
  const previous = draft.undo.at(-1);
  if (previous === undefined) return draft;
  return {
    ...draft,
    placements: snapshot(previous),
    undo: draft.undo.slice(0, -1),
    redo: [snapshot(draft.placements), ...draft.redo].slice(0, 50),
  };
}

export function redoHousingDraft(draft: HousingLocalDraft): HousingLocalDraft {
  const next = draft.redo[0];
  if (next === undefined) return draft;
  return {
    ...draft,
    placements: snapshot(next),
    undo: [...draft.undo, snapshot(draft.placements)].slice(-50),
    redo: draft.redo.slice(1),
  };
}

export function housingDraftDirty(draft: HousingLocalDraft, workspace: HousingWorkspace): boolean {
  if (draft.restorationSourceRevisionId !== null) return true;
  return (
    JSON.stringify(draft.placements) !==
    JSON.stringify(createHousingLocalDraft(workspace).placements)
  );
}

export function filterPlaceables(
  workspace: HousingWorkspace,
  search: string,
  category: HousingFurnitureCategory | 'all' | 'indoor' | 'outdoor' | 'recent',
) {
  const normalized = search.trim().toLocaleLowerCase('en-US');
  return workspace.ownedPlaceables.filter((entry) => {
    const matchesSearch =
      normalized.length === 0 ||
      entry.furniture.displayName.toLocaleLowerCase('en-US').includes(normalized) ||
      entry.furniture.key.includes(normalized);
    const matchesCategory =
      category === 'all' ||
      (category === 'indoor' && entry.furniture.indoorEligible) ||
      (category === 'outdoor' && entry.furniture.outdoorEligible) ||
      (category === 'recent' && entry.recentlyAcquired) ||
      entry.furniture.category === category;
    return matchesSearch && matchesCategory;
  });
}
