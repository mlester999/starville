import type { PlayerExperienceWorkspace } from './contracts';
import { GUIDE_ENTRIES, GUIDANCE_TARGETS, ONBOARDING_STEPS } from './catalog';
import { selectDailyObjectives } from './selection';

const NOW = '2026-01-01T10:00:00.000Z';

export const PHASE12A_LOCAL_FIXTURES = Object.freeze([
  [
    'brand-new-player',
    'Brand-new player',
    'Welcome, starter state, and no settled onboarding evidence.',
  ],
  [
    'migrated-existing-player',
    'Migrated existing player',
    'Existing progress is projected without replaying starter grants.',
  ],
  [
    'partial-onboarding',
    'Partial onboarding',
    'Five verified steps are complete and first planting is active.',
  ],
  [
    'completed-onboarding',
    'Completed onboarding',
    'All required guidance is settled without a parallel quest reward.',
  ],
  [
    'skipped-optional-guide',
    'Skipped optional guide',
    'The social education step is skipped without skipping core gameplay.',
  ],
  [
    'missing-starter-inventory',
    'Missing starter inventory',
    'One eligible Moonbean seed can enter bounded recovery.',
  ],
  [
    'full-inventory',
    'Full inventory',
    'Collection waits until authoritative inventory capacity is available.',
  ],
  ['first-crop-planted', 'First crop planted', 'The crop needs one watering action.'],
  ['first-crop-ready', 'First crop ready', 'Server time has made the crop eligible to harvest.'],
  [
    'starter-recipe-ready',
    'Starter recipe ready',
    'Garden Soup is unlocked and a job can be collected.',
  ],
  [
    'general-store-available',
    'General Store available',
    'The canonical shop and live-ops policy are open.',
  ],
  [
    'general-store-unavailable',
    'General Store unavailable',
    'Shop guidance remains recoverable while purchases are paused.',
  ],
  [
    'insufficient-dust',
    'Insufficient DUST',
    'A rejected purchase changes no balance or inventory.',
  ],
  [
    'housing-ready',
    'Housing ready',
    'Willow Chair placement and a valid layout save are available.',
  ],
  [
    'home-visits-enabled',
    'Home visits enabled',
    'Visibility and bounded visitor modes can be reviewed.',
  ],
  [
    'home-visits-disabled',
    'Home visits disabled',
    'Solo-safe settings education remains available.',
  ],
  [
    'three-daily-objectives',
    'Three daily objectives',
    'One farming and two distinct eligible categories are assigned.',
  ],
  [
    'all-daily-objectives-complete',
    'All daily objectives complete',
    'The non-economic daily completion mark is settled.',
  ],
  [
    'reset-boundary',
    'UTC reset boundary',
    'A same-day reread rolls lazily at the canonical UTC boundary.',
  ],
  [
    'reward-settlement-retry',
    'Reward settlement retry',
    'Pending canonical settlement replays without duplication.',
  ],
  [
    'missing-guidance-target',
    'Missing guidance target',
    'A semantic target uses its accessible fallback and recovery path.',
  ],
  [
    'game-test-new-player',
    'Game Test new player',
    'All state is temporary and no persistent mutation route exists.',
  ],
] as const);

export type Phase12aLocalFixtureKey = (typeof PHASE12A_LOCAL_FIXTURES)[number][0];

export interface Phase12aLocalFixture {
  readonly key: Phase12aLocalFixtureKey;
  readonly label: string;
  readonly description: string;
  readonly state: Readonly<{
    inventory: 'starter' | 'missing_starter' | 'full';
    dust: number;
    crop: 'empty' | 'planted' | 'ready';
    recipe: 'locked' | 'ready';
    shop: 'available' | 'unavailable';
    housing: 'ready' | 'unavailable';
    homeVisits: 'enabled' | 'disabled';
    rewardSettlement: 'not_ready' | 'pending' | 'settled';
    persistence: 'game_test';
  }>;
  readonly workspace: PlayerExperienceWorkspace;
}

function baseWorkspace(): PlayerExperienceWorkspace {
  const daily = selectDailyObjectives({
    playerKey: 'game-test-player',
    gameDay: '2026-01-01',
    playerLevel: 1,
    housingAvailable: true,
    shopAvailable: true,
    productionAvailable: true,
    socialAvailable: true,
  });
  return {
    onboarding: {
      version: 'starville_core_onboarding_v1',
      status: 'active',
      currentChapter: 'first_harvest',
      currentStep: 'plant_first_crop',
      revision: 3,
      startedAt: NOW,
      lastProgressedAt: NOW,
      completedAt: null,
      skippedAt: null,
      migratedExistingPlayer: false,
      rewardSettlementState: 'not_ready',
      steps: ONBOARDING_STEPS.map((step, index) => ({
        key: step.key,
        chapter: step.chapter,
        title: step.title,
        instruction: step.instruction,
        progress: index < 5 ? 1 : 0,
        required: 1,
        status: index < 5 ? 'completed' : index === 5 ? 'active' : 'locked',
        optional: step.optional,
        completedAt: index < 5 ? NOW : null,
        evidenceEventKey: index < 5 ? step.eventKey : null,
        guidanceTarget: step.target,
        recoveryHint: step.recoveryHint,
      })),
    },
    activeObjective: {
      source: 'onboarding',
      key: 'plant_first_crop',
      title: 'Plant a Moonbean',
      instruction: 'Prepare a garden tile, select a Moonbean Seed, and plant it.',
      progress: 0,
      required: 1,
      guidanceTarget: 'interactable.farm_plot',
      routeHint: 'Enter your home and approach one of the eight garden tiles.',
    },
    daily: {
      policyVersion: 'starville_daily_rhythm_v1',
      gameDayKey: '2026-01-01',
      timezone: 'UTC',
      resetAt: '2026-01-02T00:00:00.000Z',
      assignmentRevision: 1,
      objectives: daily.map((objective, index) => ({
        assignmentId: `12a00000-0000-4000-8000-00000000000${String(index + 1)}`,
        objectiveKey: objective.key,
        category: objective.category,
        title: objective.title,
        description: objective.description,
        progress: 0,
        required: objective.required,
        status: 'active',
        soloSafe: objective.soloSafe,
        rewardLabel: 'Daily Rhythm progress (non-economic)',
        completedAt: null,
        settledAt: null,
        guidanceTarget: objective.target,
      })) as PlayerExperienceWorkspace['daily']['objectives'],
      completedCount: 0,
      completionBonus: {
        status: 'locked',
        rewardLabel: 'Daily Rhythm completion mark (non-economic)',
        settledAt: null,
      },
    },
    guidanceTargets: GUIDANCE_TARGETS.map(([key, label, semanticObjectKey, worldKey, hint]) => ({
      key,
      label,
      semanticObjectKey,
      worldKey,
      status: 'ready',
      severity: 'blocking',
      distance: null,
      routeHint: hint,
      accessibleHint: hint,
    })),
    guide: GUIDE_ENTRIES.map(([key, title, summary, path]) => ({
      key,
      title,
      summary,
      unlocked: true,
      publicDocumentationPath: path,
    })),
    feedback: [],
    feedbackCursor: 0,
    guidePreferences: { minimized: false, reducedGuidance: false, revision: 1 },
    starterQuestline: {
      chainKey: 'starville-beginnings',
      version: 1,
      canonicalQuestCount: 6,
      completedQuestCount: 0,
    },
    persistence: 'game_test',
    serverTime: NOW,
  };
}

function workspaceForFixture(
  key: Phase12aLocalFixtureKey,
  base: PlayerExperienceWorkspace,
): PlayerExperienceWorkspace {
  if (key === 'brand-new-player' || key === 'game-test-new-player') {
    const first = base.onboarding.steps[0];
    if (first === undefined) return base;
    return {
      ...base,
      onboarding: {
        ...base.onboarding,
        status: 'not_started',
        currentChapter: first.chapter,
        currentStep: first.key,
        revision: 1,
        startedAt: null,
        steps: base.onboarding.steps.map((step, index) => ({
          ...step,
          progress: 0,
          status: index === 0 ? 'active' : 'locked',
          completedAt: null,
          evidenceEventKey: null,
        })),
      },
      activeObjective: {
        source: 'onboarding',
        key: first.key,
        title: first.title,
        instruction: first.instruction,
        progress: 0,
        required: 1,
        guidanceTarget: first.guidanceTarget,
        routeHint: base.guidanceTargets[0]?.routeHint ?? 'Arrive in Lantern Square.',
      },
    };
  }
  if (key === 'migrated-existing-player') {
    return {
      ...base,
      onboarding: {
        ...base.onboarding,
        status: 'migrated',
        migratedExistingPlayer: true,
        rewardSettlementState: 'settled',
      },
    };
  }
  if (key === 'completed-onboarding') {
    return {
      ...base,
      onboarding: {
        ...base.onboarding,
        status: 'completed',
        currentChapter: 'daily_rhythm',
        currentStep: 'complete_daily_objective',
        revision: 20,
        completedAt: NOW,
        rewardSettlementState: 'settled',
        steps: base.onboarding.steps.map((step) => ({
          ...step,
          progress: 1,
          status: 'completed',
          completedAt: NOW,
          evidenceEventKey: step.evidenceEventKey ?? 'trusted_fixture_evidence',
        })),
      },
      activeObjective: null,
    };
  }
  if (key === 'skipped-optional-guide') {
    return {
      ...base,
      onboarding: {
        ...base.onboarding,
        skippedAt: NOW,
        steps: base.onboarding.steps.map((step) =>
          step.key === 'review_home_visits' ? { ...step, status: 'skipped' } : step,
        ),
      },
    };
  }
  if (key === 'all-daily-objectives-complete') {
    return {
      ...base,
      daily: {
        ...base.daily,
        assignmentRevision: 7,
        completedCount: 3,
        objectives: base.daily.objectives.map((objective) => ({
          ...objective,
          progress: objective.required,
          status: 'settled',
          completedAt: NOW,
          settledAt: NOW,
        })),
        completionBonus: {
          status: 'settled',
          rewardLabel: 'Daily Rhythm completion mark (non-economic)',
          settledAt: NOW,
        },
      },
    };
  }
  if (key === 'reset-boundary') {
    return {
      ...base,
      daily: { ...base.daily, resetAt: '2026-01-01T10:00:01.000Z' },
      serverTime: '2026-01-01T10:00:00.500Z',
    };
  }
  if (key === 'general-store-unavailable' || key === 'missing-guidance-target') {
    const targetKey =
      key === 'general-store-unavailable' ? 'interactable.general_store' : 'interactable.farm_plot';
    return {
      ...base,
      guidanceTargets: base.guidanceTargets.map((target) =>
        target.key === targetKey
          ? {
              ...target,
              status: key === 'missing-guidance-target' ? 'missing' : 'unavailable',
              routeHint:
                'Use the accessible objective list and retry after authoritative state refresh.',
              accessibleHint: 'Target unavailable; core progress and rewards remain unchanged.',
            }
          : target,
      ),
    };
  }
  return base;
}

export function createPhase12aLocalFixture(key: Phase12aLocalFixtureKey): Phase12aLocalFixture {
  const definition = PHASE12A_LOCAL_FIXTURES.find(([candidate]) => candidate === key);
  if (definition === undefined) throw new Error('Unknown Phase 12A local fixture.');
  const state = {
    inventory:
      key === 'missing-starter-inventory'
        ? ('missing_starter' as const)
        : key === 'full-inventory'
          ? ('full' as const)
          : ('starter' as const),
    dust: key === 'insufficient-dust' ? 0 : 250,
    crop:
      key === 'first-crop-ready'
        ? ('ready' as const)
        : key === 'first-crop-planted'
          ? ('planted' as const)
          : ('empty' as const),
    recipe: key === 'starter-recipe-ready' ? ('ready' as const) : ('locked' as const),
    shop: key === 'general-store-unavailable' ? ('unavailable' as const) : ('available' as const),
    housing: key === 'housing-ready' ? ('ready' as const) : ('unavailable' as const),
    homeVisits: key === 'home-visits-disabled' ? ('disabled' as const) : ('enabled' as const),
    rewardSettlement:
      key === 'reward-settlement-retry'
        ? ('pending' as const)
        : key === 'completed-onboarding' || key === 'all-daily-objectives-complete'
          ? ('settled' as const)
          : ('not_ready' as const),
    persistence: 'game_test' as const,
  };
  return {
    key,
    label: definition[1],
    description: definition[2],
    state,
    workspace: workspaceForFixture(key, baseWorkspace()),
  };
}

export function createPlayerExperienceGameTestFixture(): PlayerExperienceWorkspace {
  return createPhase12aLocalFixture('partial-onboarding').workspace;
}
