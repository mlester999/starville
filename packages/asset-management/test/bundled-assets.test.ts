import { describe, expect, it } from 'vitest';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  STARVILLE_BUNDLED_ASSETS,
  STARVILLE_PHASE12D_CANDIDATE_ASSET_MANIFEST,
  STARVILLE_PHASE12D_CANDIDATE_ASSETS,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  bundledAssetEntrySchema,
  bundledAssetManifestSchema,
  bundledAssetRuntimePath,
  cropStageAssetKey,
  farmPlotAssetKey,
  getBundledAsset,
} from '../src/bundled-assets';
import {
  resolveAssetSource,
  resolveWorldAssetDelivery,
  type ManagedAssetCandidate,
} from '../src/resolver';
import type { WorldAssetDelivery } from '../src/contracts';

const render = {
  width: 512,
  height: 512,
  renderWidth: 256,
  renderHeight: 256,
  scale: 1,
  anchor: { x: 0.5, y: 1 },
  footAnchor: { x: 0.5, y: 1 },
  depthAnchor: { x: 0.5, y: 1 },
  collision: { shape: 'none', blocking: false } as const,
  supportedRotations: [0] as const,
  defaultRotation: 0 as const,
};

function upload(overrides: Partial<ManagedAssetCandidate> = {}): ManagedAssetCandidate {
  return {
    sourceKind: 'uploaded',
    identity: 'upload:tree-pine:version-two',
    versionId: '00000000-0000-4000-8000-000000000002',
    eligible: true,
    url: 'https://assets.example.test/tree-pine/v2/source.webp',
    thumbnailUrl: 'https://assets.example.test/tree-pine/v2/thumbnail.webp',
    checksum: 'a'.repeat(64),
    render,
    ...overrides,
  };
}

function repositoryDelivery(assetKey = 'tree-pine'): WorldAssetDelivery {
  return {
    assetKey,
    versionId: '00000000-0000-4000-8000-000000000001',
    checksum: 'b'.repeat(64),
    bundledManifestVersion: '1.0.0',
    url: null,
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: 1,
    anchorX: 0.5,
    anchorY: 1,
    footAnchorX: 0.5,
    footAnchorY: 1,
    depthAnchorX: 0.5,
    depthAnchorY: 1,
    collision: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    developmentMarker: true,
  };
}

function candidateRepositoryDelivery(assetKey = 'tree-pine'): WorldAssetDelivery {
  return {
    ...repositoryDelivery(assetKey),
    versionId: '00000000-0000-4000-8000-000000000012',
    checksum: 'c'.repeat(64),
    materialClass: 'bundled_candidate',
    bundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  };
}

describe('Starville bundled asset manifest', () => {
  it('provides a unique, typed, replaceable baseline without claiming final art', () => {
    expect(STARVILLE_BUNDLED_ASSETS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(STARVILLE_BUNDLED_ASSETS.map(({ key }) => key)).size).toBe(
      STARVILLE_BUNDLED_ASSETS.length,
    );
    expect(STARVILLE_BUNDLED_ASSET_MANIFEST.projection).toMatchObject({
      tileWidth: 96,
      tileHeight: 48,
      lightDirection: 'upper_left',
    });
    expect(
      STARVILLE_BUNDLED_ASSETS.every(({ qualityStatus }) => qualityStatus === 'technical_baseline'),
    ).toBe(true);
    expect(getBundledAsset('system.missing-asset')?.replacementAllowed).toBe(false);
  });

  it('adds a versioned Phase 12D candidate without mutating v1 stable contracts', () => {
    expect(STARVILLE_PHASE12D_CANDIDATE_ASSETS).toHaveLength(STARVILLE_BUNDLED_ASSETS.length);
    expect(STARVILLE_PHASE12D_CANDIDATE_ASSET_MANIFEST.manifestVersion).toBe(
      STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    );
    expect(
      STARVILLE_PHASE12D_CANDIDATE_ASSETS.every(
        ({ qualityStatus }) => qualityStatus === 'production_candidate',
      ),
    ).toBe(true);

    for (const baseline of STARVILLE_BUNDLED_ASSETS) {
      const candidate = getBundledAsset(
        baseline.key,
        STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
      );
      expect(candidate).toBeDefined();
      expect(candidate).toMatchObject({
        key: baseline.key,
        width: baseline.width,
        height: baseline.height,
        anchor: baseline.anchor,
        footAnchor: baseline.footAnchor,
        depthAnchor: baseline.depthAnchor,
        footprint: baseline.footprint,
        collision: baseline.collision,
        supportedRotations: baseline.supportedRotations,
        defaultRotation: baseline.defaultRotation,
        safeFallbackKey: baseline.safeFallbackKey,
        replacementAllowed: baseline.replacementAllowed,
      });
      expect(candidate?.sourcePath).toMatch(/^assets\/source-v2\//u);
      expect(candidate?.runtimePath).toMatch(/^\/assets\/starville\/bundled\/v2\//u);
      expect(baseline.sourcePath).toMatch(/^assets\/source\//u);
      expect(baseline.runtimePath).toMatch(/^\/assets\/starville\/bundled\/v1\//u);
    }
  });

  it('selects authored furniture rotations instead of rotating one flat bitmap', () => {
    const chair = getBundledAsset('phase7-dev-willow-chair');
    expect(chair?.supportedRotations).toEqual([0, 90, 180, 270]);
    expect(chair).toBeDefined();
    expect(bundledAssetRuntimePath(chair!, { rotation: 90 })).toContain('rotation-90');
    expect(bundledAssetRuntimePath(chair!, { rotation: 0 })).toBe(chair?.runtimePath);
  });

  it('maps authoritative crop and plot state to stable visual identities', () => {
    expect(cropStageAssetKey('moonbean', 1, 4, false)).toBe('farming.crop.moonbean.stage-0');
    expect(cropStageAssetKey('moonbean', 4, 4, true)).toBe('farming.crop.moonbean.ready');
    expect(cropStageAssetKey('unknown-crop', 1, 4, false)).toBe('system.missing-asset');
    expect(farmPlotAssetKey({ state: 'prepared' })).toBe('farming.plot.prepared');
    expect(farmPlotAssetKey({ state: 'growing', watered: true })).toBe('farming.plot.watered');
    expect(farmPlotAssetKey({ state: 'empty', invalid: true })).toBe('farming.plot.invalid');
  });

  it('rejects inconsistent animation sheets and collision outside the footprint', () => {
    const tree = getBundledAsset('tree-pine');
    if (tree === undefined) throw new Error('tree fixture missing');

    const animation = bundledAssetEntrySchema.safeParse({
      ...tree,
      animated: true,
      frameWidth: 100,
      frameHeight: 100,
      frameCount: 2,
      loopMode: 'loop',
    });
    const collision = bundledAssetEntrySchema.safeParse({
      ...tree,
      collision: {
        shape: 'rectangle',
        blocking: true,
        offsetX: -0.6,
        offsetY: -0.25,
        width: 1.2,
        height: 0.5,
      },
    });

    expect(animation.success).toBe(false);
    expect(collision.success).toBe(false);
  });

  it('rejects alias and safe-fallback cycles while retaining the missing-asset terminus', () => {
    const missing = getBundledAsset('system.missing-asset');
    const tree = getBundledAsset('tree-pine');
    const fence = getBundledAsset('fence-willow');
    if (missing === undefined || tree === undefined || fence === undefined) {
      throw new Error('fallback fixtures missing');
    }
    const fallbackCycle = bundledAssetManifestSchema.safeParse({
      ...STARVILLE_BUNDLED_ASSET_MANIFEST,
      assets: [
        missing,
        { ...tree, safeFallbackKey: fence.key },
        { ...fence, safeFallbackKey: tree.key },
      ],
    });
    const aliasCycle = bundledAssetManifestSchema.safeParse({
      ...STARVILLE_BUNDLED_ASSET_MANIFEST,
      assets: [missing, { ...tree, aliasOf: fence.key }, { ...fence, aliasOf: tree.key }],
    });

    expect(fallbackCycle.success).toBe(false);
    expect(aliasCycle.success).toBe(false);
  });
});

describe('canonical asset source resolution', () => {
  it('keeps an exact uploaded pin ahead of every fallback', () => {
    const resolution = resolveAssetSource({
      assetKey: 'tree-pine',
      context: 'published_world',
      exactPinned: upload(),
      activeOverride: upload({ identity: 'upload:tree-pine:version-three' }),
      allowActiveOverride: true,
    });
    expect(resolution.source).toBe('pinned_uploaded');
    expect(resolution.reason).toBe('exact_pinned_upload');
    expect(resolution.url).toContain('/v2/');
  });

  it('treats an exact repository pin as the immutable bundled version', () => {
    const resolution = resolveWorldAssetDelivery({
      assetKey: 'tree-pine',
      context: 'published_world',
      delivery: repositoryDelivery(),
    });
    expect(resolution.source).toBe('bundled_default');
    expect(resolution.reason).toBe('exact_pinned_bundled_version');
    const url = new URL(resolution.url!, 'https://starville.local');
    expect(url.pathname).toBe(getBundledAsset('tree-pine')?.runtimePath);
    expect(url.searchParams.get('manifest')).toBe(STARVILLE_BUNDLED_ASSET_MANIFEST.manifestVersion);
  });

  it('resolves an exact Phase 12D candidate pin while leaving published defaults on v1', () => {
    const pinned = resolveWorldAssetDelivery({
      assetKey: 'tree-pine',
      context: 'game_test',
      delivery: candidateRepositoryDelivery(),
    });
    expect(pinned.reason).toBe('exact_pinned_bundled_version');
    expect(pinned.bundled.bundledVersion).toBe(STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION);
    expect(pinned.bundled.qualityStatus).toBe('production_candidate');
    expect(new URL(pinned.url, 'https://starville.local').searchParams.get('manifest')).toBe(
      STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    );

    const published = resolveAssetSource({
      assetKey: 'tree-pine',
      context: 'published_world',
      preferredBundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    });
    expect(published.bundled.bundledVersion).toBe('1.0.0');

    const gameTest = resolveAssetSource({
      assetKey: 'tree-pine',
      context: 'game_test',
      preferredBundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    });
    expect(gameTest.bundled.bundledVersion).toBe(STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION);
  });

  it('uses an active approved upload only when no exact pin exists and policy allows it', () => {
    const resolution = resolveAssetSource({
      assetKey: 'tree-pine',
      context: 'draft_world',
      activeOverride: upload(),
      allowActiveOverride: true,
    });
    expect(resolution.source).toBe('active_uploaded');
    expect(resolution.reason).toBe('eligible_active_override');
  });

  it('falls back to bundled art when pinned uploaded media fails without changing identity', () => {
    const pinned = upload();
    const resolution = resolveAssetSource({
      assetKey: 'tree-pine',
      context: 'published_world',
      exactPinned: pinned,
      failedIdentities: new Set([pinned.identity]),
    });
    expect(resolution.source).toBe('bundled_default');
    expect(resolution.reason).toBe('uploaded_pin_unavailable_bundled_fallback');
    expect(resolution.diagnostics.safeFallbackUsed).toBe(true);
  });

  it('returns the stable Starville missing placeholder for an unknown key', () => {
    const resolution = resolveAssetSource({
      assetKey: 'world.unknown.object',
      context: 'game_test',
    });
    expect(resolution.source).toBe('missing_placeholder');
    expect(resolution.visualKey).toBe('system.missing-asset');
    expect(resolution.reason).toBe('stable_key_unknown');
    expect(resolution.diagnostics.requestedKey).toBe('world.unknown.object');
  });

  it('fails a foreign-game-shaped stable key closed to the Starville placeholder', () => {
    const resolution = resolveAssetSource({
      assetKey: 'foreign-game.world.tree.pine',
      context: 'admin_preview',
    });
    expect(resolution.source).toBe('missing_placeholder');
    expect(resolution.visualKey).toBe('system.missing-asset');
    expect(resolution.url).not.toContain('foreign-game');
  });

  it('selects an authored rotation through the protected Admin media surface', () => {
    const resolution = resolveAssetSource({
      assetKey: 'phase7-dev-willow-chair',
      context: 'admin_preview',
      rotation: 90,
      mediaSurface: 'admin',
    });
    expect(resolution.url).toBe('/api/bundled-assets/phase7-dev-willow-chair/source?rotation=90');
    expect(resolution.cacheIdentity).toContain('rotation=90');
  });
});
