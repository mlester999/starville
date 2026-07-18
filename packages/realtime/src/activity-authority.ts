export type ActivityRateAction =
  'catalog' | 'snapshot' | 'prepare' | 'ready' | 'enter' | 'interact' | 'leave';

interface ActivityRateRule {
  readonly limit: number;
  readonly windowMs: number;
}

const ACTIVITY_RATE_RULES: Readonly<Record<ActivityRateAction, ActivityRateRule>> = {
  catalog: { limit: 10, windowMs: 60_000 },
  snapshot: { limit: 30, windowMs: 60_000 },
  prepare: { limit: 6, windowMs: 60_000 },
  ready: { limit: 20, windowMs: 60_000 },
  enter: { limit: 6, windowMs: 60_000 },
  interact: { limit: 30, windowMs: 10_000 },
  leave: { limit: 10, windowMs: 60_000 },
};

export class ActivityRateAuthority {
  readonly #attempts = new Map<string, number[]>();

  public allow(playerId: string, action: ActivityRateAction, now = Date.now()): boolean {
    const rule = ACTIVITY_RATE_RULES[action];
    const key = `${playerId}:${action}`;
    const attempts = (this.#attempts.get(key) ?? []).filter((at) => now - at < rule.windowMs);
    if (attempts.length >= rule.limit) {
      this.#attempts.set(key, attempts);
      return false;
    }
    attempts.push(now);
    this.#attempts.set(key, attempts);
    return true;
  }

  public clear(playerId: string): void {
    for (const key of this.#attempts.keys()) {
      if (key.startsWith(`${playerId}:`)) this.#attempts.delete(key);
    }
  }
}
