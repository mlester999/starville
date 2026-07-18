import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(
  new URL('./player-experience-admin-dashboard.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../app/actions/player-experience.ts', import.meta.url),
  'utf8',
);
const api = readFileSync(new URL('../lib/player-experience-api.ts', import.meta.url), 'utf8');

describe('Phase 12A Player Experience administration', () => {
  it('projects funnel, questline, daily policy history, guidance, recovery, and Game Test', () => {
    expect(dashboard).toContain('Observed funnel');
    expect(dashboard).toContain('Canonical starter questline');
    expect(dashboard).toContain('Controlled policy history');
    expect(dashboard).toContain('Semantic targets');
    expect(dashboard).toContain('Recovery and telemetry');
    expect(dashboard).toContain('Phase 12A Game Test');
    expect(dashboard).toContain('/worlds/lantern-square/editor');
  });

  it('keeps mutations narrow, permission-scoped, and successor-only', () => {
    expect(actions).toContain("requireAuthorizedAdmin('player_experience.support')");
    expect(actions).toContain("requireAuthorizedAdmin('player_experience.policy.manage')");
    expect(api).toContain('/daily-policy-successors');
    expect(dashboard).toContain('Create draft policy successor');
    expect(dashboard).not.toContain('Complete Everything');
    expect(dashboard).not.toContain('complete_everything');
  });
});
