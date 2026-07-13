import {
  getAssetTypeProfile,
  type AssetType,
  type AssetTypeProfile as SharedAssetTypeProfile,
} from '@starville/asset-management';

export interface AssetTypeProfile extends SharedAssetTypeProfile {
  readonly maxFileSizeBytes: number;
  readonly recommendedDimensions: string;
  readonly recommendedRatio: string;
  readonly transparency: 'required' | 'optional';
  readonly guidance: string;
}

/** Portal presentation adapter over the shared, authoritative profile catalog. */
export function assetTypeProfile(type: AssetType): AssetTypeProfile {
  const profile = getAssetTypeProfile(type);
  const divisor = greatestCommonDivisor(profile.recommendedWidth, profile.recommendedHeight);
  return {
    ...profile,
    maxFileSizeBytes: profile.maximumSourceBytes,
    recommendedDimensions: `${String(profile.recommendedWidth)} × ${String(profile.recommendedHeight)} px`,
    recommendedRatio: `${String(profile.recommendedWidth / divisor)}:${String(profile.recommendedHeight / divisor)}`,
    transparency: profile.requiredTransparency ? 'required' : 'optional',
    guidance: profile.helperText.join(' '),
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function assetTypeLabel(type: AssetType): string {
  return getAssetTypeProfile(type).label;
}

export function formatAssetBytes(bytes: number | null): string {
  if (bytes === null) return 'Pending';
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
