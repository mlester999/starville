import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_EVIDENCE_STATUSES,
  STARVILLE_PRODUCTION_RELEASE_EVIDENCE,
  summarizeProductionRelease,
} from '../src/production-release-candidate';

describe('Phase 13D production release-candidate evidence', () => {
  it('uses explicit evidence classes and a closed status vocabulary', () => {
    for (const item of STARVILLE_PRODUCTION_RELEASE_EVIDENCE) {
      expect(PRODUCTION_EVIDENCE_STATUSES).toContain(item.status);
      expect(item.owner).not.toBe('');
      expect(item.detail).not.toBe('');
    }
  });

  it('remains Stage A blocked and NO-GO while critical evidence is absent', () => {
    expect(summarizeProductionRelease(STARVILLE_PRODUCTION_RELEASE_EVIDENCE)).toMatchObject({
      stageA: 'blocked',
      phase14Recommendation: 'NO-GO',
    });
  });

  it('does not mistake local evidence for production or owner acceptance', () => {
    const onlyLocal = STARVILLE_PRODUCTION_RELEASE_EVIDENCE.map((item) => ({
      ...item,
      status: 'passed_local' as const,
    }));
    expect(summarizeProductionRelease(onlyLocal).stageA).toBe('blocked');
    expect(summarizeProductionRelease(onlyLocal).phase14Recommendation).toBe('NO-GO');
  });
});
