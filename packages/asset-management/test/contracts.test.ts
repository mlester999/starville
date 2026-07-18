import { describe, expect, it } from 'vitest';

import {
  ASSET_TYPES,
  ASSET_TYPE_PROFILES,
  assetCollisionProfileSchema,
  assetMutationResponseSchema,
  assetRenderConfigurationSchema,
  normalizeAssetSlug,
  worldAssetDeliverySchema,
} from '../src';

describe('asset management foundation contracts', () => {
  it('defines one strict validation profile for every supported type', () => {
    expect(ASSET_TYPE_PROFILES.size).toBe(ASSET_TYPES.length);
    for (const type of ASSET_TYPES) expect(ASSET_TYPE_PROFILES.get(type)?.type).toBe(type);
  });

  it('normalizes display text into a bounded path-safe slug', () => {
    expect(normalizeAssetSlug('  Moonpetal Café Chair  ')).toBe('moonpetal-cafe-chair');
  });

  it('rejects invalid collision and rotation configurations', () => {
    expect(
      assetCollisionProfileSchema.safeParse({
        shape: 'capsule',
        blocking: true,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        radius: 0.4,
      }).success,
    ).toBe(false);
    expect(
      assetRenderConfigurationSchema.safeParse({
        renderWidth: 256,
        renderHeight: 256,
        scale: 1,
        anchor: { x: 0.5, y: 1 },
        footAnchor: { x: 0.5, y: 1 },
        depthAnchor: { x: 0.5, y: 1 },
        supportedRotations: [0, 90],
        defaultRotation: 180,
      }).success,
    ).toBe(false);
    expect(
      assetRenderConfigurationSchema.safeParse({
        renderWidth: 256,
        renderHeight: 256,
        scale: 1,
        anchor: { x: 0.5, y: 1 },
        footAnchor: { x: 0.5, y: 1 },
        depthAnchor: { x: 0.5, y: 1 },
        supportedRotations: [0, 0],
        defaultRotation: 0,
      }).success,
    ).toBe(false);
  });

  it('keeps private paths out of the published delivery descriptor', () => {
    const parsed = worldAssetDeliverySchema.parse({
      assetKey: 'willow-chair',
      versionId: '00000000-0000-4000-8000-000000000001',
      checksum: 'a'.repeat(64),
      bundledManifestVersion: null,
      url: 'https://assets.example.test/game-assets/starville/willow-chair/v1/source.webp',
      mediaType: 'image/webp',
      width: 512,
      height: 512,
      renderWidth: 256,
      renderHeight: 256,
      scale: 1,
      anchorX: 0.5,
      anchorY: 1,
      footAnchorX: 0.5,
      footAnchorY: 1,
      depthAnchorX: 0.5,
      depthAnchorY: 1,
      collision: { shape: 'none', blocking: false },
      supportedRotations: [0],
      defaultRotation: 0,
      developmentMarker: false,
    });

    expect(parsed.url).toContain('/v1/source.webp');
    expect('storagePath' in parsed).toBe(false);
  });

  it('requires repository fallbacks to remain file-free', () => {
    expect(
      worldAssetDeliverySchema.safeParse({
        assetKey: 'phase7-farm-plot-marker',
        versionId: '00000000-0000-4000-8000-000000000002',
        checksum: 'b'.repeat(64),
        bundledManifestVersion: '1.0.0',
        url: null,
        mediaType: null,
        width: null,
        height: null,
        renderWidth: null,
        renderHeight: null,
        scale: 1,
        anchorX: 0.5,
        anchorY: 1,
        footAnchorX: 0.5,
        footAnchorY: 1,
        depthAnchorX: 0.5,
        depthAnchorY: 1,
        collision: { shape: 'none', blocking: false },
        supportedRotations: [0],
        defaultRotation: 0,
        developmentMarker: true,
      }).success,
    ).toBe(true);
  });

  it('accepts unresolved legacy repository pins without letting uploads claim a manifest', () => {
    const common = {
      assetKey: 'phase7-farm-plot-marker',
      versionId: '00000000-0000-4000-8000-000000000002',
      checksum: 'b'.repeat(64),
      scale: 1,
      anchorX: 0.5,
      anchorY: 1,
      footAnchorX: 0.5,
      footAnchorY: 1,
      depthAnchorX: 0.5,
      depthAnchorY: 1,
      collision: { shape: 'none', blocking: false },
      supportedRotations: [0],
      defaultRotation: 0,
    } as const;
    expect(
      worldAssetDeliverySchema.safeParse({
        ...common,
        bundledManifestVersion: null,
        url: null,
        mediaType: null,
        width: null,
        height: null,
        renderWidth: null,
        renderHeight: null,
        developmentMarker: true,
      }).success,
    ).toBe(true);
    expect(
      worldAssetDeliverySchema.safeParse({
        ...common,
        bundledManifestVersion: '1.0.0',
        url: 'https://assets.example.test/starville/phase7-farm-plot-marker/v2/source.webp',
        mediaType: 'image/webp',
        width: 128,
        height: 128,
        renderWidth: 128,
        renderHeight: 128,
        developmentMarker: false,
      }).success,
    ).toBe(false);
  });

  it('recognizes archived as a terminal asset mutation lifecycle', () => {
    expect(assetMutationResponseSchema.shape.status.parse('archived')).toBe('archived');
    expect(assetMutationResponseSchema.shape.status.parse('bundled_default_restored')).toBe(
      'bundled_default_restored',
    );
  });
});
