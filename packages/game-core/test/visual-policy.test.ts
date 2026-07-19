import { describe, expect, it } from 'vitest';

import {
  STARVILLE_VISUAL_TOKENS,
  analyzeWorldVisualReadiness,
  computeWorldCameraFrame,
  lanternSquareManifest,
  resolveWorldContactShadowLayers,
  resolveWorldObjectContactShadow,
  resolveWorldObjectVisualScale,
  resolveWorldLabelDistanceThresholds,
  resolveWorldPlayerContactShadow,
  resolveWorldVisualSettings,
} from '../src/index';

describe('shared Starville visual policy', () => {
  it('reduces remote-label range only in low visual quality', () => {
    const balanced = resolveWorldLabelDistanceThresholds('balanced');
    const high = resolveWorldLabelDistanceThresholds('high');
    const low = resolveWorldLabelDistanceThresholds('low');

    expect(high).toEqual(balanced);
    expect(low.fullOpacityDistance).toBeLessThan(balanced.fullOpacityDistance);
    expect(low.hiddenDistance).toBeLessThan(balanced.hiddenDistance);
    expect(low.fullOpacityDistance).toBeLessThan(low.hiddenDistance);
  });

  it('resolves canonical category scale without changing authored gameplay data', () => {
    expect(resolveWorldObjectVisualScale('building')).toBe(
      STARVILLE_VISUAL_TOKENS.scale.objects.building,
    );
    expect(resolveWorldObjectVisualScale('tree', 1.25)).toBeCloseTo(0.725);
    expect(resolveWorldObjectVisualScale('lamp')).toBeLessThan(
      resolveWorldObjectVisualScale('building'),
    );
    expect(resolveWorldObjectContactShadow('building', 1.5)).toMatchObject({
      width: 279,
      height: 51,
      alpha: 0.2,
      softnessPx: 15,
    });
    const shadowLayers = resolveWorldContactShadowLayers(
      resolveWorldObjectContactShadow('building'),
    );
    expect(shadowLayers).toHaveLength(3);
    expect(shadowLayers[0]!.width).toBeGreaterThan(shadowLayers[1]!.width);
    expect(shadowLayers[1]!.width).toBeGreaterThan(shadowLayers[2]!.width);
    expect(shadowLayers.reduce((total, layer) => total + layer.alpha, 0)).toBeCloseTo(0.2);
    expect(resolveWorldPlayerContactShadow()).toMatchObject({
      width: 43,
      height: 15,
      alpha: 0.2,
      softnessPx: 10,
    });
    expect(resolveWorldPlayerContactShadow(true)).toMatchObject({
      width: 39,
      height: 13,
      alpha: 0.22,
    });
    // The bundled cottage door is approximately 102 source pixels tall. Keep
    // it at least character-height after canonical structure scaling.
    expect(102 * resolveWorldObjectVisualScale('building')).toBeGreaterThanOrEqual(
      STARVILLE_VISUAL_TOKENS.referencePixels.characterHeight,
    );
    expect(STARVILLE_VISUAL_TOKENS.referencePixels.doorHeight).toBeGreaterThan(
      STARVILLE_VISUAL_TOKENS.referencePixels.characterHeight,
    );
  });

  it('uses quality-aware defaults while respecting explicit overrides', () => {
    expect(resolveWorldVisualSettings()).toMatchObject({
      quality: 'balanced',
      shadows: true,
      ambientEffects: true,
      animatedWater: true,
    });
    expect(resolveWorldVisualSettings({ quality: 'low' })).toMatchObject({
      quality: 'low',
      ambientEffects: false,
      animatedWater: false,
    });
    expect(resolveWorldVisualSettings({ quality: 'low', animatedWater: true }).animatedWater).toBe(
      false,
    );
  });

  it('analyzes maximum-shape overlapping terrain and repeated assets deterministically', () => {
    const source = lanternSquareManifest();
    const decoration = source.objects.find(({ kind }) => kind === 'flowers')!;
    const manifest = {
      ...source,
      width: 128,
      height: 128,
      terrain: Array.from({ length: 512 }, (_, index) => ({
        ...source.terrain[0]!,
        id: `stress-terrain-${String(index)}`,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
      })),
      objects: Array.from({ length: 512 }, (_, index) => ({
        ...decoration,
        id: `stress-object-${String(index)}`,
        x: 4 + (index % 120),
        y: 4 + (Math.floor(index / 120) % 120),
      })),
    };

    const analysis = analyzeWorldVisualReadiness(manifest);
    expect(analysis.errors.find(({ code }) => code === 'terrain-coverage-gap')).toBeUndefined();
    expect(
      analysis.warnings.find(({ code }) => code === 'excessive-asset-repetition')?.objectIds,
    ).toHaveLength(512);
  });

  it('computes bounded responsive framing with presentation-only terrain apron', () => {
    const manifest = lanternSquareManifest();
    const compact = computeWorldCameraFrame({
      manifest,
      viewportWidth: 390,
      viewportHeight: 720,
    });
    const wide = computeWorldCameraFrame({
      manifest,
      viewportWidth: 1_920,
      viewportHeight: 1_080,
    });
    expect(compact.zoom).toBe(STARVILLE_VISUAL_TOKENS.camera.minimumZoom);
    expect(wide.zoom).toBe(STARVILLE_VISUAL_TOKENS.camera.maximumZoom);
    expect(compact.bounds.x).toBeLessThan(manifest.cameraBounds.minX);
    expect(compact.bounds.y).toBeLessThan(manifest.cameraBounds.minY);
    expect(wide.bounds.width).toBeGreaterThan(manifest.cameraBounds.maxX);
    expect(wide.apronTiles).toBeGreaterThanOrEqual(compact.apronTiles);

    const supportedViewports = [
      [360, 800],
      [390, 844],
      [768, 1_024],
      [820, 1_180],
      [1_024, 768],
      [1_280, 800],
      [1_440, 900],
      [1_920, 1_080],
    ] as const;
    for (const [viewportWidth, viewportHeight] of supportedViewports) {
      const frame = computeWorldCameraFrame({ manifest, viewportWidth, viewportHeight });
      expect(frame.bounds.width * frame.zoom).toBeGreaterThanOrEqual(viewportWidth);
      expect(frame.bounds.height * frame.zoom).toBeGreaterThanOrEqual(viewportHeight);
      expect(frame.apronTiles).toBeGreaterThanOrEqual(
        STARVILLE_VISUAL_TOKENS.camera.minimumApronTiles,
      );
      expect(frame.apronTiles).toBeLessThanOrEqual(
        STARVILLE_VISUAL_TOKENS.camera.maximumApronTiles,
      );
    }
  });

  it('returns categorized, actionable visual readiness findings', () => {
    const manifest = lanternSquareManifest();
    const analysis = analyzeWorldVisualReadiness(manifest);
    expect(analysis.ready).toBe(false);
    expect(analysis.errors).toEqual([]);
    expect(analysis.warnings.some(({ code }) => code === 'sparse-composition')).toBe(true);
    expect(analysis.warnings.some(({ code }) => code === 'landmark-hierarchy')).toBe(true);
    expect(analysis.recommendations.some(({ code }) => code === 'temporary-development-art')).toBe(
      true,
    );

    const invalidProjection = {
      ...manifest,
      tileWidth: 96,
      tileHeight: 80,
    };
    const invalid = analyzeWorldVisualReadiness(invalidProjection);
    expect(invalid.ready).toBe(false);
    expect(invalid.errors[0]).toMatchObject({
      code: 'projection-aspect-ratio',
      severity: 'error',
    });
    expect(invalid.errors.some(({ code }) => code === 'projection-tile-geometry')).toBe(true);
  });
});
