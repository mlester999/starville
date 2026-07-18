import { ASSET_TYPES } from '@starville/asset-management';
import { describe, expect, it } from 'vitest';

import {
  allAssetRequirementGuides,
  assetRequirementGuide,
  generalProductionChecklist,
  guideGroups,
} from './requirements';
import { isValidTemplateSpec } from './template-canvas';

describe('typed asset requirement guides', () => {
  it('covers every supported asset type with recommended (not false-exact) dimensions', () => {
    const guides = allAssetRequirementGuides();
    expect(guides).toHaveLength(ASSET_TYPES.length);
    for (const guide of guides) {
      expect(guide.recommendedWidth).toBeGreaterThan(0);
      expect(guide.recommendedHeight).toBeGreaterThan(0);
      expect(guide.dimensionsExact).toBe(false);
      expect(guide.formats).toEqual(['PNG', 'WebP']);
      expect(guide.checklist.length).toBeGreaterThan(2);
      expect(guide.templateFileName.endsWith('.png')).toBe(true);
      expect(
        isValidTemplateSpec({
          width: guide.recommendedWidth,
          height: guide.recommendedHeight,
          label: guide.label,
          fileName: guide.templateFileName,
        }),
      ).toBe(true);
    }
  });

  it('labels building requirements for owner-friendly upload preparation', () => {
    const building = assetRequirementGuide('building');
    expect(building.label).toBe('Building');
    expect(building.transparency).toBe('required');
    expect(building.checklist.some((item) => item.id === 'isometric')).toBe(true);
    expect(building.rejectList.some((item) => /screenshot/i.test(item))).toBe(true);
  });

  it('groups types for the Asset Guide page without inventing unknown keys', () => {
    const grouped = new Set(guideGroups().flatMap((group) => group.types));
    for (const type of ASSET_TYPES) {
      expect(grouped.has(type)).toBe(true);
    }
    expect(generalProductionChecklist().length).toBeGreaterThan(4);
  });
});
