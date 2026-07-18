import { z } from 'zod';

import { mapIdSchema } from '@starville/game-core';

export const CHAT_MESSAGE_MAX_CHARACTERS = 400;
export const CHAT_MESSAGE_MAX_BYTES = 800;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_NEARBY_DISTANCE = 8;

export const chatScopeSchema = z.enum(['nearby', 'channel', 'party', 'system']);
export type ChatScope = z.infer<typeof chatScopeSchema>;

export const playerChatScopeSchema = z.enum(['nearby', 'channel', 'party']);
export type PlayerChatScope = z.infer<typeof playerChatScopeSchema>;

export const chatReportCategorySchema = z.enum([
  'harassment',
  'hate_or_abuse',
  'spam',
  'scam_or_suspicious_link',
  'impersonation',
  'sexual_content',
  'other',
]);
export type ChatReportCategory = z.infer<typeof chatReportCategorySchema>;

export const chatMessageSchema = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    scope: chatScopeSchema,
    senderPresenceId: z.uuid().nullable(),
    senderDisplayName: z.string().trim().min(3).max(20),
    senderLevel: z.number().int().min(1).max(999).nullable(),
    worldId: mapIdSchema,
    channelId: z.uuid(),
    partyId: z.uuid().nullable().optional(),
    sentAt: z.iso.datetime({ offset: true }),
    text: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARACTERS),
    sourceCategory: z
      .enum([
        'player',
        'connection',
        'channel',
        'party',
        'maintenance',
        'moderation',
        'live_operations',
      ])
      .default('player'),
  })
  .strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatHistorySchema = z
  .object({
    scope: chatScopeSchema,
    messages: z.array(chatMessageSchema).max(CHAT_HISTORY_LIMIT),
    hasMore: z.boolean(),
  })
  .strict();
export type ChatHistory = z.infer<typeof chatHistorySchema>;

export const chatMessageRejectionReasonSchema = z.enum([
  'invalid_content',
  'rate_limited',
  'duplicate_spam',
  'chat_muted',
  'access_changed',
  'persistence_unavailable',
]);
export type ChatMessageRejectionReason = z.infer<typeof chatMessageRejectionReasonSchema>;

export const chatPlayerPreferenceSchema = z
  .object({
    targetPresenceId: z.uuid(),
    muted: z.boolean(),
    blocked: z.boolean(),
  })
  .strict();
export type ChatPlayerPreference = z.infer<typeof chatPlayerPreferenceSchema>;

export const chatBootstrapSchema = z
  .object({
    histories: z.array(chatHistorySchema).max(4),
    preferences: z.array(chatPlayerPreferenceSchema).max(500),
    mutedUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type ChatBootstrap = z.infer<typeof chatBootstrapSchema>;

const invalidUnicode = /[\uD800-\uDFFF]/u;
const excessiveRepeatedCharacters = /(.)\1{14,}/u;
const unsafeScheme = /(?:^|[\s(])(?:javascript|data|file|vbscript):/iu;
const htmlTag = /<\/?[A-Za-z][^>]*>/u;
const systemImpersonation = /^\s*(?:\[?system\]?|starville\s+(?:admin|staff))\s*[:-]/iu;

function containsForbiddenControlCharacter(input: string): boolean {
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 8) ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        codePoint === 127)
    ) {
      return true;
    }
  }
  return false;
}

export type ChatTextValidation =
  | { readonly accepted: true; readonly text: string }
  | { readonly accepted: false; readonly reason: 'empty' | 'characters' | 'bytes' | 'unsafe' };

export function normalizeChatText(input: string): ChatTextValidation {
  let normalized: string;
  try {
    normalized = input.normalize('NFKC').replace(/\r\n?/gu, '\n');
  } catch {
    return { accepted: false, reason: 'characters' };
  }
  normalized = normalized
    .replace(/[\t ]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (normalized.length === 0) return { accepted: false, reason: 'empty' };
  if (
    normalized.length > CHAT_MESSAGE_MAX_CHARACTERS ||
    [...normalized].length > CHAT_MESSAGE_MAX_CHARACTERS
  ) {
    return { accepted: false, reason: 'characters' };
  }
  if (new TextEncoder().encode(normalized).byteLength > CHAT_MESSAGE_MAX_BYTES) {
    return { accepted: false, reason: 'bytes' };
  }
  if (
    containsForbiddenControlCharacter(normalized) ||
    invalidUnicode.test(normalized) ||
    excessiveRepeatedCharacters.test(normalized) ||
    unsafeScheme.test(normalized) ||
    htmlTag.test(normalized) ||
    systemImpersonation.test(normalized)
  ) {
    return { accepted: false, reason: 'unsafe' };
  }
  return { accepted: true, text: normalized };
}

export function chatMessageIsNear(
  sender: { readonly x: number; readonly y: number },
  recipient: { readonly x: number; readonly y: number },
  maximumDistance = CHAT_NEARBY_DISTANCE,
): boolean {
  return Math.hypot(sender.x - recipient.x, sender.y - recipient.y) <= maximumDistance;
}
