import type { AssetInteractionCompatibility, AssetType } from '@starville/asset-management';

import type { WorldEditorAssetCandidate } from '../world-assets/contracts';
import type { AdminWorldManifest, WorldVersionSummary } from './contracts';

type MapObject = AdminWorldManifest['objects'][number];

export interface WorldAssetReplacementInput {
  readonly manifest: AdminWorldManifest;
  readonly lifecycleStatus: WorldVersionSummary['lifecycleStatus'];
  readonly objectIds: readonly string[];
  readonly nextAssetKey: string;
  readonly collisionImpactAccepted: boolean;
}

export function objectKindAssetType(kind: MapObject['kind']): AssetType {
  if (kind === 'flowers' || kind === 'bush') return 'decoration';
  return kind;
}

export function isCompatibleEditorAsset(
  candidate: WorldEditorAssetCandidate,
  object: MapObject,
  includeDevelopmentMarkers: boolean,
  requiredInteractions: readonly AssetInteractionCompatibility[] = [],
): boolean {
  const isActive =
    candidate.asset.lifecycleStatus === 'active' &&
    candidate.activeVersion.lifecycleStatus === 'active' &&
    candidate.asset.activeVersionId === candidate.activeVersion.id;
  const productionAllowed =
    candidate.asset.productionStatus === 'approved_production' ||
    (includeDevelopmentMarkers && candidate.asset.productionStatus === 'development_marker');
  return (
    isActive &&
    productionAllowed &&
    candidate.asset.assetType === objectKindAssetType(object.kind) &&
    requiredInteractions.every((interaction) =>
      candidate.supportedInteractions.includes(interaction),
    )
  );
}

export function objectInteractionRequirements(
  manifest: AdminWorldManifest,
  object: MapObject,
): readonly AssetInteractionCompatibility[] {
  const interactionKind = {
    notice: 'sign',
    farm_plot: 'farm_plot',
    shop: 'shop',
    cooking_station: 'cooking_station',
    crafting_station: 'crafting_station',
    home_entrance: 'home_entrance',
  } as const satisfies Record<
    AdminWorldManifest['interactions'][number]['type'],
    MapObject['kind']
  >;

  return [
    ...new Set(
      manifest.interactions
        .filter((entry) => {
          const requiredKind = interactionKind[entry.type];
          if (object.kind !== requiredKind) return false;
          const nearest = [...manifest.objects]
            .filter(
              (candidate) =>
                candidate.kind === requiredKind &&
                Math.hypot(entry.x - candidate.x, entry.y - candidate.y) <= entry.range,
            )
            .sort(
              (left, right) =>
                Math.hypot(entry.x - left.x, entry.y - left.y) -
                  Math.hypot(entry.x - right.x, entry.y - right.y) ||
                left.id.localeCompare(right.id),
            )[0];
          return nearest?.id === object.id;
        })
        .map((entry) => (entry.type === 'notice' ? 'sign' : entry.type)),
    ),
  ];
}

/**
 * Replaces only visual references in one unpublished world version. Map collision is deliberately
 * preserved; accepting the impact acknowledges that validation must check it against new artwork.
 */
export function replaceWorldObjectAssets(input: WorldAssetReplacementInput): AdminWorldManifest {
  if (input.lifecycleStatus !== 'draft') {
    throw new Error('Visual assets can be replaced only in an unpublished world draft.');
  }
  if (!input.collisionImpactAccepted) {
    throw new Error('Collision impact must be reviewed before replacing an asset.');
  }
  const uniqueIds = new Set(input.objectIds);
  if (uniqueIds.size === 0) throw new Error('Select at least one world object to replace.');
  const selectedObjects = input.manifest.objects.filter(({ id }) => uniqueIds.has(id));
  if (selectedObjects.length !== uniqueIds.size) {
    throw new Error('One or more selected world objects no longer exist.');
  }

  const replacedAssetKeys = new Set(selectedObjects.map(({ assetId }) => assetId));
  const objects = input.manifest.objects.map((object) =>
    uniqueIds.has(object.id) ? { ...object, assetId: input.nextAssetKey } : object,
  );
  const referencedObjectAssets = new Set(objects.map(({ assetId }) => assetId));
  const assets = input.manifest.assets.filter(
    (assetKey) => !replacedAssetKeys.has(assetKey) || referencedObjectAssets.has(assetKey),
  );
  if (!assets.includes(input.nextAssetKey)) assets.push(input.nextAssetKey);

  return { ...input.manifest, assets, objects };
}
