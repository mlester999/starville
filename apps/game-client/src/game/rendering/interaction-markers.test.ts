import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Loader: {
      Events: {
        COMPLETE: 'complete',
        FILE_LOAD_ERROR: 'loaderror',
      },
    },
  },
}));

import {
  resolveAssetSource,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import { getPhase12ELanternSquareCandidate } from '@starville/game-content';

import { resolvedWorldAssetTextureKey } from './world-asset-textures';
import {
  renderInteractionMarkerLayer,
  resolveInteractionMarkerMedia,
  resolveInteractionMarkerPresentation,
} from './interaction-markers';

function bundledCandidateDelivery(assetKey: string): WorldAssetDelivery {
  const resolved = resolveAssetSource({
    assetKey,
    context: 'game_test',
    preferredBundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  });
  return {
    assetKey,
    versionId: '120e0000-0000-4000-8000-000000000002',
    checksum: '2'.repeat(64),
    materialClass: 'bundled_candidate',
    bundledManifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    url: null,
    mediaType: null,
    width: null,
    height: null,
    renderWidth: null,
    renderHeight: null,
    scale: resolved.render.scale,
    anchorX: resolved.render.anchor.x,
    anchorY: resolved.render.anchor.y,
    footAnchorX: resolved.render.footAnchor.x,
    footAnchorY: resolved.render.footAnchor.y,
    depthAnchorX: resolved.render.depthAnchor.x,
    depthAnchorY: resolved.render.depthAnchor.y,
    collision: resolved.render.collision,
    supportedRotations: [...resolved.render.supportedRotations],
    defaultRotation: resolved.render.defaultRotation,
    developmentMarker: true,
  };
}

function chainableGameObject() {
  const target = {};
  return new Proxy(target, {
    get(value, property, receiver) {
      if (Reflect.has(value, property)) return Reflect.get(value, property, receiver);
      const method = vi.fn(() => receiver);
      Reflect.set(value, property, method);
      return method;
    },
  });
}

describe('semantic interaction markers', () => {
  const manifest = getPhase12ELanternSquareCandidate().manifest;
  const guide = manifest.interactions.find(({ type }) => type === 'starter_npc')!;
  const shop = manifest.interactions.find(({ type }) => type === 'shop')!;

  it('uses one deterministic priority model for target, unavailable, quest, onboarding, and landmarks', () => {
    expect(resolveInteractionMarkerPresentation(guide).role).toBe('onboarding');
    expect(resolveInteractionMarkerPresentation(shop).role).toBe('landmark');
    expect(
      resolveInteractionMarkerPresentation(shop, {
        questRelevantInteractionIds: new Set([shop.id]),
      }).role,
    ).toBe('quest');
    expect(
      resolveInteractionMarkerPresentation(shop, {
        questRelevantInteractionIds: new Set([shop.id]),
        unavailableInteractionIds: new Set([shop.id]),
      }).role,
    ).toBe('unavailable');
    expect(
      resolveInteractionMarkerPresentation(shop, {
        targetedInteractionId: shop.id,
        unavailableInteractionIds: new Set([shop.id]),
      }).role,
    ).toBe('target');
  });

  it('retains static high-contrast communication with Reduced Motion', () => {
    const presentation = resolveInteractionMarkerPresentation(shop, {
      targetedInteractionId: shop.id,
      reducedMotion: true,
      highContrast: true,
    });
    expect(presentation.animated).toBe(false);
    expect(presentation.ringWidth).toBe(4);
    expect(presentation.ringAlpha).toBeGreaterThan(0.8);
  });

  it('selects exact V2 marker media and diagnoses immutable V1 fallback without changing pins', () => {
    const delivery = bundledCandidateDelivery('ui.interaction');
    const v2 = resolveAssetSource({
      assetKey: 'ui.interaction',
      context: 'game_test',
      exactPinned: {
        sourceKind: 'bundled',
        identity: 'phase12e-test-v2',
        versionId: delivery.versionId,
        bundledManifestVersion: delivery.bundledManifestVersion,
        eligible: true,
        url: null,
        thumbnailUrl: null,
        checksum: delivery.checksum,
        render: null,
      },
    });
    const v1 = resolveAssetSource({ assetKey: 'ui.interaction', context: 'game_test' });

    const exact = resolveInteractionMarkerMedia({
      scene: {
        textures: { exists: vi.fn((key: string) => key === resolvedWorldAssetTextureKey(v2)) },
      } as never,
      assetKey: 'ui.interaction',
      context: 'game_test',
      delivery,
    });
    expect(exact.source).toBe('exact_delivery');
    expect(exact.asset?.bundled.bundledVersion).toBe('2.0.0');

    const fallback = resolveInteractionMarkerMedia({
      scene: {
        textures: { exists: vi.fn((key: string) => key === resolvedWorldAssetTextureKey(v1)) },
      } as never,
      assetKey: 'ui.interaction',
      context: 'game_test',
      delivery,
    });
    expect(fallback.source).toBe('bundled_v1_fallback');
    expect(fallback.asset?.bundled.bundledVersion).toBe('1.0.0');
  });

  it('rerenders only when semantic state changes and cleans every marker tween/node', () => {
    const nodes: object[] = [];
    const scene = {
      textures: { exists: vi.fn(() => false) },
      add: {
        graphics: vi.fn(() => {
          const node = chainableGameObject();
          nodes.push(node);
          return node;
        }),
        image: vi.fn(() => {
          const node = chainableGameObject();
          nodes.push(node);
          return node;
        }),
      },
      tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    };
    const layer = renderInteractionMarkerLayer(scene as never, manifest, [], {
      state: { reducedMotion: false },
    });
    const initialGraphicsCalls = scene.add.graphics.mock.calls.length;
    expect(layer.metrics.markerCount).toBe(manifest.interactions.length);
    expect(layer.metrics.proceduralCount).toBe(manifest.interactions.length);

    layer.setState({ reducedMotion: false });
    expect(scene.add.graphics).toHaveBeenCalledTimes(initialGraphicsCalls);

    layer.setState({ targetedInteractionId: shop.id, reducedMotion: false });
    expect(scene.add.graphics.mock.calls.length).toBeGreaterThan(initialGraphicsCalls);
    expect(layer.metrics.animatedMarkerCount).toBeGreaterThan(0);

    const nodesBeforeDestroy = nodes.filter(
      (node) => Reflect.get(node, 'destroy')?.mock.calls.length === 0,
    );
    const activeAnimations = layer.metrics.animatedMarkerCount;
    layer.destroy();
    layer.destroy();
    expect(scene.tweens.killTweensOf).toHaveBeenCalledTimes(
      manifest.interactions.filter(({ type }) => type === 'starter_npc').length + activeAnimations,
    );
    for (const node of nodesBeforeDestroy) {
      expect(Reflect.get(node, 'destroy')).toHaveBeenCalledTimes(1);
    }
  });
});
