import { STARVILLE_VISUAL_TOKENS, lanternSquareManifest } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import {
  adminWorldAssetProjectionScale,
  adminWorldCameraFrame,
  adminWorldObjectContactShadow,
  adminWorldReferencePlayerMetrics,
  adminWorldReferencePlayerShadow,
  analyzeAdminWorldVisualReadiness,
} from './visual-policy';

describe('Admin shared visual-policy adapter', () => {
  it('maps object findings to Composer focus paths without changing trusted validation', () => {
    const source = lanternSquareManifest();
    const manifest = {
      ...source,
      objects: source.objects.map((object, index) =>
        index === 0 ? { ...object, scale: 2 } : object,
      ),
    };
    const analysis = analyzeAdminWorldVisualReadiness(manifest);
    const scaleFinding = analysis.findings.find(({ code }) => code === 'extreme-authored-scale');

    expect(scaleFinding).toMatchObject({ severity: 'warning', path: 'objects[0]' });
    expect(analysis.counts.warning).toBeGreaterThan(0);
  });

  it('derives fitted asset size from category scale and manifest half-tile projection', () => {
    expect(
      adminWorldAssetProjectionScale({
        kind: 'building',
        authoredScale: 1,
        tileWidth: 96,
        projectedHalfTileWidth: 48,
      }),
    ).toBeCloseTo(STARVILLE_VISUAL_TOKENS.scale.objects.building);
    expect(
      adminWorldAssetProjectionScale({
        kind: 'building',
        authoredScale: 1,
        tileWidth: 96,
        projectedHalfTileWidth: 24,
      }),
    ).toBeCloseTo(STARVILLE_VISUAL_TOKENS.scale.objects.building / 2);

    const shadow = adminWorldObjectContactShadow({
      kind: 'building',
      authoredScale: 1,
      tileWidth: 96,
      projectedHalfTileWidth: 24,
    });
    expect(shadow).toMatchObject({ width: 93, height: 17, alpha: 0.2, color: '#10221b' });
    expect(shadow.layers).toHaveLength(3);
    expect(shadow.layers[0]!.width).toBeGreaterThan(shadow.layers[2]!.width);
    expect(shadow.layers.reduce((total, layer) => total + layer.alpha, 0)).toBeCloseTo(0.2);

    const player = adminWorldReferencePlayerMetrics({
      tileWidth: 96,
      projectedHalfTileWidth: 24,
    });
    expect(player.width).toBeCloseTo(32.48);
    expect(player.height).toBeCloseTo(54.88);

    const playerShadow = adminWorldReferencePlayerShadow({
      tileWidth: 96,
      projectedHalfTileWidth: 24,
    });
    expect(playerShadow.layers).toHaveLength(3);
    expect(playerShadow.layers[2]!.width).toBeCloseTo(24.08);
    expect(playerShadow.layers[2]!.height).toBeCloseTo(8.4);
    expect(playerShadow.layers[2]!.alpha).toBeCloseTo(0.104);
    expect(playerShadow.layers.reduce((total, layer) => total + layer.alpha, 0)).toBeCloseTo(0.2);
  });

  it('uses shared responsive camera framing for the Admin viewport matrix', () => {
    const manifest = lanternSquareManifest();
    const compact = adminWorldCameraFrame(manifest, { width: 360, height: 800 });
    const desktop = adminWorldCameraFrame(manifest, { width: 1920, height: 1080 });

    expect(compact.bounds.width).toBeGreaterThan(0);
    expect(desktop.apronTiles).toBeGreaterThanOrEqual(compact.apronTiles);
    expect(desktop.zoom).toBeGreaterThanOrEqual(compact.zoom);
  });
});
