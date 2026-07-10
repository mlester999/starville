import { describe, expect, it } from 'vitest';

import { createRecoveryMarker, verifyRecoveryMarker } from './recovery-marker';

const secret = 'test-only-cookie-signing-secret-with-32-characters';
const userId = '11111111-1111-4111-8111-111111111111';
const authSessionId = '22222222-2222-4222-8222-222222222222';

describe('password recovery marker', () => {
  it('binds a short-lived marker to the verified user and Auth session', () => {
    const marker = createRecoveryMarker(secret, userId, authSessionId, 1_000);

    expect(verifyRecoveryMarker(marker, secret, userId, authSessionId, 2_000)).toBe(true);
    expect(verifyRecoveryMarker(marker, secret, userId, 'different-session', 2_000)).toBe(false);
    expect(verifyRecoveryMarker(marker, secret, 'different-user', authSessionId, 2_000)).toBe(
      false,
    );
  });

  it('rejects tampering, wrong keys, malformed values, and expiration', () => {
    const marker = createRecoveryMarker(secret, userId, authSessionId, 1_000);

    expect(verifyRecoveryMarker(`${marker}x`, secret, userId, authSessionId, 2_000)).toBe(false);
    expect(
      verifyRecoveryMarker(
        marker,
        'a-different-test-secret-with-32-characters',
        userId,
        authSessionId,
        2_000,
      ),
    ).toBe(false);
    expect(verifyRecoveryMarker('not-a-marker', secret, userId, authSessionId, 2_000)).toBe(false);
    expect(verifyRecoveryMarker(marker, secret, userId, authSessionId, 602_000)).toBe(false);
  });
});
