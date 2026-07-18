import type { ProgressionWorkspace } from './contracts';

const GAME_TEST_TIME = '2026-01-01T00:00:00.000Z';

export function createProgressionGameTestFixture(): ProgressionWorkspace {
  const skills = [
    [
      'farming',
      'Farming',
      'Prepare soil, tend crops, and harvest produce.',
      'skill-farming',
      'gathering',
      3,
      125,
    ],
    [
      'cooking',
      'Cooking',
      'Collect completed meals at the Cooking Hearth.',
      'skill-cooking',
      'production',
      2,
      55,
    ],
    [
      'crafting',
      'Crafting',
      'Collect useful items at the Crafting Workbench.',
      'skill-crafting',
      'production',
      2,
      48,
    ],
  ] as const;
  return {
    playerLevel: {
      level: 2,
      totalXp: 114,
      xpInLevel: 34,
      xpForNextLevel: 110,
      maximumLevel: 20,
      revision: 1,
    },
    skills: skills.map(
      ([skillKey, displayName, description, iconRef, category, level, totalXp], index) => ({
        skillId: `d1100000-0000-4000-8000-00000000001${index}`,
        skillKey,
        displayName,
        description,
        iconRef,
        category,
        released: true,
        enabled: true,
        level,
        totalXp,
        xpInLevel: level === 3 ? 25 : totalXp - 40,
        xpForNextLevel: level === 3 ? 80 : 60,
        maximumLevel: 20,
        revision: 1,
        recentUnlocks: index === 0 ? ['Sunroot seeds'] : [],
        nextUnlocks: [],
      }),
    ),
    futureSkills: [
      {
        skillKey: 'fishing',
        displayName: 'Fishing',
        description: 'A future peaceful skill.',
        released: false,
        hidden: false,
      },
      {
        skillKey: 'animal_care',
        displayName: 'Animal Care',
        description: 'A future cozy skill.',
        released: false,
        hidden: false,
      },
    ],
    unlocks: [],
    quests: { available: [], active: [], completed: [] },
    achievements: [],
    titles: [],
    badges: [],
    preferencesRevision: 1,
    pendingRewards: [],
    recentXp: [],
    lastEventNumber: 0,
    configurationVersion: { schema: 'phase11d', skillCurve: 1, playerCurve: 1 },
    serverTime: GAME_TEST_TIME,
  };
}
