import { describe, expect, it, vi } from 'vitest';

const remoteInstances = vi.hoisted(
  () =>
    [] as Array<{
      readonly presenceId: string;
      readonly rendererMode: string;
      readonly destroy: ReturnType<typeof vi.fn>;
      readonly push: ReturnType<typeof vi.fn>;
      readonly setAppearance: ReturnType<typeof vi.fn>;
      readonly setSelected: ReturnType<typeof vi.fn>;
      readonly setNameplateVisible: ReturnType<typeof vi.fn>;
      readonly setVisualSettings: ReturnType<typeof vi.fn>;
      readonly setChatBubble: ReturnType<typeof vi.fn>;
      readonly setReducedMotion: ReturnType<typeof vi.fn>;
    }>,
);

vi.mock('phaser', () => {
  class Scene {
    public constructor(_options?: unknown) {}
  }
  return { default: { Scene } };
});

vi.mock('../rendering/remote-player', () => ({
  RemotePlayerRenderer: class {
    public readonly record;
    public constructor(
      _scene: unknown,
      presence: { presenceId: string },
      _projection: unknown,
      _reducedMotion: boolean,
      _onSelect: unknown,
      _visualSettings: unknown,
      rendererMode: string,
    ) {
      this.record = {
        presenceId: presence.presenceId,
        rendererMode,
        destroy: vi.fn(),
        push: vi.fn(),
        setAppearance: vi.fn(),
        setSelected: vi.fn(),
        setNameplateVisible: vi.fn(),
        setVisualSettings: vi.fn(),
        setChatBubble: vi.fn(),
        setReducedMotion: vi.fn(),
      };
      remoteInstances.push(this.record);
    }
    public destroy() {
      this.record.destroy();
    }
    public push(...args: unknown[]) {
      this.record.push(...args);
    }
    public setAppearance(...args: unknown[]) {
      this.record.setAppearance(...args);
    }
    public setSelected(...args: unknown[]) {
      this.record.setSelected(...args);
    }
    public setNameplateVisible(...args: unknown[]) {
      this.record.setNameplateVisible(...args);
    }
    public setVisualSettings(...args: unknown[]) {
      this.record.setVisualSettings(...args);
    }
    public setChatBubble(...args: unknown[]) {
      this.record.setChatBubble(...args);
    }
    public setReducedMotion(...args: unknown[]) {
      this.record.setReducedMotion(...args);
    }
  },
}));

import type { PublicPresence } from '@starville/realtime';
import { lanternSquareManifest } from '@starville/game-core';

import { fallbackResolvedAvatar } from '../../app/avatar-client';
import type { GameRuntimeOptions } from '../contracts';
import { productionSliceInteriorCameraFrame, WorldScene } from './WorldScene';

const presence = (
  presenceId: string,
  worldId: PublicPresence['worldId'] = 'lantern-square',
): PublicPresence => ({
  presenceId,
  displayName: 'Fern Friend',
  level: 3,
  worldId,
  worldVersionId: '11111111-1111-4111-8111-111111111111',
  channelId: 'channel-1',
  channelNumber: 1,
  x: 13,
  y: 7,
  facingDirection: 'south',
  movementState: 'idle',
  appearancePreset: 'river',
  sequence: 1,
  connected: true,
});

const options: GameRuntimeOptions = {
  initialState: { mapId: 'lantern-square', x: 12, y: 7.5, facingDirection: 'south' },
  initialWorld: {
    manifest: lanternSquareManifest(),
    versionId: '11111111-1111-4111-8111-111111111111',
    checksum: 'a'.repeat(64),
    assetDeliveries: [],
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
    onWorldAssetFallback: vi.fn(),
    onRemotePlayerSelected: vi.fn(),
    onActivityInteraction: vi.fn(),
  },
};

describe('WorldScene avatar presence boundary', () => {
  it('fits and centers the rescued interior at desktop and mobile sizes', async () => {
    const { PRODUCTION_SLICE_V3_INTERIOR_MANIFEST } = await import('@starville/game-content');
    const desktop = productionSliceInteriorCameraFrame(PRODUCTION_SLICE_V3_INTERIOR_MANIFEST, {
      width: 1_440,
      height: 900,
    });
    const mobile = productionSliceInteriorCameraFrame(PRODUCTION_SLICE_V3_INTERIOR_MANIFEST, {
      width: 390,
      height: 844,
    });

    expect(desktop.followsPlayer).toBe(false);
    expect(mobile.followsPlayer).toBe(true);
    expect(mobile.zoom).toBeGreaterThan(desktop.zoom);
    expect(mobile.zoom).toBe(1.05);
    expect(desktop.center.x).toBeCloseTo(mobile.center.x);
    expect(desktop.center.y).toBeCloseTo(mobile.center.y);
    expect(desktop.bounds.width * desktop.zoom).toBeCloseTo(1_440);
    expect(mobile.bounds.width * mobile.zoom).toBeGreaterThan(390);
    expect(mobile.bounds.height * mobile.zoom).toBeGreaterThan(844);
  });

  it('moves through the normal collision pipeline from touch input when no keyboard exists', () => {
    const scene = new WorldScene(options);
    const player = { update: vi.fn() };
    Reflect.set(scene, 'player', player);
    const before = scene.getState();
    scene.setTouchMovementInput({ up: true, down: false, left: false, right: false });

    scene.update(1_000, 250);

    expect(scene.getState()).not.toEqual(before);
    expect(player.update).toHaveBeenCalled();
    expect(options.callbacks.onStateChanged).toHaveBeenCalledWith(
      expect.objectContaining({ mapId: before.mapId }),
      'moving',
    );
  });

  it('builds the current ID set only from the active world and releases stale renderers', () => {
    remoteInstances.length = 0;
    const scene = new WorldScene(options);
    const visible = presence('10000000-0000-4000-8000-000000000001');
    const otherWorld = presence('10000000-0000-4000-8000-000000000002', 'moonpetal-meadow');
    scene.setRemotePresences([visible, otherWorld]);
    expect(remoteInstances.map((entry) => entry.presenceId)).toEqual([visible.presenceId]);

    scene.setRemotePresences([otherWorld]);
    expect(remoteInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('applies a resolved appearance to an existing remote renderer without recreating it', () => {
    remoteInstances.length = 0;
    const scene = new WorldScene(options);
    const visible = presence('10000000-0000-4000-8000-000000000003');
    scene.setRemotePresences([visible]);
    const profile = fallbackResolvedAvatar('moonberry', '33333333-3333-4333-8333-333333333333');
    scene.setRemoteAvatarProfiles({ [visible.presenceId]: profile });
    expect(remoteInstances).toHaveLength(1);
    expect(remoteInstances[0]?.setAppearance).toHaveBeenLastCalledWith(profile);
  });

  it('does not reset an active gait when the resolved local appearance refreshes', () => {
    const scene = new WorldScene(options);
    const player = { update: vi.fn(), setAppearance: vi.fn() };
    Reflect.set(scene, 'player', player);
    Reflect.set(scene, 'wasMoving', true);
    Reflect.set(scene, 'latestJogging', true);
    const profile = fallbackResolvedAvatar('marigold');

    scene.setLocalAvatarProfile(profile);

    expect(player.setAppearance).toHaveBeenCalledWith(profile);
    expect(player.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      'jog',
      expect.any(Number),
    );
  });

  it('uses the production-slice raster renderer mode for a local remote-player fixture', () => {
    remoteInstances.length = 0;
    const scene = new WorldScene({ ...options, avatarRendererMode: 'production_slice_v3' });
    const visible = presence('10000000-0000-4000-8000-000000000005');
    scene.setRemotePresences([visible]);
    expect(remoteInstances).toHaveLength(1);
    expect(remoteInstances[0]?.rendererMode).toBe('production_slice_v3');
  });

  it('resolves low quality to shadow-free settings for existing remote villagers', () => {
    remoteInstances.length = 0;
    const scene = new WorldScene(options);
    const visible = presence('10000000-0000-4000-8000-000000000004');
    scene.setRemotePresences([visible]);
    scene.setVisualSettings({ quality: 'low', shadows: true });
    expect(remoteInstances[0]?.setVisualSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ quality: 'low', shadows: false }),
    );
  });
});
