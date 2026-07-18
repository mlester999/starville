import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = readFileSync(new URL('../routes/home-visits.ts', import.meta.url), 'utf8');
const playerRoutes = readFileSync(new URL('../routes/player.ts', import.meta.url), 'utf8');
const errors = readFileSync(new URL('../errors.ts', import.meta.url), 'utf8');

describe('Phase 11F HTTP boundary', () => {
  it('authorizes all reads and requires trusted-origin checks for every mutation', () => {
    for (const path of [
      '/game-test',
      '/settings',
      '/sessions',
      '/sessions/admissions',
      '/sessions/stop',
      '/invitations',
      '/invitations/revoke',
      '/join',
      '/leave',
      '/interactions',
      '/guestbook',
      '/appreciation',
      '/helpers/water',
      '/moderation',
      '/reports',
      '/guestbook/moderation',
    ])
      expect(routes).toContain(path);
    expect(routes).toContain('authorizePlayerRequest');
    expect(routes).toContain('assertTrustedBrowserMutation');
    expect(routes).toContain('bodyLimit: 4_096');
  });

  it('issues participant-bound realtime tickets through the existing access boundary', () => {
    expect(playerRoutes).toContain('/home-visit-realtime-ticket');
    expect(playerRoutes).toContain('homeVisitRealtimeTicketRequestSchema');
    expect(playerRoutes).toContain('issueHomeVisit');
    expect(playerRoutes).toContain('assertTrustedBrowserMutation');
  });

  it('maps private persistence outcomes to stable owner-safe error codes', () => {
    for (const code of [
      'HOME_VISIT_FULL',
      'HOME_VISIT_OWNER_ABSENT',
      'HOME_VISIT_FRIEND_REQUIRED',
      'HOME_VISIT_INVITATION_REQUIRED',
      'HOME_VISIT_BLOCKED',
      'HOME_VISIT_TRANSITION_CONFLICT',
      'HOME_SEAT_OCCUPIED',
      'HOME_PHOTO_AREA_FULL',
      'HOME_GUESTBOOK_RATE_LIMITED',
      'HOME_HELPER_LIMIT_REACHED',
      'HOME_HELPER_TOO_FAR',
      'HOME_VISITS_UNAVAILABLE',
    ])
      expect(errors).toContain(code);
    expect(routes).not.toContain('error.message');
  });

  it('enforces scoped admin permissions at every operations endpoint', () => {
    for (const permission of [
      'home_visits.inspect',
      'home_visits.policies.manage',
      'home_visits.manage',
      'home_visits.guestbooks.moderate',
      'home_visits.reconciliation.manage',
    ])
      expect(routes).toContain(permission);
    expect(routes).toContain('authorizeAdminRequest');
  });
});
