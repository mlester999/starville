import { describe, expect, it } from 'vitest';

import { FixedWindowAdminRateLimiter } from './rate-limit.js';

describe('administrator read rate limiter', () => {
  it('bounds each administrator and route scope within a fixed window', () => {
    let now = 1_000;
    const limiter = new FixedWindowAdminRateLimiter(2, 60_000, () => now);
    expect(limiter.claim('admin-a:players')).toBe(true);
    expect(limiter.claim('admin-a:players')).toBe(true);
    expect(limiter.claim('admin-a:players')).toBe(false);
    expect(limiter.claim('admin-a:operations')).toBe(true);
    now += 60_000;
    expect(limiter.claim('admin-a:players')).toBe(true);
  });
});
