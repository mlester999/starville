import { describe, expect, it } from 'vitest';

import {
  renderRealtimeSettingsVerification,
  summarizeRealtimeManagementSettings,
} from './verify-realtime-settings';

describe('read-only Realtime settings verification', () => {
  it('proves private-only mode only from the authoritative private_only field', () => {
    expect(
      summarizeRealtimeManagementSettings({
        suspend: false,
        private_only: true,
        max_clients: 200,
        max_events_per_second: 100,
        max_presence_events_per_second: 20,
        max_payload_size_in_kb: 256,
      }),
    ).toEqual({
      realtimeService: 'enabled',
      publicChannelAccess: 'disabled',
      privateOnlyRequirement: 'proven',
      presenceCapability: 'unknown',
      source: 'Management API',
    });
  });

  it('does not reinterpret an undocumented presence_enabled response field', () => {
    const summary = summarizeRealtimeManagementSettings({
      suspend: false,
      presence_enabled: false,
    });
    expect(summary.presenceCapability).toBe('unknown');
    expect(summary.publicChannelAccess).toBe('unknown');
    expect(summary.privateOnlyRequirement).toBe('not proven');
    expect(summary.source).toContain('Dashboard-required');
  });

  it('renders only the bounded status report and no raw response or credentials', () => {
    const output = renderRealtimeSettingsVerification(
      summarizeRealtimeManagementSettings({
        suspend: true,
        private_only: false,
        internal_secret: 'must-never-be-rendered',
      }),
    );
    expect(output).toContain('Realtime service: disabled');
    expect(output).toContain('public channel access: allowed');
    expect(output).not.toContain('must-never-be-rendered');
    expect(output).not.toContain('internal_secret');
  });

  it('sanitizes an invalid Management API response instead of rendering raw values', () => {
    expect(() =>
      summarizeRealtimeManagementSettings({
        suspend: 'invalid-secret-shaped-value',
      }),
    ).toThrow('response shape is not recognized');
    try {
      summarizeRealtimeManagementSettings({ suspend: 'invalid-secret-shaped-value' });
    } catch (error) {
      expect(String(error)).not.toContain('invalid-secret-shaped-value');
    }
  });
});
