import type { WorldAssetDelivery } from '@starville/asset-management';

export const RUNTIME_PERFORMANCE_EVENT_NAME = 'starville:runtime-performance';

export interface RuntimePerformanceSnapshot {
  readonly sampledAt: number;
  readonly frames: number;
  readonly longFrames: number;
  readonly maximumFrameMs: number;
  readonly realtimeMessages: number;
  readonly assetRequests: number;
  readonly assetCacheHits: number;
  readonly assetCacheMisses: number;
  readonly activeRemotePlayers: number;
  readonly activeListeners: number;
  readonly mountedModals: number;
  readonly mountedHudPanels: number;
  readonly activeAnimations: number;
  readonly activeParticles: number;
  readonly activeTextures: number;
  readonly estimatedTextureBytes: number;
}

type ManagedTextureDelivery = Pick<
  WorldAssetDelivery,
  'assetKey' | 'versionId' | 'width' | 'height'
>;

export function estimateManagedTextureUsage(deliveries: readonly ManagedTextureDelivery[]): {
  readonly activeTextures: number;
  readonly estimatedTextureBytes: number;
} {
  const unique = new Map<string, ManagedTextureDelivery>();
  for (const delivery of deliveries) {
    unique.set(`${delivery.assetKey}:${delivery.versionId}`, delivery);
  }
  let estimatedTextureBytes = 0;
  for (const delivery of unique.values()) {
    if (delivery.width === null || delivery.height === null) continue;
    estimatedTextureBytes += delivery.width * delivery.height * 4;
  }
  return { activeTextures: unique.size, estimatedTextureBytes };
}

export class DevelopmentPerformanceMetrics {
  private frames = 0;
  private longFrames = 0;
  private maximumFrameMs = 0;
  private realtimeMessages = 0;
  private assetRequests = 0;
  private assetCacheHits = 0;
  private assetCacheMisses = 0;
  private readonly gauges = new Map<string, number>();

  public constructor(
    private readonly enabled: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  public recordFrame(durationMs: number): void {
    if (!this.enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
    this.frames += 1;
    if (durationMs >= 50) this.longFrames += 1;
    this.maximumFrameMs = Math.max(this.maximumFrameMs, durationMs);
  }

  public recordRealtimeMessage(): void {
    if (this.enabled) this.realtimeMessages += 1;
  }

  public recordAssetRequest(cacheHit: boolean): void {
    if (!this.enabled) return;
    this.assetRequests += 1;
    if (cacheHit) this.assetCacheHits += 1;
    else this.assetCacheMisses += 1;
  }

  public setGauge(
    name:
      | 'activeRemotePlayers'
      | 'activeListeners'
      | 'mountedModals'
      | 'mountedHudPanels'
      | 'activeAnimations'
      | 'activeParticles'
      | 'activeTextures'
      | 'estimatedTextureBytes',
    value: number,
  ): void {
    if (!this.enabled) return;
    this.gauges.set(name, Math.max(0, Math.floor(value)));
  }

  public adjustGauge(
    name: Parameters<DevelopmentPerformanceMetrics['setGauge']>[0],
    delta: number,
  ): void {
    this.setGauge(name, (this.gauges.get(name) ?? 0) + delta);
  }

  public snapshot(): RuntimePerformanceSnapshot | null {
    if (!this.enabled) return null;
    return {
      sampledAt: this.now(),
      frames: this.frames,
      longFrames: this.longFrames,
      maximumFrameMs: this.maximumFrameMs,
      realtimeMessages: this.realtimeMessages,
      assetRequests: this.assetRequests,
      assetCacheHits: this.assetCacheHits,
      assetCacheMisses: this.assetCacheMisses,
      activeRemotePlayers: this.gauges.get('activeRemotePlayers') ?? 0,
      activeListeners: this.gauges.get('activeListeners') ?? 0,
      mountedModals: this.gauges.get('mountedModals') ?? 0,
      mountedHudPanels: this.gauges.get('mountedHudPanels') ?? 0,
      activeAnimations: this.gauges.get('activeAnimations') ?? 0,
      activeParticles: this.gauges.get('activeParticles') ?? 0,
      activeTextures: this.gauges.get('activeTextures') ?? 0,
      estimatedTextureBytes: this.gauges.get('estimatedTextureBytes') ?? 0,
    };
  }
}

export const runtimeDevelopmentMetrics = new DevelopmentPerformanceMetrics(import.meta.env.DEV);
