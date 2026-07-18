import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  bundledAssetManifestSchema,
} from '@starville/asset-management';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { ASSET_OUTPUT_PATHS, CURRENT_WORLD_MANIFEST_ASSET_KEYS } from '../src/constants';
import { runAssetPipelineCli } from '../src/cli';
import { resolveAssetFilesystemPath, sha256, writeFileIfChanged } from '../src/files';
import {
  buildCoverageReport,
  buildSizeReport,
  generateAll,
  renderRuntimeAssetBytes,
} from '../src/pipeline';
import { renderBundledAssetSvg } from '../src/svg';
import { validateBundledAssets } from '../src/validation';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starville-assets-'));
  temporaryRoots.push(root);
  return root;
}

const missingAsset = STARVILLE_BUNDLED_ASSET_MANIFEST.assets.find(
  ({ key }) => key === 'system.missing-asset',
);
if (missingAsset === undefined) throw new Error('Canonical missing asset fixture is unavailable');

const fixtureManifest = bundledAssetManifestSchema.parse({
  ...STARVILLE_BUNDLED_ASSET_MANIFEST,
  assets: [missingAsset],
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('deterministic bundled asset pipeline', () => {
  it('renders deterministic, editable SVG without embedded or remote content', () => {
    const first = renderBundledAssetSvg({ asset: missingAsset });
    const second = renderBundledAssetSvg({ asset: missingAsset });

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 192 192"');
    expect(first).toContain('<title>Missing Asset</title>');
    expect(first).not.toMatch(/(?:data:|<image\b|\bhref\s*=)/iu);
  });

  it('writes only changed bytes and preserves unchanged file modification time', async () => {
    const root = await temporaryRoot();
    const target = path.join(root, 'assets', 'source', 'fixture.svg');
    const first = await writeFileIfChanged(target, '<svg/>\n');
    const firstModifiedAt = (await stat(target)).mtimeMs;
    const second = await writeFileIfChanged(target, '<svg/>\n');
    const secondModifiedAt = (await stat(target)).mtimeMs;

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(secondModifiedAt).toBe(firstModifiedAt);
  });

  it('generates a complete manifest subset, validates it, and is idempotent', async () => {
    const root = await temporaryRoot();
    const first = await generateAll(root, fixtureManifest);
    const runtime = resolveAssetFilesystemPath(root, missingAsset.runtimePath);
    const thumbnail = resolveAssetFilesystemPath(root, missingAsset.thumbnailPath);
    const manifest = resolveAssetFilesystemPath(root, ASSET_OUTPUT_PATHS.manifest);

    expect(first.written).toBe(6);
    await expect(readFile(runtime)).resolves.toBeInstanceOf(Buffer);
    await expect(readFile(thumbnail)).resolves.toBeInstanceOf(Buffer);
    await expect(readFile(manifest, 'utf8')).resolves.toContain('system.missing-asset');

    const validation = await validateBundledAssets(root, fixtureManifest);
    expect(validation.issues).toEqual([]);
    expect(validation.expectedFileCount).toBe(3);

    const second = await generateAll(root, fixtureManifest);
    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(6);
  });

  it('rejects unsafe paths, opaque wrong-size outputs, and orphaned generated files', async () => {
    const root = await temporaryRoot();
    await generateAll(root, fixtureManifest);
    expect(() => resolveAssetFilesystemPath(root, 'assets/../outside.webp')).toThrow(
      'escapes the managed root',
    );
    expect(() => resolveAssetFilesystemPath(root, 'assets/uploads/override.webp')).toThrow(
      'uploaded-asset path',
    );

    const runtime = resolveAssetFilesystemPath(root, missingAsset.runtimePath);
    await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
    })
      .webp({ lossless: true })
      .toFile(runtime);
    const orphan = resolveAssetFilesystemPath(root, 'assets/source/interaction/orphan.svg');
    await mkdir(path.dirname(orphan), { recursive: true });
    await writeFile(orphan, '<svg width="1" height="1"/>\n');

    const validation = await validateBundledAssets(root, fixtureManifest);
    expect(validation.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'RUNTIME_DIMENSIONS',
        'RUNTIME_ALPHA',
        'GENERATED_MEDIA_DRIFT',
        'ORPHAN_FILE',
        'SIZE_OUTPUT_STALE',
      ]),
    );
  });

  it('renders required terrain, farming, interface, furniture, and station states to distinct pixels', async () => {
    const groups = [
      [
        'world.terrain.dirt',
        'world.terrain.path.stone',
        'world.terrain.plaza',
        'world.terrain.water',
        'world.terrain.soil.dry',
        'world.terrain.soil.watered',
      ],
      [
        'farming.plot.empty',
        'farming.plot.prepared',
        'farming.plot.dry',
        'farming.plot.watered',
        'farming.plot.planted',
        'farming.plot.selected',
        'farming.plot.invalid',
      ],
      [
        'ui.currency.dust',
        'ui.category.inventory',
        'ui.category.farming',
        'ui.category.cooking',
        'ui.category.crafting',
        'ui.category.shop',
        'ui.category.housing',
        'ui.category.social',
        'ui.quest.active',
        'ui.objective.active',
        'ui.direction',
        'ui.interaction',
        'ui.spawn',
        'ui.exit',
        'ui.warning',
        'ui.validation.success',
        'ui.validation.error',
        'ui.social.home-visit',
        'ui.social.photo-area',
        'ui.social.guestbook',
        'ui.social.appreciation',
      ],
      ['phase7-dev-hearth-table', 'phase7-dev-meadow-shelf'],
      [
        'phase7-cooking-hearth-marker',
        'world.station.cooking-hearth.active',
        'world.station.cooking-hearth.ready',
      ],
      [
        'phase7-crafting-workbench-marker',
        'world.station.crafting-workbench.active',
        'world.station.crafting-workbench.ready',
      ],
    ] as const;

    for (const keys of groups) {
      const assets = keys.map((key) =>
        STARVILLE_BUNDLED_ASSET_MANIFEST.assets.find((asset) => asset.key === key),
      );
      expect(assets.every((asset) => asset !== undefined)).toBe(true);
      const hashes = await Promise.all(
        assets.map(async (asset) => sha256(await renderRuntimeAssetBytes(asset!))),
      );
      expect(new Set(hashes).size, keys.join(', ')).toBe(keys.length);
    }
  }, 30_000);

  it('records every stable key and operational replacement evidence in canonical coverage', () => {
    const coverage = buildCoverageReport() as {
      assets: readonly Record<string, unknown>[];
      gameplayCatalogReferences: readonly { key: string; present: boolean }[];
      missingGameplayCatalogReferences: readonly string[];
    };

    expect(coverage.assets).toHaveLength(STARVILLE_BUNDLED_ASSET_MANIFEST.assets.length);
    expect(coverage.missingGameplayCatalogReferences).toEqual([]);
    expect(CURRENT_WORLD_MANIFEST_ASSET_KEYS).toEqual([
      'cottage-amber',
      'cottage-sage',
      'tree-pine',
      'tree-maple',
      'rock-moss',
      'fence-willow',
      'lamp-star',
      'notice-board',
      'flowers-moon',
      'bush-round',
      'moonstone-marker',
      'brooklight-sign',
      'orchard-road-sign',
      'whisperpine-gate',
      'closed-route-marker',
      'phase7-farm-plot-marker',
      'phase7-general-store-marker',
      'phase7-cooking-hearth-marker',
      'phase7-crafting-workbench-marker',
      'phase7-home-entrance-marker',
      'phase10b-wardrobe-mirror-marker',
      'phase10b-wardrobe-furniture-marker',
    ]);
    expect(coverage.gameplayCatalogReferences).toContainEqual({ key: 'tree-pine', present: true });
    expect(coverage.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'phase7-general-store-marker',
          bundledStatus: 'bundled_default_available',
          uploadedOverrideStatus: 'runtime_lifecycle_managed_not_observable_in_repository',
          replacementPriority: 'high',
          qualityStatus: 'technical_baseline',
        }),
      ]),
    );
    expect(
      coverage.assets.every(
        (asset) =>
          'runtimePath' in asset &&
          'sourcePath' in asset &&
          'thumbnail' in asset &&
          'dimensions' in asset &&
          'anchor' in asset &&
          'footprint' in asset &&
          'collision' in asset &&
          'frameInformation' in asset &&
          'fallbackState' in asset &&
          'replacementStatusEvidence' in asset,
      ),
    ).toBe(true);
  });

  it('aggregates file sizes by role and category and reports largest files', async () => {
    const root = await temporaryRoot();
    await generateAll(root, fixtureManifest);
    const sizes = (await buildSizeReport(root, fixtureManifest)) as {
      bytesByRole: Record<string, { files: number; bytes: number; missing: number }>;
      bytesByCategory: Record<string, { files: number; bytes: number; missing: number }>;
      largestFiles: readonly { bytes: number | null }[];
    };

    expect(sizes.bytesByRole).toMatchObject({
      runtime: { files: 1, missing: 0 },
      source: { files: 1, missing: 0 },
      thumbnail: { files: 1, missing: 0 },
    });
    expect(sizes.bytesByCategory['interaction']?.files).toBe(3);
    expect(sizes.largestFiles).toHaveLength(3);
    expect(sizes.largestFiles[0]!.bytes).toBeGreaterThanOrEqual(sizes.largestFiles[1]!.bytes ?? 0);
  });

  it('makes check detect generated drift without repairing it', async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, 'package.json'), '{"name":"starville"}\n');
    await generateAll(root, fixtureManifest);
    const source = resolveAssetFilesystemPath(root, missingAsset.sourcePath);
    const canonical = await readFile(source, 'utf8');
    const drifted = canonical.replace('<title>', '<title>Drift ');
    await writeFile(source, drifted);

    const error = console.error;
    const log = console.log;
    console.error = () => undefined;
    console.log = () => undefined;
    try {
      await expect(runAssetPipelineCli(['check'], root, fixtureManifest)).resolves.toBe(1);
    } finally {
      console.error = error;
      console.log = log;
    }
    await expect(readFile(source, 'utf8')).resolves.toBe(drifted);
  }, 30_000);
});
