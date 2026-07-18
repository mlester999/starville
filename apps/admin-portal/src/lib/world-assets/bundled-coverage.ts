import {
  GLOBAL_ASSET_DERIVATIVE_MAX_BYTES,
  type BundledAssetEntry,
} from '@starville/asset-management';

import type { WorldAssetSummary } from './contracts';
import type { BundledMediaEvidence } from './bundled-media';

export interface BundledAssetCoverageRow {
  readonly asset: BundledAssetEntry;
  readonly registered: WorldAssetSummary | null;
  readonly sourceAvailable: boolean;
  readonly thumbnailAvailable: boolean;
  readonly sourceBytes: number | null;
  readonly oversized: boolean;
  readonly uploadedOverride: boolean;
  readonly activeOverride: boolean;
  readonly validationFailure: boolean;
  readonly unused: boolean;
  readonly usingPlaceholder: boolean;
  readonly worldUsageCount: number;
  readonly furnitureUsageCount: number;
  readonly farmingUsageCount: number;
  readonly status: 'ready' | 'missing_source' | 'missing_thumbnail' | 'oversized';
}

export interface BundledAssetCoverageReport {
  readonly rows: readonly BundledAssetCoverageRow[];
  readonly totals: Readonly<{
    stableKeys: number;
    bundledAvailable: number;
    registeredKeys: number;
    uploadedOverrides: number;
    activeOverrides: number;
    missingSources: number;
    missingThumbnails: number;
    oversized: number;
    referencedByWorlds: number;
    referencedByFurniture: number;
    referencedByFarming: number;
    validationFailures: number;
    unusedAssets: number;
    usingPlaceholders: number;
    developmentMarkers: number;
  }>;
}

export function buildBundledAssetCoverageReport(input: {
  readonly manifestAssets: readonly BundledAssetEntry[];
  readonly directoryAssets: readonly WorldAssetSummary[];
  readonly mediaEvidence: readonly BundledMediaEvidence[];
}): BundledAssetCoverageReport {
  const directoryByKey = new Map(input.directoryAssets.map((asset) => [asset.slug, asset]));
  const evidenceByKey = new Map(input.mediaEvidence.map((evidence) => [evidence.key, evidence]));
  const rows = input.manifestAssets.map((asset): BundledAssetCoverageRow => {
    const registered = directoryByKey.get(asset.key) ?? null;
    const evidence = evidenceByKey.get(asset.key);
    const sourceAvailable = evidence?.sourceAvailable === true;
    const thumbnailAvailable = evidence?.thumbnailAvailable === true;
    const sourceBytes = evidence?.sourceBytes ?? null;
    const oversized = sourceBytes !== null && sourceBytes > GLOBAL_ASSET_DERIVATIVE_MAX_BYTES;
    const uploadedOverride = (registered?.uploadedVersionCount ?? 0) > 0;
    const activeOverride =
      registered?.activeSourceState === 'uploaded_override' &&
      registered.lifecycleStatus === 'active' &&
      registered.productionStatus === 'approved_production' &&
      registered.activeVersionId !== null;
    const validationFailure = (registered?.invalidVersionCount ?? 0) > 0;
    const unused = registered !== null && registered.referenceCount === 0;
    const usingPlaceholder =
      registered?.productionStatus === 'development_marker' ||
      registered?.activeSourceState === 'unavailable';
    const status = oversized
      ? 'oversized'
      : !sourceAvailable
        ? 'missing_source'
        : !thumbnailAvailable
          ? 'missing_thumbnail'
          : 'ready';
    return {
      asset,
      registered,
      sourceAvailable,
      thumbnailAvailable,
      sourceBytes,
      oversized,
      uploadedOverride,
      activeOverride,
      validationFailure,
      unused,
      usingPlaceholder,
      worldUsageCount: registered?.referenceBreakdown.world ?? 0,
      furnitureUsageCount: registered?.referenceBreakdown.furniture ?? 0,
      farmingUsageCount: registered?.referenceBreakdown.farming ?? 0,
      status,
    };
  });
  return {
    rows,
    totals: {
      stableKeys: rows.length,
      bundledAvailable: rows.filter(({ sourceAvailable }) => sourceAvailable).length,
      registeredKeys: rows.filter(({ registered }) => registered !== null).length,
      uploadedOverrides: rows.filter(({ uploadedOverride }) => uploadedOverride).length,
      activeOverrides: rows.filter(({ activeOverride }) => activeOverride).length,
      missingSources: rows.filter(({ sourceAvailable }) => !sourceAvailable).length,
      missingThumbnails: rows.filter(({ thumbnailAvailable }) => !thumbnailAvailable).length,
      oversized: rows.filter(({ oversized }) => oversized).length,
      referencedByWorlds: rows.filter(({ worldUsageCount }) => worldUsageCount > 0).length,
      referencedByFurniture: rows.filter(({ furnitureUsageCount }) => furnitureUsageCount > 0)
        .length,
      referencedByFarming: rows.filter(({ farmingUsageCount }) => farmingUsageCount > 0).length,
      validationFailures: rows.filter(({ validationFailure }) => validationFailure).length,
      unusedAssets: rows.filter(({ unused }) => unused).length,
      usingPlaceholders: rows.filter(({ usingPlaceholder }) => usingPlaceholder).length,
      developmentMarkers: rows.filter(
        ({ registered }) => registered?.productionStatus === 'development_marker',
      ).length,
    },
  };
}
