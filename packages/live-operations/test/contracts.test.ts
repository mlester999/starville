import { describe, expect, it } from 'vitest';

import {
  MAINTENANCE_FALLBACK_MESSAGE,
  MAINTENANCE_FALLBACK_TITLE,
  maintenanceMutationSchema,
  safeCtaUrlSchema,
} from '../src';

describe('live operations contracts', () => {
  it('retains a nonblank fixed maintenance fallback', () => {
    expect(MAINTENANCE_FALLBACK_TITLE).toBe('SERVER PAUSED');
    expect(MAINTENANCE_FALLBACK_MESSAGE).toContain('temporarily unavailable');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/x', '//evil.example'])(
    'rejects unsafe CTA %s',
    (value) => expect(safeCtaUrlSchema.safeParse(value).success).toBe(false),
  );

  it('requires typed confirmation for immediate maintenance', () => {
    const input = {
      expectedRevision: 0,
      enabled: true,
      scheduledStartAt: null,
      expectedEndAt: null,
      autoDisableAtEnd: false,
      title: 'SERVER PAUSED',
      message: 'Starville is temporarily unavailable.',
      updateDetails: [],
      expectedReturnMessage: null,
      showReturnToLanding: true,
      ctaLabel: null,
      ctaUrl: null,
      reason: 'Reviewed immediate maintenance activation',
    };
    expect(maintenanceMutationSchema.safeParse(input).success).toBe(false);
    expect(
      maintenanceMutationSchema.safeParse({ ...input, confirmation: 'MAINTENANCE' }).success,
    ).toBe(true);
  });

  it('allows a future schedule without the immediate activation phrase', () => {
    const result = maintenanceMutationSchema.safeParse({
      expectedRevision: 1,
      enabled: true,
      scheduledStartAt: '2030-01-01T00:00:00.000Z',
      expectedEndAt: '2030-01-01T01:00:00.000Z',
      autoDisableAtEnd: true,
      title: 'Scheduled maintenance',
      message: 'Starville will briefly pause for scheduled maintenance.',
      updateDetails: [],
      expectedReturnMessage: null,
      showReturnToLanding: true,
      ctaLabel: null,
      ctaUrl: null,
      reason: 'Reviewed scheduled maintenance window',
    });
    expect(result.success).toBe(true);
  });
});
