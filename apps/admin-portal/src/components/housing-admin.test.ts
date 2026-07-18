import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/game-content/housing/page.tsx', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(new URL('./housing-admin-dashboard.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../app/actions/housing.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/housing-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 11E housing administration', () => {
  it('loads configuration or one private player through the matching permission', () => {
    expect(page).toContain('housing.furniture.inspect');
    expect(page).toContain('housing.player_homes.inspect');
    expect(page).toContain('loadAdminHousing');
    expect(api).toContain('/api/v1/admin/housing');
  });

  it('covers linked furniture, templates, upgrades, storage, homes, revisions, and operations', () => {
    for (const heading of [
      'Furniture definitions',
      'Home templates and zones',
      'Versioned upgrade paths',
      'Storage policy',
      'Player homes',
      'Immutable layout revision inspection',
      'Reconciliation and corrections',
      'Live Ops',
      'Telemetry and audit',
    ]) {
      expect(dashboard).toContain(heading);
    }
    expect(dashboard).toContain('/world-assets/');
    expect(dashboard).toContain('independent review');
    expect(dashboard).toContain('destructive deletion is unavailable');
  });

  it('uses successor-only configuration and scoped AAL2 mutation actions', () => {
    for (const permission of [
      'housing.upgrades.manage',
      'housing.live_ops.manage',
      'housing.reconciliation.manage',
      'housing.corrections.manage',
      'housing.upgrades.inspect',
    ]) {
      expect(actions).toContain(permission);
    }
    expect(actions).toContain('createHousingUpgradeSuccessor');
    expect(actions).toContain('applyHousingCorrection');
    expect(actions).not.toContain('deleteHousing');
    expect(actions).not.toContain('updatePlayerInventory');
  });

  it('retains usable narrow-screen and reduced-motion presentation', () => {
    expect(styles).toContain('.housing-admin');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
