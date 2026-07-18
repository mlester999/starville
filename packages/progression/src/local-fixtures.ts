export const PROGRESSION_LOCAL_FIXTURE_SCENARIOS = [
  'new_player',
  'phase11a_complete',
  'phase11b_complete',
  'phase11c_complete',
  'farming_level_1',
  'farming_level_2',
  'cooking_level_2',
  'crafting_level_2',
  'player_level_3',
  'near_level_up',
  'maximum_level',
  'active_quest_chain',
  'completed_quest_chain',
  'achievement_in_progress',
  'achievement_complete',
  'owned_title',
  'pending_reward',
  'duplicate_xp_source',
  'invalid_unlock',
  'game_test_progression',
  'correction_scenario',
  'reconciliation_mismatch',
] as const;

export type ProgressionLocalFixtureScenario = (typeof PROGRESSION_LOCAL_FIXTURE_SCENARIOS)[number];

export interface ProgressionLocalFixtureDescriptor {
  readonly scenario: ProgressionLocalFixtureScenario;
  readonly persistence: 'rollback_only' | 'in_memory_only';
  readonly authority: 'trusted_database_fixture' | 'game_test_fixture';
  readonly expectedEvidence: string;
}

export function createProgressionLocalFixtureCatalog(): readonly ProgressionLocalFixtureDescriptor[] {
  return PROGRESSION_LOCAL_FIXTURE_SCENARIOS.map((scenario) => ({
    scenario,
    persistence: scenario === 'game_test_progression' ? 'in_memory_only' : 'rollback_only',
    authority:
      scenario === 'game_test_progression' ? 'game_test_fixture' : 'trusted_database_fixture',
    expectedEvidence:
      scenario === 'game_test_progression'
        ? 'No mutation client or persistent record is available.'
        : 'The Phase 11D PostgreSQL execution fixture runs inside a rolled-back transaction.',
  }));
}
