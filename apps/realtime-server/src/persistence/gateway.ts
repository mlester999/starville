import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { persistedResolvedAvatarSchema, type CompactAppearanceReference } from '@starville/avatar';
import {
  playableVerticalSliceSchema,
  privateHomeRealtimeEventSchema,
  type PlayableVerticalSlice,
  type PrivateHomeRealtimeEvent,
} from '@starville/cozy-gameplay';
import { mapIdSchema, mapManifestSchema, type MapManifest } from '@starville/game-core';
import {
  cooperativeActivityBootstrapSchema,
  cooperativeActivityOperationResultSchema,
  type CooperativeActivityBootstrap,
  type CooperativeActivityOperationResult,
} from '@starville/cooperative-activities';
import {
  chatBootstrapSchema,
  chatHistorySchema,
  chatMessageSchema,
  chatPlayerPreferenceSchema,
  socialBootstrapSchema,
  socialGraphBootstrapSchema,
  socialGraphOperationResultSchema,
  socialInspectResultSchema,
  socialInteractionCollectionSchema,
  socialInteractionViewSchema,
  socialReceiptSchema,
  type ChatBootstrap,
  type ChatHistory,
  type ChatMessage,
  type ChatPlayerPreference,
  type ChatReportCategory,
  type PlayerChatScope,
  type PublicPlayerInspect,
  type SocialBootstrap,
  type SocialGraphBootstrap,
  type SocialGraphOperationResult,
  type SocialInteractionView,
  type SocialOfferItemInput,
  type publicPresenceSchema,
} from '@starville/realtime';
import { homeVisitParticipantSchema } from '@starville/housing';

const channelSchema = z
  .object({
    id: z.uuid(),
    worldId: mapIdSchema,
    number: z.number().int().min(1).max(99),
    capacity: z.number().int().min(1).max(200),
    population: z.number().int().min(0).max(200),
    available: z.boolean(),
  })
  .strict();

const publishedManifestSchema = mapManifestSchema.transform((manifest): MapManifest => {
  const spawn = manifest.spawns.find((candidate) => candidate.id === manifest.defaultSpawnId);
  if (spawn === undefined) throw new Error('Published manifest default spawn is missing.');
  return { ...manifest, spawn: { x: spawn.x, y: spawn.y } };
});

const admittedSchema = z
  .object({
    status: z.literal('admitted'),
    sessionId: z.uuid(),
    presenceId: z.uuid(),
    displayName: z.string().min(3).max(20),
    level: z.number().int().min(1).max(999),
    appearancePreset: z.enum(['moss', 'marigold', 'moonberry', 'river']),
    worldId: mapIdSchema,
    worldVersionId: z.uuid(),
    manifest: publishedManifestSchema,
    channelId: z.uuid(),
    channelNumber: z.number().int().min(1).max(99),
    x: z.coerce.number().finite().min(0).max(128),
    y: z.coerce.number().finite().min(0).max(128),
    facingDirection: z.enum([
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ]),
    channels: z.array(channelSchema).max(99),
  })
  .strict();

const denialSchema = z
  .object({
    status: z.enum([
      'invalid_ticket',
      'access_revoked',
      'player_suspended',
      'rename_required',
      'maintenance',
      'world_unavailable',
      'world_changed',
      'channel_full',
      'channel_unavailable',
      'closed',
    ]),
  })
  .strict();

export type RealtimeAdmission = z.infer<typeof admittedSchema>;
export type RealtimeDenial = z.infer<typeof denialSchema>['status'];

const privateHomeAdmittedSchema = z
  .object({
    status: z.literal('admitted'),
    sessionId: z.uuid(),
    homeId: z.uuid(),
    lastEventNumber: z.string().regex(/^\d+$/u),
    view: z.unknown(),
  })
  .strict();
const privateHomeDenialSchema = z
  .object({
    status: z.enum([
      'invalid_ticket',
      'invalid_session',
      'access_revoked',
      'player_suspended',
      'rename_required',
      'maintenance',
      'world_unavailable',
      'world_changed',
      'plot_unavailable',
      'plot_world_mismatch',
      'closed',
    ]),
  })
  .strict();
const privateHomeEventsSchema = z
  .object({
    status: z.literal('loaded'),
    lastEventNumber: z.string().regex(/^\d+$/u),
    events: z.array(z.unknown()).max(100),
    view: z.unknown(),
  })
  .strict();
const privateHomeNoChangesSchema = z
  .object({
    status: z.literal('no_changes'),
    lastEventNumber: z.string().regex(/^\d+$/u),
  })
  .strict();

export interface PrivateHomeRealtimeAdmission {
  readonly status: 'admitted';
  readonly sessionId: string;
  readonly homeId: string;
  readonly lastEventNumber: string;
  readonly view: PlayableVerticalSlice;
}
export type PrivateHomeRealtimeDenial = z.infer<typeof privateHomeDenialSchema>['status'];
export interface PrivateHomeRealtimeEvents {
  readonly lastEventNumber: string;
  readonly events: readonly PrivateHomeRealtimeEvent[];
  readonly view: PlayableVerticalSlice;
}

const homeVisitAdmittedSchema = z
  .object({
    status: z.literal('admitted'),
    realtimeSessionId: z.uuid(),
    visitSessionId: z.uuid(),
    participantId: z.uuid(),
    homeId: z.uuid(),
    lastEventNumber: z.string().regex(/^\d+$/u),
    snapshot: z.record(z.string(), z.unknown()),
  })
  .strict();
const homeVisitDenialSchema = z
  .object({
    status: z.enum([
      'invalid_ticket',
      'invalid_session',
      'access_revoked',
      'player_suspended',
      'rename_required',
      'maintenance',
      'home_visitor_not_found',
      'home_visit_session_closing',
      'home_visit_blocked',
      'home_visit_reconnect_expired',
      'closed',
      'invalid_position',
      'stale_sequence',
    ]),
  })
  .strict();
const homeVisitEventsSchema = z
  .object({
    status: z.literal('loaded'),
    lastEventNumber: z.string().regex(/^\d+$/u),
    events: z.array(z.record(z.string(), z.unknown())).max(100),
    snapshot: z.record(z.string(), z.unknown()),
  })
  .strict();
const homeVisitNoChangesSchema = z
  .object({ status: z.literal('no_changes'), lastEventNumber: z.string().regex(/^\d+$/u) })
  .strict();

export type HomeVisitRealtimeAdmission = z.infer<typeof homeVisitAdmittedSchema>;
export type HomeVisitRealtimeDenial = z.infer<typeof homeVisitDenialSchema>['status'];
export interface HomeVisitRealtimeEvents {
  readonly lastEventNumber: string;
  readonly events: readonly Readonly<Record<string, unknown>>[];
  readonly snapshot: Readonly<Record<string, unknown>>;
}

const socialOperationResultSchema = z
  .object({
    status: z.string().min(1).max(64),
    interaction: socialInteractionViewSchema.optional(),
    receipt: socialReceiptSchema.optional(),
    senderPresenceId: z.uuid().optional(),
    targetPresenceId: z.uuid().optional(),
  })
  .strict();

export type SocialOperationResult = z.infer<typeof socialOperationResultSchema>;

export interface RealtimePersistenceGateway {
  admit(
    ticketHash: string,
    connectionId: string,
    requestId: string,
  ): Promise<RealtimeAdmission | RealtimeDenial>;
  checkpoint(
    sessionId: string,
    presence: z.infer<typeof publicPresenceSchema>,
  ): Promise<'checkpointed' | 'closed' | 'invalid_position'>;
  switchChannel(
    sessionId: string,
    channelId: string,
    requestId: string,
  ): Promise<
    | {
        readonly status: 'switched';
        readonly channelId: string;
        readonly channelNumber: number;
        readonly channels: RealtimeAdmission['channels'];
      }
    | 'unchanged'
    | 'closed'
    | 'channel_full'
    | 'channel_unavailable'
  >;
  revalidate(sessionId: string): Promise<'active' | RealtimeDenial>;
  avatarProfile(
    sessionId: string,
    requestId: string,
  ): Promise<
    | CompactAppearanceReference
    | 'not_found'
    | 'closed'
    | 'access_revoked'
    | 'module_disabled'
    | 'maintenance'
    | 'rate_limited'
    | 'fallback'
  >;
  activateEmote(
    sessionId: string,
    emoteKey: string,
    requestId: string,
  ): Promise<
    | {
        readonly status: 'activated';
        readonly presenceId: string;
        readonly channelId: string;
        readonly emoteKey: string;
        readonly activationId: string;
        readonly startedAt: number;
        readonly durationMs: number;
      }
    | {
        readonly status:
          | 'not_owned'
          | 'rate_limited'
          | 'access_changed'
          | 'maintenance'
          | 'module_disabled'
          | 'invalid_request';
      }
  >;
  close(sessionId: string, reason: string, requestId: string): Promise<boolean>;
  chatBootstrap(sessionId: string): Promise<ChatBootstrap>;
  acceptChat(
    sessionId: string,
    requestId: string,
    scope: PlayerChatScope,
    text: string,
    position: { readonly x: number; readonly y: number },
  ): Promise<
    | { readonly status: 'accepted' | 'replayed'; readonly message: ChatMessage }
    | { readonly status: 'invalid_content' | 'access_changed' }
    | { readonly status: 'chat_muted'; readonly mutedUntil: string }
  >;
  chatHistory(
    sessionId: string,
    scope: ChatHistory['scope'],
    afterSequence: number,
  ): Promise<ChatHistory>;
  updateChatPreference(
    sessionId: string,
    targetPresenceId: string,
    action: 'mute' | 'unmute' | 'block' | 'unblock',
  ): Promise<ChatPlayerPreference>;
  reportChat(
    sessionId: string,
    messageId: string,
    category: ChatReportCategory,
    reason: string,
    requestId: string,
  ): Promise<{ readonly status: 'accepted'; readonly reportId: string }>;
  socialBootstrap(sessionId: string): Promise<SocialBootstrap>;
  inspectSocialPlayer(
    sessionId: string,
    targetPresenceId: string,
  ): Promise<{ readonly status: string; readonly profile: PublicPlayerInspect | undefined }>;
  createSocialGift(
    sessionId: string,
    targetPresenceId: string,
    itemSlug: string,
    quantity: number,
    requestId: string,
  ): Promise<SocialOperationResult>;
  respondSocialGift(
    sessionId: string,
    interactionId: string,
    action: 'accept' | 'decline',
    requestId: string,
  ): Promise<SocialOperationResult>;
  cancelSocialGift(
    sessionId: string,
    interactionId: string,
    requestId: string,
  ): Promise<SocialOperationResult>;
  createSocialTrade(
    sessionId: string,
    targetPresenceId: string,
    requestId: string,
  ): Promise<SocialOperationResult>;
  respondSocialTrade(
    sessionId: string,
    interactionId: string,
    action: 'accept' | 'decline',
    requestId: string,
  ): Promise<SocialOperationResult>;
  updateSocialTradeOffer(
    sessionId: string,
    interactionId: string,
    expectedRevision: number,
    items: readonly SocialOfferItemInput[],
    requestId: string,
  ): Promise<SocialOperationResult>;
  confirmSocialTrade(
    sessionId: string,
    interactionId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialOperationResult>;
  cancelSocialTrade(
    sessionId: string,
    interactionId: string,
    requestId: string,
  ): Promise<SocialOperationResult>;
  resumeSocialTrade(
    sessionId: string,
    interactionId: string,
    requestId: string,
  ): Promise<SocialOperationResult>;
  socialDisconnect(
    sessionId: string,
    reason: string,
    requestId: string,
  ): Promise<readonly SocialInteractionView[]>;
  invalidateSocialPair(
    sessionId: string,
    targetPresenceId: string,
    requestId: string,
  ): Promise<readonly SocialInteractionView[]>;
  socialGraphBootstrap(sessionId: string): Promise<SocialGraphBootstrap>;
  sendFriendRequest(
    sessionId: string,
    targetPresenceId: string,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  respondFriendRequest(
    sessionId: string,
    friendRequestId: string,
    action: 'accept' | 'decline',
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  cancelFriendRequest(
    sessionId: string,
    friendRequestId: string,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  removeFriend(
    sessionId: string,
    targetPresenceId: string,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  createParty(sessionId: string, requestId: string): Promise<SocialGraphOperationResult>;
  sendPartyInvitation(
    sessionId: string,
    targetPresenceId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  respondPartyInvitation(
    sessionId: string,
    invitationId: string,
    expectedRevision: number,
    action: 'accept' | 'decline',
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  cancelPartyInvitation(
    sessionId: string,
    invitationId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  leaveParty(
    sessionId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  kickPartyMember(
    sessionId: string,
    targetPresenceId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  promotePartyLeader(
    sessionId: string,
    targetPresenceId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  disbandParty(
    sessionId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  startPartyReadyCheck(
    sessionId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  respondPartyReadyCheck(
    sessionId: string,
    readyCheckId: string,
    expectedRevision: number,
    response: 'ready' | 'not_ready',
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  socialGraphDisconnect(
    sessionId: string,
    reason: string,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  invalidateSocialGraphPair(
    sessionId: string,
    targetPresenceId: string,
    requestId: string,
  ): Promise<SocialGraphOperationResult>;
  cooperativeActivityBootstrap(sessionId: string): Promise<CooperativeActivityBootstrap>;
  prepareCooperativeActivityEntry(
    sessionId: string,
    activityKey: string,
    expectedPartyRevision: number,
    requestId: string,
  ): Promise<CooperativeActivityOperationResult>;
  enterCooperativeActivity(
    sessionId: string,
    preparationId: string,
    requestId: string,
  ): Promise<CooperativeActivityOperationResult>;
  interactCooperativeActivity(
    sessionId: string,
    instanceId: string,
    expectedRevision: number,
    objectiveKey: string,
    objectKey: string,
    position: { readonly x: number; readonly y: number },
    requestId: string,
  ): Promise<CooperativeActivityOperationResult>;
  leaveCooperativeActivity(
    sessionId: string,
    instanceId: string,
    requestId: string,
  ): Promise<CooperativeActivityOperationResult>;
  cooperativeActivityDisconnect(
    sessionId: string,
    reason: string,
    requestId: string,
  ): Promise<CooperativeActivityOperationResult>;
  admitPrivateHome(
    ticketHash: string,
    connectionId: string,
    requestId: string,
  ): Promise<PrivateHomeRealtimeAdmission | PrivateHomeRealtimeDenial>;
  privateHomeEvents(
    sessionId: string,
    afterEventNumber: string,
    forceSnapshot: boolean,
  ): Promise<PrivateHomeRealtimeEvents | 'no_changes' | PrivateHomeRealtimeDenial>;
  revalidatePrivateHome(sessionId: string): Promise<'active' | PrivateHomeRealtimeDenial>;
  closePrivateHome(sessionId: string, reason: string, requestId: string): Promise<boolean>;
  admitHomeVisit(
    ticketHash: string,
    connectionId: string,
    requestId: string,
  ): Promise<HomeVisitRealtimeAdmission | HomeVisitRealtimeDenial>;
  homeVisitEvents(
    sessionId: string,
    afterEventNumber: string,
    forceSnapshot: boolean,
  ): Promise<HomeVisitRealtimeEvents | 'no_changes' | HomeVisitRealtimeDenial>;
  checkpointHomeVisit(
    sessionId: string,
    movement: {
      readonly x: number;
      readonly y: number;
      readonly facingDirection: string;
      readonly sequence: number;
    },
  ): Promise<
    | {
        readonly status: 'checkpointed';
        readonly participant: z.infer<typeof homeVisitParticipantSchema>;
      }
    | HomeVisitRealtimeDenial
  >;
  revalidateHomeVisit(sessionId: string): Promise<'active' | HomeVisitRealtimeDenial>;
  closeHomeVisit(sessionId: string, reason: string, requestId: string): Promise<boolean>;
}

export class RealtimePersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Realtime persistence boundary failed.');
    this.name = 'RealtimePersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new RealtimePersistenceError(operation);
  return data;
}

export function createSupabaseRealtimePersistenceGateway(
  client: SupabaseClient,
): RealtimePersistenceGateway {
  return {
    async admit(ticketHash, connectionId, requestId) {
      const value = await rpc(client, 'admit_player_realtime_ticket', {
        p_ticket_hash: ticketHash,
        p_connection_id: connectionId,
        p_request_id: requestId,
      });
      const admitted = admittedSchema.safeParse(value);
      if (admitted.success) return admitted.data;
      return denialSchema.parse(value).status;
    },

    async admitPrivateHome(ticketHash, connectionId, requestId) {
      const value = await rpc(client, 'admit_player_private_home_realtime_ticket', {
        p_ticket_hash: ticketHash,
        p_connection_id: connectionId,
        p_request_id: requestId,
      });
      const admitted = privateHomeAdmittedSchema.safeParse(value);
      if (admitted.success) {
        return { ...admitted.data, view: playableVerticalSliceSchema.parse(admitted.data.view) };
      }
      return privateHomeDenialSchema.parse(value).status;
    },

    async privateHomeEvents(sessionId, afterEventNumber, forceSnapshot) {
      const value = await rpc(client, 'get_player_private_home_realtime_events', {
        p_session_id: sessionId,
        p_after_event_number: afterEventNumber,
        p_force_snapshot: forceSnapshot,
      });
      const loaded = privateHomeEventsSchema.safeParse(value);
      if (loaded.success) {
        return {
          lastEventNumber: loaded.data.lastEventNumber,
          events: loaded.data.events.map((event) => privateHomeRealtimeEventSchema.parse(event)),
          view: playableVerticalSliceSchema.parse(loaded.data.view),
        };
      }
      if (privateHomeNoChangesSchema.safeParse(value).success) return 'no_changes';
      return privateHomeDenialSchema.parse(value).status;
    },

    async revalidatePrivateHome(sessionId) {
      const value = z
        .object({ status: z.string().min(1).max(64) })
        .strict()
        .parse(
          await rpc(client, 'revalidate_player_private_home_realtime_session', {
            p_session_id: sessionId,
          }),
        ).status;
      if (value === 'active') return value;
      return privateHomeDenialSchema.parse({ status: value }).status;
    },

    async closePrivateHome(sessionId, reason, requestId) {
      return z.boolean().parse(
        await rpc(client, 'close_player_private_home_realtime_session', {
          p_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },

    async admitHomeVisit(ticketHash, connectionId, requestId) {
      const value = await rpc(client, 'admit_player_home_visit_realtime_ticket', {
        p_ticket_hash: ticketHash,
        p_connection_id: connectionId,
        p_request_id: requestId,
      });
      const admitted = homeVisitAdmittedSchema.safeParse(value);
      return admitted.success ? admitted.data : homeVisitDenialSchema.parse(value).status;
    },

    async homeVisitEvents(sessionId, afterEventNumber, forceSnapshot) {
      const value = await rpc(client, 'get_player_home_visit_realtime_events', {
        p_realtime_session_id: sessionId,
        p_after_event_number: afterEventNumber,
        p_force_snapshot: forceSnapshot,
      });
      const loaded = homeVisitEventsSchema.safeParse(value);
      if (loaded.success) return loaded.data;
      if (homeVisitNoChangesSchema.safeParse(value).success) return 'no_changes';
      return homeVisitDenialSchema.parse(value).status;
    },

    async checkpointHomeVisit(sessionId, movement) {
      const value = await rpc(client, 'checkpoint_player_home_visit_movement', {
        p_realtime_session_id: sessionId,
        p_position_x: movement.x,
        p_position_y: movement.y,
        p_facing_direction: movement.facingDirection,
        p_sequence: movement.sequence,
      });
      const checkpointed = z
        .object({ status: z.literal('checkpointed'), participant: homeVisitParticipantSchema })
        .strict()
        .safeParse(value);
      return checkpointed.success ? checkpointed.data : homeVisitDenialSchema.parse(value).status;
    },

    async revalidateHomeVisit(sessionId) {
      const value = z
        .object({ status: z.string().min(1).max(64) })
        .strict()
        .parse(
          await rpc(client, 'revalidate_player_home_visit_realtime_session', {
            p_realtime_session_id: sessionId,
          }),
        ).status;
      return value === 'active' ? value : homeVisitDenialSchema.parse({ status: value }).status;
    },

    async closeHomeVisit(sessionId, reason, requestId) {
      return z.boolean().parse(
        await rpc(client, 'close_player_home_visit_realtime_session', {
          p_realtime_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },

    async checkpoint(sessionId, presence) {
      const parsed = z
        .object({ status: z.enum(['checkpointed', 'closed', 'invalid_position']) })
        .strict()
        .parse(
          await rpc(client, 'checkpoint_realtime_session', {
            p_session_id: sessionId,
            p_position_x: presence.x,
            p_position_y: presence.y,
            p_facing_direction: presence.facingDirection,
            p_sequence: presence.sequence,
          }),
        );
      return parsed.status;
    },

    async avatarProfile(sessionId, requestId) {
      const value = await rpc(client, 'get_realtime_avatar_profile', {
        p_realtime_session_id: sessionId,
        p_request_id: requestId,
      });
      const loaded = persistedResolvedAvatarSchema.safeParse(value);
      if (loaded.success) {
        return {
          appearanceId: loaded.data.appearance.appearanceId,
          appearanceRevision: loaded.data.appearance.revision,
        };
      }
      return z
        .object({
          status: z.enum([
            'not_found',
            'closed',
            'access_revoked',
            'module_disabled',
            'maintenance',
            'rate_limited',
            'fallback',
          ]),
        })
        .strict()
        .parse(value).status;
    },

    async activateEmote(sessionId, emoteKey, requestId) {
      const value = await rpc(client, 'activate_realtime_player_emote', {
        p_realtime_session_id: sessionId,
        p_emote_key: emoteKey,
        p_request_id: requestId,
      });
      const activated = z
        .object({
          status: z.literal('activated'),
          presenceId: z.uuid(),
          channelId: z.uuid(),
          emoteKey: z.string().min(3).max(80),
          activationId: z.uuid(),
          startedAt: z.number().int().nonnegative(),
          durationMs: z.number().int().min(250).max(15_000),
        })
        .strict()
        .safeParse(value);
      if (activated.success) return activated.data;
      return z
        .object({
          status: z.enum([
            'not_owned',
            'rate_limited',
            'access_changed',
            'maintenance',
            'module_disabled',
            'invalid_request',
          ]),
        })
        .strict()
        .parse(value);
    },

    async switchChannel(sessionId, channelId, requestId) {
      const value = await rpc(client, 'switch_realtime_channel', {
        p_session_id: sessionId,
        p_channel_id: channelId,
        p_request_id: requestId,
      });
      const switched = z
        .object({
          status: z.literal('switched'),
          channelId: z.uuid(),
          channelNumber: z.number().int().min(1).max(99),
          channels: z.array(channelSchema).max(99),
        })
        .strict()
        .safeParse(value);
      if (switched.success) return switched.data;
      return z
        .object({
          status: z.enum(['unchanged', 'closed', 'channel_full', 'channel_unavailable']),
        })
        .strict()
        .parse(value).status;
    },

    async revalidate(sessionId) {
      const parsed = z
        .object({
          status: z.enum([
            'active',
            'invalid_ticket',
            'access_revoked',
            'player_suspended',
            'rename_required',
            'maintenance',
            'world_unavailable',
            'world_changed',
            'channel_full',
            'channel_unavailable',
            'closed',
          ]),
        })
        .strict()
        .parse(await rpc(client, 'revalidate_realtime_session', { p_session_id: sessionId }));
      return parsed.status;
    },

    async close(sessionId, reason, requestId) {
      return z.boolean().parse(
        await rpc(client, 'close_realtime_session', {
          p_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },

    async chatBootstrap(sessionId) {
      return chatBootstrapSchema.parse(
        await rpc(client, 'get_realtime_chat_bootstrap', { p_session_id: sessionId }),
      );
    },

    async acceptChat(sessionId, requestId, scope, text, position) {
      const value = await rpc(client, 'accept_realtime_chat_message', {
        p_session_id: sessionId,
        p_client_request_id: requestId,
        p_scope: scope,
        p_message_text: text,
        p_sender_position_x: position.x,
        p_sender_position_y: position.y,
      });
      const accepted = z
        .object({ status: z.enum(['accepted', 'replayed']), message: chatMessageSchema })
        .strict()
        .safeParse(value);
      if (accepted.success) return accepted.data;
      const muted = z
        .object({ status: z.literal('chat_muted'), mutedUntil: z.iso.datetime({ offset: true }) })
        .strict()
        .safeParse(value);
      if (muted.success) return muted.data;
      return z
        .object({ status: z.enum(['invalid_content', 'access_changed']) })
        .strict()
        .parse(value);
    },

    async chatHistory(sessionId, scope, afterSequence) {
      return chatHistorySchema.parse(
        await rpc(client, 'get_realtime_chat_history', {
          p_session_id: sessionId,
          p_scope: scope,
          p_after_sequence: afterSequence,
        }),
      );
    },

    async updateChatPreference(sessionId, targetPresenceId, action) {
      return chatPlayerPreferenceSchema.parse(
        await rpc(client, 'update_realtime_chat_preference', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_action: action,
        }),
      );
    },

    async reportChat(sessionId, messageId, category, reason, requestId) {
      return z
        .object({ status: z.literal('accepted'), reportId: z.uuid() })
        .strict()
        .parse(
          await rpc(client, 'report_realtime_chat_message', {
            p_session_id: sessionId,
            p_message_id: messageId,
            p_category: category,
            p_reason: reason,
            p_request_id: requestId,
          }),
        );
    },

    async socialBootstrap(sessionId) {
      return socialBootstrapSchema.parse(
        await rpc(client, 'get_realtime_social_bootstrap', { p_session_id: sessionId }),
      );
    },

    async inspectSocialPlayer(sessionId, targetPresenceId) {
      return socialInspectResultSchema.parse(
        await rpc(client, 'inspect_realtime_social_player', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
        }),
      );
    },

    async createSocialGift(sessionId, targetPresenceId, itemSlug, quantity, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'create_realtime_social_gift', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_item_slug: itemSlug,
          p_quantity: quantity,
          p_client_request_id: requestId,
        }),
      );
    },

    async respondSocialGift(sessionId, interactionId, action, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'respond_realtime_social_gift', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_action: action,
          p_client_request_id: requestId,
        }),
      );
    },

    async cancelSocialGift(sessionId, interactionId, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'cancel_realtime_social_gift', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_client_request_id: requestId,
        }),
      );
    },

    async createSocialTrade(sessionId, targetPresenceId, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'create_realtime_social_trade', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_client_request_id: requestId,
        }),
      );
    },

    async respondSocialTrade(sessionId, interactionId, action, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'respond_realtime_social_trade', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_action: action,
          p_client_request_id: requestId,
        }),
      );
    },

    async updateSocialTradeOffer(sessionId, interactionId, expectedRevision, items, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'update_realtime_social_trade_offer', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_expected_revision: expectedRevision,
          p_items: items,
          p_client_request_id: requestId,
        }),
      );
    },

    async confirmSocialTrade(sessionId, interactionId, expectedRevision, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'confirm_realtime_social_trade', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async cancelSocialTrade(sessionId, interactionId, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'cancel_realtime_social_trade', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_client_request_id: requestId,
        }),
      );
    },

    async resumeSocialTrade(sessionId, interactionId, requestId) {
      return socialOperationResultSchema.parse(
        await rpc(client, 'resume_realtime_social_trade', {
          p_session_id: sessionId,
          p_interaction_id: interactionId,
          p_client_request_id: requestId,
        }),
      );
    },

    async socialDisconnect(sessionId, reason, requestId) {
      return socialInteractionCollectionSchema.parse(
        await rpc(client, 'handle_realtime_social_disconnect', {
          p_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      ).interactions;
    },

    async invalidateSocialPair(sessionId, targetPresenceId, requestId) {
      return socialInteractionCollectionSchema.parse(
        await rpc(client, 'invalidate_realtime_social_pair', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_request_id: requestId,
        }),
      ).interactions;
    },

    async socialGraphBootstrap(sessionId) {
      return socialGraphBootstrapSchema.parse(
        await rpc(client, 'get_realtime_social_graph_bootstrap', { p_session_id: sessionId }),
      );
    },

    async sendFriendRequest(sessionId, targetPresenceId, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'send_realtime_friend_request', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_client_request_id: requestId,
        }),
      );
    },

    async respondFriendRequest(sessionId, friendRequestId, action, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'respond_realtime_friend_request', {
          p_session_id: sessionId,
          p_friend_request_id: friendRequestId,
          p_action: action,
          p_client_request_id: requestId,
        }),
      );
    },

    async cancelFriendRequest(sessionId, friendRequestId, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'cancel_realtime_friend_request', {
          p_session_id: sessionId,
          p_friend_request_id: friendRequestId,
          p_client_request_id: requestId,
        }),
      );
    },

    async removeFriend(sessionId, targetPresenceId, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'remove_realtime_friend', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_client_request_id: requestId,
        }),
      );
    },

    async createParty(sessionId, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'create_realtime_party', {
          p_session_id: sessionId,
          p_client_request_id: requestId,
        }),
      );
    },

    async sendPartyInvitation(sessionId, targetPresenceId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'send_realtime_party_invitation', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async respondPartyInvitation(sessionId, invitationId, expectedRevision, action, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'respond_realtime_party_invitation', {
          p_session_id: sessionId,
          p_invitation_id: invitationId,
          p_expected_revision: expectedRevision,
          p_action: action,
          p_client_request_id: requestId,
        }),
      );
    },

    async cancelPartyInvitation(sessionId, invitationId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'cancel_realtime_party_invitation', {
          p_session_id: sessionId,
          p_invitation_id: invitationId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async leaveParty(sessionId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'leave_realtime_party', {
          p_session_id: sessionId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async kickPartyMember(sessionId, targetPresenceId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'kick_realtime_party_member', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async promotePartyLeader(sessionId, targetPresenceId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'promote_realtime_party_leader', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async disbandParty(sessionId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'disband_realtime_party', {
          p_session_id: sessionId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async startPartyReadyCheck(sessionId, expectedRevision, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'start_realtime_party_ready_check', {
          p_session_id: sessionId,
          p_expected_revision: expectedRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async respondPartyReadyCheck(sessionId, readyCheckId, expectedRevision, response, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'respond_realtime_party_ready_check', {
          p_session_id: sessionId,
          p_ready_check_id: readyCheckId,
          p_expected_revision: expectedRevision,
          p_response: response,
          p_client_request_id: requestId,
        }),
      );
    },

    async socialGraphDisconnect(sessionId, reason, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'handle_realtime_social_graph_disconnect', {
          p_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },

    async invalidateSocialGraphPair(sessionId, targetPresenceId, requestId) {
      return socialGraphOperationResultSchema.parse(
        await rpc(client, 'invalidate_realtime_social_graph_pair', {
          p_session_id: sessionId,
          p_target_presence_id: targetPresenceId,
          p_request_id: requestId,
        }),
      );
    },

    async cooperativeActivityBootstrap(sessionId) {
      return cooperativeActivityBootstrapSchema.parse(
        await rpc(client, 'get_realtime_cooperative_activity_bootstrap', {
          p_session_id: sessionId,
        }),
      );
    },

    async prepareCooperativeActivityEntry(
      sessionId,
      activityKey,
      expectedPartyRevision,
      requestId,
    ) {
      return cooperativeActivityOperationResultSchema.parse(
        await rpc(client, 'prepare_realtime_cooperative_activity_entry', {
          p_session_id: sessionId,
          p_activity_key: activityKey,
          p_expected_party_revision: expectedPartyRevision,
          p_client_request_id: requestId,
        }),
      );
    },

    async enterCooperativeActivity(sessionId, preparationId, requestId) {
      return cooperativeActivityOperationResultSchema.parse(
        await rpc(client, 'enter_realtime_cooperative_activity', {
          p_session_id: sessionId,
          p_preparation_id: preparationId,
          p_client_request_id: requestId,
        }),
      );
    },

    async interactCooperativeActivity(
      sessionId,
      instanceId,
      expectedRevision,
      objectiveKey,
      objectKey,
      position,
      requestId,
    ) {
      return cooperativeActivityOperationResultSchema.parse(
        await rpc(client, 'interact_realtime_cooperative_activity', {
          p_session_id: sessionId,
          p_instance_id: instanceId,
          p_expected_revision: expectedRevision,
          p_objective_key: objectiveKey,
          p_object_key: objectKey,
          p_position_x: position.x,
          p_position_y: position.y,
          p_client_request_id: requestId,
        }),
      );
    },

    async leaveCooperativeActivity(sessionId, instanceId, requestId) {
      return cooperativeActivityOperationResultSchema.parse(
        await rpc(client, 'leave_realtime_cooperative_activity', {
          p_session_id: sessionId,
          p_instance_id: instanceId,
          p_client_request_id: requestId,
        }),
      );
    },

    async cooperativeActivityDisconnect(sessionId, reason, requestId) {
      return cooperativeActivityOperationResultSchema.parse(
        await rpc(client, 'handle_realtime_cooperative_activity_disconnect', {
          p_session_id: sessionId,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },
  };
}
