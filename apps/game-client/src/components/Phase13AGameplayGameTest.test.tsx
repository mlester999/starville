import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Phase13AGameplayGameTest } from './Phase13AGameplayGameTest';
import { PHASE13A_GAMEPLAY_GAME_TEST_STEPS } from './phase13a-gameplay-game-test';

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
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('Phase 13A Game Test integration scenario', () => {
  it('covers every required system with local-only fixture evidence', async () => {
    await act(async () => root.render(<Phase13AGameplayGameTest onClose={vi.fn()} />));
    expect(PHASE13A_GAMEPLAY_GAME_TEST_STEPS).toHaveLength(27);
    for (const title of [
      'New-player entry',
      'Farming',
      'Cooking',
      'General Store',
      'Home visits',
      'Gifting',
      'Trading',
      'Reconnect',
      'Duplicate-request simulation',
      'Inventory-full simulation',
      'Stale-revision simulation',
      'Connection-failure simulation',
    ]) {
      expect(document.body.textContent).toContain(title);
    }
    expect(document.body.textContent).toContain('No hosted player, inventory, DUST');
    expect(document.body.textContent).toContain('game_test');
  });

  it('advances only an in-memory inspection marker', async () => {
    await act(async () => root.render(<Phase13AGameplayGameTest onClose={vi.fn()} />));
    const mark = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Mark inspected and continue'),
    );
    await act(async () => mark?.click());
    expect(document.body.textContent).toContain('1 of 27 local steps inspected');
    expect(document.body.textContent).toContain('Character handoff');
  });
});
