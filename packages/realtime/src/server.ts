import {
  isPositionWalkable,
  moveWithCollisions,
  movementSpeed,
  PLAYER_FOOT_RADIUS,
  type FacingDirection,
  type MapManifest,
  type Point,
} from '@starville/game-core';

import type { PublicPresence, RealtimeChannel, RealtimeMovementState } from './protocol';

export * from './chat-authority';
export * from './activity-authority';
export * from './social-graph-authority';
export * from './social-authority';

export interface AuthoritativeMovementInput extends Point {
  readonly sequence: number;
  readonly movementState: RealtimeMovementState;
  readonly receivedAt: number;
}

export type MovementRejectionReason =
  'stale_sequence' | 'frequency' | 'speed' | 'collision' | 'bounds' | 'malformed';

export type MovementValidationResult =
  | {
      readonly accepted: true;
      readonly position: Point;
      readonly facingDirection: FacingDirection;
      readonly movementState: RealtimeMovementState;
    }
  | { readonly accepted: false; readonly reason: MovementRejectionReason };

export interface MovementAuthorityState extends Point {
  readonly sequence: number;
  readonly facingDirection: FacingDirection;
  readonly acceptedAt: number;
  readonly messagesInWindow: number;
  readonly windowStartedAt: number;
}

const MAX_MESSAGES_PER_SECOND = 20;
const POSITION_TOLERANCE = 0.08;
const STATIONARY_EPSILON = 1e-4;

const FACING_BY_SCREEN_OCTANT: readonly FacingDirection[] = [
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'north',
  'northeast',
];

function authoritativeFacingDirection(delta: Point, previous: FacingDirection): FacingDirection {
  if (Math.hypot(delta.x, delta.y) <= STATIONARY_EPSILON) return previous;

  // Movement is stored on Starville's logical isometric plane. Convert it back to the
  // screen-relative compass plane used by the public facing-direction contract before
  // selecting the nearest of the eight supported directions.
  const screenX = delta.x - delta.y;
  const screenY = delta.x + delta.y;
  const octant = Math.round(Math.atan2(screenY, screenX) / (Math.PI / 4));
  return FACING_BY_SCREEN_OCTANT[(octant + 8) % 8] ?? previous;
}

function authoritativeMovementState(
  requestedState: RealtimeMovementState,
  distance: number,
  elapsedSeconds: number,
): RealtimeMovementState {
  if (distance <= STATIONARY_EPSILON) return 'idle';
  if (requestedState !== 'jogging') return 'walking';

  // A jog request permits the larger validation envelope, but it only publishes as jogging
  // when the accepted displacement is beyond what the walk envelope could authorize.
  const maximumWalkingDistance = movementSpeed(false) * elapsedSeconds + POSITION_TOLERANCE;
  return distance > maximumWalkingDistance ? 'jogging' : 'walking';
}

export function validateAuthoritativeMovement(
  state: MovementAuthorityState,
  input: AuthoritativeMovementInput,
  manifest: MapManifest,
): MovementValidationResult {
  if (
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y) ||
    !Number.isSafeInteger(input.sequence) ||
    input.receivedAt < state.acceptedAt
  ) {
    return { accepted: false, reason: 'malformed' };
  }
  if (input.sequence <= state.sequence) return { accepted: false, reason: 'stale_sequence' };
  if (
    input.receivedAt - state.windowStartedAt < 1_000 &&
    state.messagesInWindow >= MAX_MESSAGES_PER_SECOND
  ) {
    return { accepted: false, reason: 'frequency' };
  }
  if (
    !isPositionWalkable(input, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, manifest.collisions)
  ) {
    const insideBounds =
      input.x >= manifest.safeSaveBounds.minX + PLAYER_FOOT_RADIUS &&
      input.y >= manifest.safeSaveBounds.minY + PLAYER_FOOT_RADIUS &&
      input.x <= manifest.safeSaveBounds.maxX - PLAYER_FOOT_RADIUS &&
      input.y <= manifest.safeSaveBounds.maxY - PLAYER_FOOT_RADIUS;
    return { accepted: false, reason: insideBounds ? 'collision' : 'bounds' };
  }

  const elapsedSeconds = Math.min(Math.max((input.receivedAt - state.acceptedAt) / 1_000, 0), 0.5);
  const maximumDistance =
    movementSpeed(input.movementState === 'jogging') * elapsedSeconds + POSITION_TOLERANCE;
  const delta = { x: input.x - state.x, y: input.y - state.y };
  const distance = Math.hypot(delta.x, delta.y);
  if (distance > maximumDistance) return { accepted: false, reason: 'speed' };

  const resolved = moveWithCollisions(
    state,
    delta,
    PLAYER_FOOT_RADIUS,
    manifest.safeSaveBounds,
    manifest.collisions,
  );
  if (Math.hypot(resolved.x - input.x, resolved.y - input.y) > POSITION_TOLERANCE) {
    return { accepted: false, reason: 'collision' };
  }
  return {
    accepted: true,
    position: { x: input.x, y: input.y },
    facingDirection: authoritativeFacingDirection(delta, state.facingDirection),
    movementState: authoritativeMovementState(input.movementState, distance, elapsedSeconds),
  };
}

export class ChannelAuthority {
  readonly #presenceById = new Map<string, PublicPresence>();
  readonly #presenceIdsByChannel = new Map<string, Set<string>>();

  public constructor(private channels: readonly RealtimeChannel[]) {}

  public list(worldId: string): readonly RealtimeChannel[] {
    return this.channels
      .filter((channel) => channel.worldId === worldId)
      .map((channel) => {
        const population = this.#presenceIdsByChannel.get(channel.id)?.size ?? 0;
        return { ...channel, population, available: population < channel.capacity };
      });
  }

  public assign(worldId: string, requestedChannelId?: string): RealtimeChannel | undefined {
    const candidates = this.list(worldId).filter((channel) => channel.available);
    if (requestedChannelId !== undefined) {
      return candidates.find((channel) => channel.id === requestedChannelId);
    }
    return [...candidates].sort(
      (left, right) => left.population - right.population || left.number - right.number,
    )[0];
  }

  public join(presence: PublicPresence): boolean {
    if (this.#presenceById.has(presence.presenceId)) return false;
    const channel = this.list(presence.worldId).find((entry) => entry.id === presence.channelId);
    if (channel === undefined || !channel.available) return false;
    this.#presenceById.set(presence.presenceId, presence);
    const members = this.#presenceIdsByChannel.get(presence.channelId) ?? new Set<string>();
    members.add(presence.presenceId);
    this.#presenceIdsByChannel.set(presence.channelId, members);
    return true;
  }

  public update(presence: PublicPresence): boolean {
    const current = this.#presenceById.get(presence.presenceId);
    if (
      current === undefined ||
      current.worldId !== presence.worldId ||
      current.channelId !== presence.channelId
    ) {
      return false;
    }
    this.#presenceById.set(presence.presenceId, presence);
    return true;
  }

  public leave(presenceId: string): PublicPresence | undefined {
    const presence = this.#presenceById.get(presenceId);
    if (presence === undefined) return undefined;
    this.#presenceById.delete(presenceId);
    const members = this.#presenceIdsByChannel.get(presence.channelId);
    members?.delete(presenceId);
    if (members?.size === 0) this.#presenceIdsByChannel.delete(presence.channelId);
    return presence;
  }

  public members(worldId: string, channelId: string): readonly PublicPresence[] {
    return [...(this.#presenceIdsByChannel.get(channelId) ?? [])]
      .map((id) => this.#presenceById.get(id))
      .filter(
        (presence): presence is PublicPresence =>
          presence !== undefined && presence.worldId === worldId,
      );
  }

  public replaceChannels(channels: readonly RealtimeChannel[]): void {
    this.channels = channels;
  }
}
