import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/game-content/progression/page.tsx', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('./progression-admin-dashboard.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(new URL('../app/actions/progression.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/progression-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 11D progression administrator experience', () => {
  it('protects inspection and every mutation with granular progression permissions', () => {
    expect(page).toContain("requireAuthorizedAdmin('progression.skills.inspect')");
    for (const permission of [
      'progression.curves.manage',
      'progression.skills.manage',
      'progression.xp_rules.manage',
      'progression.unlocks.manage',
      'progression.quests.manage',
      'progression.achievements.manage',
      'progression.titles.manage',
      'progression.corrections.manage',
      'progression.reconciliation.manage',
      'progression.live_ops.manage',
    ]) {
      expect(`${dashboard}\n${actions}`).toContain(permission);
    }
  });

  it('provides reviewed successor, validation, activation, simulation, and no-migration UX', () => {
    expect(dashboard).toContain('Create curve successor');
    expect(dashboard).toContain('Run blocking validation');
    expect(dashboard).toContain('Activate with no player migration');
    expect(dashboard).toContain('Simulate time-to-level');
    expect(dashboard).toContain('earned progress stays pinned');
    expect(actions).toContain('simulation-complete-no-player-migration');
    expect(api).toContain('/api/v1/admin/progression/curves/');
  });

  it('keeps correction, reconciliation, and title controls evidence-based', () => {
    expect(dashboard).toContain('Preview correction');
    expect(dashboard).toContain('Apply reviewed correction');
    expect(dashboard).toContain('Queue bounded check');
    expect(dashboard).toContain('never deletes earned ownership');
    expect(dashboard).not.toContain('Set XP');
    expect(dashboard).not.toContain('Set Level');
    expect(api).toContain('/api/v1/admin/progression/corrections');
    expect(api).toContain('/api/v1/admin/progression/presentation/');
  });

  it('has responsive layouts and bounded overflow for private evidence', () => {
    expect(styles).toContain('.progression-admin-liveops');
    expect(styles).toContain('.progression-admin-presentations');
    expect(styles).toContain('.progression-admin-json');
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.progression-admin-liveops/u);
  });
});
