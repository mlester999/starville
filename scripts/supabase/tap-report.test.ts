import { describe, expect, it } from 'vitest';

import { extractTapLines, parseTapReport } from './tap-report';

describe('hosted pgTAP report validation', () => {
  it('extracts and validates a complete passing TAP plan', () => {
    const lines = extractTapLines([
      [{ plan: '1..2' }],
      [{ has_table: 'ok 1 - table exists' }],
      [{ ok: 'ok 2 - policy denies writes' }],
    ]);

    expect(parseTapReport(lines)).toEqual({ planned: 2, passed: 2 });
  });

  it('rejects failed, incomplete, and missing plans', () => {
    expect(() => parseTapReport(['1..1', 'not ok 1 - unsafe grant'])).toThrow(
      'not ok 1 - unsafe grant',
    );
    expect(() => parseTapReport(['1..2', 'ok 1 - first'])).toThrow('plan mismatch');
    expect(() => parseTapReport(['ok 1 - unplanned'])).toThrow('valid test plan');
  });
});
