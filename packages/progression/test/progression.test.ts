import { describe, expect, it } from 'vitest';
import {
  STARTER_PLAYER_THRESHOLDS,
  STARTER_SKILL_THRESHOLDS,
  createProgressionGameTestFixture,
  createProgressionLocalFixtureCatalog,
  progressionWorkspaceSchema,
} from '../src/index';

describe('progression contracts', () => {
  it('keeps both starter curves explicit, bounded, and strictly increasing', () => {
    for (const thresholds of [STARTER_SKILL_THRESHOLDS, STARTER_PLAYER_THRESHOLDS]) {
      expect(thresholds).toHaveLength(20);
      expect(thresholds[0]).toBe(0);
      expect(
        thresholds.every((value, index) => index === 0 || value > thresholds[index - 1]!),
      ).toBe(true);
    }
  });

  it('provides isolated non-persistent Game Test progression data', () => {
    const fixture = progressionWorkspaceSchema.parse(createProgressionGameTestFixture());
    expect(fixture.skills.map((skill) => skill.skillKey)).toEqual([
      'farming',
      'cooking',
      'crafting',
    ]);
    expect(fixture.configurationVersion.schema).toBe('phase11d');
  });

  it('catalogs every bounded local acceptance scenario without production seeding', () => {
    const fixtures = createProgressionLocalFixtureCatalog();
    expect(fixtures).toHaveLength(22);
    expect(fixtures.find((fixture) => fixture.scenario === 'game_test_progression')).toMatchObject({
      persistence: 'in_memory_only',
      authority: 'game_test_fixture',
    });
    expect(fixtures.filter((fixture) => fixture.persistence === 'rollback_only')).toHaveLength(21);
  });
});
