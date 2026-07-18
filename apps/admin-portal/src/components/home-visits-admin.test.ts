import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/operations/social/home-visits/page.tsx', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('./home-visits-admin-dashboard.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(new URL('../app/actions/home-visits.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/home-visits-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 11F home-visit administration', () => {
  it('loads the social operations workspace through its inspect permission', () => {
    expect(page).toContain('home_visits.inspect');
    expect(page).toContain('loadAdminHomeVisits');
    expect(api).toContain('/api/v1/admin/home-visits');
  });

  it('covers sessions, participants, invitations, moderation, reports, telemetry, and audit', () => {
    for (const heading of [
      'Active hosted sessions',
      'Participants',
      'Invitations',
      'Guestbook',
      'Appreciation',
      'Helper activity',
      'Reports',
      'Request reconciliation',
      'Home visit telemetry',
      'Audit history',
    ])
      expect(dashboard).toContain(heading);
    expect(dashboard).toContain('Close session');
    expect(dashboard).toContain('Create policy successor');
    expect(dashboard).not.toContain('rawToken');
  });

  it('uses scoped mutations and successor-only policy history', () => {
    for (const permission of [
      'home_visits.policies.manage',
      'home_visits.manage',
      'home_visits.guestbooks.moderate',
      'home_visits.reconciliation.manage',
    ])
      expect(actions).toContain(permission);
    expect(actions).toContain('createAdminHomeVisitPolicy');
    expect(actions).toContain('transitionAdminHomeVisitPolicy');
    expect(actions).not.toContain('deleteHomeVisitPolicy');
    expect(actions).not.toContain('updatePlayerInventory');
  });

  it('retains AAL2-backed server actions and narrow-screen accessibility', () => {
    expect(api).toContain('callTrustedAdminApi');
    expect(actions).toContain("'use server'");
    expect(dashboard).toContain('aria-live="polite"');
    expect(styles).toContain('.home-visits-admin');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
