import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const listPage = readFileSync(
  new URL('../app/(protected)/operations/chat/page.tsx', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/(protected)/operations/chat/[reportId]/page.tsx', import.meta.url),
  'utf8',
);
const action = readFileSync(new URL('../app/actions/chat-moderation.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('administrator chat moderation area', () => {
  it('requires protected report evidence permission and separates mutation authority', () => {
    expect(listPage).toContain("requireAuthorizedAdmin('multiplayer_chat.reports.read')");
    expect(detailPage).toContain("requireAuthorizedAdmin('multiplayer_chat.reports.read')");
    expect(detailPage).toContain("hasAdminPermission(context, 'multiplayer_chat.moderate')");
    expect(action).toContain("requireAuthorizedAdmin('multiplayer_chat.moderate')");
  });

  it('shows exact evidence without wallet, email, IP, or session credential fields', () => {
    expect(detailPage).toContain('Exact message evidence');
    expect(detailPage).toContain('cannot be edited or destructively deleted');
    for (const forbidden of ['walletAddress', 'emailAddress', 'ipAddress', 'sessionToken']) {
      expect(detailPage).not.toContain(forbidden);
      expect(listPage).not.toContain(forbidden);
    }
  });

  it('offers bounded pagination, filters, revision checks, reasons, and approved mute periods', () => {
    for (const pageSize of ['10', '50', '100']) expect(listPage).toContain(`value="${pageSize}"`);
    expect(listPage).toContain('Message ID or display name');
    expect(detailPage).toContain('expectedRevision');
    expect(detailPage).toContain('minLength={12}');
    for (const duration of ['15', '60', '1440', '10080']) {
      expect(detailPage).toContain(`value="${duration}"`);
    }
  });

  it('uses responsive cards and bounded evidence wrapping on mobile and tablet', () => {
    expect(styles).toContain('@media (max-width: 820px)');
    expect(styles).toContain('.chat-report-table td::before');
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(styles).toContain('.chat-report-detail__grid');
  });
});
