import { describe, expect, it } from 'vitest';

import {
  WORLD_VISUAL_REVIEW_CHECKS,
  WORLD_VISUAL_REVIEW_MODES,
  WORLD_VISUAL_REVIEW_VIEWPORTS,
  worldVisualReviewMode,
  worldVisualReviewProgress,
  type WorldVisualReviewCheckId,
} from './visual-readiness-review';

describe('Phase 12C local visual review model', () => {
  it('covers every required review dimension', () => {
    expect(WORLD_VISUAL_REVIEW_CHECKS.map(({ id }) => id)).toEqual([
      'camera_coverage',
      'terrain_readability',
      'object_scale',
      'depth_occlusion',
      'shadow_language',
      'world_boundaries',
      'route_readability',
      'landmark_hierarchy',
      'repetition_rhythm',
      'mobile_touch',
      'hud_clearance',
      'manual_screenshots',
    ]);
  });

  it('exposes the exact eight-size viewport matrix', () => {
    expect(WORLD_VISUAL_REVIEW_VIEWPORTS.map(({ width, height }) => [width, height])).toEqual([
      [360, 800],
      [390, 844],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]);
  });

  it('keeps deterministic modes bounded to declared checks and viewports', () => {
    const checkIds = new Set(WORLD_VISUAL_REVIEW_CHECKS.map(({ id }) => id));
    const viewportIds = new Set(WORLD_VISUAL_REVIEW_VIEWPORTS.map(({ id }) => id));
    expect(new Set(WORLD_VISUAL_REVIEW_MODES.map(({ id }) => id)).size).toBe(
      WORLD_VISUAL_REVIEW_MODES.length,
    );
    for (const mode of WORLD_VISUAL_REVIEW_MODES) {
      expect(mode.steps).toHaveLength(3);
      expect(viewportIds.has(mode.viewportId)).toBe(true);
      expect(mode.checkIds.every((id) => checkIds.has(id))).toBe(true);
      expect(worldVisualReviewMode(mode.id)).toBe(mode);
    }
  });

  it('derives progress only from caller-owned local state', () => {
    const completed = new Set<WorldVisualReviewCheckId>(['camera_coverage', 'hud_clearance']);
    expect(worldVisualReviewProgress(completed)).toEqual({ complete: 2, total: 12, percent: 17 });
    expect(completed).toEqual(new Set(['camera_coverage', 'hud_clearance']));
  });
});
