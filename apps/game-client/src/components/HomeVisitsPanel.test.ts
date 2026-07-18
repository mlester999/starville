import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(resolve(process.cwd(), 'src/components/HomeVisitsPanel.tsx'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'src/app/home-visit-client.ts'), 'utf8');
const realtime = readFileSync(
  resolve(process.cwd(), 'src/app/home-visit-realtime-client.ts'),
  'utf8',
);
const housing = readFileSync(
  resolve(process.cwd(), 'src/components/HousingWorkspacePanel.tsx'),
  'utf8',
);
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('Phase 11F game-client home visits', () => {
  it('provides complete hosting, discovery, invitation, admission, and safe-return controls', () => {
    for (const behavior of [
      'Who may visit',
      'Private',
      'Friends Only',
      'Invite Only',
      'Public',
      'What visitors may do',
      'View Only',
      'Social Interactions',
      'Allow Helpers',
      'Start Hosting',
      'Close admissions',
      'Reopen admissions',
      'End Visit',
      'Homes hosting now',
      'Accept and visit',
      'Leave Home',
    ])
      expect(panel).toContain(behavior);
    expect(panel).toContain('session.visitorCount');
    expect(panel).toContain('session.maximumVisitors');
    expect(panel).toContain('sessionConfigurationRevision');
    expect(panel).not.toContain('expectedSessionRevision: 1');
  });

  it('exposes bounded social, inspection, helper, moderation, and reporting affordances', () => {
    for (const behavior of [
      "action: 'emote'",
      "action: 'sit'",
      "action: 'stand'",
      "action: 'join_photo_area'",
      "action: 'leave_photo_area'",
      "action: 'inspect_furniture'",
      'Sign guestbook',
      'Appreciate this home',
      'Help water crop',
      "action: 'remove'",
      "action: 'block'",
      'Report saved for authorized moderation review',
    ])
      expect(panel).toContain(behavior);
    expect(panel).toContain('owner keeps crop output and progression');
    expect(panel).toContain('workspace.ownAppreciation?.stateVersion');
    expect(panel).not.toContain('walletAddress');
  });

  it('connects the participant-bound isolated realtime route and never accepts raw success input', () => {
    expect(panel).toContain('HomeVisitRealtimeConnection');
    expect(panel).toContain('Realtime presence:');
    expect(realtime).toContain('/home-visit');
    expect(realtime).toContain('/home-visit-realtime-ticket');
    expect(realtime).toContain('homeVisitRealtimeServerMessageSchema.safeParse');
    expect(realtime).toContain("type: 'movement'");
    expect(realtime).toContain("type: 'sync'");
    expect(housing).toContain('realtimeUrl={realtimeUrl}');
  });

  it('keeps Game Test temporary and contains no preview mutation endpoint', () => {
    expect(panel).toContain('Load owner + ten visitor fixture');
    expect(panel).toContain('Temporary preview participants and data only.');
    expect(client).toContain('/game-test');
    expect(client).not.toContain('/game-test/save');
    expect(client).not.toContain('/game-test/join');
  });

  it('retains semantic participant summaries and responsive accessible controls', () => {
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain('<ul>');
    expect(panel).toContain('Sitting state:');
    expect(panel).toContain('aria-label="Appreciate this home"');
    expect(styles).toContain('@media (max-width: 48rem)');
    expect(styles).toContain('min-height: 2.75rem');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
