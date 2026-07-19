import { describe, expect, it, vi } from 'vitest';

const visualMocks = vi.hoisted(() => {
  const ambienceLayer = { metrics: {}, destroy: vi.fn() };
  const markerLayer = { metrics: {}, setState: vi.fn(), destroy: vi.fn() };
  const terrain = { getAll: vi.fn(() => []), destroy: vi.fn() };
  return {
    ambienceLayer,
    markerLayer,
    terrain,
    renderTerrain: vi.fn(() => terrain),
    renderWorldObjects: vi.fn(() => []),
    renderWorldObjectAmbience: vi.fn(() => ambienceLayer),
    renderInteractionMarkerLayer: vi.fn(() => markerLayer),
  };
});

vi.mock('phaser', () => {
  class Scene {
    public constructor(_config?: unknown) {}
  }
  return { default: { Scene, Loader: { Events: { COMPLETE: 'complete' } } } };
});

vi.mock('../rendering/terrain', () => ({
  bundledTerrainAssetKeysForManifest: vi.fn(() => []),
  renderTerrain: visualMocks.renderTerrain,
}));

vi.mock('../rendering/world-objects', () => ({
  renderWorldObjects: visualMocks.renderWorldObjects,
}));
vi.mock('../rendering/world-ambience', () => ({
  renderWorldObjectAmbience: visualMocks.renderWorldObjectAmbience,
}));
vi.mock('../rendering/interaction-markers', () => ({
  renderInteractionMarkerLayer: visualMocks.renderInteractionMarkerLayer,
}));
vi.mock('../rendering/world-asset-textures', () => ({ queueWorldAssetTextures: vi.fn(() => 0) }));

import { getPhase12ELanternSquareCandidate } from '@starville/game-content';

import type { GameRuntimeOptions } from '../contracts';
import { WorldScene } from './WorldScene';

function options(): GameRuntimeOptions {
  const manifest = getPhase12ELanternSquareCandidate().manifest;
  return {
    initialState: {
      mapId: manifest.id,
      x: 5,
      y: 6.25,
      facingDirection: 'south',
    },
    initialWorld: {
      manifest,
      versionId: '120e0000-0000-4000-8000-000000000012',
      checksum: 'e'.repeat(64),
      assetDeliveries: [],
      assetResolutionContext: 'game_test',
    },
    appearancePreset: 'moss',
    reducedMotion: false,
    collisionDebug: false,
    audioSettings: { masterVolume: 0.8, muted: false },
    callbacks: {
      onReady: vi.fn(),
      onError: vi.fn(),
      onStateChanged: vi.fn(),
      onCheckpoint: vi.fn(),
      onInteractionTarget: vi.fn(),
      onInteractionOpen: vi.fn(),
      onSettingsRequested: vi.fn(),
      onExitRequested: vi.fn(),
      onMapChanged: vi.fn(),
      onRemotePlayerSelected: vi.fn(),
      onWorldAssetFallback: vi.fn(),
      onActivityInteraction: vi.fn(),
    },
  };
}

describe('WorldScene Phase 12E visual integration', () => {
  it('mounts presentation-only ambience and semantic markers, then cleans both', () => {
    visualMocks.ambienceLayer.destroy.mockClear();
    visualMocks.markerLayer.destroy.mockClear();
    const scene = new WorldScene(options());
    Object.assign(scene, {
      tweens: { killTweensOf: vi.fn() },
      collisionDebug: undefined,
    });

    Reflect.get(scene, 'renderMap').call(scene);

    expect(visualMocks.renderWorldObjectAmbience).toHaveBeenCalledWith(
      scene,
      expect.anything(),
      [],
      expect.objectContaining({ enabled: true, reducedMotion: false, quality: 'balanced' }),
    );
    expect(visualMocks.renderInteractionMarkerLayer).toHaveBeenCalledWith(
      scene,
      expect.anything(),
      [],
      expect.objectContaining({
        assetResolutionContext: 'game_test',
        state: expect.objectContaining({ reducedMotion: false }),
      }),
    );

    Reflect.get(scene, 'clearMap').call(scene);

    expect(visualMocks.ambienceLayer.destroy).toHaveBeenCalledTimes(1);
    expect(visualMocks.markerLayer.destroy).toHaveBeenCalledTimes(1);
    expect(visualMocks.terrain.destroy).toHaveBeenCalled();
  });

  it('updates the shared marker layer when the nearest interaction target changes', () => {
    visualMocks.markerLayer.setState.mockClear();
    const config = options();
    const scene = new WorldScene(config);
    Object.assign(scene, { interactionMarkers: visualMocks.markerLayer });

    Reflect.get(scene, 'refreshInteractionTarget').call(scene);

    const selected = config.initialWorld.manifest.interactions.find(
      ({ id }) => id === 'phase7-general-store',
    );
    expect(selected).toBeDefined();
    expect(visualMocks.markerLayer.setState).toHaveBeenCalledWith(
      expect.objectContaining({ targetedInteractionId: selected!.id, reducedMotion: false }),
    );
    expect(config.callbacks.onInteractionTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: selected!.id }),
    );
  });

  it('clears a normal-world highlight when an activity has no nearby target', () => {
    visualMocks.markerLayer.setState.mockClear();
    const config = options();
    const previous = config.initialWorld.manifest.interactions.find(
      ({ id }) => id === 'phase7-general-store',
    )!;
    const scene = new WorldScene(config);
    Object.assign(scene, {
      interactionMarkers: visualMocks.markerLayer,
      currentInteraction: previous,
      activityInstance: {
        status: 'active',
        currentObjectiveKey: 'phase12e-review-objective',
        objects: [],
        instanceId: '120e0000-0000-4000-8000-000000000099',
        revision: 1,
      },
    });

    Reflect.get(scene, 'refreshInteractionTarget').call(scene);

    expect(visualMocks.markerLayer.setState).toHaveBeenCalledWith(
      expect.objectContaining({ targetedInteractionId: null }),
    );
    expect(config.callbacks.onInteractionTarget).toHaveBeenCalledWith(null);
    expect(Reflect.get(scene, 'currentInteraction')).toBeUndefined();
  });
});
