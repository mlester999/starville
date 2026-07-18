import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  bundledAssetManifestSchema,
  type BundledAssetManifest,
} from '@starville/asset-management';
import sharp from 'sharp';

import { ASSET_BUDGETS, ASSET_OUTPUT_PATHS, REQUIRED_GAMEPLAY_ASSET_KEYS } from './constants';
import {
  fileSize,
  formattedJson,
  isMissingFileError,
  listFilesRecursively,
  resolveAssetFilesystemPath,
} from './files';
import {
  assetFileDescriptors,
  buildCoverageReport,
  buildSizeReport,
  renderRuntimeAssetBytes,
  renderThumbnailBytes,
  type AssetFileDescriptor,
} from './pipeline';
import { renderBundledAssetSvg } from './svg';

export type AssetValidationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type AssetValidationReport = Readonly<{
  valid: boolean;
  assetCount: number;
  expectedFileCount: number;
  totalBytes: number;
  issues: readonly AssetValidationIssue[];
}>;

export type AssetValidationOptions = Readonly<{
  enforceGameplayCatalogReferences?: boolean;
}>;

export async function validateBundledAssets(
  workspaceRoot: string,
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
  options: AssetValidationOptions = {},
): Promise<AssetValidationReport> {
  const issues: AssetValidationIssue[] = [];
  try {
    bundledAssetManifestSchema.parse(manifest);
  } catch (error) {
    issues.push({ code: 'MANIFEST_SCHEMA', path: 'manifest', message: String(error) });
    return {
      valid: false,
      assetCount: manifest.assets.length,
      expectedFileCount: 0,
      totalBytes: 0,
      issues,
    };
  }

  const descriptors = assetFileDescriptors(manifest);
  validateDescriptorPaths(workspaceRoot, descriptors, issues);
  validateAliases(manifest, issues);
  if (options.enforceGameplayCatalogReferences ?? manifest === STARVILLE_BUNDLED_ASSET_MANIFEST) {
    validateGameplayCatalogReferences(manifest, issues);
  }
  await validateManagedPathCase(workspaceRoot, descriptors, issues);

  let totalBytes = 0;
  for (const descriptor of descriptors) {
    const filePath = resolveAssetFilesystemPath(workspaceRoot, descriptor.manifestPath);
    const bytes = await fileSize(filePath);
    if (bytes === undefined) {
      issues.push({
        code: 'FILE_MISSING',
        path: descriptor.manifestPath,
        message: `Expected ${descriptor.role} file is missing`,
      });
      continue;
    }
    totalBytes += bytes;
    if (bytes > descriptor.budgetBytes) {
      issues.push({
        code: 'FILE_BUDGET',
        path: descriptor.manifestPath,
        message: `${String(bytes)} bytes exceeds ${String(descriptor.budgetBytes)} byte budget`,
      });
    }
    await validateDeterministicMedia(filePath, descriptor, issues);
    if (descriptor.role === 'source') {
      await validateSvg(filePath, descriptor, issues);
    } else {
      await validateWebp(filePath, descriptor, issues);
    }
  }

  if (totalBytes > ASSET_BUDGETS.totalBytes) {
    issues.push({
      code: 'TOTAL_BUDGET',
      path: 'assets',
      message: `${String(totalBytes)} bytes exceeds ${String(ASSET_BUDGETS.totalBytes)} byte total budget`,
    });
  }

  await validateOrphans(workspaceRoot, descriptors, issues);
  await validateOutput(
    workspaceRoot,
    ASSET_OUTPUT_PATHS.manifest,
    await formattedJson(manifest),
    'MANIFEST_OUTPUT_STALE',
    issues,
  );
  await validateOutput(
    workspaceRoot,
    ASSET_OUTPUT_PATHS.coverage,
    await formattedJson(buildCoverageReport(manifest)),
    'COVERAGE_OUTPUT_STALE',
    issues,
  );
  await validateOutput(
    workspaceRoot,
    ASSET_OUTPUT_PATHS.sizes,
    await formattedJson(await buildSizeReport(workspaceRoot, manifest)),
    'SIZE_OUTPUT_STALE',
    issues,
  );

  return {
    valid: issues.length === 0,
    assetCount: manifest.assets.length,
    expectedFileCount: descriptors.length,
    totalBytes,
    issues,
  };
}

function validateAliases(manifest: BundledAssetManifest, issues: AssetValidationIssue[]): void {
  const catalog = new Map(manifest.assets.map((asset) => [asset.key, asset]));
  for (const asset of manifest.assets) {
    if (asset.aliasOf === null) continue;
    const target = catalog.get(asset.aliasOf);
    if (target === undefined) continue;
    const pathsMatch =
      asset.sourcePath === target.sourcePath &&
      asset.runtimePath === target.runtimePath &&
      asset.thumbnailPath === target.thumbnailPath;
    if (!pathsMatch) {
      issues.push({
        code: 'ALIAS_PATH_MISMATCH',
        path: asset.key,
        message: `Alias media paths must match target ${target.key}`,
      });
    }
    if (asset.width !== target.width || asset.height !== target.height) {
      issues.push({
        code: 'ALIAS_DIMENSION_MISMATCH',
        path: asset.key,
        message: `Alias dimensions must match target ${target.key}`,
      });
    }
  }
}

function validateDescriptorPaths(
  workspaceRoot: string,
  descriptors: readonly AssetFileDescriptor[],
  issues: AssetValidationIssue[],
): void {
  const seen = new Set<string>();
  const seenCaseFolded = new Map<string, string>();
  for (const descriptor of descriptors) {
    try {
      resolveAssetFilesystemPath(workspaceRoot, descriptor.manifestPath);
    } catch (error) {
      issues.push({ code: 'PATH_UNSAFE', path: descriptor.manifestPath, message: String(error) });
    }
    if (seen.has(descriptor.manifestPath)) {
      issues.push({
        code: 'PATH_DUPLICATE',
        path: descriptor.manifestPath,
        message: 'Multiple manifest records target the same generated file',
      });
    }
    seen.add(descriptor.manifestPath);
    const caseFolded = descriptor.manifestPath.toLocaleLowerCase('en-US');
    const previousCase = seenCaseFolded.get(caseFolded);
    if (previousCase !== undefined && previousCase !== descriptor.manifestPath) {
      issues.push({
        code: 'PATH_CASE_COLLISION',
        path: descriptor.manifestPath,
        message: `Generated path differs from ${previousCase} only by letter case`,
      });
    }
    seenCaseFolded.set(caseFolded, descriptor.manifestPath);
  }
}

function validateGameplayCatalogReferences(
  manifest: BundledAssetManifest,
  issues: AssetValidationIssue[],
): void {
  const keys = new Set(manifest.assets.map(({ key }) => key));
  for (const key of REQUIRED_GAMEPLAY_ASSET_KEYS) {
    if (!keys.has(key)) {
      issues.push({
        code: 'GAMEPLAY_ASSET_REFERENCE_MISSING',
        path: key,
        message: 'Required gameplay or diagnostic stable key is absent from the bundled catalog',
      });
    }
  }
}

async function validateManagedPathCase(
  workspaceRoot: string,
  descriptors: readonly AssetFileDescriptor[],
  issues: AssetValidationIssue[],
): Promise<void> {
  const actualRelativePaths = (
    await Promise.all(
      [
        resolveAssetFilesystemPath(workspaceRoot, 'assets/source'),
        resolveAssetFilesystemPath(workspaceRoot, '/assets/starville/bundled/v1'),
      ].map((root) => listFilesRecursively(root)),
    )
  )
    .flat()
    .map((filePath) => path.relative(workspaceRoot, filePath).split(path.sep).join('/'));
  const actualByCaseFoldedPath = new Map(
    actualRelativePaths.map((relativePath) => [
      relativePath.toLocaleLowerCase('en-US'),
      relativePath,
    ]),
  );
  for (const descriptor of descriptors) {
    const expected = descriptor.manifestPath.startsWith('/')
      ? descriptor.manifestPath.slice(1)
      : descriptor.manifestPath;
    const actual = actualByCaseFoldedPath.get(expected.toLocaleLowerCase('en-US'));
    if (actual !== undefined && actual !== expected) {
      issues.push({
        code: 'PATH_CASE_MISMATCH',
        path: descriptor.manifestPath,
        message: `Manifest path case does not match filesystem path ${actual}`,
      });
    }
  }
}

async function validateDeterministicMedia(
  filePath: string,
  descriptor: AssetFileDescriptor,
  issues: AssetValidationIssue[],
): Promise<void> {
  const actual = await readFile(filePath);
  let expected: Buffer;
  if (descriptor.role === 'source') {
    expected = Buffer.from(
      renderBundledAssetSvg({
        asset: descriptor.asset,
        ...(descriptor.variant === undefined ? {} : { variant: descriptor.variant }),
      }),
      'utf8',
    );
  } else if (descriptor.role === 'thumbnail') {
    expected = await renderThumbnailBytes(descriptor.asset);
  } else {
    expected = await renderRuntimeAssetBytes(descriptor.asset, descriptor.variant);
  }
  if (!actual.equals(expected)) {
    issues.push({
      code: 'GENERATED_MEDIA_DRIFT',
      path: descriptor.manifestPath,
      message:
        'Generated bytes differ from the canonical deterministic source; run assets:generate',
    });
  }
}

async function validateSvg(
  filePath: string,
  descriptor: AssetFileDescriptor,
  issues: AssetValidationIssue[],
): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  if (/(?:data:|<image\b|\bhref\s*=|url\(\s*['"]?https?:)/iu.test(content)) {
    issues.push({
      code: 'SVG_EXTERNAL_CONTENT',
      path: descriptor.manifestPath,
      message: 'SVG sources cannot embed base64 data or reference external content',
    });
  }
  const metadata = await sharp(Buffer.from(content)).metadata();
  if (metadata.width !== descriptor.asset.width || metadata.height !== descriptor.asset.height) {
    issues.push({
      code: 'SOURCE_DIMENSIONS',
      path: descriptor.manifestPath,
      message: `Expected ${String(descriptor.asset.width)}x${String(descriptor.asset.height)}, found ${String(metadata.width)}x${String(metadata.height)}`,
    });
  }
  const stats = await sharp(Buffer.from(content)).stats();
  if (metadata.hasAlpha !== true || stats.isOpaque) {
    issues.push({
      code: 'SOURCE_ALPHA',
      path: descriptor.manifestPath,
      message: 'Bundled SVG must retain transparent pixels around its silhouette',
    });
  }
  await validateTransparentEdgeMargin(
    sharp(Buffer.from(content)),
    descriptor.manifestPath,
    'SOURCE_MARGIN',
    issues,
  );
}

async function validateWebp(
  filePath: string,
  descriptor: AssetFileDescriptor,
  issues: AssetValidationIssue[],
): Promise<void> {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const expectedWidth =
    descriptor.role === 'thumbnail' ? ASSET_BUDGETS.thumbnailDimension : descriptor.asset.width;
  const expectedHeight =
    descriptor.role === 'thumbnail' ? ASSET_BUDGETS.thumbnailDimension : descriptor.asset.height;
  if (metadata.format !== 'webp') {
    issues.push({
      code: 'RUNTIME_FORMAT',
      path: descriptor.manifestPath,
      message: 'Expected WebP output',
    });
  }
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    issues.push({
      code: 'RUNTIME_DIMENSIONS',
      path: descriptor.manifestPath,
      message: `Expected ${String(expectedWidth)}x${String(expectedHeight)}, found ${String(metadata.width)}x${String(metadata.height)}`,
    });
  }
  if (metadata.space !== 'srgb') {
    issues.push({
      code: 'RUNTIME_COLORSPACE',
      path: descriptor.manifestPath,
      message: `Expected sRGB-compatible output, found ${metadata.space ?? 'unknown'} color space`,
    });
  }
  const stats = await image.stats();
  if (metadata.hasAlpha !== true || stats.isOpaque) {
    issues.push({
      code: 'RUNTIME_ALPHA',
      path: descriptor.manifestPath,
      message: 'Bundled WebP must retain transparent pixels around its silhouette',
    });
  }
  await validateTransparentEdgeMargin(image, descriptor.manifestPath, 'RUNTIME_MARGIN', issues);
}

async function validateTransparentEdgeMargin(
  image: sharp.Sharp,
  manifestPath: string,
  code: string,
  issues: AssetValidationIssue[],
): Promise<void> {
  const { data, info } = await image
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaChannel = info.channels - 1;
  const alphaAt = (x: number, y: number): number =>
    data[(y * info.width + x) * info.channels + alphaChannel] ?? 0;
  let touchesEdge = false;
  for (let x = 0; x < info.width && !touchesEdge; x += 1) {
    touchesEdge = alphaAt(x, 0) > 0 || alphaAt(x, info.height - 1) > 0;
  }
  for (let y = 0; y < info.height && !touchesEdge; y += 1) {
    touchesEdge = alphaAt(0, y) > 0 || alphaAt(info.width - 1, y) > 0;
  }
  if (touchesEdge) {
    issues.push({
      code,
      path: manifestPath,
      message: 'Visible pixels touch the canvas edge; preserve a transparent safety margin',
    });
  }
}

async function validateOrphans(
  workspaceRoot: string,
  descriptors: readonly AssetFileDescriptor[],
  issues: AssetValidationIssue[],
): Promise<void> {
  const expected = new Set(
    descriptors.map(({ manifestPath }) =>
      path.normalize(resolveAssetFilesystemPath(workspaceRoot, manifestPath)),
    ),
  );
  const roots = [
    resolveAssetFilesystemPath(workspaceRoot, 'assets/source'),
    resolveAssetFilesystemPath(workspaceRoot, '/assets/starville/bundled/v1'),
  ];
  for (const root of roots) {
    for (const filePath of await listFilesRecursively(root)) {
      if (!/\.(?:svg|webp)$/u.test(filePath)) continue;
      if (!expected.has(path.normalize(filePath))) {
        issues.push({
          code: 'ORPHAN_FILE',
          path: path.relative(workspaceRoot, filePath).split(path.sep).join('/'),
          message: 'Generated asset is not declared by the canonical manifest',
        });
      }
    }
  }
}

async function validateOutput(
  workspaceRoot: string,
  outputPath: string,
  expected: string,
  code: string,
  issues: AssetValidationIssue[],
): Promise<void> {
  try {
    const actual = await readFile(resolveAssetFilesystemPath(workspaceRoot, outputPath), 'utf8');
    if (actual !== expected) {
      issues.push({ code, path: outputPath, message: 'Generated metadata output is stale' });
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    issues.push({ code, path: outputPath, message: 'Generated metadata output is missing' });
  }
}
