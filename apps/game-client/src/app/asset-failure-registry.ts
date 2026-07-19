import type { WorldAssetFallbackEvent } from '../game/contracts';

interface PendingAssetLoad {
  readonly status: 'pending';
  readonly updatedAt: number;
}

interface FailedAssetLoad {
  readonly status: 'failed';
  readonly updatedAt: number;
  readonly requestId: string;
  readonly reports: number;
}

type AssetLoadRecord = PendingAssetLoad | FailedAssetLoad;

export interface AssetFailureRegistryOptions {
  readonly retryAfterMs?: number;
  readonly pendingExpiryMs?: number;
  readonly maximumEntries?: number;
  readonly requestId?: () => string;
  readonly now?: () => number;
}

export class AssetFailureRegistry {
  private readonly records = new Map<string, AssetLoadRecord>();
  private readonly retryAfterMs: number;
  private readonly pendingExpiryMs: number;
  private readonly maximumEntries: number;
  private readonly requestId: () => string;
  private readonly now: () => number;

  public constructor(options: AssetFailureRegistryOptions = {}) {
    this.retryAfterMs = options.retryAfterMs ?? 5 * 60_000;
    this.pendingExpiryMs = options.pendingExpiryMs ?? 30_000;
    this.maximumEntries = options.maximumEntries ?? 512;
    this.requestId = options.requestId ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
  }

  public begin(cacheIdentity: string): boolean {
    const current = this.records.get(cacheIdentity);
    const now = this.now();
    if (
      current !== undefined &&
      now - current.updatedAt <
        (current.status === 'failed' ? this.retryAfterMs : this.pendingExpiryMs)
    ) {
      return false;
    }
    this.records.delete(cacheIdentity);
    this.records.set(cacheIdentity, { status: 'pending', updatedAt: now });
    this.trim();
    return true;
  }

  public cancel(cacheIdentity: string): void {
    if (this.records.get(cacheIdentity)?.status === 'pending') this.records.delete(cacheIdentity);
  }

  public succeed(cacheIdentity: string): void {
    this.records.delete(cacheIdentity);
  }

  public fail(
    cacheIdentity: string,
    assetKey: string,
    versionId: string,
  ): { readonly event: WorldAssetFallbackEvent; readonly shouldReport: boolean } {
    const current = this.records.get(cacheIdentity);
    const requestId = current?.status === 'failed' ? current.requestId : this.requestId();
    const reports = current?.status === 'failed' ? current.reports : 0;
    this.records.delete(cacheIdentity);
    this.records.set(cacheIdentity, {
      status: 'failed',
      updatedAt: this.now(),
      requestId,
      reports: reports + 1,
    });
    this.trim();
    return {
      event: {
        code: 'WORLD_ASSET_LOAD_FAILED',
        assetKey,
        versionId,
        requestId,
      },
      shouldReport: reports === 0,
    };
  }

  public get size(): number {
    return this.records.size;
  }

  public clear(): void {
    this.records.clear();
  }

  private trim(): void {
    while (this.records.size > this.maximumEntries) {
      const oldest = this.records.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.records.delete(oldest);
    }
  }
}

export const sessionAssetFailureRegistry = new AssetFailureRegistry();
