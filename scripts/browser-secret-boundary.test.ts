import { describe, expect, it } from 'vitest';

import { inspectBrowserOutput } from './browser-secret-boundary';

describe('browser output secret boundary', () => {
  it.each(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DATABASE_URL', 'ADMIN_RECOVERY_COOKIE_SECRET'])(
    'detects the server-only identifier %s',
    (identifier) => {
      expect(
        inspectBrowserOutput({
          content: Buffer.from(`window.__invalid__ = '${identifier}'`),
          path: 'fixture.js',
          secrets: {},
        }),
      ).toHaveLength(1);
    },
  );

  it('detects actual local secret values without printing them', () => {
    expect(
      inspectBrowserOutput({
        content: Buffer.from('compiled-private-value'),
        path: 'fixture.js',
        secrets: { PRIVATE_VALUE: 'compiled-private-value' },
      }),
    ).toEqual(['PRIVATE_VALUE value appears in browser output fixture.js']);
  });

  it('accepts browser-safe compiled output', () => {
    expect(
      inspectBrowserOutput({
        content: Buffer.from('window.__public__ = true'),
        path: 'fixture.js',
        secrets: { PRIVATE_VALUE: 'not-present' },
      }),
    ).toEqual([]);
  });
});
