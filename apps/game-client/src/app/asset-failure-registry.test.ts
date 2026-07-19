import { describe, expect, it } from 'vitest';

import { AssetFailureRegistry } from './asset-failure-registry';

describe('asset failure suppression', () => {
  it('reports one sanitized failure and suppresses repeated fetches until cooldown', () => {
    let now = 1_000;
    const registry = new AssetFailureRegistry({
      now: () => now,
      requestId: () => 'asset-request-1',
      retryAfterMs: 5_000,
    });
    expect(registry.begin('safe-cache-id')).toBe(true);
    expect(registry.fail('safe-cache-id', 'world.tree.oak', 'bundled-manifest:1.0.0')).toEqual({
      shouldReport: true,
      event: {
        code: 'WORLD_ASSET_LOAD_FAILED',
        assetKey: 'world.tree.oak',
        versionId: 'bundled-manifest:1.0.0',
        requestId: 'asset-request-1',
      },
    });
    expect(registry.begin('safe-cache-id')).toBe(false);
    now += 5_001;
    expect(registry.begin('safe-cache-id')).toBe(true);
  });

  it('bounds retained identities and clears successful or abandoned attempts', () => {
    const registry = new AssetFailureRegistry({
      maximumEntries: 2,
      requestId: () => 'request',
    });
    expect(registry.begin('one')).toBe(true);
    registry.cancel('one');
    expect(registry.size).toBe(0);
    for (const identity of ['one', 'two', 'three']) {
      registry.begin(identity);
      registry.fail(identity, 'system.missing-asset', 'bundled-manifest:1.0.0');
    }
    expect(registry.size).toBe(2);
    registry.succeed('three');
    expect(registry.size).toBe(1);
  });
});
