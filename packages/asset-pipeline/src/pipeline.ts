import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  bundledAssetManifestSchema,
  type BundledAssetEntry,
  type BundledAssetManifest,
  type BundledAssetVariant,
} from '@starville/asset-management';
import sharp from 'sharp';

import {
  ASSET_BUDGETS,
  ASSET_OUTPUT_PATHS,
  ASSET_PIPELINE_VERSION,
  REQUIRED_GAMEPLAY_ASSET_KEYS,
} from './constants';
import {
  fileSize,
  formattedJson,
  resolveAssetFilesystemPath,
  sha256,
  writeFileIfChanged,
  type WriteResult,
} from './files';
import { renderBundledAssetSvg } from './svg';

export type GeneratedFileRole = 'source' | 'runtime' | 'thumbnail';
export type AssetFileDescriptor = Readonly<{
  asset: BundledAssetEntry;
  variant?: BundledAssetVariant;
  role: GeneratedFileRole;
  manifestPath: string;
  budgetBytes: number;
}>;

export type PipelineResult = Readonly<{
  written: number;
  unchanged: number;
  files: number;
  bytes: number;
}>;

export function assetFileDescriptors(
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): readonly AssetFileDescriptor[] {
  return manifest.assets.flatMap((asset) => {
    if (asset.aliasOf !== null) return [];
    const runtimeBudget = runtimeBudgetFor(asset);
    const base: AssetFileDescriptor[] = [
      {
        asset,
        role: 'source',
        manifestPath: asset.sourcePath,
        budgetBytes: ASSET_BUDGETS.sourceBytes,
      },
      {
        asset,
        role: 'runtime',
        manifestPath: asset.runtimePath,
        budgetBytes: runtimeBudget,
      },
      {
        asset,
        role: 'thumbnail',
        manifestPath: asset.thumbnailPath,
        budgetBytes: ASSET_BUDGETS.thumbnailBytes,
      },
    ];
    const variants = asset.variants.flatMap((variant) => [
      {
        asset,
        variant,
        role: 'source' as const,
        manifestPath: variant.sourcePath,
        budgetBytes: ASSET_BUDGETS.sourceBytes,
      },
      {
        asset,
        variant,
        role: 'runtime' as const,
        manifestPath: variant.runtimePath,
        budgetBytes: runtimeBudget,
      },
    ]);
    return [...base, ...variants];
  });
}

export async function generateSources(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  const writes: WriteResult[] = [];
  for (const descriptor of assetFileDescriptors(manifest).filter(({ role }) => role === 'source')) {
    const content = renderBundledAssetSvg({
      asset: descriptor.asset,
      ...(descriptor.variant === undefined ? {} : { variant: descriptor.variant }),
    });
    writes.push(
      await writeFileIfChanged(
        resolveAssetFilesystemPath(workspaceRoot, descriptor.manifestPath),
        content,
      ),
    );
  }
  return summarizeWrites(writes);
}

export async function generateRuntimeAssets(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  const writes: WriteResult[] = [];
  const descriptors = assetFileDescriptors(manifest);
  for (const runtime of descriptors.filter(({ role }) => role === 'runtime')) {
    const webp = await renderRuntimeAssetBytes(runtime.asset, runtime.variant);
    writes.push(
      await writeFileIfChanged(
        resolveAssetFilesystemPath(workspaceRoot, runtime.manifestPath),
        webp,
      ),
    );
  }
  return summarizeWrites(writes);
}

export async function generateThumbnails(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  const writes: WriteResult[] = [];
  for (const asset of manifest.assets.filter(({ aliasOf }) => aliasOf === null)) {
    const webp = await renderThumbnailBytes(asset);
    writes.push(
      await writeFileIfChanged(
        resolveAssetFilesystemPath(workspaceRoot, asset.thumbnailPath),
        webp,
      ),
    );
  }
  return summarizeWrites(writes);
}

export async function generateManifestOutput(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  const parsed = bundledAssetManifestSchema.parse(manifest);
  const write = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, ASSET_OUTPUT_PATHS.manifest),
    await formattedJson(parsed),
  );
  return summarizeWrites([write]);
}

export function buildCoverageReport(
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): unknown {
  const descriptors = assetFileDescriptors(manifest);
  const catalog = new Set(manifest.assets.map(({ key }) => key));
  return {
    schemaVersion: 1,
    pipelineVersion: ASSET_PIPELINE_VERSION,
    manifestVersion: manifest.manifestVersion,
    assetCount: manifest.assets.length,
    variantCount: manifest.assets.reduce((total, asset) => total + asset.variants.length, 0),
    expectedFiles: {
      source: descriptors.filter(({ role }) => role === 'source').length,
      runtime: descriptors.filter(({ role }) => role === 'runtime').length,
      thumbnail: descriptors.filter(({ role }) => role === 'thumbnail').length,
      total: descriptors.length,
    },
    byAssetType: countBy(manifest.assets, ({ assetType }) => assetType),
    byCategory: countBy(manifest.assets, ({ category }) => category),
    byCriticalGroup: Object.fromEntries(
      ['lantern_square', 'personal_home', 'farming', 'housing', 'interface', 'game_test'].map(
        (group) => [
          group,
          manifest.assets.filter(({ criticalGroups }) => criticalGroups.includes(group as never))
            .length,
        ],
      ),
    ),
    aliases: manifest.assets
      .filter(({ aliasOf }) => aliasOf !== null)
      .map(({ key, aliasOf }) => ({ key, aliasOf })),
    gameplayCatalogReferences: REQUIRED_GAMEPLAY_ASSET_KEYS.map((key) => ({
      key,
      present: catalog.has(key),
    })),
    missingGameplayCatalogReferences: REQUIRED_GAMEPLAY_ASSET_KEYS.filter(
      (key) => !catalog.has(key),
    ),
    assets: manifest.assets.map((asset) => ({
      key: asset.key,
      category: asset.category,
      assetType: asset.assetType,
      bundledStatus:
        asset.aliasOf === null ? 'bundled_default_available' : 'bundled_alias_available',
      uploadedOverrideStatus: 'runtime_lifecycle_managed_not_observable_in_repository',
      runtimePath: asset.runtimePath,
      sourcePath: asset.sourcePath,
      thumbnail: asset.thumbnailPath,
      dimensions: {
        width: asset.width,
        height: asset.height,
        aspectRatio: asset.aspectRatio,
        recommendedScale: asset.recommendedScale,
      },
      anchor: {
        origin: asset.anchor,
        foot: asset.footAnchor,
        depth: asset.depthAnchor,
        interaction: asset.interactionAnchor,
        interactionRadius: asset.interactionRadius,
      },
      footprint: asset.footprint,
      collision: asset.collision,
      frameInformation: {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
        frameCount: asset.frameCount,
        frameDurationMs: asset.frameDurationMs,
        loopMode: asset.loopMode,
      },
      animationState: asset.animated ? 'animated' : 'static',
      supportedDirections: asset.supportedDirections,
      supportedRotations: asset.supportedRotations,
      variants: asset.variants.map(({ id, rotation, state, runtimePath }) => ({
        id,
        rotation,
        state,
        runtimePath,
      })),
      usageLocations: asset.usageLocations,
      fallbackState: {
        safeFallbackKey: asset.safeFallbackKey,
        isCanonicalMissingAsset: asset.key === 'system.missing-asset',
      },
      qualityStatus: asset.qualityStatus,
      replacementAllowed: asset.replacementAllowed,
      replacementPriority: replacementPriorityFor(asset),
      replacementStatusEvidence: replacementStatusEvidenceFor(asset),
      aliasOf: asset.aliasOf,
      criticalGroups: asset.criticalGroups,
    })),
    fallbackKey: 'system.missing-asset',
    qualityStatus: 'technical_baseline',
  };
}

export async function buildSizeReport(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<unknown> {
  const files = await Promise.all(
    assetFileDescriptors(manifest).map(async (descriptor) => {
      const filePath = resolveAssetFilesystemPath(workspaceRoot, descriptor.manifestPath);
      const bytes = await fileSize(filePath);
      const content = bytes === undefined ? undefined : await readFile(filePath);
      return {
        assetKey: descriptor.asset.key,
        category: descriptor.asset.category,
        assetType: descriptor.asset.assetType,
        variantId: descriptor.variant?.id ?? null,
        role: descriptor.role,
        path: descriptor.manifestPath,
        bytes: bytes ?? null,
        budgetBytes: descriptor.budgetBytes,
        withinBudget: bytes !== undefined && bytes <= descriptor.budgetBytes,
        sha256: content === undefined ? null : sha256(content),
      };
    }),
  );
  const totalBytes = files.reduce((total, file) => total + (file.bytes ?? 0), 0);
  const filesByDescendingSize = [...files].sort(
    (left, right) =>
      (right.bytes ?? -1) - (left.bytes ?? -1) || left.path.localeCompare(right.path),
  );
  return {
    schemaVersion: 1,
    pipelineVersion: ASSET_PIPELINE_VERSION,
    manifestVersion: manifest.manifestVersion,
    totalBytes,
    totalBudgetBytes: ASSET_BUDGETS.totalBytes,
    withinTotalBudget: totalBytes <= ASSET_BUDGETS.totalBytes,
    missingFileCount: files.filter(({ bytes }) => bytes === null).length,
    overBudgetFileCount: files.filter(({ withinBudget }) => !withinBudget).length,
    bytesByRole: summarizeFileBytes(files, ({ role }) => role),
    bytesByCategory: summarizeFileBytes(files, ({ category }) => category),
    largestFiles: filesByDescendingSize.slice(0, 20),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export async function renderRuntimeAssetBytes(
  asset: BundledAssetEntry,
  variant?: BundledAssetVariant,
): Promise<Buffer> {
  const source = Buffer.from(
    renderBundledAssetSvg({ asset, ...(variant === undefined ? {} : { variant }) }),
  );
  return sharp(source, { density: 144 })
    .resize(asset.width, asset.height, { fit: 'fill' })
    .webp({ lossless: true, effort: 6, alphaQuality: 100 })
    .toBuffer();
}

export async function renderThumbnailBytes(asset: BundledAssetEntry): Promise<Buffer> {
  const source = Buffer.from(renderBundledAssetSvg({ asset }));
  return sharp(source, { density: 144 })
    .resize(ASSET_BUDGETS.thumbnailDimension, ASSET_BUDGETS.thumbnailDimension, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ lossless: true, effort: 6, alphaQuality: 100 })
    .toBuffer();
}

export async function generateCoverageOutputs(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  const coverage = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, ASSET_OUTPUT_PATHS.coverage),
    await formattedJson(buildCoverageReport(manifest)),
  );
  const sizes = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, ASSET_OUTPUT_PATHS.sizes),
    await formattedJson(await buildSizeReport(workspaceRoot, manifest)),
  );
  return summarizeWrites([coverage, sizes]);
}

export async function generateAll(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<PipelineResult> {
  bundledAssetManifestSchema.parse(manifest);
  const results = [
    await generateManifestOutput(workspaceRoot, manifest),
    await generateSources(workspaceRoot, manifest),
    await generateRuntimeAssets(workspaceRoot, manifest),
    await generateThumbnails(workspaceRoot, manifest),
    await generateCoverageOutputs(workspaceRoot, manifest),
  ];
  return results.reduce(
    (total, result) => ({
      written: total.written + result.written,
      unchanged: total.unchanged + result.unchanged,
      files: total.files + result.files,
      bytes: total.bytes + result.bytes,
    }),
    { written: 0, unchanged: 0, files: 0, bytes: 0 },
  );
}

function runtimeBudgetFor(asset: BundledAssetEntry): number {
  if (asset.renderLayer === 'ground' || asset.renderLayer === 'ground_detail') {
    return ASSET_BUDGETS.terrainRuntimeBytes;
  }
  if (asset.renderLayer === 'interface') return ASSET_BUDGETS.interfaceRuntimeBytes;
  if (asset.renderLayer === 'structure') return ASSET_BUDGETS.structureRuntimeBytes;
  return ASSET_BUDGETS.objectRuntimeBytes;
}

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function replacementPriorityFor(asset: BundledAssetEntry): 'protected' | 'high' | 'medium' | 'low' {
  if (!asset.replacementAllowed) return 'protected';
  if (asset.aliasOf !== null) return 'low';
  if (
    asset.criticalGroups.some((group) =>
      ['lantern_square', 'personal_home', 'farming', 'housing', 'interface'].includes(group),
    )
  ) {
    return 'high';
  }
  return 'medium';
}

function replacementStatusEvidenceFor(asset: BundledAssetEntry): readonly string[] {
  return [
    `quality_status:${asset.qualityStatus}`,
    `replacement_allowed:${String(asset.replacementAllowed)}`,
    asset.aliasOf === null ? 'physical_bundled_media' : `alias_of:${asset.aliasOf}`,
    `critical_groups:${asset.criticalGroups.join(',') || 'none'}`,
  ];
}

function summarizeFileBytes<T extends Readonly<{ bytes: number | null }>>(
  files: readonly T[],
  key: (file: T) => string,
): Readonly<Record<string, Readonly<{ files: number; bytes: number; missing: number }>>> {
  const aggregates = new Map<string, { files: number; bytes: number; missing: number }>();
  for (const file of files) {
    const aggregate = aggregates.get(key(file)) ?? { files: 0, bytes: 0, missing: 0 };
    aggregate.files += 1;
    aggregate.bytes += file.bytes ?? 0;
    if (file.bytes === null) aggregate.missing += 1;
    aggregates.set(key(file), aggregate);
  }
  return Object.fromEntries(
    [...aggregates.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summarizeWrites(writes: readonly WriteResult[]): PipelineResult {
  return {
    written: writes.filter(({ changed }) => changed).length,
    unchanged: writes.filter(({ changed }) => !changed).length,
    files: writes.length,
    bytes: writes.reduce((total, { bytes }) => total + bytes, 0),
  };
}

export function relativeOutputPath(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}
