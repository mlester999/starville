import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(
  resolve(process.cwd(), 'src/components/GuidedPlayerExperience.tsx'),
  'utf8',
);
const gameTest = readFileSync(
  resolve(process.cwd(), 'src/components/PlayerExperienceGameTest.tsx'),
  'utf8',
);
const world = readFileSync(resolve(process.cwd(), 'src/components/GameWorld.tsx'), 'utf8');

describe('Phase 12A player-experience UI', () => {
  it('keeps one compact objective, accessible feedback, recovery, and daily authority controls', () => {
    expect(guide).toContain('Starville Guide');
    expect(guide).toContain('role="progressbar"');
    expect(guide).toContain('Refresh daily authority');
    expect(guide).toContain('I’m stuck');
    expect(guide).toContain('Dismiss notification');
    expect(guide).toContain('Reduce world guidance and keep text hints');
    expect(world).toContain('playerGuideOpen');
  });

  it('exposes every bounded fixture through inspection-only Game Test', () => {
    expect(gameTest).toContain('PHASE12A_LOCAL_FIXTURES');
    expect(gameTest).toContain('All controls are inspection-only');
    expect(gameTest).toMatch(/No player, inventory, DUST, XP, or quest state is\s+saved\./u);
    expect(gameTest).not.toContain('requestPlayerApi');
  });
});
