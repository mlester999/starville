import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = readFileSync(new URL('../routes/housing.ts', import.meta.url), 'utf8');
const gateway = readFileSync(new URL('./gateway.ts', import.meta.url), 'utf8');
const errors = readFileSync(new URL('../errors.ts', import.meta.url), 'utf8');

describe('Phase 11E HTTP boundary', () => {
  it('exposes owner-authorized housing reads and trusted-origin mutations', () => {
    for (const path of [
      '/game-test',
      '/decoration-sessions',
      '/layouts/validate',
      '/layouts',
      '/storage/open',
      '/storage/${storageOperation}',
      '/upgrades/purchase',
    ]) {
      expect(routes).toContain(path);
    }
    expect(routes).toContain('authorizePlayerRequest');
    expect(routes).toContain('assertTrustedBrowserMutation');
    expect(routes).toMatch(/bodyLimit:\s*262_144/);
  });

  it('keeps Game Test fixture and deterministic simulations off database RPCs', () => {
    expect(gateway).toMatch(/gameTest\(\)\s*{\s*return housingGameTestFixture;\s*}/);
    expect(gateway).toContain('runHousingSimulation');
    expect(gateway).not.toContain("rpc(client,'get_player_housing_game_test'");
    expect(gateway).not.toContain("rpc(client,'simulate_housing'");
  });

  it('requires scoped admin permissions and owner-safe public errors', () => {
    for (const permission of [
      'housing.furniture.inspect',
      'housing.player_homes.inspect',
      'housing.upgrades.manage',
      'housing.live_ops.manage',
      'housing.reconciliation.manage',
      'housing.corrections.manage',
    ]) {
      expect(routes).toContain(permission);
    }
    for (const code of [
      'HOUSING_PERMISSION_DENIED',
      'HOUSING_CONFLICT',
      'HOUSING_LAYOUT_INVALID',
      'HOUSING_FURNITURE_RETURN_BLOCKED',
      'HOUSING_STORAGE_FULL',
      'HOUSING_UPGRADE_UNAVAILABLE',
    ]) {
      expect(errors).toContain(code);
    }
  });
});
