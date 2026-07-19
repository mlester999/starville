import { describe, expect, it } from 'vitest';

import {
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import { lanternSquareManifest } from '@starville/game-core';

import type { RuntimeWorld } from '../game/contracts';
import {
  applyLocalVisualCandidateReview,
  resolveLocalVisualCandidateReview,
} from './local-visual-candidate';

const baseWorld = (): RuntimeWorld => ({
  manifest: lanternSquareManifest(),
  versionId: '11111111-1111-4111-8111-111111111111',
  checksum: 'a'.repeat(64),
  assetDeliveries: [],
});

describe('local Phase 12D visual candidate review', () => {
  it('requires development, loopback, and the exact query value on every load', () => {
    expect(
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: 'localhost',
        search: '?visual-candidate=v2',
      }),
    ).toMatchObject({
      enabled: true,
      requested: true,
      avatarRendererMode: 'phase12d_candidate',
    });
    expect(
      resolveLocalVisualCandidateReview({
        development: false,
        hostname: 'localhost',
        search: '?visual-candidate=v2',
      }).enabled,
    ).toBe(false);
    expect(
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: 'starville.example',
        search: '?visual-candidate=v2',
      }).enabled,
    ).toBe(false);
    expect(
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: '127.0.0.1',
        search: '?visual-candidate=v1',
      }).requested,
    ).toBe(false);
  });

  it('preserves the exact published world when review is disabled', () => {
    const world = baseWorld();
    const result = applyLocalVisualCandidateReview(
      world,
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: 'localhost',
        search: '',
      }),
    );
    expect(result).toBe(world);
  });

  it('rebinds supported stable keys to exact V2 without changing world geometry or identity', () => {
    const world = baseWorld();
    const result = applyLocalVisualCandidateReview(
      world,
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: '[::1]',
        search: '?visual-candidate=v2',
      }),
    );
    expect(result).not.toBe(world);
    expect(result.manifest).toBe(world.manifest);
    expect(result.manifest.objects).toBe(world.manifest.objects);
    expect(result.manifest.collisions).toBe(world.manifest.collisions);
    expect(result.versionId).toBe(world.versionId);
    expect(result.checksum).toBe(world.checksum);
    expect(result.assetResolutionContext).toBe('game_test');
    expect(result.assetDeliveries.length).toBeGreaterThan(0);
    expect(
      result.assetDeliveries.every(
        (delivery) =>
          delivery.developmentMarker &&
          delivery.bundledManifestVersion === STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
      ),
    ).toBe(true);
  });

  it('retains an exact published delivery when a stable key has no valid V2 candidate', () => {
    const publishedOnly = {
      assetKey: 'world.test.published-only',
      versionId: '22222222-2222-4222-8222-222222222222',
    } as WorldAssetDelivery;
    const world = baseWorld();
    const worldWithMissingCandidate: RuntimeWorld = {
      ...world,
      manifest: {
        ...world.manifest,
        assets: [...world.manifest.assets, publishedOnly.assetKey],
      },
      assetDeliveries: [publishedOnly],
    };
    const result = applyLocalVisualCandidateReview(
      worldWithMissingCandidate,
      resolveLocalVisualCandidateReview({
        development: true,
        hostname: 'localhost',
        search: '?visual-candidate=v2',
      }),
    );
    expect(result.assetDeliveries.find(({ assetKey }) => assetKey === publishedOnly.assetKey)).toBe(
      publishedOnly,
    );
  });
});
