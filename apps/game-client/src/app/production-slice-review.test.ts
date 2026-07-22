import { defaultMapSpawn } from '@starville/game-core';
import { PRODUCTION_SLICE_V3_MANIFEST } from '@starville/game-content';
import { describe, expect, it } from 'vitest';

import {
  parseProductionSliceReviewVersion,
  PRODUCTION_SLICE_REVIEW_CORE_OFFSET,
  productionSliceReviewCheckpoint,
  productionSliceReviewConfig,
  productionSliceReviewInitialState,
  productionSliceReviewRequested,
  productionSliceRuntimeWorld,
} from './production-slice-review';

describe('production-slice local review gate', () => {
  it('requires development, loopback, and the exact explicit candidate query', () => {
    const input = {
      development: true,
      hostname: 'localhost',
      search: '?visual-candidate=production-slice-v3',
    };
    expect(productionSliceReviewRequested(input)).toBe(true);
    expect(productionSliceReviewRequested({ ...input, development: false })).toBe(false);
    expect(productionSliceReviewRequested({ ...input, hostname: 'starville.example' })).toBe(false);
    expect(productionSliceReviewRequested({ ...input, search: '?visual-candidate=v3' })).toBe(
      false,
    );
  });

  it('defaults to v3 and keeps v1, rejected v2, and v3 distinct', () => {
    expect(parseProductionSliceReviewVersion('')).toBe('v3');
    expect(parseProductionSliceReviewVersion('?visual-version=v1')).toBe('v1');
    expect(productionSliceReviewConfig('v1').rendererMode).toBe('published_v1');
    expect(productionSliceReviewConfig('v2').rendererMode).toBe('phase12d_candidate');
    expect(productionSliceReviewConfig('v3').rendererMode).toBe('production_slice_v3');
    expect(productionSliceReviewConfig('v2').label).toContain('REJECTED');
  });

  it('builds read-only exact repository deliveries without changing map identity', () => {
    const v1 = productionSliceRuntimeWorld('v1');
    const v3 = productionSliceRuntimeWorld('v3');
    expect(v1.manifest).toBe(v3.manifest);
    expect(v3.manifest.id).toBe('lantern-square');
    expect(v3.assetResolutionContext).toBe('game_test');
    expect(v3.assetDeliveries.every(({ developmentMarker }) => developmentMarker)).toBe(true);
    expect(
      new Set(v3.assetDeliveries.map(({ bundledManifestVersion }) => bundledManifestVersion)),
    ).toEqual(new Set(['3.1.0']));
  });

  it('offers deterministic local depth and entrance screenshot checkpoints', () => {
    expect(productionSliceReviewInitialState('?review-position=behind-pine')).toMatchObject({
      mapId: 'lantern-square',
      x: 5.8,
      y: 5.9,
    });
    expect(productionSliceReviewInitialState('?review-position=front-pine')).toMatchObject({
      x: 7.5,
      y: 8.9,
    });
    expect(productionSliceReviewInitialState('?review-position=cottage-entry')).toMatchObject({
      x: 22.8,
      y: 12.7,
    });
    expect(productionSliceReviewInitialState('?review-position=far-east')).toMatchObject({
      x: 43,
      y: 20,
    });
    expect(productionSliceReviewInitialState('?review-position=overview')).toMatchObject({
      x: 23.33,
      y: 18,
    });
    expect(productionSliceReviewInitialState('?review-position=unknown')).toMatchObject(
      defaultMapSpawn(PRODUCTION_SLICE_V3_MANIFEST),
    );
  });

  it('keeps rescue checkpoints aligned directly with the curated cottage interaction', () => {
    expect(PRODUCTION_SLICE_REVIEW_CORE_OFFSET).toEqual({ x: 0, y: 0 });
    const checkpoint = productionSliceReviewCheckpoint('cottage-entry');
    const entrance = PRODUCTION_SLICE_V3_MANIFEST.interactions.find(
      (interaction) => interaction.id === 'slice-cottage-entrance',
    );
    expect(entrance).toBeDefined();
    if (entrance === undefined) return;
    expect(Math.hypot(checkpoint.x - entrance.x, checkpoint.y - entrance.y)).toBeLessThanOrEqual(
      entrance.range,
    );
  });

  it('builds a separate local interior world and direct interior checkpoint', () => {
    const interior = productionSliceRuntimeWorld('v3', 'interior');
    expect(interior.manifest.name).toBe('Amber Cottage Interior');
    expect(interior.manifest.version).toBe(1215);
    expect(interior.assetDeliveries.some(({ assetKey }) => assetKey === 'v3.interior.bed')).toBe(
      true,
    );
    expect(productionSliceReviewInitialState('?review-location=interior')).toMatchObject({
      mapId: 'lantern-square',
      x: 8,
      y: 10,
      facingDirection: 'north',
    });
  });
});
