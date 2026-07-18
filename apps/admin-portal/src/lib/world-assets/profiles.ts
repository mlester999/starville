import {
  getAssetTypeProfile,
  type AssetCategory,
  type AssetType,
  type AssetTypeProfile as SharedAssetTypeProfile,
} from '@starville/asset-management';

export interface AssetTypeProfile extends SharedAssetTypeProfile {
  readonly maxFileSizeBytes: number;
  readonly recommendedDimensions: string;
  readonly recommendedRatio: string;
  readonly transparency: 'required' | 'optional';
  readonly guidance: string;
  readonly guideBullets: readonly string[];
}

const CATEGORY_LABELS: Readonly<Record<AssetCategory, string>> = {
  terrain: 'Terrain',
  structure: 'Structure',
  nature: 'Nature',
  boundary: 'Boundary',
  lighting: 'Lighting',
  signage: 'Signage',
  farming: 'Farming',
  crop: 'Crop',
  furniture: 'Furniture',
  interior: 'Interior',
  interaction: 'Interaction',
  inventory: 'Inventory',
  recipe: 'Recipe',
  shop: 'Shop',
  branding: 'Branding',
};

/** Portal presentation adapter over the shared, authoritative profile catalog. */
export function assetTypeProfile(type: AssetType): AssetTypeProfile {
  const profile = getAssetTypeProfile(type);
  const divisor = greatestCommonDivisor(profile.recommendedWidth, profile.recommendedHeight);
  const recommendedDimensions = `${String(profile.recommendedWidth)} × ${String(profile.recommendedHeight)} px`;
  return {
    ...profile,
    maxFileSizeBytes: profile.maximumSourceBytes,
    recommendedDimensions,
    recommendedRatio: `${String(profile.recommendedWidth / divisor)}:${String(profile.recommendedHeight / divisor)}`,
    transparency: profile.requiredTransparency ? 'required' : 'optional',
    guidance: profile.helperText.join(' '),
    guideBullets: buildGuideBullets(profile, recommendedDimensions),
  };
}

function buildGuideBullets(
  profile: SharedAssetTypeProfile,
  recommendedDimensions: string,
): readonly string[] {
  const bullets: string[] = [
    'Use a transparent PNG or WebP (no black or solid full-bleed background).',
    `Recommended dimensions: ${recommendedDimensions}.`,
    `Maximum file size: ${formatAssetBytes(profile.maximumSourceBytes)}.`,
    'Do not upload a full-map background, screenshot, or flattened scene composite.',
  ];
  if (profile.previewMode === 'isometric') {
    bullets.splice(1, 0, 'Use the approved isometric perspective and keep empty padding clean.');
  }
  if (profile.requiredTransparency) {
    bullets.push('Transparency is required so terrain and lighting show through correctly.');
  }
  if (profile.anchorRequired) {
    bullets.push('You will set the foot anchor and depth point after upload.');
  }
  if (profile.collisionSupport !== 'none') {
    bullets.push('Collision is configured after upload and reviewed before activation.');
  }
  for (const tip of profile.helperText) {
    if (!bullets.some((bullet) => bullet.toLowerCase().includes(tip.toLowerCase().slice(0, 24)))) {
      bullets.push(tip);
    }
  }
  return bullets;
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

export function assetCategoryLabel(category: string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as AssetCategory];
  }
  return category
    .split(/[_-]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** First allowed category for a type — used as the intelligent default. */
export function defaultCategoryForAssetType(type: AssetType): string {
  return getAssetTypeProfile(type).allowedCategories[0] ?? 'structure';
}

export function formatAssetBytes(bytes: number | null): string {
  if (bytes === null) return 'Pending';
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
