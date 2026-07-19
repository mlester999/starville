import { describe, expect, it } from 'vitest';

import {
  DevelopmentPerformanceMetrics,
  estimateManagedTextureUsage,
} from './development-performance';

describe('development-only performance metrics', () => {
  it('collects bounded counters and gauges without timing samples', () => {
    const metrics = new DevelopmentPerformanceMetrics(true, () => 123);
    metrics.recordFrame(16);
    metrics.recordFrame(72);
    metrics.recordRealtimeMessage();
    metrics.recordAssetRequest(false);
    metrics.recordAssetRequest(true);
    metrics.setGauge('activeRemotePlayers', 20);
    metrics.setGauge('activeListeners', 7);
    metrics.setGauge('mountedModals', -10);
    metrics.setGauge('activeTextures', 9);
    metrics.setGauge('estimatedTextureBytes', 12_288);
    expect(metrics.snapshot()).toEqual(
      expect.objectContaining({
        sampledAt: 123,
        frames: 2,
        longFrames: 1,
        maximumFrameMs: 72,
        realtimeMessages: 1,
        assetRequests: 2,
        assetCacheHits: 1,
        assetCacheMisses: 1,
        activeRemotePlayers: 20,
        activeListeners: 7,
        mountedModals: 0,
        activeTextures: 9,
        estimatedTextureBytes: 12_288,
      }),
    );
  });

  it('is a complete no-op outside development', () => {
    const metrics = new DevelopmentPerformanceMetrics(false);
    metrics.recordFrame(100);
    metrics.recordRealtimeMessage();
    metrics.recordAssetRequest(false);
    metrics.setGauge('activeListeners', 10);
    expect(metrics.snapshot()).toBeNull();
  });

  it('deduplicates managed texture identities and estimates decoded RGBA bytes when known', () => {
    const deliveries = [
      {
        assetKey: 'world.tree.oak',
        versionId: 'version-a',
        width: 32,
        height: 64,
      },
      {
        assetKey: 'world.tree.oak',
        versionId: 'version-a',
        width: 32,
        height: 64,
      },
      {
        assetKey: 'world.sign.board',
        versionId: 'version-b',
        width: null,
        height: null,
      },
    ];

    expect(estimateManagedTextureUsage(deliveries)).toEqual({
      activeTextures: 2,
      estimatedTextureBytes: 32 * 64 * 4,
    });
  });
});
