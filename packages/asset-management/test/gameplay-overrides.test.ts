import { describe, expect, it } from 'vitest';

import {
  GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS,
  STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS,
  gameplayAssetOverrideCandidate,
  gameplayAssetOverrideSchema,
} from '../src';

function override(assetKey = 'phase7-dev-moonbean') {
  return {
    assetKey,
    versionId: '00000000-0000-4000-8000-000000000123',
    checksum: 'a'.repeat(64),
    source: 'active_uploaded',
    bundledManifestVersion: null,
    url: `https://assets.example.test/game-assets/starville/${assetKey}/v2/source.webp`,
    mediaType: 'image/webp',
    width: 256,
    height: 256,
    renderWidth: 128,
    renderHeight: 128,
    scale: 1,
    anchor: { x: 0.5, y: 1 },
    footAnchor: { x: 0.5, y: 0.92 },
    depthAnchor: { x: 0.5, y: 0.92 },
    collision: { shape: 'none', blocking: false },
    supportedRotations: [0],
    defaultRotation: 0,
    replacementAllowed: true,
  } as const;
}

describe('gameplay uploaded overrides', () => {
  it('keeps the gameplay allowlist bounded and excludes world-only or protected material', () => {
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length).toBeLessThanOrEqual(
      GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS,
    );
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS).toContain('phase7-dev-moonbean');
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS).toContain('farming.crop.moonbean.stage-0');
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS).toContain('phase7-dev-willow-chair');
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS).not.toContain('tree-pine');
    expect(STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS).not.toContain('system.missing-asset');
  });

  it('parses only immutable allowlisted uploaded derivatives and builds a versioned candidate', () => {
    const parsed = gameplayAssetOverrideSchema.parse(override());
    expect(gameplayAssetOverrideCandidate(parsed)).toMatchObject({
      identity: `upload:phase7-dev-moonbean:${parsed.versionId}`,
      versionId: parsed.versionId,
      checksum: 'a'.repeat(64),
      eligible: true,
    });
    expect(gameplayAssetOverrideSchema.safeParse(override('tree-pine')).success).toBe(false);
    expect(
      gameplayAssetOverrideSchema.safeParse({ ...override(), url: 'data:image/webp;base64,AAAA' })
        .success,
    ).toBe(false);
    expect(
      gameplayAssetOverrideSchema.safeParse({
        ...override(),
        url: `${override().url}?cacheBust=unsafe`,
      }).success,
    ).toBe(false);
  });
});
