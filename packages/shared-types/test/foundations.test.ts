import { describe, expect, it } from 'vitest';

import { APPLICATION_NAMES, ENVIRONMENT_NAMES } from '../src/index';

describe('shared foundational names', () => {
  it('contains exactly the six Phase 1 applications', () => {
    expect(APPLICATION_NAMES).toEqual([
      'landing',
      'game-client',
      'admin-portal',
      'api',
      'realtime-server',
      'worker',
    ]);
  });

  it('contains only supported deployment environments', () => {
    expect(ENVIRONMENT_NAMES).toEqual(['development', 'test', 'production']);
  });
});
