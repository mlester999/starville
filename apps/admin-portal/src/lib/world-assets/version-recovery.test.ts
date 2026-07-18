import { describe, expect, it, vi } from 'vitest';

import {
  canonicalWorldAssetPath,
  canonicalWorldAssetVersionPath,
  resolveAssetVersionRead,
  type AssetVersionRecoveryLog,
} from './version-recovery';

const assetId = '36f4dc81-50f0-4ebd-81f0-f014b27217a5';
const versionTwoId = '9a03dc7d-1039-4841-8680-40775c9b08de';
const versionOneId = 'ee26ba4b-d21c-4b35-9fd4-c7c565f30f4e';

function apiFailure(status: number): Error & { readonly status: number } {
  return Object.assign(new Error('safe test failure'), { status });
}

describe('world asset version URL recovery', () => {
  it('builds both Tree Pine Inspect links from canonical UUIDs and the plural route segment', () => {
    expect(canonicalWorldAssetVersionPath(assetId, versionTwoId)).toBe(
      `/world-assets/${assetId}/versions/${versionTwoId}`,
    );
    expect(canonicalWorldAssetVersionPath(assetId, versionOneId)).toBe(
      `/world-assets/${assetId}/versions/${versionOneId}`,
    );
    expect(canonicalWorldAssetVersionPath(assetId, versionTwoId)).not.toContain('/version/');
    expect(canonicalWorldAssetVersionPath(assetId, versionTwoId)).not.toMatch(/\/versions\/2$/u);
    expect(canonicalWorldAssetVersionPath(assetId, versionOneId)).not.toMatch(/\/versions\/1$/u);
  });

  it('returns a stale version URL safely to the canonical asset', async () => {
    const events: AssetVersionRecoveryLog[] = [];
    const canonical = { asset: { id: assetId } } as never;

    await expect(
      resolveAssetVersionRead({
        loadVersion: async () => Promise.reject(apiFailure(404)),
        loadCanonicalAsset: async () => canonical,
        log: (event) => events.push(event),
      }),
    ).resolves.toEqual({ kind: 'recover', asset: canonical });
    expect(events).toEqual([
      { requestStage: 'version_detail_read', errorCategory: 'version_not_found' },
    ]);
    expect(canonicalWorldAssetPath(assetId)).toBe(`/world-assets/${assetId}`);
  });

  it('does not invent a canonical record when both asset and version are missing', async () => {
    await expect(
      resolveAssetVersionRead({
        loadVersion: async () => Promise.reject(apiFailure(404)),
        loadCanonicalAsset: async () => Promise.reject(apiFailure(404)),
        log: vi.fn(),
      }),
    ).resolves.toEqual({ kind: 'missing_asset' });
  });

  it('returns a retryable state for a temporary version-read failure', async () => {
    const loadCanonicalAsset = vi.fn();
    await expect(
      resolveAssetVersionRead({
        loadVersion: async () => Promise.reject(apiFailure(503)),
        loadCanonicalAsset,
        log: vi.fn(),
      }),
    ).resolves.toEqual({ kind: 'retryable' });
    expect(loadCanonicalAsset).not.toHaveBeenCalled();
  });

  it('opens a valid canonical Tree Pine version without recovery', async () => {
    const detail = {
      asset: { id: assetId },
      version: { id: versionTwoId, lifecycleStatus: 'validated' },
    } as never;
    const loadCanonicalAsset = vi.fn();
    await expect(
      resolveAssetVersionRead({
        loadVersion: async () => detail,
        loadCanonicalAsset,
        log: vi.fn(),
      }),
    ).resolves.toEqual({ kind: 'loaded', detail });
    expect(loadCanonicalAsset).not.toHaveBeenCalled();
  });

  it('opens the active immutable Tree Pine version without recovery', async () => {
    const detail = {
      asset: { id: assetId },
      version: { id: versionOneId, lifecycleStatus: 'active' },
    } as never;
    await expect(
      resolveAssetVersionRead({
        loadVersion: async () => detail,
        loadCanonicalAsset: vi.fn(),
        log: vi.fn(),
      }),
    ).resolves.toEqual({ kind: 'loaded', detail });
  });

  it('recovers an invalid version UUID through the canonical asset without calling a version read', async () => {
    const canonical = { asset: { id: assetId } } as never;
    const events: AssetVersionRecoveryLog[] = [];
    await expect(
      resolveAssetVersionRead({
        loadCanonicalAsset: async () => canonical,
        log: (event) => events.push(event),
      }),
    ).resolves.toEqual({ kind: 'recover', asset: canonical });
    expect(events).toEqual([
      { requestStage: 'version_detail_read', errorCategory: 'invalid_version_identifier' },
    ]);
  });
});
