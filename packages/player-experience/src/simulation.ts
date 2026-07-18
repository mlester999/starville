import { z } from 'zod';

export const earlyGameScenarioSchema = z.enum([
  'minimum_legal_path',
  'normal_new_player',
  'skip_optional_guidance',
  'disconnect_mid_onboarding',
  'owns_starter_equivalents',
  'inventory_full',
  'spends_dust_early',
  'crop_delayed',
  'recipe_delayed',
  'shop_unavailable',
  'social_unavailable',
  'daily_reset',
  'repeated_requests',
  'game_test',
]);
export type EarlyGameScenario = z.infer<typeof earlyGameScenarioSchema>;

export interface EarlyGameSimulationResult {
  readonly scenario: EarlyGameScenario;
  readonly completionMinutes: number;
  readonly endingDust: number;
  readonly endingInventory: Readonly<Record<string, number>>;
  readonly endingPlayerXp: number;
  readonly blockers: number;
  readonly recoveries: number;
  readonly duplicateSettlements: number;
  readonly affordable: boolean;
  readonly economySource: number;
  readonly economySink: number;
  readonly persisted: boolean;
  readonly assumptions: readonly string[];
}

export function runEarlyGameSimulation(scenario: EarlyGameScenario): EarlyGameSimulationResult {
  const modifiers: Partial<Record<EarlyGameScenario, Partial<EarlyGameSimulationResult>>> = {
    minimum_legal_path: { completionMinutes: 14, endingPlayerXp: 66, economySource: 39 },
    normal_new_player: { completionMinutes: 18, endingPlayerXp: 86, economySource: 54 },
    skip_optional_guidance: { completionMinutes: 15 },
    disconnect_mid_onboarding: { completionMinutes: 20, recoveries: 1 },
    owns_starter_equivalents: { completionMinutes: 16 },
    inventory_full: { completionMinutes: 22, blockers: 1, recoveries: 1 },
    spends_dust_early: { economySink: 23 },
    crop_delayed: { completionMinutes: 28, blockers: 1 },
    recipe_delayed: { completionMinutes: 22, blockers: 1 },
    shop_unavailable: { completionMinutes: 25, blockers: 1, recoveries: 1 },
    social_unavailable: { completionMinutes: 18 },
    daily_reset: { completionMinutes: 19, recoveries: 1 },
    repeated_requests: { duplicateSettlements: 0 },
    game_test: {
      completionMinutes: 12,
      endingPlayerXp: 0,
      economySource: 0,
      economySink: 0,
      persisted: false,
    },
  };
  const base: EarlyGameSimulationResult = {
    scenario,
    completionMinutes: 18,
    endingDust: 290,
    endingInventory: {
      'starter-hoe': 1,
      'watering-can': 1,
      moonbean: 1,
      'garden-soup': 1,
      'willow-chair': 0,
    },
    endingPlayerXp: 76,
    blockers: 0,
    recoveries: 0,
    duplicateSettlements: 0,
    affordable: true,
    economySource: 47,
    economySink: 7,
    persisted: true,
    assumptions: [
      '250 starter DUST and current Candidate D planning assumptions remain unchanged.',
      'Moonbean uses the canonical five-minute production duration; Garden Soup uses 30 seconds.',
      'Daily Rhythm v1 grants non-economic completion progress, so repeatable DUST emission is zero.',
      'Times are deterministic local planning estimates, not hosted player measurements.',
    ],
  };
  const result = { ...base, ...modifiers[scenario], scenario };
  return {
    ...result,
    endingDust: result.persisted ? 250 + result.economySource - result.economySink : 250,
  };
}

export function runPhase12aSimulationMatrix(): readonly EarlyGameSimulationResult[] {
  return earlyGameScenarioSchema.options.map((scenario) => runEarlyGameSimulation(scenario));
}
