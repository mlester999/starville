import { z } from 'zod';

import { compactAppearanceReferenceSchema } from '@starville/avatar';
import { cosmeticEmoteKeySchema } from '@starville/cosmetics';
import { appearancePresetSchema, facingDirectionSchema, mapIdSchema } from '@starville/game-core';
import {
  cooperativeActivityBootstrapSchema,
  cooperativeActivityCatalogSchema,
  cooperativeActivityErrorCodeSchema,
  cooperativeActivityInstanceSnapshotSchema,
  cooperativeActivityInteractionIntentSchema,
  cooperativeActivityPreparationSchema,
} from '@starville/cooperative-activities';
import {
  chatBootstrapSchema,
  chatHistorySchema,
  chatMessageRejectionReasonSchema,
  chatMessageSchema,
  chatReportCategorySchema,
  chatScopeSchema,
  playerChatScopeSchema,
} from './chat';
import {
  publicPlayerInspectSchema,
  socialBootstrapSchema,
  socialGiftViewSchema,
  socialInteractionErrorCodeSchema,
  socialInteractionViewSchema,
  socialOfferItemInputListSchema,
  socialReceiptSchema,
  socialTradeViewSchema,
} from './social';
import {
  friendRequestViewSchema,
  partyInvitationSchema,
  partySnapshotSchema,
  socialGraphBootstrapSchema,
  socialGraphErrorCodeSchema,
  socialGraphNotificationSchema,
  socialGraphRequestIdSchema,
} from './social-graph';

export const REALTIME_PROTOCOL_VERSION = 1 as const;
export const REALTIME_MAX_PAYLOAD_BYTES = 16 * 1024;
export const REALTIME_DEFAULT_CHANNEL_CAPACITY = 40;
export const REALTIME_CLIENT_SEND_INTERVAL_MS = 100;
export const REALTIME_INTERPOLATION_DELAY_MS = 120;
export const REALTIME_STALE_PRESENCE_MS = 15_000;

const uuidSchema = z.uuid();
const coordinateSchema = z.number().finite().min(0).max(128);
const sequenceSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const realtimeMovementStateSchema = z.enum(['idle', 'walking', 'jogging']);
export type RealtimeMovementState = z.infer<typeof realtimeMovementStateSchema>;

export const realtimeChannelSchema = z
  .object({
    id: uuidSchema,
    worldId: mapIdSchema,
    number: z.number().int().min(1).max(99),
    capacity: z.number().int().min(1).max(200),
    population: z.number().int().min(0).max(200),
    available: z.boolean(),
  })
  .strict();
export type RealtimeChannel = z.infer<typeof realtimeChannelSchema>;

export const publicPresenceSchema = z
  .object({
    presenceId: uuidSchema,
    displayName: z.string().trim().min(3).max(20),
    level: z.number().int().min(1).max(999),
    worldId: mapIdSchema,
    worldVersionId: uuidSchema,
    channelId: uuidSchema,
    channelNumber: z.number().int().min(1).max(99),
    x: coordinateSchema,
    y: coordinateSchema,
    facingDirection: facingDirectionSchema,
    movementState: realtimeMovementStateSchema,
    appearancePreset: appearancePresetSchema,
    appearanceId: compactAppearanceReferenceSchema.shape.appearanceId.optional(),
    appearanceRevision: compactAppearanceReferenceSchema.shape.appearanceRevision.optional(),
    sequence: sequenceSchema,
    connected: z.boolean(),
  })
  .strict()
  .superRefine((presence, context) => {
    if ((presence.appearanceId === undefined) !== (presence.appearanceRevision === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['appearanceId'],
        message: 'Compact appearance id and revision must be provided together',
      });
    }
  });
export type PublicPresence = z.infer<typeof publicPresenceSchema>;

export const realtimeTicketViewSchema = z
  .object({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type RealtimeTicketView = z.infer<typeof realtimeTicketViewSchema>;

const clientEnvelope = {
  version: z.literal(REALTIME_PROTOCOL_VERSION),
} as const;

export const realtimeClientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...clientEnvelope,
      type: z.literal('authenticate'),
      ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('movement'),
      sequence: sequenceSchema,
      x: coordinateSchema,
      y: coordinateSchema,
      facingDirection: facingDirectionSchema,
      movementState: realtimeMovementStateSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('switch_channel'),
      channelId: uuidSchema,
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('resync') }).strict(),
  z.object({ ...clientEnvelope, type: z.literal('appearance.refresh') }).strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('emote.activate'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      emoteKey: cosmeticEmoteKeySchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('ping'),
      nonce: z.string().min(1).max(64),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('chat.send'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      scope: playerChatScopeSchema,
      text: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('chat.history.request'),
      scope: chatScopeSchema,
      afterSequence: sequenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('chat.report'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      messageId: uuidSchema,
      category: chatReportCategorySchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum([
        'chat.mute_player',
        'chat.unmute_player',
        'chat.block_player',
        'chat.unblock_player',
      ]),
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('chat.mark_read'),
      scope: chatScopeSchema,
      throughSequence: sequenceSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('social.inspect.request'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('social.gift.create'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      targetPresenceId: uuidSchema,
      itemSlug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
        .max(80),
      quantity: z.number().int().min(1).max(999),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['social.gift.accept', 'social.gift.decline', 'social.gift.cancel']),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      interactionId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('social.trade.request'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['social.trade.accept', 'social.trade.decline']),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      interactionId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('social.trade.offer.update'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      interactionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      items: socialOfferItemInputListSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('social.trade.confirm'),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      interactionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['social.trade.cancel', 'social.trade.resume']),
      requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
      interactionId: uuidSchema,
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('friends.list.request') }).strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('friends.request.send'),
      requestId: socialGraphRequestIdSchema,
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['friends.request.accept', 'friends.request.decline', 'friends.request.cancel']),
      requestId: socialGraphRequestIdSchema,
      friendRequestId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('friends.remove'),
      requestId: socialGraphRequestIdSchema,
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.create'),
      requestId: socialGraphRequestIdSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.invite.send'),
      requestId: socialGraphRequestIdSchema,
      targetPresenceId: uuidSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['party.invite.accept', 'party.invite.decline', 'party.invite.cancel']),
      requestId: socialGraphRequestIdSchema,
      invitationId: uuidSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.leave'),
      requestId: socialGraphRequestIdSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.enum(['party.kick', 'party.promote']),
      requestId: socialGraphRequestIdSchema,
      targetPresenceId: uuidSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.disband'),
      requestId: socialGraphRequestIdSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('party.snapshot.request') }).strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.ready_check.start'),
      requestId: socialGraphRequestIdSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('party.ready_check.respond'),
      requestId: socialGraphRequestIdSchema,
      readyCheckId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      response: z.enum(['ready', 'not_ready']),
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('activity.catalog.request') }).strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('activity.entry.prepare'),
      requestId: socialGraphRequestIdSchema,
      activityKey: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
        .max(80),
      expectedPartyRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('activity.entry.ready'),
      requestId: socialGraphRequestIdSchema,
      readyCheckId: uuidSchema,
      expectedPartyRevision: z.number().int().positive(),
      response: z.enum(['ready', 'not_ready']),
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('activity.entry.enter'),
      requestId: socialGraphRequestIdSchema,
      preparationId: uuidSchema,
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('activity.instance.snapshot.request') }).strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('activity.interact'),
      requestId: socialGraphRequestIdSchema,
      intent: cooperativeActivityInteractionIntentSchema,
    })
    .strict(),
  z
    .object({
      ...clientEnvelope,
      type: z.literal('activity.leave'),
      requestId: socialGraphRequestIdSchema,
      instanceId: uuidSchema,
    })
    .strict(),
  z.object({ ...clientEnvelope, type: z.literal('activity.resume') }).strict(),
]);
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;

const serverEnvelope = {
  version: z.literal(REALTIME_PROTOCOL_VERSION),
  serverTime: z.number().int().nonnegative(),
} as const;

export const realtimeSafeErrorCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'AUTHENTICATION_TIMEOUT',
  'INVALID_TICKET',
  'ACCESS_REVOKED',
  'PLAYER_SUSPENDED',
  'PLAYER_RENAME_REQUIRED',
  'GAME_MAINTENANCE',
  'CHANNEL_FULL',
  'CHANNEL_UNAVAILABLE',
  'INVALID_MESSAGE',
  'MOVEMENT_REJECTED',
  'RATE_LIMITED',
  'SERVER_UNAVAILABLE',
]);
export type RealtimeSafeErrorCode = z.infer<typeof realtimeSafeErrorCodeSchema>;

export const realtimeServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...serverEnvelope,
      type: z.literal('admitted'),
      self: publicPresenceSchema,
      channels: z.array(realtimeChannelSchema).max(99),
      checkpointIntervalMs: z.number().int().min(5_000).max(120_000),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.bootstrap'),
      chat: chatBootstrapSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.message'),
      message: chatMessageSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.history'),
      history: chatHistorySchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.message_rejected'),
      requestId: z.string().min(1).max(64),
      reason: chatMessageRejectionReasonSchema,
      retryAfterMs: z.number().int().min(0).max(60_000).optional(),
      mutedUntil: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum([
        'chat.player_muted',
        'chat.player_unmuted',
        'chat.player_blocked',
        'chat.player_unblocked',
      ]),
      targetPresenceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.report_received'),
      requestId: z.string().min(1).max(64),
      reportId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.unread_count'),
      scope: chatScopeSchema,
      count: z.number().int().min(0).max(999),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.moderation_notice'),
      code: z.enum(['chat_muted', 'chat_unmuted', 'warning']),
      mutedUntil: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('chat.system_message'),
      message: chatMessageSchema.refine((message) => message.scope === 'system'),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.bootstrap'),
      social: socialBootstrapSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.inspect.result'),
      requestId: z.string().min(1).max(64),
      profile: publicPlayerInspectSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.request.received'),
      interaction: socialInteractionViewSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.request.updated'),
      interaction: socialInteractionViewSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.gift.completed'),
      gift: socialGiftViewSchema,
      receipt: socialReceiptSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum([
        'social.trade.opened',
        'social.trade.updated',
        'social.trade.confirmation_changed',
      ]),
      trade: socialTradeViewSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.trade.completed'),
      trade: socialTradeViewSchema,
      receipt: socialReceiptSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum(['social.trade.cancelled', 'social.trade.invalidated']),
      trade: socialTradeViewSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.interaction.error'),
      requestId: z.string().min(1).max(64),
      code: socialInteractionErrorCodeSchema,
      retryAfterMs: z.number().int().min(0).max(60_000).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum(['social_graph.bootstrap', 'friends.snapshot']),
      socialGraph: socialGraphBootstrapSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('friends.request.received'),
      request: friendRequestViewSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('friends.relationship.updated'),
      socialGraph: socialGraphBootstrapSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('party.snapshot'),
      party: partySnapshotSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum(['party.invitation.received', 'party.invitation.updated']),
      invitation: partyInvitationSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum([
        'party.member.joined',
        'party.member.left',
        'party.leader.changed',
        'party.ready_check.updated',
      ]),
      party: partySnapshotSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('party.disbanded'),
      partyId: uuidSchema,
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.notification'),
      notification: socialGraphNotificationSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('social.error'),
      requestId: socialGraphRequestIdSchema,
      code: socialGraphErrorCodeSchema,
      retryAfterMs: z.number().int().min(0).max(3_600_000).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('activity.bootstrap'),
      activity: cooperativeActivityBootstrapSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('activity.catalog'),
      catalog: cooperativeActivityCatalogSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('activity.entry.updated'),
      preparation: cooperativeActivityPreparationSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.enum([
        'activity.instance.created',
        'activity.instance.snapshot',
        'activity.objective.updated',
        'activity.participant.updated',
        'activity.timer.updated',
        'activity.paused',
        'activity.completed',
        'activity.failed',
        'activity.cancelled',
      ]),
      instance: cooperativeActivityInstanceSnapshotSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('activity.error'),
      requestId: socialGraphRequestIdSchema.optional(),
      code: cooperativeActivityErrorCodeSchema,
      retryAfterMs: z.number().int().min(0).max(3_600_000).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('snapshot'),
      worldId: mapIdSchema,
      channelId: uuidSchema,
      presences: z.array(publicPresenceSchema).max(200),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('presence_joined'),
      presence: publicPresenceSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('presence_updated'),
      presence: publicPresenceSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('appearance_updated'),
      presenceId: uuidSchema,
      appearanceId: compactAppearanceReferenceSchema.shape.appearanceId,
      appearanceRevision: compactAppearanceReferenceSchema.shape.appearanceRevision,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('emote.activated'),
      requestId: z.string().min(1).max(64),
      presenceId: uuidSchema,
      emoteKey: cosmeticEmoteKeySchema,
      activationId: uuidSchema,
      startedAt: z.number().int().nonnegative(),
      durationMs: z.number().int().min(250).max(15_000),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('emote.rejected'),
      requestId: z.string().min(1).max(64),
      reason: z.enum([
        'not_owned',
        'rate_limited',
        'access_changed',
        'maintenance',
        'module_disabled',
        'invalid_request',
      ]),
    })
    .strict(),
  z
    .object({ ...serverEnvelope, type: z.literal('presence_left'), presenceId: uuidSchema })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('channel_changed'),
      self: publicPresenceSchema,
      channels: z.array(realtimeChannelSchema).max(99),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('channels'),
      channels: z.array(realtimeChannelSchema).max(99),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('movement_rejected'),
      reason: z.enum(['stale_sequence', 'frequency', 'speed', 'collision', 'bounds', 'malformed']),
      authoritative: publicPresenceSchema,
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('error'),
      code: realtimeSafeErrorCodeSchema,
      retryable: z.boolean(),
      requestId: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z
    .object({
      ...serverEnvelope,
      type: z.literal('pong'),
      nonce: z.string().min(1).max(64),
    })
    .strict(),
]);
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;

export function parseRealtimeClientMessage(payload: string): RealtimeClientMessage | undefined {
  if (new TextEncoder().encode(payload).byteLength > REALTIME_MAX_PAYLOAD_BYTES) return undefined;
  try {
    const value: unknown = JSON.parse(payload);
    const parsed = realtimeClientMessageSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function serializeRealtimeServerMessage(message: RealtimeServerMessage): string {
  return JSON.stringify(realtimeServerMessageSchema.parse(message));
}
