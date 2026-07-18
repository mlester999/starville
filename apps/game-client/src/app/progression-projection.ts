import type { ProgressionWorkspace } from '@starville/progression';

export interface TrackedProgressionQuest {
  readonly questName: string;
  readonly objectiveLabel: string;
  readonly currentCount: number;
  readonly requiredCount: number;
}

export function trackedProgressionQuest(
  workspace: ProgressionWorkspace,
): TrackedProgressionQuest | null {
  const quest = workspace.quests.active.find((candidate) => candidate.tracked);
  if (quest === undefined) return null;
  const objective =
    quest.objectives.find((candidate) => candidate.currentCount < candidate.requiredCount) ??
    quest.objectives[0];
  if (objective === undefined) return null;
  return {
    questName: quest.name,
    objectiveLabel: objective.label,
    currentCount: objective.currentCount,
    requiredCount: objective.requiredCount,
  };
}
