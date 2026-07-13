import { describe, expect, it } from 'vitest';

import { FixedWindowPlayerRateLimiter } from './rate-limit.js';

describe('player request rate limiter', () => {
  it('isolates players and releases the fixed window deterministically', () => {
    let now = 1_000;
    const limiter = new FixedWindowPlayerRateLimiter(2, 60_000, () => now);

    expect(limiter.claim('wallet-a:quickbar')).toBe(true);
    expect(limiter.claim('wallet-a:quickbar')).toBe(true);
    expect(limiter.claim('wallet-a:quickbar')).toBe(false);
    expect(limiter.claim('wallet-b:quickbar')).toBe(true);
    now += 60_000;
    expect(limiter.claim('wallet-a:quickbar')).toBe(true);
  });
});
