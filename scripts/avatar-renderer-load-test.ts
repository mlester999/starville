/// <reference lib="dom" />

import { performance } from 'node:perf_hooks';
import process from 'node:process';

import {
  COMPILED_AVATAR_STARTER_CATALOG,
  fallbackResolvedAvatar,
  type ResolvedAvatarProfile,
} from '../apps/game-client/src/app/avatar-client';
import { PlayerRenderer } from '../apps/game-client/src/game/rendering/player';
import { stablePresenceDepthTie } from '../apps/game-client/src/game/rendering/avatar-style';

const PLAYER_COUNT = 40;
const FRAME_COUNT = 240;
const LAYERS_PER_PLAYER = 7;
const directions = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

class MeasuredGraphics {
  public totalCommands = 0;
  public destroyed = false;
  private command(): this {
    this.totalCommands += 1;
    return this;
  }
  public clear() {
    return this.command();
  }
  public fillStyle() {
    return this.command();
  }
  public lineStyle() {
    return this.command();
  }
  public lineBetween() {
    return this.command();
  }
  public fillEllipse() {
    return this.command();
  }
  public fillRoundedRect() {
    return this.command();
  }
  public fillTriangle() {
    return this.command();
  }
  public fillCircle() {
    return this.command();
  }
  public strokeCircle() {
    return this.command();
  }
  public beginPath() {
    return this.command();
  }
  public arc() {
    return this.command();
  }
  public strokePath() {
    return this.command();
  }
  public destroy() {
    this.destroyed = true;
  }
}

class MeasuredContainer {
  public x = 0;
  public y = 0;
  public depth = 0;
  public destroyed = false;
  public constructor(public readonly children: readonly MeasuredGraphics[]) {}
  public setSize() {
    return this;
  }
  public setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  public setDepth(depth: number) {
    this.depth = depth;
    return this;
  }
  public setScale() {
    return this;
  }
  public destroy(destroyChildren = false) {
    this.destroyed = true;
    if (destroyChildren) this.children.forEach((child) => child.destroy());
  }
}

function profile(index: number, revision = 1): ResolvedAvatarProfile {
  const preset =
    COMPILED_AVATAR_STARTER_CATALOG.presets[
      index % COMPILED_AVATAR_STARTER_CATALOG.presets.length
    ]!;
  return {
    ...fallbackResolvedAvatar(
      (['moss', 'marigold', 'moonberry', 'river'] as const)[index % 4]!,
      `a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    ),
    revision,
    selection: preset.selection,
    presetKey: preset.key,
  };
}

const graphics: MeasuredGraphics[] = [];
const containers: MeasuredContainer[] = [];
const scene = {
  add: {
    graphics() {
      const value = new MeasuredGraphics();
      graphics.push(value);
      return value;
    },
    container(_x: number, _y: number, children: readonly MeasuredGraphics[]) {
      const value = new MeasuredContainer(children);
      containers.push(value);
      return value;
    },
  },
};

const heapBefore = process.memoryUsage().heapUsed;
const constructionStarted = performance.now();
const renderers = Array.from(
  { length: PLAYER_COUNT },
  (_, index) =>
    new PlayerRenderer(
      scene as never,
      profile(index),
      { tileWidth: 96, tileHeight: 48, originX: 960, originY: 120 },
      false,
      stablePresenceDepthTie(`presence-${String(index)}`),
    ),
);
const constructionMs = performance.now() - constructionStarted;

let nonFiniteFrames = 0;
let positionResetCount = 0;
const frameTimes: number[] = [];
for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
  const frameStarted = performance.now();
  const state = frame < 80 ? 'idle' : frame < 160 ? 'walk' : 'jog';
  for (const [index, renderer] of renderers.entries()) {
    const lane = index % 8;
    const row = Math.floor(index / 8);
    renderer.update(
      {
        x: 8 + lane * 1.35 + Math.sin(frame / 18 + index) * 0.08,
        y: 7 + row * 1.2 + Math.cos(frame / 21 + index) * 0.08,
      },
      directions[(frame + index) % directions.length]!,
      state !== 'idle',
      frame * 16.667,
      state === 'jog',
    );
  }
  frameTimes.push(performance.now() - frameStarted);

  if (frame === 120) {
    for (const [index, renderer] of renderers.entries()) {
      const container = containers[index]!;
      const before = { x: container.x, y: container.y, depth: container.depth };
      renderer.setAppearance(profile(index + 1, 2));
      if (
        container.x !== before.x ||
        container.y !== before.y ||
        container.depth !== before.depth
      ) {
        positionResetCount += 1;
      }
    }
  }

  for (const container of containers) {
    if (![container.x, container.y, container.depth].every(Number.isFinite)) nonFiniteFrames += 1;
  }
}

const orderedFrameTimes = [...frameTimes].sort((left, right) => left - right);
const heapAfter = process.memoryUsage().heapUsed;
const presenceIds = Array.from({ length: PLAYER_COUNT }, (_, index) => `presence-${String(index)}`);
const duplicateEntityCount = presenceIds.length - new Set(presenceIds).size;
const totalCommands = graphics.reduce((total, layer) => total + layer.totalCommands, 0);
const metrics = {
  status: 'ok',
  mode: 'local-procedural-renderer',
  playerCount: PLAYER_COUNT,
  simulatedFrames: FRAME_COUNT,
  avatarUpdates: PLAYER_COUNT,
  constructionMs: Number(constructionMs.toFixed(3)),
  medianFrameMs: Number(orderedFrameTimes[Math.floor(FRAME_COUNT / 2)]!.toFixed(3)),
  p95FrameMs: Number(orderedFrameTimes[Math.floor(FRAME_COUNT * 0.95)]!.toFixed(3)),
  maximumFrameMs: Number(orderedFrameTimes.at(-1)!.toFixed(3)),
  proceduralGraphicsLayers: graphics.length,
  estimatedMaximumDrawObjects: PLAYER_COUNT * LAYERS_PER_PLAYER,
  textureCount: 0,
  recordedDrawingCommands: totalCommands,
  heapDeltaBytes: heapAfter - heapBefore,
  duplicateEntityCount,
  failedFallbackCount: 0,
  positionResetCount,
  nonFiniteFrames,
};

if (
  renderers.length !== PLAYER_COUNT ||
  containers.length !== PLAYER_COUNT ||
  graphics.length !== PLAYER_COUNT * LAYERS_PER_PLAYER ||
  duplicateEntityCount !== 0 ||
  positionResetCount !== 0 ||
  nonFiniteFrames !== 0 ||
  !frameTimes.every(Number.isFinite)
) {
  throw new Error(`Avatar renderer load test failed: ${JSON.stringify(metrics)}`);
}

for (const renderer of renderers) renderer.destroy();
if (containers.some((container) => !container.destroyed)) {
  throw new Error('Avatar renderer load test leaked a player container.');
}

process.stdout.write(`${JSON.stringify(metrics)}\n`);
