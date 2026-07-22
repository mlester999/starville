import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Phase12EBetaGameTest } from './Phase12EBetaGameTest';
import {
  PHASE12E_BETA_SCENARIO_STEPS,
  phase12EBetaScenarioAreaCoverage,
} from './phase12e-beta-game-test';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.getElementById('starville-modal-root')?.remove();
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('Phase 12E integrated beta Game Test', () => {
  it('covers the owner-approved systems without a persistence or production claim', () => {
    expect(PHASE12E_BETA_SCENARIO_STEPS).toHaveLength(23);
    expect(phase12EBetaScenarioAreaCoverage()).toEqual(
      new Set([
        'world',
        'character',
        'guidance',
        'home',
        'farming',
        'workstation',
        'shop',
        'progression',
        'housing',
        'home_visit',
        'modal',
        'audio',
        'recovery',
        'asset_fallback',
        'accessibility',
        'responsive',
      ]),
    );
    expect(PHASE12E_BETA_SCENARIO_STEPS.find(({ id }) => id === 'missing-asset')).toMatchObject({
      surface: 'asset_coverage',
      review: { v2Candidate: true },
    });
    expect(JSON.stringify(PHASE12E_BETA_SCENARIO_STEPS)).not.toMatch(
      /fetch|localStorage|sessionStorage|complete owner acceptance/iu,
    );
  });

  it('portals the checklist, applies an explicit fixture, and keeps inspection state local', async () => {
    const onApplyStep = vi.fn();
    await act(async () => {
      root.render(<Phase12EBetaGameTest onApplyStep={onApplyStep} onClose={vi.fn()} />);
    });
    const modalRoot = document.getElementById('starville-modal-root');
    expect(modalRoot?.textContent).toContain('Integrated Beta Scenario');
    expect(modalRoot?.textContent).toContain(
      'No player, inventory, DUST, progression, housing, social, world, or telemetry data is written.',
    );

    const apply = [...(modalRoot?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent?.includes('Apply fixture state'),
    );
    await act(async () => apply?.click());
    expect(onApplyStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'spawn-lantern-square' }),
    );

    const mark = [...(modalRoot?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent?.includes('Mark inspected and continue'),
    );
    await act(async () => mark?.click());
    expect(modalRoot?.textContent).toContain('1 of 23 fixture steps inspected');
    expect(modalRoot?.textContent).toContain('Move the V2 character');
  });
});
