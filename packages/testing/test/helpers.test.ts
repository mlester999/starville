import { describe, expect, it } from 'vitest';

import { createDeferred, createFixedClock } from '../src/index';

describe('test helpers', () => {
  it('provides externally controlled asynchronous completion', async () => {
    const deferred = createDeferred<string>();
    deferred.resolve('ready');

    await expect(deferred.promise).resolves.toBe('ready');
  });

  it('returns independent dates from a deterministic clock', () => {
    const clock = createFixedClock('2026-07-10T00:00:00.000Z');
    const first = clock();
    const second = clock();

    expect(first.toISOString()).toBe('2026-07-10T00:00:00.000Z');
    expect(first).not.toBe(second);
  });

  it('rejects invalid fixed timestamps', () => {
    expect(() => createFixedClock('not-a-date')).toThrow();
  });
});
