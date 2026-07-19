import type {
  AppearancePreset,
  FacingDirection,
  MapManifest,
  PlayerStateUpdate,
  WorldVisualSettings,
} from '@starville/game-core';
import { isPositionWalkable, PLAYER_FOOT_RADIUS } from '@starville/game-core';
import type { PublicPresence } from '@starville/realtime';

import type { WorldChatBubbleMessage } from '../game/contracts';

export const PHASE12C_VISUAL_REVIEW_PLAYER_CAP = 11;
export const PHASE12C_VISUAL_REVIEW_BUBBLE_CAP = 6;

export type Phase12CParticipantMode = 'one-player' | 'eleven-players';
export type Phase12CDepthMode =
  'overview' | 'tree-behind' | 'tree-front' | 'building-behind' | 'building-front';
export type Phase12CVisualQuality = 'normal' | 'low';

interface Phase12CVisualReviewInput {
  readonly manifest: Pick<MapManifest, 'id' | 'objects' | 'safeSaveBounds' | 'collisions'>;
  readonly baseState: PlayerStateUpdate;
  readonly worldVersionId: string;
  readonly participantMode: Phase12CParticipantMode;
  readonly depthMode: Phase12CDepthMode;
  readonly bubblesEnabled: boolean;
  /** Immutable injected renderer clock keeps unit and screenshot fixtures repeatable. */
  readonly visualClockMs: number;
  /** Keeps production GameCanvas remount identity distinct across explicit review sources. */
  readonly sourceIdentity?: string;
}

export interface Phase12CWorldGameTestFixture {
  readonly canvasKey: string;
  readonly localState: PlayerStateUpdate;
  readonly remotePresences: readonly PublicPresence[];
  readonly chatBubbleMessages: readonly WorldChatBubbleMessage[];
  readonly totalPlayerCount: number;
  readonly depthTargetId: string | null;
  readonly depthInstruction: string;
}

interface CrowdMember {
  readonly presenceId: string;
  readonly displayName: string;
  readonly level: number;
  readonly appearancePreset: AppearancePreset;
  readonly facingDirection: FacingDirection;
  readonly xOffset: number;
  readonly yOffset: number;
}

const FIXTURE_CHANNEL_ID = '12000000-0000-4000-8000-000000000012';
const PLACEMENT_SEARCH_STEP = 0.2;
const MINIMUM_PARTICIPANT_DISTANCE = PLAYER_FOOT_RADIUS * 2 + 0.28;

const CROWD: readonly CrowdMember[] = [
  {
    presenceId: '12000000-0000-4000-8000-000000000101',
    displayName: 'Aster Vale',
    level: 4,
    appearancePreset: 'marigold',
    facingDirection: 'southeast',
    xOffset: -2.4,
    yOffset: -1.2,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000102',
    displayName: 'Bramble Bea',
    level: 7,
    appearancePreset: 'moss',
    facingDirection: 'south',
    xOffset: -1.15,
    yOffset: -2.25,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000103',
    displayName: 'Celeste Noor',
    level: 11,
    appearancePreset: 'moonberry',
    facingDirection: 'southwest',
    xOffset: 0.45,
    yOffset: -2.45,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000104',
    displayName: 'Dewdrop Ren',
    level: 3,
    appearancePreset: 'river',
    facingDirection: 'west',
    xOffset: 2.15,
    yOffset: -1.65,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000105',
    displayName: 'Ember Lune',
    level: 15,
    appearancePreset: 'marigold',
    facingDirection: 'northwest',
    xOffset: 2.7,
    yOffset: -0.15,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000106',
    displayName: 'Fern Miko',
    level: 8,
    appearancePreset: 'moss',
    facingDirection: 'north',
    xOffset: 2.05,
    yOffset: 1.65,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000107',
    displayName: 'Goldie Rae',
    level: 12,
    appearancePreset: 'moonberry',
    facingDirection: 'northeast',
    xOffset: 0.8,
    yOffset: 2.55,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000108',
    displayName: 'Hazel Rune',
    level: 6,
    appearancePreset: 'river',
    facingDirection: 'east',
    xOffset: -0.8,
    yOffset: 2.45,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000109',
    displayName: 'Indigo Kit',
    level: 18,
    appearancePreset: 'moonberry',
    facingDirection: 'northeast',
    xOffset: -2.25,
    yOffset: 1.45,
  },
  {
    presenceId: '12000000-0000-4000-8000-000000000110',
    displayName: 'Juniper Sol',
    level: 9,
    appearancePreset: 'marigold',
    facingDirection: 'east',
    xOffset: -2.75,
    yOffset: 0.05,
  },
] as const;

const SAFE_BUBBLE_TEXT = [
  'Lantern Square looks lovely today.',
  'Meet by the golden lanterns!',
  'The shoreline shimmer is so gentle.',
  'I can see the path crossing clearly.',
  'Let us take a cozy group photo.',
  'The tree depth reads well from here.',
] as const;

interface FixturePoint {
  readonly x: number;
  readonly y: number;
}

function farEnoughFromParticipants(
  point: FixturePoint,
  occupied: readonly FixturePoint[],
): boolean {
  return occupied.every(
    (existing) =>
      Math.hypot(point.x - existing.x, point.y - existing.y) >= MINIMUM_PARTICIPANT_DISTANCE,
  );
}

/**
 * Finds the nearest collision-safe point with deterministic ring ordering.
 * The preferred point remains exact when it is already valid; otherwise the
 * search expands in fixed world-space increments without random sampling.
 */
function nearestWalkablePoint(input: {
  readonly preferred: FixturePoint;
  readonly manifest: Phase12CVisualReviewInput['manifest'];
  readonly occupied?: readonly FixturePoint[];
  readonly accepts?: (point: FixturePoint) => boolean;
}): FixturePoint {
  const occupied = input.occupied ?? [];
  const accepts = input.accepts ?? (() => true);
  const valid = (point: FixturePoint) =>
    accepts(point) &&
    farEnoughFromParticipants(point, occupied) &&
    isPositionWalkable(
      point,
      PLAYER_FOOT_RADIUS,
      input.manifest.safeSaveBounds,
      input.manifest.collisions,
    );
  if (valid(input.preferred)) return input.preferred;

  const bounds = input.manifest.safeSaveBounds;
  const maximumRing =
    Math.ceil(
      Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / PLACEMENT_SEARCH_STEP,
    ) + 2;
  for (let ring = 1; ring <= maximumRing; ring += 1) {
    for (let yStep = -ring; yStep <= ring; yStep += 1) {
      for (const xStep of [-ring, ring]) {
        const candidate = {
          x: input.preferred.x + xStep * PLACEMENT_SEARCH_STEP,
          y: input.preferred.y + yStep * PLACEMENT_SEARCH_STEP,
        };
        if (valid(candidate)) return candidate;
      }
    }
    for (let xStep = -ring + 1; xStep < ring; xStep += 1) {
      for (const yStep of [-ring, ring]) {
        const candidate = {
          x: input.preferred.x + xStep * PLACEMENT_SEARCH_STEP,
          y: input.preferred.y + yStep * PLACEMENT_SEARCH_STEP,
        };
        if (valid(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    `Phase 12C could not find a collision-safe fixture point in ${input.manifest.id}`,
  );
}

function depthState(input: Phase12CVisualReviewInput): Readonly<{
  state: PlayerStateUpdate;
  targetId: string | null;
  instruction: string;
}> {
  if (input.depthMode === 'overview') {
    const position = nearestWalkablePoint({
      preferred: input.baseState,
      manifest: input.manifest,
    });
    const spawnWasAdjusted = position.x !== input.baseState.x || position.y !== input.baseState.y;
    return {
      state: { ...input.baseState, mapId: input.manifest.id, x: position.x, y: position.y },
      targetId: null,
      instruction: spawnWasAdjusted
        ? 'The revision spawn overlapped current collision, so overview uses its nearest deterministic safe point. Use WASD to inspect paths, water, scale, and world edges.'
        : 'Overview uses the exact revision spawn. Use WASD to inspect paths, water, scale, and world edges.',
    };
  }

  const kind = input.depthMode.startsWith('tree') ? 'tree' : 'building';
  const eligibleKinds = kind === 'tree' ? new Set(['tree']) : new Set(['building', 'shop']);
  const target = input.manifest.objects
    .filter((object) => eligibleKinds.has(object.kind))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (target === undefined) {
    const position = nearestWalkablePoint({
      preferred: input.baseState,
      manifest: input.manifest,
    });
    return {
      state: { ...input.baseState, mapId: input.manifest.id, x: position.x, y: position.y },
      targetId: null,
      instruction: `This exact revision has no ${kind} depth anchor; the fixture safely used the nearest walkable revision spawn.`,
    };
  }

  const inFront = input.depthMode.endsWith('front');
  const offset = inFront ? 1.05 : -1.05;
  const targetDepth = target.x + target.y;
  const position = nearestWalkablePoint({
    preferred: { x: target.x + offset, y: target.y + offset },
    manifest: input.manifest,
    accepts: (candidate) =>
      inFront ? candidate.x + candidate.y > targetDepth : candidate.x + candidate.y < targetDepth,
  });
  return {
    state: {
      mapId: input.manifest.id,
      x: position.x,
      y: position.y,
      facingDirection: inFront ? 'northwest' : 'southeast',
    },
    targetId: target.id,
    instruction: inFront
      ? `Player starts in front of ${kind} “${target.id}”. Confirm the player overlaps the lower foreground side.`
      : `Player starts behind ${kind} “${target.id}”. Confirm the ${kind} overlaps the player naturally.`,
  };
}

function remotePresences(
  input: Phase12CVisualReviewInput,
  localState: PlayerStateUpdate,
): readonly PublicPresence[] {
  if (input.participantMode === 'one-player') return [];
  const occupied: FixturePoint[] = [{ x: localState.x, y: localState.y }];
  const remotes: PublicPresence[] = [];
  for (const [index, member] of CROWD.slice(0, PHASE12C_VISUAL_REVIEW_PLAYER_CAP - 1).entries()) {
    const position = nearestWalkablePoint({
      preferred: { x: localState.x + member.xOffset, y: localState.y + member.yOffset },
      manifest: input.manifest,
      occupied,
    });
    occupied.push(position);
    remotes.push({
      presenceId: member.presenceId,
      displayName: member.displayName,
      level: member.level,
      worldId: input.manifest.id,
      worldVersionId: input.worldVersionId,
      channelId: FIXTURE_CHANNEL_ID,
      channelNumber: 1,
      x: position.x,
      y: position.y,
      facingDirection: member.facingDirection,
      movementState: 'idle',
      appearancePreset: member.appearancePreset,
      sequence: index + 1,
      connected: true,
    });
  }
  return remotes;
}

function chatBubbleMessages(
  input: Phase12CVisualReviewInput,
  remotes: readonly PublicPresence[],
): readonly WorldChatBubbleMessage[] {
  if (!input.bubblesEnabled) return [];
  if (!Number.isFinite(input.visualClockMs)) {
    throw new Error('Phase 12C visual fixture clock must be finite');
  }
  const sentAt = new Date(input.visualClockMs).toISOString();
  const speakers: readonly (PublicPresence | 'local')[] = ['local', ...remotes];
  return speakers.slice(0, PHASE12C_VISUAL_REVIEW_BUBBLE_CAP).map((speaker, index) => ({
    id: `phase12c-visual-qa-bubble-${String(index + 1).padStart(2, '0')}`,
    worldId: input.manifest.id,
    senderPresenceId: speaker === 'local' ? null : speaker.presenceId,
    text: SAFE_BUBBLE_TEXT[index]!,
    sentAt,
    ...(speaker === 'local' ? { local: true } : {}),
  }));
}

export function createPhase12CWorldGameTestFixture(
  input: Phase12CVisualReviewInput,
): Phase12CWorldGameTestFixture {
  const depth = depthState(input);
  const remotes = remotePresences(input, depth.state);
  const bubbles = chatBubbleMessages(input, remotes);
  return {
    canvasKey: `${input.sourceIdentity ?? 'revision'}:${input.depthMode}:${depth.state.x.toFixed(2)}:${depth.state.y.toFixed(2)}`,
    localState: depth.state,
    remotePresences: remotes,
    chatBubbleMessages: bubbles,
    totalPlayerCount: remotes.length + 1,
    depthTargetId: depth.targetId,
    depthInstruction: depth.instruction,
  };
}

export function phase12CGameCanvasVisualSettings(input: {
  readonly quality: Phase12CVisualQuality;
  readonly shadows: boolean;
  readonly ambientEffects: boolean;
  readonly animatedWater: boolean;
  readonly labels: boolean;
  readonly chatBubbles: boolean;
}): WorldVisualSettings {
  const low = input.quality === 'low';
  return {
    quality: low ? 'low' : 'balanced',
    shadows: low ? false : input.shadows,
    ambientEffects: low ? false : input.ambientEffects,
    animatedWater: low ? false : input.animatedWater,
    remoteLabels: input.labels,
    chatBubbles: input.chatBubbles,
  };
}
