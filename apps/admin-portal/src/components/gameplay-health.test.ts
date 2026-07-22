import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/operations/gameplay-health/page.tsx', import.meta.url),
  'utf8',
);
const operations = readFileSync(
  new URL('../app/(protected)/operations/page.tsx', import.meta.url),
  'utf8',
);
const routeMetadata = readFileSync(new URL('../lib/admin-route-meta.ts', import.meta.url), 'utf8');

describe('Operations Gameplay Health route contract', () => {
  it('is protected inside the existing Operations area', () => {
    expect(page).toContain("requireAuthorizedAdmin('operations.read')");
    expect(operations).toContain('href="/operations/gameplay-health"');
    expect(routeMetadata).toContain("path: '/operations/gameplay-health'");
    expect(routeMetadata).toContain("parentHref: '/operations'");
  });

  it('is read-only and contains no private-player or mutation surface', () => {
    expect(page).toContain('summarizePhase13aGameplayHealth()');
    expect(page).toContain('no player records');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('action=');
    expect(page).not.toContain('walletAddress');
    expect(page).not.toContain('playerId');
  });

  it('keeps hosted evidence, owner acceptance, and Phase 13B gates explicit', () => {
    expect(page).toContain('does not mean hosted validation or owner acceptance passed');
    expect(page).toContain('Local versus hosted evidence');
    expect(page).toContain('Phase 13B handoff blockers');
    expect(page).toContain('does not query production');
  });
});
