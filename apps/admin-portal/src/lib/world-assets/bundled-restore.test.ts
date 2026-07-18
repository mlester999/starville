import { describe, expect, it } from 'vitest';

import {
  BUNDLED_DEFAULT_RESTORE_CONFIRMATION,
  parseBundledDefaultRestoreForm,
} from './bundled-restore';

const assetId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';

function form(overrides: Readonly<Record<string, string>> = {}): FormData {
  const value = new FormData();
  for (const [key, entry] of Object.entries({
    assetId,
    expectedAssetRevision: '4',
    reason: 'Restore the reviewed repository baseline after comparison.',
    requestId,
    confirmed: 'yes',
    typedConfirmation: BUNDLED_DEFAULT_RESTORE_CONFIRMATION,
    ...overrides,
  })) {
    value.set(key, entry);
  }
  return value;
}

describe('bundled-default restore form', () => {
  it('binds the exact asset revision, reason, confirmation, and idempotency key', () => {
    const result = parseBundledDefaultRestoreForm(form());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      assetId,
      expectedAssetRevision: 4,
      reason: 'Restore the reviewed repository baseline after comparison.',
      idempotencyKey: requestId,
      confirmed: true,
      typedConfirmation: BUNDLED_DEFAULT_RESTORE_CONFIRMATION,
    });
  });

  it('rejects a short reason and stale-form revision omissions', () => {
    expect(parseBundledDefaultRestoreForm(form({ reason: 'too short' })).success).toBe(false);
    expect(parseBundledDefaultRestoreForm(form({ expectedAssetRevision: '' })).success).toBe(false);
  });

  it('requires the exact destructive-action confirmation', () => {
    expect(
      parseBundledDefaultRestoreForm(form({ typedConfirmation: 'RESTORE DEFAULT' })).success,
    ).toBe(false);
  });
});
