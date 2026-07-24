import { describe, expect, it } from 'vitest';

import {
  HOSTED_DATABASE_TEST_ALLOWLIST,
  selectHostedDatabaseTestSuites,
} from './hosted-database-suite-selection';

describe('hosted database suite selection', () => {
  it('includes the reviewed Phase 13E suite', () => {
    expect(HOSTED_DATABASE_TEST_ALLOWLIST).toContain('phase13e_supabase_first_foundation.test.sql');
    expect(
      selectHostedDatabaseTestSuites([
        '--',
        '--suite',
        'phase13e_supabase_first_foundation.test.sql',
      ]),
    ).toEqual(['phase13e_supabase_first_foundation.test.sql']);
  });

  it.each([
    'unknown.test.sql',
    'phase13e_supabase_first_foundation-renamed.test.sql',
    '../phase13e_supabase_first_foundation.test.sql',
    '..\\phase13e_supabase_first_foundation.test.sql',
  ])('rejects an unknown, renamed, or traversing suite: %s', (suite) => {
    expect(() => selectHostedDatabaseTestSuites(['--suite', suite])).toThrow();
  });

  it('does not offer an unrestricted path or run-all argument', () => {
    expect(() => selectHostedDatabaseTestSuites(['--all'])).toThrow();
    expect(() => selectHostedDatabaseTestSuites(['--suite', 'a.test.sql', '--suite'])).toThrow();
  });
});
