export type SocialRateAction = 'inspect' | 'request' | 'response' | 'offer' | 'confirm' | 'cancel';

export interface SocialRateLimits {
  readonly inspectPerMinute: number;
  readonly requestsPerMinute: number;
  readonly responsesPerMinute: number;
  readonly offersPerMinute: number;
  readonly confirmationsPerMinute: number;
  readonly cancellationsPerMinute: number;
}

export const DEFAULT_SOCIAL_RATE_LIMITS: SocialRateLimits = {
  inspectPerMinute: 60,
  requestsPerMinute: 6,
  responsesPerMinute: 12,
  offersPerMinute: 30,
  confirmationsPerMinute: 20,
  cancellationsPerMinute: 20,
};

export class SocialRateAuthority {
  readonly #attempts = new Map<string, number[]>();

  public constructor(private readonly limits: SocialRateLimits = DEFAULT_SOCIAL_RATE_LIMITS) {}

  public allow(playerId: string, action: SocialRateAction, now = Date.now()): boolean {
    const key = `${playerId}:${action}`;
    const attempts = (this.#attempts.get(key) ?? []).filter((at) => now - at < 60_000);
    if (attempts.length >= this.limit(action)) {
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

  private limit(action: SocialRateAction): number {
    return {
      inspect: this.limits.inspectPerMinute,
      request: this.limits.requestsPerMinute,
      response: this.limits.responsesPerMinute,
      offer: this.limits.offersPerMinute,
      confirm: this.limits.confirmationsPerMinute,
      cancel: this.limits.cancellationsPerMinute,
    }[action];
  }
}
