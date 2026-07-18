import { describe, expect, it, vi } from 'vitest';

const remoteInstances = vi.hoisted(
  () =>
    [] as Array<{
      readonly presenceId: string;
      readonly destroy: ReturnType<typeof vi.fn>;
      readonly push: ReturnType<typeof vi.fn>;
      readonly setAppearance: ReturnType<typeof vi.fn>;
      readonly setSelected: ReturnType<typeof vi.fn>;
      readonly setNameplateVisible: ReturnType<typeof vi.fn>;
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
    public constructor(_scene: unknown, presence: { presenceId: string }) {
      this.record = {
        presenceId: presence.presenceId,
        destroy: vi.fn(),
        push: vi.fn(),
        setAppearance: vi.fn(),
        setSelected: vi.fn(),
        setNameplateVisible: vi.fn(),
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
  },
}));

import type { PublicPresence } from '@starville/realtime';
import { lanternSquareManifest } from '@starville/game-core';

import { fallbackResolvedAvatar } from '../../app/avatar-client';
import type { GameRuntimeOptions } from '../contracts';
import { WorldScene } from './WorldScene';

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
});
