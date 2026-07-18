import type { PublicPresence } from './protocol';
import {
  chatMessageIsNear,
  normalizeChatText,
  type ChatMessageRejectionReason,
  type PlayerChatScope,
} from './chat';

interface TimedValue {
  readonly at: number;
  readonly value: string;
  readonly fingerprint: string;
}

export interface ChatRateLimits {
  readonly shortWindowMessages: number;
  readonly minuteMessages: number;
  readonly hourlyReports: number;
  readonly minuteSafetyActions: number;
  readonly malformedMessages: number;
}

const DEFAULT_CHAT_RATE_LIMITS: ChatRateLimits = {
  shortWindowMessages: 4,
  minuteMessages: 20,
  hourlyReports: 5,
  minuteSafetyActions: 20,
  malformedMessages: 10,
};

export type ChatSendDecision =
  | { readonly accepted: true; readonly text: string }
  | {
      readonly accepted: false;
      readonly reason: ChatMessageRejectionReason;
      readonly retryAfterMs?: number;
    };

export class ChatRateAuthority {
  readonly #messages = new Map<string, TimedValue[]>();
  readonly #reports = new Map<string, number[]>();
  readonly #safetyActions = new Map<string, number[]>();
  readonly #malformed = new Map<string, number[]>();

  public constructor(private readonly limits: ChatRateLimits = DEFAULT_CHAT_RATE_LIMITS) {}

  public evaluateSend(playerId: string, text: string, now = Date.now()): ChatSendDecision {
    const normalized = normalizeChatText(text);
    if (!normalized.accepted) return { accepted: false, reason: 'invalid_content' };
    const recent = (this.#messages.get(playerId) ?? []).filter((entry) => now - entry.at < 60_000);
    const fiveSeconds = recent.filter((entry) => now - entry.at < 5_000);
    if (
      fiveSeconds.length >= this.limits.shortWindowMessages ||
      recent.length >= this.limits.minuteMessages
    ) {
      this.#messages.set(playerId, recent);
      const oldest = fiveSeconds[0]?.at ?? recent[0]?.at ?? now;
      return {
        accepted: false,
        reason: 'rate_limited',
        retryAfterMs: Math.max(250, Math.min(60_000, oldest + 5_000 - now)),
      };
    }
    const canonical = normalized.text.toLocaleLowerCase('en');
    const fingerprint = canonical.replace(/[\p{P}\p{S}\s]+/gu, '');
    if (
      recent.filter((entry) => entry.value === canonical || entry.fingerprint === fingerprint)
        .length >= 2
    ) {
      this.#messages.set(playerId, recent);
      return { accepted: false, reason: 'duplicate_spam', retryAfterMs: 5_000 };
    }
    recent.push({ at: now, value: canonical, fingerprint });
    this.#messages.set(playerId, recent);
    return { accepted: true, text: normalized.text };
  }

  public allowReport(playerId: string, now = Date.now()): boolean {
    return this.claim(this.#reports, playerId, now, 60 * 60_000, this.limits.hourlyReports);
  }

  public allowSafetyAction(playerId: string, now = Date.now()): boolean {
    return this.claim(this.#safetyActions, playerId, now, 60_000, this.limits.minuteSafetyActions);
  }

  public noteMalformed(connectionId: string, now = Date.now()): boolean {
    return this.claim(this.#malformed, connectionId, now, 10_000, this.limits.malformedMessages);
  }

  public clear(playerId: string): void {
    this.#messages.delete(playerId);
    this.#reports.delete(playerId);
    this.#safetyActions.delete(playerId);
  }

  private claim(
    store: Map<string, number[]>,
    key: string,
    now: number,
    windowMs: number,
    limit: number,
  ): boolean {
    const values = (store.get(key) ?? []).filter((value) => now - value < windowMs);
    if (values.length >= limit) {
      store.set(key, values);
      return false;
    }
    values.push(now);
    store.set(key, values);
    return true;
  }
}

export function chatRecipients(
  scope: PlayerChatScope,
  sender: PublicPresence,
  members: readonly PublicPresence[],
  nearbyDistance?: number,
): readonly PublicPresence[] {
  return members.filter(
    (member) =>
      member.worldId === sender.worldId &&
      member.channelId === sender.channelId &&
      (scope === 'channel' ||
        scope === 'party' ||
        chatMessageIsNear(sender, member, nearbyDistance)),
  );
}
