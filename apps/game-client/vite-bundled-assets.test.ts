import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  STARVILLE_BUNDLED_ASSETS,
  STARVILLE_PHASE12D_CANDIDATE_ASSETS,
  STARVILLE_PRODUCTION_SLICE_ASSETS,
} from '../../packages/asset-management/src/bundled-assets';

import {
  bundledAssetFileForRequest,
  isBundledAssetRoute,
  realFileInsideBundledRoot,
  starvilleBundledAssetsPlugin,
} from './vite-bundled-assets';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('bundled asset Vite boundary', () => {
  it('maps only manifest-allowlisted WebPs with the exact manifest cache identity', () => {
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v1/terrain/world__terrain__grass__base.webp?manifest=1.0.0',
      ),
    ).toMatch(/assets\/starville\/bundled\/v1\/terrain\/world__terrain__grass__base\.webp$/u);
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v1/terrain/not-in-the-manifest.webp?manifest=1.0.0',
      ),
    ).toBeNull();
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v3/structure/cottage-amber.webp?manifest=3.1.0',
      ),
    ).toMatch(/assets\/starville\/bundled\/v3\/structure\/cottage-amber\.webp$/u);
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/avatar/production-slice-v3/starville-production-adventurer.webp?manifest=3.1.0',
      ),
    ).toMatch(
      /assets\/starville\/avatar\/production-slice-v3\/starville-production-adventurer\.webp$/u,
    );
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v2/terrain/world__terrain__grass__base.webp?manifest=2.0.0',
      ),
    ).toMatch(/assets\/starville\/bundled\/v2\/terrain\/world__terrain__grass__base\.webp$/u);
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v2/terrain/world__terrain__grass__base.webp?manifest=1.0.0',
      ),
    ).toBeNull();
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v1/terrain/world__terrain__grass__base.webp?manifest=2.0.0',
      ),
    ).toBeNull();
    expect(bundledAssetFileForRequest('/assets/source/terrain/private.svg')).toBeNull();
    expect(bundledAssetFileForRequest('/package.json')).toBeNull();
  });

  it('does not serve immutable bytes without the current manifest-version query', () => {
    const path = '/assets/starville/bundled/v1/terrain/world__terrain__grass__base.webp';
    expect(bundledAssetFileForRequest(path)).toBeNull();
    expect(bundledAssetFileForRequest(`${path}?manifest=0.9.0`)).toBeNull();
    expect(bundledAssetFileForRequest(`${path}?manifest=1.0.0&manifest=1.0.0`)).toBeNull();
    expect(bundledAssetFileForRequest(`${path}?manifest=1.0.0&token=private`)).toBeNull();
    expect(isBundledAssetRoute(path)).toBe(true);
    expect(isBundledAssetRoute('/visual-acceptance.html?panel=assets')).toBe(false);
  });

  it('rejects traversal, malformed encoding, and non-WebP files', () => {
    expect(
      bundledAssetFileForRequest(
        '/assets/starville/bundled/v1/%2e%2e/%2e%2e/%2e%2e/.env.local.webp?manifest=1.0.0',
      ),
    ).toBeNull();
    expect(bundledAssetFileForRequest('/assets/starville/bundled/v1/%E0%A4%A')).toBeNull();
    expect(
      bundledAssetFileForRequest('/assets/starville/bundled/v1/terrain/tile.svg?manifest=1.0.0'),
    ).toBeNull();
  });

  it('rejects an allowlisted-looking file when its canonical path escapes through a symlink', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'starville-bundled-boundary-'));
    temporaryDirectories.push(workspace);
    const root = path.join(workspace, 'runtime');
    const outside = path.join(workspace, 'private.webp');
    mkdirSync(path.join(root, 'terrain'), { recursive: true });
    writeFileSync(outside, 'private');
    const linked = path.join(root, 'terrain', 'world__terrain__grass__base.webp');
    symlinkSync(outside, linked);

    expect(realFileInsideBundledRoot(linked, root)).toBeNull();

    const safe = path.join(root, 'terrain', 'safe.webp');
    writeFileSync(safe, 'safe');
    expect(realFileInsideBundledRoot(safe, root)).toBe(realpathSync(safe));
  });

  it('emits exactly the unique manifest allowlist rather than walking arbitrary files', async () => {
    const emitted: string[] = [];
    const plugin = starvilleBundledAssetsPlugin().find(({ apply }) => apply === 'build');
    expect(plugin).toBeDefined();
    if (plugin === undefined || typeof plugin.buildStart !== 'function') {
      throw new Error('Expected a build-start hook');
    }
    expect(plugin.buildStart).toBeTypeOf('function');
    await plugin.buildStart.call(
      {
        emitFile: (asset: { fileName?: string }) => {
          if (asset.fileName !== undefined) emitted.push(asset.fileName);
          return `fixture-${String(emitted.length)}`;
        },
      } as never,
      {} as never,
    );

    const expected = [
      ...STARVILLE_BUNDLED_ASSETS,
      ...STARVILLE_PHASE12D_CANDIDATE_ASSETS,
      ...STARVILLE_PRODUCTION_SLICE_ASSETS,
    ]
      .flatMap((asset) => [
        asset.runtimePath.slice(1),
        asset.thumbnailPath.slice(1),
        ...asset.variants.map((variant) => variant.runtimePath.slice(1)),
      ])
      .concat('assets/starville/avatar/production-slice-v3/starville-production-adventurer.webp')
      .sort();
    expect(emitted.sort()).toEqual([...new Set(expected)]);
    expect(new Set(emitted).size).toBe(emitted.length);
    expect(emitted.every((file) => file.endsWith('.webp'))).toBe(true);
    expect(emitted).toContain(
      'assets/starville/bundled/v1/terrain/world__terrain__grass__base.webp',
    );
    expect(emitted).toContain(
      'assets/starville/bundled/v2/terrain/world__terrain__grass__base.webp',
    );
    expect(emitted).toContain('assets/starville/bundled/v3/structure/cottage-amber.webp');
    expect(emitted).not.toContain('assets/starville/bundled/v1/not-in-manifest.webp');
    expect(emitted).not.toContain('assets/starville/bundled/v2/not-in-manifest.webp');
  });
});
