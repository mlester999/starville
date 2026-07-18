import { DAILY_OBJECTIVE_CATALOG, type DailyObjectiveDefinition } from './catalog';

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function gameDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function nextUtcReset(now: Date): string {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.toISOString();
}

export function selectDailyObjectives(input: {
  readonly playerKey: string;
  readonly gameDay: string;
  readonly playerLevel: number;
  readonly housingAvailable: boolean;
  readonly shopAvailable: boolean;
  readonly productionAvailable: boolean;
  readonly socialAvailable: boolean;
}): readonly DailyObjectiveDefinition[] {
  const eligible = DAILY_OBJECTIVE_CATALOG.filter((objective) => {
    if (objective.minimumPlayerLevel > input.playerLevel) return false;
    if (objective.category === 'housing' && !input.housingAvailable) return false;
    if (objective.category === 'general_store' && !input.shopAvailable) return false;
    if (objective.category === 'production' && !input.productionAvailable) return false;
    if (objective.category === 'social' && !input.socialAvailable) return false;
    return true;
  }).sort(
    (left, right) =>
      stableHash(`${input.playerKey}:${input.gameDay}:${left.key}`) -
      stableHash(`${input.playerKey}:${input.gameDay}:${right.key}`),
  );
  const selected: DailyObjectiveDefinition[] = [];
  const farming = eligible.find((objective) => objective.category === 'farming');
  if (farming !== undefined) selected.push(farming);
  for (const objective of eligible) {
    if (selected.length >= 3) break;
    if (selected.some((candidate) => candidate.key === objective.key)) continue;
    if (objective.category === 'farming') continue;
    if (objective.social && selected.some((candidate) => candidate.social)) continue;
    selected.push(objective);
  }
  if (selected.length !== 3 || !selected.some((objective) => objective.soloSafe)) {
    throw new Error('No safe three-objective daily set is available.');
  }
  return selected;
}
