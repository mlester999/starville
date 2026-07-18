import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProgressionGameTestFixture,
  type ProgressionWorkspace,
} from '@starville/progression';

import { trackedProgressionQuest } from '../app/progression-projection';
import { ProgressionWorkspaceView } from './ProgressionPanel';

let container: HTMLDivElement;
let root: Root;

const progressionQuest: ProgressionWorkspace['quests']['available'][number] = {
  questDefinitionId: 'd1100000-0000-4000-8000-000000000301',
  questVersionId: 'd1100000-0000-4000-8000-000000000311',
  questInstanceId: null,
  configurationRevision: 4,
  questKind: 'progression_chapter',
  questSlug: 'growing-roots',
  name: 'Growing Roots',
  description: 'Grow beyond the starter Moonbean harvest.',
  status: 'available',
  stateVersion: 1,
  tracked: false,
  rewardState: 'not_ready',
  acceptedAt: null,
  completedAt: null,
  chain: { chainKey: 'starville-beginnings', name: 'Starville Beginnings', sequence: 4 },
  prerequisites: {
    questDefinitionId: 'c1100000-0000-4000-8000-000000000210',
    playerLevel: null,
    skillKey: 'farming',
    skillLevel: 2,
    met: true,
  },
  objectives: [
    {
      objectiveId: 'd1100000-0000-4000-8000-000000000321',
      objectiveKey: 'reach_skill_level',
      label: 'Reach Farming Level 2',
      currentCount: 1,
      requiredCount: 2,
      completedAt: null,
      targetKey: 'farming',
    },
  ],
  rewards: [{ rewardType: 'dust', displayLabel: '10 DUST', amount: 10 }],
};

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('Phase 11D progression workspace', () => {
  it('renders Player Level, released skills, and non-mutating Game Test disclosure', async () => {
    await act(async () => {
      root.render(
        <ProgressionWorkspaceView
          preview
          workspace={createProgressionGameTestFixture()}
          onAccept={vi.fn()}
        />,
      );
    });
    expect(container.textContent).toContain('Player Level 2');
    expect(container.textContent).toContain('Farming · Lv 3');
    expect(container.textContent).toContain('temporary preview data · nothing is saved');
    expect(container.querySelector('button')?.textContent).toBe('Overview');
  });

  it('passes the immutable quest UUID and actual configuration revision to acceptance', async () => {
    const onAccept = vi.fn();
    const fixture = createProgressionGameTestFixture();
    const workspace: ProgressionWorkspace = {
      ...fixture,
      quests: { ...fixture.quests, available: [progressionQuest] },
    };
    await act(async () => {
      root.render(<ProgressionWorkspaceView workspace={workspace} onAccept={onAccept} />);
    });
    const journal = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Quest journal',
    );
    await act(async () => journal?.click());
    const accept = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Accept chapter',
    );
    await act(async () => accept?.click());
    expect(onAccept).toHaveBeenCalledWith(progressionQuest.questDefinitionId, 4);
  });

  it('keeps reused legacy chapters in their original gameplay workflow', async () => {
    const legacy = {
      ...progressionQuest,
      questDefinitionId: 'a1100000-0000-4000-8000-000000000031',
      questVersionId: 'a1100000-0000-4000-8000-000000000032',
      questKind: 'farming_tutorial' as const,
      questSlug: 'farming-introduction',
      name: 'Farming Introduction',
      chain: { ...progressionQuest.chain, sequence: 1 },
    };
    const fixture = createProgressionGameTestFixture();
    await act(async () => {
      root.render(
        <ProgressionWorkspaceView
          workspace={{ ...fixture, quests: { ...fixture.quests, available: [legacy] } }}
        />,
      );
    });
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'Quest journal')
        ?.click(),
    );
    expect(container.textContent).toContain('Continue this chapter in the personal plot workflow.');
    expect(container.textContent).not.toContain('Accept chapter');
  });

  it('derives one compact tracked-objective HUD projection', () => {
    const fixture = createProgressionGameTestFixture();
    const active = {
      ...progressionQuest,
      questInstanceId: 'd1100000-0000-4000-8000-000000000399',
      status: 'active' as const,
      tracked: true,
    };
    expect(
      trackedProgressionQuest({
        ...fixture,
        quests: { ...fixture.quests, active: [active] },
      }),
    ).toEqual({
      questName: 'Growing Roots',
      objectiveLabel: 'Reach Farming Level 2',
      currentCount: 1,
      requiredCount: 2,
    });
  });
});
