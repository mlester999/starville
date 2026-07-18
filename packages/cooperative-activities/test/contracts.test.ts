import { describe, expect, it } from 'vitest';

import {
  cooperativeActivityEditorInputSchema,
  cooperativeActivityVersionSchema,
  cooperativeObjectiveDefinitionSchema,
  MOONPETAL_HARVEST_HELP,
} from '../src';

describe('cooperative activity definitions', () => {
  it('publishes one strict Moonpetal Harvest Help sequence without blockchain rewards', () => {
    expect(MOONPETAL_HARVEST_HELP.minimumPartySize).toBe(2);
    expect(MOONPETAL_HARVEST_HELP.maximumPartySize).toBe(4);
    expect(MOONPETAL_HARVEST_HELP.objectives.map((objective) => objective.key)).toEqual([
      'gather-seed-bundles',
      'plant-shared-plots',
      'water-shared-crops',
      'let-crops-grow',
      'harvest-together',
      'deliver-community-harvest',
      'community-harvest-complete',
    ]);
    expect(JSON.stringify(MOONPETAL_HARVEST_HELP.reward)).not.toMatch(/star|sol|token|nft/iu);
  });

  it('rejects unknown objective types and executable fields', () => {
    const objective = { ...MOONPETAL_HARVEST_HELP.objectives[0], type: 'run_script' };
    expect(cooperativeObjectiveDefinitionSchema.safeParse(objective).success).toBe(false);
    expect(
      cooperativeObjectiveDefinitionSchema.safeParse({
        ...MOONPETAL_HARVEST_HELP.objectives[0],
        script: 'return true',
      }).success,
    ).toBe(false);
  });

  it('rejects malformed sequences, party bounds, and oversized rewards', () => {
    expect(
      cooperativeActivityVersionSchema.safeParse({
        ...MOONPETAL_HARVEST_HELP,
        minimumPartySize: 4,
        maximumPartySize: 2,
      }).success,
    ).toBe(false);
    expect(
      cooperativeActivityVersionSchema.safeParse({
        ...MOONPETAL_HARVEST_HELP,
        objectives: MOONPETAL_HARVEST_HELP.objectives.map((objective, index) =>
          index === 0 ? { ...objective, nextObjectiveKey: null } : objective,
        ),
      }).success,
    ).toBe(false);
    expect(
      cooperativeActivityVersionSchema.safeParse({
        ...MOONPETAL_HARVEST_HELP,
        reward: { ...MOONPETAL_HARVEST_HELP.reward, dust: 1_001 },
      }).success,
    ).toBe(false);
  });

  it('keeps editor input structured and rejects publication metadata', () => {
    const input = {
      ...MOONPETAL_HARVEST_HELP,
      versionId: undefined,
      status: undefined,
      revision: undefined,
      publishedAt: undefined,
    };
    expect(cooperativeActivityEditorInputSchema.safeParse(input).success).toBe(false);
    const valid: Record<string, unknown> = structuredClone(MOONPETAL_HARVEST_HELP);
    delete valid['versionId'];
    delete valid['status'];
    delete valid['revision'];
    delete valid['publishedAt'];
    expect(cooperativeActivityEditorInputSchema.parse(valid).objectives).toHaveLength(7);
  });
});
