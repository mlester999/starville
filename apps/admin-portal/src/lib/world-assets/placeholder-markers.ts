import type { WorldAssetSummary, WorldAssetType } from './contracts';

export interface PlaceholderMarkerOption {
  readonly key: string;
  readonly friendlyName: string;
  readonly assetType: WorldAssetType;
  readonly category: string;
  readonly lifecycleStatus: string;
  readonly productionStatus: string;
  readonly thumbnailUrl: string | null;
  readonly assetId: string;
}

/** Pure mapper — safe for server and client modules. */
export function toPlaceholderMarkerOptions(
  assets: readonly WorldAssetSummary[],
): readonly PlaceholderMarkerOption[] {
  return assets
    .filter((asset) => asset.productionStatus === 'development_marker')
    .map((asset) => ({
      key: asset.slug,
      friendlyName: asset.friendlyName,
      assetType: asset.assetType,
      category: asset.category,
      lifecycleStatus: asset.lifecycleStatus,
      productionStatus: asset.productionStatus,
      thumbnailUrl: asset.thumbnailUrl,
      assetId: asset.id,
    }));
}
