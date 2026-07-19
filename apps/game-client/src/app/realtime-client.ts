import {
  REALTIME_CLIENT_SEND_INTERVAL_MS,
  REALTIME_PROTOCOL_VERSION,
  realtimeServerMessageSchema,
  realtimeTicketViewSchema,
  type PublicPresence,
  type ChatMessage,
  type ChatPlayerPreference,
  type ChatReportCategory,
  type ChatScope,
  type RealtimeChannel,
  type RealtimeMovementState,
  type RealtimeServerMessage,
  type PublicPlayerInspect,
  type SocialBootstrap,
  type SocialInteractionErrorCode,
  type SocialInteractionView,
  type SocialOfferItemInput,
  type SocialReceipt,
  type SocialGraphBootstrap,
  type SocialGraphErrorCode,
  type PartySnapshot,
} from '@starville/realtime';
import type {
  CooperativeActivityBootstrap,
  CooperativeActivityErrorCode,
} from '@starville/cooperative-activities';
import type { PlayerStateUpdate } from '@starville/game-core';
import { z } from 'zod';
import { runtimeDevelopmentMetrics } from './development-performance';
import { automaticRetryAvailable, runtimeRetryDelay } from './runtime-recovery';

const apiEnvelopeSchema = z
  .object({ success: z.literal(true), data: realtimeTicketViewSchema, requestId: z.string() })
  .strict();

export type RealtimeConnectionStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'full' | 'blocked' | 'unavailable';

export interface RealtimeViewState {
  readonly status: RealtimeConnectionStatus;
  readonly self?: PublicPresence;
  readonly channels: readonly RealtimeChannel[];
  readonly remotes: readonly PublicPresence[];
  readonly retryAttempt: number;
  readonly errorCode?: string;
  readonly chat: RealtimeChatView;
  readonly social: RealtimeSocialView;
  readonly socialGraph: RealtimeSocialGraphView;
  readonly activity: RealtimeActivityView;
  readonly emotes: RealtimeEmoteView;
}

export interface RealtimeEmoteActivation {
  readonly presenceId: string;
  readonly emoteKey: string;
  readonly activationId: string;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface RealtimeEmoteView {
  readonly activations: readonly RealtimeEmoteActivation[];
  readonly lastRejection?: { readonly requestId: string; readonly reason: string };
}

export interface RealtimeActivityView extends CooperativeActivityBootstrap {
  readonly lastError?: {
    readonly requestId?: string;
    readonly code: CooperativeActivityErrorCode;
    readonly retryAfterMs?: number;
  };
}

export interface RealtimeSocialView extends SocialBootstrap {
  readonly inspectedProfile?: PublicPlayerInspect;
  readonly lastError?: {
    readonly requestId: string;
    readonly code: SocialInteractionErrorCode;
    readonly retryAfterMs?: number;
  };
}

export interface RealtimeChatView {
  readonly messages: Readonly<Record<ChatScope, readonly ChatMessage[]>>;
  readonly preferences: readonly ChatPlayerPreference[];
  readonly mutedUntil: string | null;
  readonly lastRejection?: {
    readonly requestId: string;
    readonly reason: string;
    readonly mutedUntil?: string;
  };
  readonly latestReportId?: string;
}

export interface RealtimeSocialGraphView extends SocialGraphBootstrap {
  readonly lastError?: {
    readonly requestId: string;
    readonly code: SocialGraphErrorCode;
    readonly retryAfterMs?: number;
  };
}

const EMPTY_CHAT_MESSAGES: Readonly<Record<ChatScope, readonly ChatMessage[]>> = {
  nearby: [],
  channel: [],
  party: [],
  system: [],
};

const EMPTY_SOCIAL_GRAPH: RealtimeSocialGraphView = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  party: null,
  invitations: [],
  notifications: [],
  settings: {
    maximumFriends: 100,
    maximumIncomingRequests: 50,
    maximumOutgoingRequests: 25,
    partyCapacity: 4,
    friendRequestExpirySeconds: 604_800,
    partyInvitationExpirySeconds: 120,
    readyCheckExpirySeconds: 30,
    leaderReconnectGraceSeconds: 60,
    partyDormantTimeoutSeconds: 86_400,
    nearbyInvitationsEnabled: true,
    partyChatEnabled: true,
    friendLocationVisibilityEnabled: true,
    version: 1,
  },
};

const EMPTY_ACTIVITY: RealtimeActivityView = {
  catalog: { generatedAt: '1970-01-01T00:00:00.000Z', activities: [] },
  preparation: null,
  instance: null,
};

function mergeChatMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): readonly ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .slice(-50);
}

export const INITIAL_REALTIME_VIEW: RealtimeViewState = {
  status: 'connecting',
  channels: [],
  remotes: [],
  retryAttempt: 0,
  chat: { messages: EMPTY_CHAT_MESSAGES, preferences: [], mutedUntil: null },
  social: {
    inventory: [],
    pendingRequests: [],
    activeTrade: null,
    recentReceipts: [],
    interactionDistance: 3,
    dustTransferEnabled: false,
  },
  socialGraph: EMPTY_SOCIAL_GRAPH,
  activity: EMPTY_ACTIVITY,
  emotes: { activations: [] },
};

function newerPartySnapshot(
  current: PartySnapshot | null,
  incoming: PartySnapshot | null,
): PartySnapshot | null {
  if (incoming === null) return null;
  if (current === null || current.partyId !== incoming.partyId) return incoming;
  return incoming.revision >= current.revision ? incoming : current;
}

function reconcileSocialGraphSnapshot(
  current: RealtimeSocialGraphView,
  incoming: SocialGraphBootstrap,
): RealtimeSocialGraphView {
  return {
    ...incoming,
    party: newerPartySnapshot(current.party, incoming.party),
    ...(current.lastError === undefined ? {} : { lastError: current.lastError }),
  };
}

function mergeSocialInteraction(
  interactions: readonly SocialInteractionView[],
  interaction: SocialInteractionView,
): SocialInteractionView[] {
  const remaining = interactions.filter((entry) => entry.id !== interaction.id);
  return ['pending', 'negotiating'].includes(interaction.status)
    ? [...remaining, interaction]
    : remaining;
}

function mergeSocialReceipt(
  receipts: readonly SocialReceipt[],
  receipt: SocialReceipt,
): SocialReceipt[] {
  return [receipt, ...receipts.filter((entry) => entry.id !== receipt.id)].slice(0, 10);
}

export function reconcileRealtimeMessage(
  state: RealtimeViewState,
  message: RealtimeServerMessage,
): RealtimeViewState {
  if (message.type === 'admitted') {
    return {
      status: 'connected',
      self: message.self,
      channels: message.channels,
      remotes: [],
      retryAttempt: 0,
      chat: state.chat,
      social: state.social,
      socialGraph: state.socialGraph,
      activity: state.activity,
      emotes: state.emotes,
    };
  }
  if (message.type === 'snapshot') {
    if (
      state.self === undefined ||
      message.worldId !== state.self.worldId ||
      message.channelId !== state.self.channelId
    ) {
      return state;
    }
    const remotes = new Map(
      message.presences
        .filter((presence) => presence.presenceId !== state.self?.presenceId)
        .map((presence) => [presence.presenceId, presence]),
    );
    return { ...state, remotes: [...remotes.values()] };
  }
  if (message.type === 'presence_joined' || message.type === 'presence_updated') {
    if (
      state.self === undefined ||
      message.presence.channelId !== state.self.channelId ||
      message.presence.worldId !== state.self.worldId ||
      message.presence.presenceId === state.self.presenceId
    ) {
      return state;
    }
    const remotes = new Map(state.remotes.map((presence) => [presence.presenceId, presence]));
    const current = remotes.get(message.presence.presenceId);
    if (current === undefined || message.presence.sequence > current.sequence) {
      remotes.set(message.presence.presenceId, message.presence);
    }
    return {
      ...state,
      remotes: [...remotes.values()],
      emotes:
        message.type === 'presence_updated' && message.presence.movementState !== 'idle'
          ? {
              ...state.emotes,
              activations: state.emotes.activations.filter(
                (activation) => activation.presenceId !== message.presence.presenceId,
              ),
            }
          : state.emotes,
    };
  }
  if (message.type === 'appearance_updated') {
    const reference = {
      appearanceId: message.appearanceId,
      appearanceRevision: message.appearanceRevision,
    };
    if (state.self?.presenceId === message.presenceId) {
      return { ...state, self: { ...state.self, ...reference } };
    }
    if (!state.remotes.some((presence) => presence.presenceId === message.presenceId)) {
      return state;
    }
    return {
      ...state,
      remotes: state.remotes.map((presence) =>
        presence.presenceId === message.presenceId ? { ...presence, ...reference } : presence,
      ),
    };
  }
  if (message.type === 'presence_left') {
    return {
      ...state,
      remotes: state.remotes.filter((presence) => presence.presenceId !== message.presenceId),
      emotes: {
        ...state.emotes,
        activations: state.emotes.activations.filter(
          (activation) => activation.presenceId !== message.presenceId,
        ),
      },
    };
  }
  if (message.type === 'channel_changed') {
    return {
      ...state,
      self: message.self,
      channels: message.channels,
      remotes: [],
      emotes: { activations: [] },
      chat: {
        ...state.chat,
        messages: {
          ...state.chat.messages,
          nearby: [],
          channel: [],
        },
      },
    };
  }
  if (message.type === 'channels') return { ...state, channels: message.channels };
  if (message.type === 'emote.activated') {
    const activation = {
      presenceId: message.presenceId,
      emoteKey: message.emoteKey,
      activationId: message.activationId,
      startedAt: message.startedAt,
      durationMs: message.durationMs,
    };
    return {
      ...state,
      emotes: {
        activations: [
          ...state.emotes.activations.filter((entry) => entry.presenceId !== message.presenceId),
          activation,
        ],
      },
    };
  }
  if (message.type === 'emote.rejected') {
    return {
      ...state,
      emotes: {
        ...state.emotes,
        lastRejection: { requestId: message.requestId, reason: message.reason },
      },
    };
  }
  if (message.type === 'movement_rejected') {
    return { ...state, self: message.authoritative };
  }
  if (message.type === 'chat.bootstrap') {
    return {
      ...state,
      chat: {
        messages: state.chat.messages,
        preferences: message.chat.preferences,
        mutedUntil: message.chat.mutedUntil,
      },
    };
  }
  if (message.type === 'chat.message' || message.type === 'chat.system_message') {
    const chatMessage = message.message;
    return {
      ...state,
      chat: {
        ...state.chat,
        messages: {
          ...state.chat.messages,
          [chatMessage.scope]: mergeChatMessages(state.chat.messages[chatMessage.scope], [
            chatMessage,
          ]),
        },
      },
    };
  }
  if (message.type === 'chat.history') {
    return state;
  }
  if (message.type === 'chat.message_rejected') {
    return {
      ...state,
      chat: {
        ...state.chat,
        ...(message.reason === 'chat_muted' && message.mutedUntil !== undefined
          ? { mutedUntil: message.mutedUntil }
          : {}),
        lastRejection: {
          requestId: message.requestId,
          reason: message.reason,
          ...(message.mutedUntil === undefined ? {} : { mutedUntil: message.mutedUntil }),
        },
      },
    };
  }
  if (
    message.type === 'chat.player_muted' ||
    message.type === 'chat.player_unmuted' ||
    message.type === 'chat.player_blocked' ||
    message.type === 'chat.player_unblocked'
  ) {
    const existing = state.chat.preferences.find(
      (preference) => preference.targetPresenceId === message.targetPresenceId,
    ) ?? { targetPresenceId: message.targetPresenceId, muted: false, blocked: false };
    const preference = {
      ...existing,
      ...(message.type === 'chat.player_muted' ? { muted: true } : {}),
      ...(message.type === 'chat.player_unmuted' ? { muted: false } : {}),
      ...(message.type === 'chat.player_blocked' ? { blocked: true } : {}),
      ...(message.type === 'chat.player_unblocked' ? { blocked: false } : {}),
    };
    const preferences = state.chat.preferences.filter(
      (entry) => entry.targetPresenceId !== message.targetPresenceId,
    );
    if (preference.muted || preference.blocked) preferences.push(preference);
    const hidden = new Set(preferences.map((entry) => entry.targetPresenceId));
    return {
      ...state,
      chat: {
        ...state.chat,
        preferences,
        messages: {
          nearby: state.chat.messages.nearby.filter(
            (entry) => entry.senderPresenceId === null || !hidden.has(entry.senderPresenceId),
          ),
          channel: state.chat.messages.channel.filter(
            (entry) => entry.senderPresenceId === null || !hidden.has(entry.senderPresenceId),
          ),
          party: state.chat.messages.party.filter(
            (entry) => entry.senderPresenceId === null || !hidden.has(entry.senderPresenceId),
          ),
          system: state.chat.messages.system,
        },
      },
    };
  }
  if (message.type === 'chat.report_received') {
    return { ...state, chat: { ...state.chat, latestReportId: message.reportId } };
  }
  if (message.type === 'chat.moderation_notice') {
    return {
      ...state,
      chat: {
        ...state.chat,
        mutedUntil:
          message.code === 'chat_unmuted' ? null : (message.mutedUntil ?? state.chat.mutedUntil),
      },
    };
  }
  if (message.type === 'social.bootstrap') {
    return {
      ...state,
      social: {
        ...message.social,
        ...(state.social.inspectedProfile === undefined
          ? {}
          : { inspectedProfile: state.social.inspectedProfile }),
      },
    };
  }
  if (message.type === 'social.inspect.result') {
    return { ...state, social: { ...state.social, inspectedProfile: message.profile } };
  }
  if (message.type === 'social.request.received' || message.type === 'social.request.updated') {
    return {
      ...state,
      social: {
        ...state.social,
        pendingRequests: mergeSocialInteraction(state.social.pendingRequests, message.interaction),
      },
    };
  }
  if (message.type === 'social.gift.completed') {
    return {
      ...state,
      social: {
        ...state.social,
        pendingRequests: state.social.pendingRequests.filter(
          (entry) => entry.id !== message.gift.id,
        ),
        recentReceipts: mergeSocialReceipt(state.social.recentReceipts, message.receipt),
      },
    };
  }
  if (
    message.type === 'social.trade.opened' ||
    message.type === 'social.trade.updated' ||
    message.type === 'social.trade.confirmation_changed'
  ) {
    return {
      ...state,
      social: {
        ...state.social,
        pendingRequests: state.social.pendingRequests.filter(
          (entry) => entry.id !== message.trade.id,
        ),
        activeTrade: message.trade,
      },
    };
  }
  if (message.type === 'social.trade.completed') {
    return {
      ...state,
      social: {
        ...state.social,
        activeTrade: null,
        pendingRequests: state.social.pendingRequests.filter(
          (entry) => entry.id !== message.trade.id,
        ),
        recentReceipts: mergeSocialReceipt(state.social.recentReceipts, message.receipt),
      },
    };
  }
  if (message.type === 'social.trade.cancelled' || message.type === 'social.trade.invalidated') {
    return {
      ...state,
      social: {
        ...state.social,
        activeTrade:
          state.social.activeTrade?.id === message.trade.id ? null : state.social.activeTrade,
        pendingRequests: state.social.pendingRequests.filter(
          (entry) => entry.id !== message.trade.id,
        ),
      },
    };
  }
  if (message.type === 'social.interaction.error') {
    return {
      ...state,
      social: {
        ...state.social,
        lastError: {
          requestId: message.requestId,
          code: message.code,
          ...(message.retryAfterMs === undefined ? {} : { retryAfterMs: message.retryAfterMs }),
        },
      },
    };
  }
  if (message.type === 'social_graph.bootstrap' || message.type === 'friends.snapshot') {
    return {
      ...state,
      socialGraph: reconcileSocialGraphSnapshot(state.socialGraph, message.socialGraph),
    };
  }
  if (message.type === 'friends.relationship.updated') {
    return {
      ...state,
      socialGraph: reconcileSocialGraphSnapshot(state.socialGraph, message.socialGraph),
    };
  }
  if (message.type === 'friends.request.received') {
    return {
      ...state,
      socialGraph: {
        ...state.socialGraph,
        incomingRequests: [
          message.request,
          ...state.socialGraph.incomingRequests.filter((entry) => entry.id !== message.request.id),
        ],
      },
    };
  }
  if (message.type === 'party.snapshot') {
    return {
      ...state,
      socialGraph: {
        ...state.socialGraph,
        party: newerPartySnapshot(state.socialGraph.party, message.party),
      },
    };
  }
  if (
    message.type === 'party.member.joined' ||
    message.type === 'party.member.left' ||
    message.type === 'party.leader.changed' ||
    message.type === 'party.ready_check.updated'
  ) {
    return {
      ...state,
      socialGraph: {
        ...state.socialGraph,
        party: newerPartySnapshot(state.socialGraph.party, message.party),
      },
    };
  }
  if (message.type === 'party.invitation.received' || message.type === 'party.invitation.updated') {
    const invitations = state.socialGraph.invitations.filter(
      (entry) => entry.id !== message.invitation.id,
    );
    if (message.invitation.status === 'pending') invitations.unshift(message.invitation);
    return { ...state, socialGraph: { ...state.socialGraph, invitations } };
  }
  if (message.type === 'party.disbanded') {
    if (
      state.socialGraph.party?.partyId !== message.partyId ||
      state.socialGraph.party.revision > message.revision
    ) {
      return state;
    }
    return { ...state, socialGraph: { ...state.socialGraph, party: null } };
  }
  if (message.type === 'social.notification') {
    return {
      ...state,
      socialGraph: {
        ...state.socialGraph,
        notifications: [
          message.notification,
          ...state.socialGraph.notifications.filter(
            (entry) => entry.id !== message.notification.id,
          ),
        ].slice(0, 20),
      },
    };
  }
  if (message.type === 'social.error') {
    return {
      ...state,
      socialGraph: {
        ...state.socialGraph,
        lastError: {
          requestId: message.requestId,
          code: message.code,
          ...(message.retryAfterMs === undefined ? {} : { retryAfterMs: message.retryAfterMs }),
        },
      },
    };
  }
  if (message.type === 'activity.bootstrap') {
    return { ...state, activity: message.activity };
  }
  if (message.type === 'activity.catalog') {
    return { ...state, activity: { ...state.activity, catalog: message.catalog } };
  }
  if (message.type === 'activity.entry.updated') {
    return { ...state, activity: { ...state.activity, preparation: message.preparation } };
  }
  if (
    message.type === 'activity.instance.created' ||
    message.type === 'activity.instance.snapshot' ||
    message.type === 'activity.objective.updated' ||
    message.type === 'activity.participant.updated' ||
    message.type === 'activity.timer.updated' ||
    message.type === 'activity.paused' ||
    message.type === 'activity.completed' ||
    message.type === 'activity.failed' ||
    message.type === 'activity.cancelled'
  ) {
    return { ...state, activity: { ...state.activity, instance: message.instance } };
  }
  if (message.type === 'activity.error') {
    return {
      ...state,
      activity: {
        ...state.activity,
        lastError: {
          code: message.code,
          ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
          ...(message.retryAfterMs === undefined ? {} : { retryAfterMs: message.retryAfterMs }),
        },
      },
    };
  }
  if (message.type === 'error') {
    const status =
      message.code === 'CHANNEL_FULL' ? 'full' : message.retryable ? 'unavailable' : 'blocked';
    return { ...state, status, remotes: [], errorCode: message.code };
  }
  return state;
}

export function reconnectDelay(attempt: number, random = Math.random): number {
  return runtimeRetryDelay('realtime', attempt, random);
}

async function issueTicket(apiUrl: string, channelId: string | undefined, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/api/v1/token-access/player/realtime-ticket`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(channelId === undefined ? {} : { channelId }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { readonly error?: { readonly code?: string } } | undefined;
    const error = new Error(body?.error?.code ?? 'REALTIME_TICKET_UNAVAILABLE');
    Object.assign(error, { status: response.status, code: body?.error?.code });
    throw error;
  }
  return apiEnvelopeSchema.parse(await response.json()).data;
}

export interface RealtimeConnectionOptions {
  readonly apiUrl: string;
  readonly realtimeUrl: string;
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly onState: (state: RealtimeViewState) => void;
  readonly onAccessInvalid: () => void;
  readonly createSocket?: (url: string) => WebSocket;
}

interface PendingMovement {
  readonly state: PlayerStateUpdate;
  readonly stopAfter: boolean;
  readonly allowHidden: boolean;
}

const LOCAL_POSITION_EPSILON = 1e-4;

export class RealtimeConnection {
  private socket: WebSocket | undefined;
  private controller: AbortController | undefined;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private socketListenerCleanup: (() => void) | undefined;
  private disposed = false;
  private attempt = 0;
  private preferredChannelId: string | undefined;
  private state = INITIAL_REALTIME_VIEW;
  private sequence = 0;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private lastSentState: PlayerStateUpdate | undefined;
  private lastSentMovementState: RealtimeMovementState = 'idle';
  private latestLocalState: PlayerStateUpdate | undefined;
  private pendingMovement: PendingMovement | undefined;
  private movementTimer: number | undefined;
  private movementActive = false;
  private movementSuspended = true;

  public constructor(private readonly options: RealtimeConnectionOptions) {}

  public start(): void {
    this.disposed = false;
    void this.connect(false);
  }

  public dispose(): void {
    this.flushIdleBeforeClose();
    this.disposed = true;
    this.cancelMovementQueue();
    this.controller?.abort();
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.socketListenerCleanup?.();
    this.socketListenerCleanup = undefined;
    this.socket?.close(1000, 'Client left realtime');
    this.socket = undefined;
    this.publish({ ...this.state, status: 'disconnected', remotes: [] });
  }

  public reconcileVisibility(): void {
    if (document.visibilityState !== 'visible') {
      const state = this.latestLocalState ?? this.lastSentState;
      if (state !== undefined) this.stopMovement(state, performance.now(), true);
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ version: REALTIME_PROTOCOL_VERSION, type: 'resync' }));
    } else if (!this.disposed) {
      void this.connect(true);
    }
  }

  public retryNow(): void {
    if (this.disposed || this.state.status === 'blocked') return;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ version: REALTIME_PROTOCOL_VERSION, type: 'resync' }));
      return;
    }
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.attempt = 0;
    void this.connect(true);
  }

  public switchChannel(channelId: string): void {
    this.preferredChannelId = channelId;
    this.cancelMovementQueue();
    this.movementActive = false;
    this.movementSuspended = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({ version: REALTIME_PROTOCOL_VERSION, type: 'switch_channel', channelId }),
      );
    }
  }

  public refreshAppearance(): void {
    this.sendRealtimePayload({ type: 'appearance.refresh' });
  }

  public activateEmote(emoteKey: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'emote.activate', requestId, emoteKey });
    return requestId;
  }

  public sendMovement(next: PlayerStateUpdate, now = performance.now()): void {
    this.latestLocalState = next;
    this.movementActive = true;
    this.queueMovement({ state: next, stopAfter: false, allowHidden: false }, now);
  }

  public stopMovement(next: PlayerStateUpdate, now = performance.now(), allowHidden = false): void {
    this.latestLocalState = next;
    this.movementActive = false;
    if (
      this.pendingMovement?.stopAfter === true &&
      this.samePosition(this.pendingMovement.state, next)
    ) {
      return;
    }
    if (
      this.pendingMovement === undefined &&
      this.lastSentMovementState === 'idle' &&
      this.lastSentState !== undefined &&
      this.samePosition(this.lastSentState, next)
    ) {
      return;
    }
    this.queueMovement({ state: next, stopAfter: true, allowHidden }, now);
  }

  public sendChat(
    scope: 'nearby' | 'channel' | 'party',
    text: string,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendChatPayload({ type: 'chat.send', requestId, scope, text });
    return requestId;
  }

  public requestFriends(): void {
    this.sendRealtimePayload({ type: 'friends.list.request' });
  }

  public sendFriendRequest(targetPresenceId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'friends.request.send', requestId, targetPresenceId });
    return requestId;
  }

  public respondFriendRequest(
    friendRequestId: string,
    action: 'accept' | 'decline' | 'cancel',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: `friends.request.${action}`,
      requestId,
      friendRequestId,
    });
    return requestId;
  }

  public removeFriend(targetPresenceId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'friends.remove', requestId, targetPresenceId });
    return requestId;
  }

  public createParty(requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'party.create', requestId });
    return requestId;
  }

  public inviteToParty(
    targetPresenceId: string,
    expectedRevision: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'party.invite.send',
      requestId,
      targetPresenceId,
      expectedRevision,
    });
    return requestId;
  }

  public respondPartyInvitation(
    invitationId: string,
    expectedRevision: number,
    action: 'accept' | 'decline' | 'cancel',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: `party.invite.${action}`,
      requestId,
      invitationId,
      expectedRevision,
    });
    return requestId;
  }

  public leaveParty(expectedRevision: number, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'party.leave', requestId, expectedRevision });
    return requestId;
  }

  public kickPartyMember(
    targetPresenceId: string,
    expectedRevision: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'party.kick',
      requestId,
      targetPresenceId,
      expectedRevision,
    });
    return requestId;
  }

  public promotePartyLeader(
    targetPresenceId: string,
    expectedRevision: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'party.promote',
      requestId,
      targetPresenceId,
      expectedRevision,
    });
    return requestId;
  }

  public disbandParty(expectedRevision: number, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'party.disband', requestId, expectedRevision });
    return requestId;
  }

  public startPartyReadyCheck(expectedRevision: number, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'party.ready_check.start', requestId, expectedRevision });
    return requestId;
  }

  public respondPartyReadyCheck(
    readyCheckId: string,
    expectedRevision: number,
    response: 'ready' | 'not_ready',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'party.ready_check.respond',
      requestId,
      readyCheckId,
      expectedRevision,
      response,
    });
    return requestId;
  }

  public requestActivityCatalog(): void {
    this.sendRealtimePayload({ type: 'activity.catalog.request' });
  }

  public prepareActivityEntry(
    activityKey: string,
    expectedPartyRevision: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'activity.entry.prepare',
      requestId,
      activityKey,
      expectedPartyRevision,
    });
    return requestId;
  }

  public respondActivityReady(
    readyCheckId: string,
    expectedPartyRevision: number,
    response: 'ready' | 'not_ready',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'activity.entry.ready',
      requestId,
      readyCheckId,
      expectedPartyRevision,
      response,
    });
    return requestId;
  }

  public enterActivity(preparationId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'activity.entry.enter', requestId, preparationId });
    return requestId;
  }

  public requestActivitySnapshot(): void {
    this.sendRealtimePayload({ type: 'activity.instance.snapshot.request' });
  }

  public interactWithActivity(
    intent: {
      readonly instanceId: string;
      readonly expectedRevision: number;
      readonly objectiveKey: string;
      readonly objectKey: string;
    },
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({ type: 'activity.interact', requestId, intent });
    return requestId;
  }

  public leaveActivity(instanceId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'activity.leave', requestId, instanceId });
    return requestId;
  }

  public resumeActivity(): void {
    this.sendRealtimePayload({ type: 'activity.resume' });
  }

  public requestChatHistory(scope: ChatScope, afterSequence = 0): void {
    this.sendChatPayload({ type: 'chat.history.request', scope, afterSequence });
  }

  public markChatRead(scope: ChatScope, throughSequence: number): void {
    this.sendChatPayload({ type: 'chat.mark_read', scope, throughSequence });
  }

  public setChatPreference(
    targetPresenceId: string,
    action: 'mute_player' | 'unmute_player' | 'block_player' | 'unblock_player',
  ): void {
    this.sendChatPayload({ type: `chat.${action}`, targetPresenceId });
  }

  public reportChat(
    messageId: string,
    category: ChatReportCategory,
    reason: string,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendChatPayload({ type: 'chat.report', requestId, messageId, category, reason });
    return requestId;
  }

  public inspectPlayer(targetPresenceId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'social.inspect.request', requestId, targetPresenceId });
    return requestId;
  }

  public createGift(
    targetPresenceId: string,
    itemSlug: string,
    quantity: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'social.gift.create',
      requestId,
      targetPresenceId,
      itemSlug,
      quantity,
    });
    return requestId;
  }

  public respondGift(
    interactionId: string,
    action: 'accept' | 'decline' | 'cancel',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: `social.gift.${action}`,
      requestId,
      interactionId,
    });
    return requestId;
  }

  public requestTrade(targetPresenceId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({ type: 'social.trade.request', requestId, targetPresenceId });
    return requestId;
  }

  public respondTrade(
    interactionId: string,
    action: 'accept' | 'decline',
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: `social.trade.${action}`,
      requestId,
      interactionId,
    });
    return requestId;
  }

  public updateTradeOffer(
    interactionId: string,
    expectedRevision: number,
    items: readonly SocialOfferItemInput[],
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'social.trade.offer.update',
      requestId,
      interactionId,
      expectedRevision,
      items,
    });
    return requestId;
  }

  public confirmTrade(
    interactionId: string,
    expectedRevision: number,
    requestId = crypto.randomUUID(),
  ): string {
    this.sendRealtimePayload({
      type: 'social.trade.confirm',
      requestId,
      interactionId,
      expectedRevision,
    });
    return requestId;
  }

  public cancelTrade(interactionId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({
      type: 'social.trade.cancel',
      requestId,
      interactionId,
    });
    return requestId;
  }

  public resumeTrade(interactionId: string, requestId = crypto.randomUUID()): string {
    this.sendRealtimePayload({
      type: 'social.trade.resume',
      requestId,
      interactionId,
    });
    return requestId;
  }

  private sendChatPayload(payload: Record<string, unknown>): void {
    this.sendRealtimePayload(payload);
  }

  private sendRealtimePayload(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN || this.state.status !== 'connected') return;
    this.socket.send(JSON.stringify({ version: REALTIME_PROTOCOL_VERSION, ...payload }));
  }

  private queueMovement(pending: PendingMovement, now: number): void {
    if (!this.canSendMovement(pending.allowHidden)) return;
    this.pendingMovement = pending;
    const remaining = REALTIME_CLIENT_SEND_INTERVAL_MS - (now - this.lastSentAt);
    if (remaining <= 0) {
      this.flushPendingMovement(now);
      return;
    }
    if (this.movementTimer !== undefined) window.clearTimeout(this.movementTimer);
    this.movementTimer = window.setTimeout(() => {
      this.movementTimer = undefined;
      this.flushPendingMovement(performance.now());
    }, remaining);
  }

  private flushPendingMovement(now: number): void {
    const pending = this.pendingMovement;
    if (pending === undefined) return;
    if (!this.canSendMovement(pending.allowHidden)) {
      this.pendingMovement = undefined;
      return;
    }
    const remaining = REALTIME_CLIENT_SEND_INTERVAL_MS - (now - this.lastSentAt);
    if (remaining > 0) {
      if (this.movementTimer !== undefined) window.clearTimeout(this.movementTimer);
      this.movementTimer = window.setTimeout(() => {
        this.movementTimer = undefined;
        this.flushPendingMovement(performance.now());
      }, remaining);
      return;
    }

    this.pendingMovement = undefined;
    const previous = this.lastSentState;
    const distance =
      previous === undefined
        ? 0
        : Math.hypot(pending.state.x - previous.x, pending.state.y - previous.y);
    const hasAcceptedDisplacement = distance > LOCAL_POSITION_EPSILON;
    const requestedState: RealtimeMovementState = hasAcceptedDisplacement
      ? distance > 0.29
        ? 'jogging'
        : 'walking'
      : 'idle';
    this.sendMovementPacket(pending.state, requestedState, now);

    if (pending.stopAfter && hasAcceptedDisplacement && !this.movementActive) {
      this.queueMovement(
        {
          state: pending.state,
          stopAfter: true,
          allowHidden: pending.allowHidden,
        },
        now,
      );
    }
  }

  private sendMovementPacket(
    state: PlayerStateUpdate,
    movementState: RealtimeMovementState,
    now: number,
  ): void {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN || this.state.status !== 'connected') return;
    this.lastSentAt = now;
    this.lastSentState = state;
    this.lastSentMovementState = movementState;
    this.sequence += 1;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: 'movement',
        sequence: this.sequence,
        x: state.x,
        y: state.y,
        facingDirection: state.facingDirection,
        movementState,
      }),
    );
  }

  private canSendMovement(allowHidden: boolean): boolean {
    return (
      !this.disposed &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.state.status === 'connected' &&
      !this.movementSuspended &&
      (allowHidden || document.visibilityState === 'visible')
    );
  }

  private samePosition(left: PlayerStateUpdate, right: PlayerStateUpdate): boolean {
    return Math.hypot(left.x - right.x, left.y - right.y) <= LOCAL_POSITION_EPSILON;
  }

  private cancelMovementQueue(): void {
    if (this.movementTimer !== undefined) window.clearTimeout(this.movementTimer);
    this.movementTimer = undefined;
    this.pendingMovement = undefined;
  }

  private flushIdleBeforeClose(): void {
    const state = this.latestLocalState ?? this.lastSentState;
    if (
      state === undefined ||
      this.lastSentState === undefined ||
      this.lastSentMovementState === 'idle' ||
      !this.samePosition(state, this.lastSentState) ||
      !this.canSendMovement(true)
    ) {
      return;
    }
    this.sendMovementPacket(state, 'idle', performance.now());
  }

  private resetMovementBaseline(presence: PublicPresence): void {
    this.cancelMovementQueue();
    this.sequence = Math.max(this.sequence, presence.sequence);
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.lastSentState = {
      mapId: presence.worldId,
      x: presence.x,
      y: presence.y,
      facingDirection: presence.facingDirection,
    };
    this.latestLocalState = this.lastSentState;
    this.lastSentMovementState = presence.movementState;
    this.movementActive = false;
    this.movementSuspended = false;
  }

  private publish(state: RealtimeViewState): void {
    this.state = state;
    this.options.onState(state);
  }

  private async connect(reconnecting: boolean): Promise<void> {
    if (this.disposed || this.controller !== undefined) return;
    this.controller = new AbortController();
    this.publish({
      ...this.state,
      status: reconnecting ? 'reconnecting' : 'connecting',
      remotes: [],
      retryAttempt: this.attempt,
    });
    try {
      const ticket = await issueTicket(
        this.options.apiUrl,
        this.preferredChannelId,
        this.controller.signal,
      );
      if (this.disposed) return;
      const socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(
        `${this.options.realtimeUrl.replace(/\/$/u, '')}/connect`,
      );
      this.socket = socket;
      const handleOpen = () => {
        socket.send(
          JSON.stringify({
            version: REALTIME_PROTOCOL_VERSION,
            type: 'authenticate',
            ticket: ticket.ticket,
          }),
        );
      };
      const handleMessage = (event: MessageEvent) => {
        if (this.socket !== socket || this.disposed) return;
        runtimeDevelopmentMetrics.recordRealtimeMessage();
        const parsed = realtimeServerMessageSchema.safeParse(
          (() => {
            try {
              return JSON.parse(String(event.data));
            } catch {
              return undefined;
            }
          })(),
        );
        if (!parsed.success) return;
        if (
          parsed.data.type === 'admitted' &&
          (parsed.data.self.worldId !== this.options.worldId ||
            parsed.data.self.worldVersionId !== this.options.worldVersionId)
        ) {
          socket.close(1008, 'World version changed');
          return;
        }
        this.publish(reconcileRealtimeMessage(this.state, parsed.data));
        if (parsed.data.type === 'admitted') {
          this.attempt = 0;
          this.preferredChannelId = parsed.data.self.channelId;
          this.resetMovementBaseline(parsed.data.self);
        } else if (parsed.data.type === 'channel_changed') {
          this.resetMovementBaseline(parsed.data.self);
        } else if (parsed.data.type === 'movement_rejected') {
          this.lastSentState = {
            mapId: parsed.data.authoritative.worldId,
            x: parsed.data.authoritative.x,
            y: parsed.data.authoritative.y,
            facingDirection: parsed.data.authoritative.facingDirection,
          };
          this.lastSentMovementState = parsed.data.authoritative.movementState;
        }
        if (
          parsed.data.type === 'error' &&
          [
            'ACCESS_REVOKED',
            'PLAYER_SUSPENDED',
            'PLAYER_RENAME_REQUIRED',
            'GAME_MAINTENANCE',
          ].includes(parsed.data.code)
        ) {
          this.options.onAccessInvalid();
        }
      };
      const handleClose = (event: CloseEvent) => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.socketListenerCleanup?.();
        this.socketListenerCleanup = undefined;
        this.cancelMovementQueue();
        this.movementActive = false;
        this.movementSuspended = true;
        if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
        if (this.disposed || event.code === 1000) return;
        if (this.state.status === 'blocked') return;
        this.scheduleReconnect();
      };
      let listenersAttached = true;
      this.socketListenerCleanup = () => {
        if (!listenersAttached) return;
        listenersAttached = false;
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('close', handleClose);
        runtimeDevelopmentMetrics.adjustGauge('activeListeners', -3);
      };
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', handleClose);
      runtimeDevelopmentMetrics.adjustGauge('activeListeners', 3);
      this.pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN && document.visibilityState === 'visible') {
          socket.send(
            JSON.stringify({
              version: REALTIME_PROTOCOL_VERSION,
              type: 'ping',
              nonce: String(Date.now()),
            }),
          );
        }
      }, 10_000);
    } catch (error) {
      if (this.controller.signal.aborted || this.disposed) return;
      const status = (error as { readonly status?: number }).status;
      if (status === 401 || status === 403 || status === 409) {
        this.publish({ ...this.state, status: 'blocked', remotes: [] });
        this.options.onAccessInvalid();
      } else {
        this.publish({ ...this.state, status: 'unavailable', remotes: [] });
        this.scheduleReconnect();
      }
    } finally {
      this.controller = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== undefined) return;
    if (!automaticRetryAvailable('realtime', this.attempt)) {
      this.publish({
        ...this.state,
        status: 'unavailable',
        remotes: [],
        retryAttempt: this.attempt,
      });
      return;
    }
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.publish({
      ...this.state,
      status: 'reconnecting',
      remotes: [],
      retryAttempt: this.attempt,
    });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(true);
    }, delay);
  }
}
