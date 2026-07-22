import { describe, expect, it } from 'vitest';

import {
  OPERATIONAL_CAPABILITY_STATUSES,
  STARVILLE_OPERATIONAL_CAPABILITIES,
  summarizeOperationalCapabilities,
} from '../src/release-readiness';

describe('Phase 13C operational capability inventory', () => {
  it('uses the closed truthful status vocabulary', () => {
    expect(OPERATIONAL_CAPABILITY_STATUSES).toEqual([
      'ready',
      'ready_with_limitations',
      'missing',
      'blocked',
    ]);
    expect(
      STARVILLE_OPERATIONAL_CAPABILITIES.every((item) =>
        OPERATIONAL_CAPABILITY_STATUSES.includes(item.status),
      ),
    ).toBe(true);
  });

  it('requires ownership, authorization, audit, rollback, evidence, and a runbook', () => {
    for (const item of STARVILLE_OPERATIONAL_CAPABILITIES) {
      expect(item.operatorRole).not.toBe('');
      expect(item.permission).not.toBe('');
      expect(item.auditEvidence).not.toBe('');
      expect(item.rollback).not.toBe('');
      expect(item.runbook).toMatch(/^docs\/operations\//u);
      expect(item.automatedEvidence).not.toBe('');
      if (item.status !== 'ready') expect(item.limitation).not.toBeNull();
    }
  });

  it('does not claim production readiness while blockers or missing capabilities remain', () => {
    const summary = summarizeOperationalCapabilities(STARVILLE_OPERATIONAL_CAPABILITIES);
    expect(summary.total).toBe(STARVILLE_OPERATIONAL_CAPABILITIES.length);
    expect(summary.missing).toBeGreaterThan(0);
    expect(summary.blocked).toBeGreaterThan(0);
    expect(summary.productionReady).toBe(false);
  });

  it('only reports production ready after missing and blocked capabilities are resolved', () => {
    const resolved = STARVILLE_OPERATIONAL_CAPABILITIES.map((item) => ({
      ...item,
      status:
        item.status === 'blocked' || item.status === 'missing' ? ('ready' as const) : item.status,
    }));
    expect(summarizeOperationalCapabilities(resolved).productionReady).toBe(true);
  });
});
