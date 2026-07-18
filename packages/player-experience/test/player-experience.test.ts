import { describe, expect, it } from 'vitest';
import {
  createPlayerExperienceGameTestFixture,
  createPhase12aLocalFixture,
  gameDayKey,
  nextUtcReset,
  PHASE12A_LOCAL_FIXTURES,
  playerExperienceWorkspaceSchema,
  runPhase12aSimulationMatrix,
  selectDailyObjectives,
} from '../src';

describe('Phase 12A player experience', () => {
  it('selects a deterministic, solo-safe daily set with at most one social objective', () => {
    const input = {
      playerKey: 'player-1',
      gameDay: '2026-07-18',
      playerLevel: 1,
      housingAvailable: true,
      shopAvailable: true,
      productionAvailable: true,
      socialAvailable: true,
    } as const;
    const first = selectDailyObjectives(input);
    expect(selectDailyObjectives(input)).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first.some((objective) => objective.soloSafe)).toBe(true);
    expect(first.filter((objective) => objective.social)).toHaveLength(
      first.some((objective) => objective.social) ? 1 : 0,
    );
    expect(new Set(first.map((objective) => objective.key)).size).toBe(3);
    expect(new Set(first.map((objective) => objective.category)).size).toBe(3);
    expect(first.filter((objective) => objective.category === 'farming')).toHaveLength(1);
  });

  it('uses the canonical UTC game-day boundary', () => {
    const now = new Date('2026-07-18T23:59:59.000Z');
    expect(gameDayKey(now)).toBe('2026-07-18');
    expect(nextUtcReset(now)).toBe('2026-07-19T00:00:00.000Z');
  });

  it('provides a schema-valid and nonpersistent Game Test fixture', () => {
    const fixture = playerExperienceWorkspaceSchema.parse(createPlayerExperienceGameTestFixture());
    expect(fixture.persistence).toBe('game_test');
    expect(fixture.onboarding.steps).toHaveLength(14);
    expect(fixture.daily.objectives).toHaveLength(3);
  });

  it('provides every bounded Phase 12A local fixture without persistent state', () => {
    expect(PHASE12A_LOCAL_FIXTURES).toHaveLength(22);
    for (const [key] of PHASE12A_LOCAL_FIXTURES) {
      const fixture = createPhase12aLocalFixture(key);
      expect(playerExperienceWorkspaceSchema.parse(fixture.workspace).persistence).toBe(
        'game_test',
      );
      expect(fixture.state.persistence).toBe('game_test');
    }
  });

  it('covers every required deterministic simulation without duplicate settlement', () => {
    const matrix = runPhase12aSimulationMatrix();
    expect(matrix).toHaveLength(14);
    expect(matrix.every((result) => result.affordable)).toBe(true);
    expect(matrix.every((result) => result.duplicateSettlements === 0)).toBe(true);
    expect(
      matrix
        .filter((result) => result.persisted)
        .every((result) => result.endingDust === 250 + result.economySource - result.economySink),
    ).toBe(true);
    expect(matrix.find((result) => result.scenario === 'game_test')?.persisted).toBe(false);
  });
});
