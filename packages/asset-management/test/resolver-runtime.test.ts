import { describe, expect, it } from 'vitest';

import {
  resolveAssetSource,
  resolveWorldAssetDelivery,
  type ManagedAssetCandidate,
} from '../src/resolver';
import { worldAssetDeliverySchema, type WorldAssetDelivery } from '../src/contracts';

function bundledCandidate(overrides: Partial<ManagedAssetCandidate> = {}): ManagedAssetCandidate {
  return {
    sourceKind: 'bundled',
    identity: 'repository:tree-pine:00000000-0000-4000-8000-000000000001:1.0.0',
    versionId: '00000000-0000-4000-8000-000000000001',
    bundledManifestVersion: '1.0.0',
    eligible: true,
    url: null,
    thumbnailUrl: null,
    checksum: 'b'.repeat(64),
    render: null,
    ...overrides,
  };
}

function repositoryDelivery(): WorldAssetDelivery {
  return {
    assetKey: 'tree-pine',
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

describe('runtime bundled pin identity', () => {
  it('binds an exact repository pin to the checked-in manifest and version identity', () => {
    const resolution = resolveWorldAssetDelivery({
      assetKey: 'tree-pine',
      context: 'published_world',
      delivery: repositoryDelivery(),
    });

    expect(resolution.source).toBe('bundled_default');
    expect(resolution.reason).toBe('exact_pinned_bundled_version');
    expect(resolution.versionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(resolution.url).toContain('?manifest=1.0.0');
  });

  it('fails a stale or unbound bundled pin closed to the stable missing material', () => {
    for (const exactPinned of [
      bundledCandidate({ bundledManifestVersion: '0.9.0' }),
      bundledCandidate({ bundledManifestVersion: null }),
      bundledCandidate({ versionId: null }),
      bundledCandidate({ eligible: false }),
    ]) {
      const resolution = resolveAssetSource({
        assetKey: 'tree-pine',
        context: 'published_world',
        exactPinned,
      });
      expect(resolution.source).toBe('missing_placeholder');
      expect(resolution.visualKey).toBe('system.missing-asset');
      expect(resolution.reason).toBe('exact_pinned_bundled_identity_mismatch');
      expect(resolution.diagnostics.safeFallbackUsed).toBe(true);
    }
  });

  it('renders a pre-12B unbound repository delivery as missing instead of current bundled art', () => {
    const legacy = { ...repositoryDelivery(), bundledManifestVersion: null };
    const parsed = worldAssetDeliverySchema.parse(legacy);
    const resolution = resolveWorldAssetDelivery({
      assetKey: parsed.assetKey,
      context: 'published_world',
      delivery: parsed,
    });

    expect(resolution.source).toBe('missing_placeholder');
    expect(resolution.visualKey).toBe('system.missing-asset');
    expect(resolution.reason).toBe('exact_pinned_bundled_identity_mismatch');
    expect(resolution.versionId).toBe(legacy.versionId);
  });
});
