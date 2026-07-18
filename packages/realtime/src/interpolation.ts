import type { FacingDirection, Point } from '@starville/game-core';

import type { PublicPresence, RealtimeMovementState } from './protocol';

export interface PresenceSample extends Point {
  readonly receivedAt: number;
  readonly sequence: number;
  readonly facingDirection: FacingDirection;
  readonly movementState: RealtimeMovementState;
}

export interface InterpolatedPresence extends Point {
  readonly facingDirection: FacingDirection;
  readonly movementState: RealtimeMovementState;
  readonly sequence: number;
}

export class PresenceInterpolationBuffer {
  readonly #samples: PresenceSample[] = [];

  public constructor(
    private readonly delayMs = 120,
    private readonly maximumExtrapolationMs = 100,
  ) {}

  public push(presence: PublicPresence, receivedAt: number): boolean {
    const latest = this.#samples.at(-1);
    if (latest !== undefined && presence.sequence <= latest.sequence) return false;
    this.#samples.push({
      x: presence.x,
      y: presence.y,
      receivedAt,
      sequence: presence.sequence,
      facingDirection: presence.facingDirection,
      movementState: presence.movementState,
    });
    while (this.#samples.length > 12) this.#samples.shift();
    return true;
  }

  public sample(now: number, reducedMotion = false): InterpolatedPresence | undefined {
    const latest = this.#samples.at(-1);
    if (latest === undefined) return undefined;
    if (reducedMotion || this.#samples.length === 1) return { ...latest };

    const renderAt = now - this.delayMs;
    while (this.#samples.length > 2 && (this.#samples[1]?.receivedAt ?? Infinity) <= renderAt) {
      this.#samples.shift();
    }

    const from = this.#samples[0];
    const to = this.#samples[1];
    if (from === undefined) return undefined;
    if (to === undefined || renderAt <= from.receivedAt) return { ...from };
    if (renderAt <= to.receivedAt) {
      const span = Math.max(to.receivedAt - from.receivedAt, 1);
      const progress = Math.min(Math.max((renderAt - from.receivedAt) / span, 0), 1);
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        facingDirection: to.facingDirection,
        movementState: to.movementState,
        sequence: to.sequence,
      };
    }

    const elapsed = Math.min(renderAt - to.receivedAt, this.maximumExtrapolationMs);
    const sampleSpan = Math.max(to.receivedAt - from.receivedAt, 1);
    const multiplier = elapsed / sampleSpan;
    return {
      x: to.x + (to.x - from.x) * multiplier,
      y: to.y + (to.y - from.y) * multiplier,
      facingDirection: to.facingDirection,
      movementState: to.movementState,
      sequence: to.sequence,
    };
  }

  public clear(): void {
    this.#samples.length = 0;
  }
}
