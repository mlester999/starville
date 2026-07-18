export type SocialGraphRateAction =
  | 'friend_request'
  | 'friend_response'
  | 'friend_remove'
  | 'party_create'
  | 'party_invite'
  | 'party_response'
  | 'party_membership'
  | 'ready_start'
  | 'ready_response';

export interface SocialGraphRateLimits {
  readonly friendRequestsPerMinute: number;
  readonly friendResponsesPerMinute: number;
  readonly friendRemovalsPerMinute: number;
  readonly partyCreationsPerHour: number;
  readonly partyInvitationsPerMinute: number;
  readonly partyResponsesPerMinute: number;
  readonly partyMembershipActionsPerMinute: number;
  readonly readyChecksPerMinute: number;
  readonly readyResponsesPerMinute: number;
}

export const DEFAULT_SOCIAL_GRAPH_RATE_LIMITS: SocialGraphRateLimits = {
  friendRequestsPerMinute: 4,
  friendResponsesPerMinute: 12,
  friendRemovalsPerMinute: 10,
  partyCreationsPerHour: 3,
  partyInvitationsPerMinute: 8,
  partyResponsesPerMinute: 15,
  partyMembershipActionsPerMinute: 12,
  readyChecksPerMinute: 4,
  readyResponsesPerMinute: 20,
};

export class SocialGraphRateAuthority {
  readonly #attempts = new Map<string, number[]>();

  public constructor(
    private readonly limits: SocialGraphRateLimits = DEFAULT_SOCIAL_GRAPH_RATE_LIMITS,
  ) {}

  public allow(playerId: string, action: SocialGraphRateAction, now = Date.now()): boolean {
    const key = `${playerId}:${action}`;
    const windowMs = action === 'party_create' ? 60 * 60_000 : 60_000;
    const attempts = (this.#attempts.get(key) ?? []).filter((at) => now - at < windowMs);
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

  private limit(action: SocialGraphRateAction): number {
    return {
      friend_request: this.limits.friendRequestsPerMinute,
      friend_response: this.limits.friendResponsesPerMinute,
      friend_remove: this.limits.friendRemovalsPerMinute,
      party_create: this.limits.partyCreationsPerHour,
      party_invite: this.limits.partyInvitationsPerMinute,
      party_response: this.limits.partyResponsesPerMinute,
      party_membership: this.limits.partyMembershipActionsPerMinute,
      ready_start: this.limits.readyChecksPerMinute,
      ready_response: this.limits.readyResponsesPerMinute,
    }[action];
  }
}
