export interface PlayerRequestRateLimiter {
  claim(key: string): boolean;
}

export class FixedWindowPlayerRateLimiter implements PlayerRequestRateLimiter {
  readonly #entries = new Map<string, { count: number; expiresAt: number }>();

  public constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error('Player request rate limits must be positive integers.');
    }
  }

  public claim(key: string): boolean {
    const now = this.now();
    const existing = this.#entries.get(key);
    if (existing === undefined || existing.expiresAt <= now) {
      if (this.#entries.size >= 10_000) {
        this.#prune(now);
        if (this.#entries.size >= 10_000 && existing === undefined) return false;
      }
      this.#entries.set(key, { count: 1, expiresAt: now + this.windowMs });
      return true;
    }
    if (existing.count >= this.limit) return false;
    existing.count += 1;
    return true;
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key);
    }
  }
}
