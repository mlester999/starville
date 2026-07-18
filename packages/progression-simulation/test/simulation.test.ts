import { describe, expect, it } from 'vitest';
import { STARTER_SKILL_THRESHOLDS } from '@starville/progression';
import { runProgressionSimulation } from '../src/index';

describe('progression simulation', () => {
  it('projects a deterministic starter curve without migrating players', () => {
    const result = runProgressionSimulation({
      thresholds: [...STARTER_SKILL_THRESHOLDS],
      eventsPerDay: 12,
      xpPerEvent: 8,
      multiplier: 1,
      playerCount: 1_000,
    });
    expect(result.valid).toBe(true);
    expect(result.levels).toHaveLength(20);
    expect(result.autoMigratesPlayers).toBe(false);
  });

  it('blocks duplicate and descending thresholds', () => {
    const result = runProgressionSimulation({
      thresholds: [0, 40, 40, 20],
      eventsPerDay: 10,
      xpPerEvent: 5,
      multiplier: 1,
      playerCount: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.blockingErrors).toContain('thresholds_must_be_strictly_increasing');
  });
});
