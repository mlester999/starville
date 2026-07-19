import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isPositionWalkable,
  lanternSquareManifest,
  PLAYER_FOOT_RADIUS,
  STARVILLE_VISUAL_TOKENS,
  type MapManifest,
  type PlayerStateUpdate,
} from '@starville/game-core';
import { getPhase7LocalDraft } from '@starville/game-content';

import { selectVisibleWorldChatBubbles } from '../game/rendering/chat-bubbles';

import {
  PHASE12C_VISUAL_REVIEW_BUBBLE_CAP,
  PHASE12C_VISUAL_REVIEW_PLAYER_CAP,
  createPhase12CWorldGameTestFixture,
  phase12CGameCanvasVisualSettings,
  type Phase12CDepthMode,
  type Phase12CParticipantMode,
} from './phase12c-world-game-test-fixture';

const VISUAL_CLOCK_MS = Date.parse('2026-07-18T04:00:00.000Z');

const manifest: Pick<MapManifest, 'id' | 'objects' | 'safeSaveBounds' | 'collisions'> = {
  id: 'lantern-square',
  safeSaveBounds: { minX: 1, minY: 1, maxX: 31, maxY: 31 },
  collisions: [],
  objects: [
    {
      id: 'tree.depth-anchor',
      assetId: 'nature.tree.oak',
      kind: 'tree',
      x: 12,
      y: 10,
      scale: 1,
    },
    {
      id: 'building.depth-anchor',
      assetId: 'structure.general-store',
      kind: 'building',
      x: 20,
      y: 18,
      scale: 1,
    },
  ],
};

const baseState: PlayerStateUpdate = {
  mapId: 'lantern-square',
  x: 16,
  y: 16,
  facingDirection: 'south',
};

function fixture(
  participantMode: Phase12CParticipantMode = 'eleven-players',
  depthMode: Phase12CDepthMode = 'overview',
) {
  return createPhase12CWorldGameTestFixture({
    manifest,
    baseState,
    worldVersionId: '12000000-0000-4000-8000-000000000001',
    participantMode,
    depthMode,
    bubblesEnabled: true,
    visualClockMs: VISUAL_CLOCK_MS,
  });
}

describe('Phase 12C local World Game Test fixture', () => {
  it('is deterministic for an injected clock and exact world revision', () => {
    expect(fixture()).toEqual(fixture());
    expect(
      fixture().remotePresences.every(
        (presence) =>
          presence.worldId === manifest.id &&
          presence.worldVersionId === '12000000-0000-4000-8000-000000000001',
      ),
    ).toBe(true);
  });

  it('provides exactly one-player and eleven-player modes without exceeding caps', () => {
    const solo = fixture('one-player');
    const crowd = fixture('eleven-players');
    expect(solo.totalPlayerCount).toBe(1);
    expect(solo.remotePresences).toHaveLength(0);
    expect(crowd.totalPlayerCount).toBe(PHASE12C_VISUAL_REVIEW_PLAYER_CAP);
    expect(crowd.remotePresences).toHaveLength(PHASE12C_VISUAL_REVIEW_PLAYER_CAP - 1);
    expect(new Set(crowd.remotePresences.map(({ presenceId }) => presenceId)).size).toBe(
      crowd.remotePresences.length,
    );
    expect(
      crowd.remotePresences.every(({ x, y }) =>
        isPositionWalkable(
          { x, y },
          PLAYER_FOOT_RADIUS,
          manifest.safeSaveBounds,
          manifest.collisions,
        ),
      ),
    ).toBe(true);
    const allPositions = [crowd.localState, ...crowd.remotePresences];
    for (const [index, position] of allPositions.entries()) {
      expect(
        allPositions.every(
          (other, otherIndex) =>
            index === otherIndex || Math.hypot(position.x - other.x, position.y - other.y) >= 0.75,
        ),
      ).toBe(true);
    }
  });

  it('caps active safe chat bubbles and associates them only with fixture participants', () => {
    const crowd = fixture();
    const solo = fixture('one-player');
    expect(crowd.chatBubbleMessages).toHaveLength(PHASE12C_VISUAL_REVIEW_BUBBLE_CAP);
    expect(solo.chatBubbleMessages).toHaveLength(1);
    expect(solo.chatBubbleMessages[0]?.local).toBe(true);
    const remoteIds = new Set(crowd.remotePresences.map(({ presenceId }) => presenceId));
    expect(
      crowd.chatBubbleMessages.every(
        (message) =>
          message.sentAt === '2026-07-18T04:00:00.000Z' &&
          message.text.length <= 180 &&
          !/[<>]|(?:https?:\/\/|www\.)/iu.test(message.text) &&
          (message.local === true ||
            (message.senderPresenceId !== null && remoteIds.has(message.senderPresenceId))),
      ),
    ).toBe(true);
    expect(
      createPhase12CWorldGameTestFixture({
        manifest,
        baseState,
        worldVersionId: '12000000-0000-4000-8000-000000000001',
        participantMode: 'eleven-players',
        depthMode: 'overview',
        bubblesEnabled: false,
        visualClockMs: VISUAL_CLOCK_MS,
      }).chatBubbleMessages,
    ).toEqual([]);

    expect(
      selectVisibleWorldChatBubbles({
        messages: crowd.chatBubbleMessages,
        worldId: manifest.id,
        visiblePresenceIds: remoteIds,
        now: VISUAL_CLOCK_MS,
        quality: 'balanced',
      }),
    ).toHaveLength(PHASE12C_VISUAL_REVIEW_BUBBLE_CAP);
  });

  it('places the player on both sides of canonical tree and building depth anchors', () => {
    for (const [behindMode, frontMode, targetId] of [
      ['tree-behind', 'tree-front', 'tree.depth-anchor'],
      ['building-behind', 'building-front', 'building.depth-anchor'],
    ] as const) {
      const behind = fixture('one-player', behindMode);
      const front = fixture('one-player', frontMode);
      const target = manifest.objects.find((object) => object.id === targetId)!;
      const targetDepth = target.x + target.y;
      expect(behind.depthTargetId).toBe(targetId);
      expect(front.depthTargetId).toBe(targetId);
      expect(behind.localState.x + behind.localState.y).toBeLessThan(targetDepth);
      expect(front.localState.x + front.localState.y).toBeGreaterThan(targetDepth);
      expect(behind.depthInstruction).toContain('behind');
      expect(front.depthInstruction).toContain('in front');
    }
  });

  it('keeps all depth and crowd placements collision-safe on published and local Lantern Square', () => {
    const manifests = [
      lanternSquareManifest(),
      getPhase7LocalDraft('lantern-square').manifest,
    ] as const;
    const depthModes: readonly Phase12CDepthMode[] = [
      'overview',
      'tree-behind',
      'tree-front',
      'building-behind',
      'building-front',
    ];

    for (const realManifest of manifests) {
      const spawn = realManifest.spawns.find(({ id }) => id === realManifest.defaultSpawnId);
      if (spawn === undefined) throw new Error('Lantern Square default spawn is unavailable');
      for (const depthMode of depthModes) {
        const realFixture = createPhase12CWorldGameTestFixture({
          manifest: realManifest,
          baseState: {
            mapId: realManifest.id,
            x: spawn.x,
            y: spawn.y,
            facingDirection: spawn.facingDirection,
          },
          worldVersionId: '12000000-0000-4000-8000-000000000001',
          participantMode: 'eleven-players',
          depthMode,
          bubblesEnabled: true,
          visualClockMs: VISUAL_CLOCK_MS,
        });
        const positions = [realFixture.localState, ...realFixture.remotePresences];
        expect(realFixture.remotePresences).toHaveLength(10);
        expect(
          positions.every((position) =>
            isPositionWalkable(
              position,
              PLAYER_FOOT_RADIUS,
              realManifest.safeSaveBounds,
              realManifest.collisions,
            ),
          ),
        ).toBe(true);
        expect(new Set(positions.map(({ x, y }) => `${x.toFixed(4)}:${y.toFixed(4)}`)).size).toBe(
          positions.length,
        );
        for (const [index, position] of positions.entries()) {
          expect(
            positions.every(
              (other, otherIndex) =>
                index === otherIndex ||
                Math.hypot(position.x - other.x, position.y - other.y) >= 0.75,
            ),
          ).toBe(true);
        }
        expect(
          realFixture.remotePresences.every(
            (presence) =>
              Math.hypot(
                presence.x - realFixture.localState.x,
                presence.y - realFixture.localState.y,
              ) <= STARVILLE_VISUAL_TOKENS.chatBubbles.hiddenDistance,
          ),
        ).toBe(true);

        if (depthMode !== 'overview') {
          const target = realManifest.objects.find(({ id }) => id === realFixture.depthTargetId);
          if (target === undefined) throw new Error('Expected real depth target is unavailable');
          const fixtureDepth = realFixture.localState.x + realFixture.localState.y;
          const targetDepth = target.x + target.y;
          if (depthMode.endsWith('front')) expect(fixtureDepth).toBeGreaterThan(targetDepth);
          else expect(fixtureDepth).toBeLessThan(targetDepth);
        }
      }
    }
  });

  it('maps normal and low modes to production renderer settings with safe low-mode caps', () => {
    expect(
      phase12CGameCanvasVisualSettings({
        quality: 'normal',
        shadows: true,
        ambientEffects: true,
        animatedWater: true,
        labels: true,
        chatBubbles: true,
      }),
    ).toEqual({
      quality: 'balanced',
      shadows: true,
      ambientEffects: true,
      animatedWater: true,
      remoteLabels: true,
      chatBubbles: true,
    });
    expect(
      phase12CGameCanvasVisualSettings({
        quality: 'low',
        shadows: true,
        ambientEffects: true,
        animatedWater: true,
        labels: false,
        chatBubbles: false,
      }),
    ).toEqual({
      quality: 'low',
      shadows: false,
      ambientEffects: false,
      animatedWater: false,
      remoteLabels: false,
      chatBubbles: false,
    });
  });

  it('contains no persistence, economy, telemetry, or public realtime client dependency', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/phase12c-world-game-test-fixture.ts'),
      'utf8',
    );
    for (const forbidden of [
      'app/realtime-client',
      'app/player-client',
      'usePlayerPersistence',
      'useRealtimePresence',
      'requestPlayerApi',
      'telemetry',
      'analytics',
      'localStorage',
      'sessionStorage',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
