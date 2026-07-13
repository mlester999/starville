import { describe, expect, it } from 'vitest';

import {
  buildMaintenanceHelpSteps,
  defaultActivationMode,
  maintenanceFieldLabel,
  parseMaintenanceFormData,
  readFormBoolean,
} from './maintenance-form';

const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date('2026-07-13T12:00:00.000Z');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function baseEntries(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    requestId: REQUEST_ID,
    expectedRevision: '1',
    enabled: 'true',
    activationMode: 'immediate',
    title: 'SERVER PAUSED',
    message: 'Starville is temporarily unavailable for maintenance.',
    updateDetails: '',
    expectedReturnMessage: '',
    scheduledStartAt: '',
    expectedEndAt: '',
    autoDisableAtEnd: 'false',
    showReturnToLanding: 'false',
    ctaLabel: '',
    ctaUrl: '',
    reason: 'Reviewed immediate maintenance activation',
    confirmation: 'MAINTENANCE',
    ...overrides,
  };
}

describe('maintenance form boolean parsing', () => {
  it.each([
    ['on', true],
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['false', false],
    ['FALSE', false],
    ['off', false],
    ['0', false],
    ['', false],
  ] as const)('parses %s as %s', (value, expected) => {
    const data = form({ flag: value });
    expect(readFormBoolean(data, 'flag')).toBe(expected);
  });

  it('treats an absent checkbox as false', () => {
    expect(readFormBoolean(form({}), 'flag')).toBe(false);
  });
});

describe('maintenance form parsing', () => {
  it('accepts immediate activation with blank schedule and end', () => {
    const result = parseMaintenanceFormData(form(baseEntries()), { now: NOW });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.activationMode).toBe('immediate');
    expect(result.data.enabled).toBe(true);
    expect(result.data.scheduledStartAt).toBeNull();
    expect(result.data.expectedEndAt).toBeNull();
    expect(result.data.autoDisableAtEnd).toBe(false);
    expect(result.data.confirmation).toBe('MAINTENANCE');
  });

  it('forces auto-disable false when expected end is blank', () => {
    const result = parseMaintenanceFormData(
      form(baseEntries({ autoDisableAtEnd: 'true', expectedEndAt: '' })),
      { now: NOW },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.autoDisableAtEnd).toBe(false);
  });

  it('rejects immediate activation without typed confirmation', () => {
    const result = parseMaintenanceFormData(form(baseEntries({ confirmation: '' })), { now: NOW });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors['confirmation']).toContain('MAINTENANCE');
  });

  it('requires future scheduled start in scheduled mode', () => {
    const missing = parseMaintenanceFormData(
      form(
        baseEntries({
          activationMode: 'scheduled',
          scheduledStartAt: '',
          confirmation: '',
        }),
      ),
      { now: NOW },
    );
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.fieldErrors['scheduledStartAt']).toContain('required');
    }

    const past = parseMaintenanceFormData(
      form(
        baseEntries({
          activationMode: 'scheduled',
          scheduledStartAt: '2020-01-01T00:00',
          confirmation: '',
        }),
      ),
      { now: NOW },
    );
    expect(past.success).toBe(false);
    if (!past.success) {
      expect(past.fieldErrors['scheduledStartAt']).toContain('future');
    }

    const future = parseMaintenanceFormData(
      form(
        baseEntries({
          activationMode: 'scheduled',
          scheduledStartAt: '2030-01-01T00:00',
          confirmation: '',
        }),
      ),
      { now: NOW },
    );
    expect(future.success).toBe(true);
    if (!future.success) return;
    expect(future.data.scheduledStartAt).toBeTruthy();
    expect(future.data.confirmation).toBeUndefined();
  });

  it('rejects expected end earlier than scheduled start', () => {
    const result = parseMaintenanceFormData(
      form(
        baseEntries({
          activationMode: 'scheduled',
          scheduledStartAt: '2030-01-01T02:00',
          expectedEndAt: '2030-01-01T01:00',
          confirmation: '',
        }),
      ),
      { now: NOW },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors['expectedEndAt']).toContain('later than scheduled start');
    }
  });

  it('accepts paired CTA values and rejects unpaired values', () => {
    const ok = parseMaintenanceFormData(
      form(baseEntries({ ctaLabel: 'Status page', ctaUrl: 'https://status.example.com' })),
      { now: NOW },
    );
    expect(ok.success).toBe(true);

    const internal = parseMaintenanceFormData(
      form(baseEntries({ ctaLabel: 'Help', ctaUrl: '/help' })),
      { now: NOW },
    );
    expect(internal.success).toBe(true);

    const unpaired = parseMaintenanceFormData(form(baseEntries({ ctaLabel: 'Help', ctaUrl: '' })), {
      now: NOW,
    });
    expect(unpaired.success).toBe(false);
    if (!unpaired.success) {
      expect(unpaired.fieldErrors['ctaLabel']).toBeTruthy();
    }
  });

  it('allows return-to-landing without custom CTA fields', () => {
    const result = parseMaintenanceFormData(
      form(baseEntries({ showReturnToLanding: 'true', ctaLabel: '', ctaUrl: '' })),
      { now: NOW },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.showReturnToLanding).toBe(true);
    expect(result.data.ctaLabel).toBeNull();
    expect(result.data.ctaUrl).toBeNull();
  });

  it('rejects short reasons and preserves field-level errors', () => {
    const result = parseMaintenanceFormData(form(baseEntries({ reason: 'too short' })), {
      now: NOW,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors['reason']).toContain('12');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('defaults activation mode to immediate unless a future schedule exists', () => {
    expect(
      defaultActivationMode({
        enabled: false,
        scheduledStartAt: null,
        now: NOW,
      }),
    ).toBe('immediate');
    expect(
      defaultActivationMode({
        enabled: true,
        scheduledStartAt: '2030-01-01T00:00:00.000Z',
        now: NOW,
      }),
    ).toBe('scheduled');
    expect(
      defaultActivationMode({
        enabled: true,
        scheduledStartAt: '2020-01-01T00:00:00.000Z',
        now: NOW,
      }),
    ).toBe('immediate');
  });

  it('does not treat the string false as true for enablement', () => {
    const result = parseMaintenanceFormData(
      form(
        baseEntries({
          enabled: 'false',
          confirmation: '',
          reason: 'Disable maintenance after completed patch window',
        }),
      ),
      { now: NOW },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enabled).toBe(false);
  });

  it('allows disable with only a reason and ignores schedule requirements', () => {
    const result = parseMaintenanceFormData(
      form(
        baseEntries({
          enabled: 'false',
          activationMode: 'scheduled',
          scheduledStartAt: '',
          title: '',
          message: '',
          confirmation: '',
          reason: 'Ending maintenance after the patch window completed successfully',
        }),
      ),
      { now: NOW },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enabled).toBe(false);
    expect(result.data.scheduledStartAt).toBeNull();
    expect(result.data.expectedEndAt).toBeNull();
    expect(result.data.autoDisableAtEnd).toBe(false);
    expect(result.data.title.length).toBeGreaterThan(0);
    expect(result.data.message.length).toBeGreaterThan(0);
    expect(result.data.confirmation).toBeUndefined();
  });

  it('builds actionable help steps from field errors', () => {
    expect(maintenanceFieldLabel('confirmation')).toBe('Typed confirmation');
    const steps = buildMaintenanceHelpSteps({
      confirmation: 'Type MAINTENANCE to confirm immediate activation.',
      reason: 'Provide an administrator reason of at least 12 characters.',
    });
    expect(steps.some((step) => step.includes('MAINTENANCE'))).toBe(true);
    expect(steps.some((step) => step.includes('reason'))).toBe(true);
  });

  it('accepts multi-line player messages that browsers submit with CRLF endings', () => {
    const result = parseMaintenanceFormData(
      form(
        baseEntries({
          message:
            'Starville is temporarily unavailable for maintenance.\r\nPlease check back soon.',
        }),
      ),
      { now: NOW },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.message).toBe(
      'Starville is temporarily unavailable for maintenance.\nPlease check back soon.',
    );
    expect(result.data.message.includes('\r')).toBe(false);
  });
});
