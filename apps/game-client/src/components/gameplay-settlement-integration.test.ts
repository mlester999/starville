import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gameWorld = readFileSync(resolve(process.cwd(), 'src/components/GameWorld.tsx'), 'utf8');
const cozy = readFileSync(resolve(process.cwd(), 'src/components/CozyGameplay.tsx'), 'utf8');
const housing = readFileSync(
  resolve(process.cwd(), 'src/components/HousingWorkspacePanel.tsx'),
  'utf8',
);
const visits = readFileSync(resolve(process.cwd(), 'src/components/HomeVisitsPanel.tsx'), 'utf8');

describe('authoritative gameplay settlement propagation', () => {
  it('invalidates both progression and player-experience projections after settlement', () => {
    expect(gameWorld).toContain('handleAuthoritativeGameplayMutation');
    expect(gameWorld).toContain('setPlayerExperienceRefresh((value) => value + 1)');
    expect(gameWorld).toContain('refreshProgressionHud()');
    expect(gameWorld).toContain('onAuthoritativeMutation={handleAuthoritativeGameplayMutation}');
  });

  it('propagates successful cozy, store, housing, and visit mutations only after rehydration', () => {
    expect(cozy).toContain('await refreshMutableState();');
    expect(cozy).toContain('onAuthoritativeMutation?.();');
    expect(cozy.indexOf('await refreshMutableState();')).toBeLessThan(
      cozy.indexOf('onAuthoritativeMutation?.();'),
    );
    expect(housing).toContain('onAuthoritativeMutation={onAuthoritativeMutation}');
    expect(visits).toContain('await refresh();');
    expect(visits.indexOf('await refresh();')).toBeLessThan(
      visits.indexOf('onAuthoritativeMutation?.();'),
    );
  });

  it('does not replace server authority with an optimistic global cache', () => {
    for (const source of [cozy, housing, visits]) {
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('sessionStorage');
    }
  });
});
