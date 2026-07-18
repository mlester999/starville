import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  privateHomeRealtimeClientMessageSchema,
  privateHomeRealtimeServerMessageSchema,
  type PrivateHomeRealtimeServerMessage,
} from '@starville/cozy-gameplay';
import {
  homeVisitRealtimeClientMessageSchema,
  homeVisitRealtimeServerMessageSchema,
  type HomeVisitRealtimeServerMessage,
} from '@starville/housing';
import { type MapManifest } from '@starville/game-core';
import {
  type CooperativeActivityBootstrap,
  type CooperativeActivityErrorCode,
  type CooperativeActivityOperationResult,
} from '@starville/cooperative-activities';
import {
  type ChatBootstrap,
  REALTIME_PROTOCOL_VERSION,
  SOCIAL_INTERACTION_DISTANCE,
  parseRealtimeClientMessage,
  serializeRealtimeServerMessage,
  socialDistance,
  type PublicPresence,
  type RealtimeClientMessage,
  type RealtimeSafeErrorCode,
  type RealtimeServerMessage,
  type SocialInteractionErrorCode,
  type SocialInteractionView,
  type SocialGraphBootstrap,
  type SocialGraphErrorCode,
  type SocialGraphOperationResult,
} from '@starville/realtime';
import {
  ActivityRateAuthority,
  ChannelAuthority,
  ChatRateAuthority,
  SocialGraphRateAuthority,
  SocialRateAuthority,
  chatRecipients,
  validateAuthoritativeMovement,
} from '@starville/realtime/server';
import type { ServiceHealth } from '@starville/shared-types';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import { ConnectionRegistry } from './connections/connection-registry.js';
import type { RealtimeRuntimeConfig, ServiceLogger } from './contracts.js';
import { isAllowedRealtimeOrigin } from './origins.js';
import type {
  RealtimeAdmission,
  RealtimeDenial,
  RealtimePersistenceGateway,
  PrivateHomeRealtimeDenial,
  HomeVisitRealtimeDenial,
  SocialOperationResult,
} from './persistence/gateway.js';
import { RoomRegistry } from './rooms/room-registry.js';

const SERVICE_VERSION = '0.8.0';

interface WebSocketVerificationInfo {
  readonly origin?: string;
}

type WebSocketVerificationCallback = (
  accepted: boolean,
  statusCode?: number,
  message?: string,
) => void;

interface ActiveConnection {
  readonly connectionId: string;
  readonly requestId: string;
  readonly socket: WebSocket;
  readonly sessionId: string;
  readonly manifest: MapManifest;
  presence: PublicPresence;
  acceptedAt: number;
  lastSeenAt: number;
  lastCheckpointAt: number;
  lastRevalidatedAt: number;
  windowStartedAt: number;
  messagesInWindow: number;
  lastAppearanceRefreshAt: number;
  hiddenPresenceIds: Set<string>;
  chatMutedUntil: string | undefined;
  socialGraph: SocialGraphBootstrap;
  activity: CooperativeActivityBootstrap;
  closingReason?: string;
}

interface ActivePrivateHomeConnection {
  readonly connectionId: string;
  readonly requestId: string;
  readonly socket: WebSocket;
  readonly sessionId: string;
  readonly homeId: string;
  lastEventNumber: string;
  lastSeenAt: number;
  lastPolledAt: number;
  lastRevalidatedAt: number;
  windowStartedAt: number;
  messagesInWindow: number;
  closingReason?: string;
}

interface ActiveHomeVisitConnection {
  readonly connectionId: string;
  readonly requestId: string;
  readonly socket: WebSocket;
  readonly realtimeSessionId: string;
  readonly visitSessionId: string;
  readonly participantId: string;
  readonly homeId: string;
  lastEventNumber: string;
  lastSeenAt: number;
  lastPolledAt: number;
  lastRevalidatedAt: number;
  windowStartedAt: number;
  messagesInWindow: number;
  closingReason?: string;
}

type ChatClientMessage = Extract<
  RealtimeClientMessage,
  {
    readonly type:
      | 'chat.send'
      | 'chat.history.request'
      | 'chat.report'
      | 'chat.mute_player'
      | 'chat.unmute_player'
      | 'chat.block_player'
      | 'chat.unblock_player'
      | 'chat.mark_read';
  }
>;

type SocialClientMessage = Extract<
  RealtimeClientMessage,
  {
    readonly type:
      | 'social.inspect.request'
      | 'social.gift.create'
      | 'social.gift.accept'
      | 'social.gift.decline'
      | 'social.gift.cancel'
      | 'social.trade.request'
      | 'social.trade.accept'
      | 'social.trade.decline'
      | 'social.trade.offer.update'
      | 'social.trade.confirm'
      | 'social.trade.cancel'
      | 'social.trade.resume';
  }
>;

type SocialGraphClientMessage = Extract<
  RealtimeClientMessage,
  {
    readonly type:
      | 'friends.list.request'
      | 'friends.request.send'
      | 'friends.request.accept'
      | 'friends.request.decline'
      | 'friends.request.cancel'
      | 'friends.remove'
      | 'party.create'
      | 'party.invite.send'
      | 'party.invite.accept'
      | 'party.invite.decline'
      | 'party.invite.cancel'
      | 'party.leave'
      | 'party.kick'
      | 'party.promote'
      | 'party.disband'
      | 'party.snapshot.request'
      | 'party.ready_check.start'
      | 'party.ready_check.respond';
  }
>;

type ActivityClientMessage = Extract<
  RealtimeClientMessage,
  { readonly type: `activity.${string}` }
>;

function isSocialClientMessage(message: RealtimeClientMessage): message is SocialClientMessage {
  return message.type.startsWith('social.');
}

function isSocialGraphClientMessage(
  message: RealtimeClientMessage,
): message is SocialGraphClientMessage {
  return message.type.startsWith('friends.') || message.type.startsWith('party.');
}

function isActivityClientMessage(message: RealtimeClientMessage): message is ActivityClientMessage {
  return message.type.startsWith('activity.');
}

function normalizeWebSocket(candidate: WebSocket | { readonly socket: WebSocket }): WebSocket {
  return typeof (candidate as WebSocket).close === 'function'
    ? (candidate as WebSocket)
    : (candidate as { readonly socket: WebSocket }).socket;
}

export interface RealtimeApp {
  readonly app: FastifyInstance;
  readonly connections: ConnectionRegistry;
  readonly rooms: RoomRegistry;
}

export interface BuildRealtimeAppOptions {
  readonly config: RealtimeRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly persistence: RealtimePersistenceGateway;
}

function safeErrorForDenial(denial: RealtimeDenial): RealtimeSafeErrorCode {
  const codes: Readonly<Record<RealtimeDenial, RealtimeSafeErrorCode>> = {
    invalid_ticket: 'INVALID_TICKET',
    access_revoked: 'ACCESS_REVOKED',
    player_suspended: 'PLAYER_SUSPENDED',
    rename_required: 'PLAYER_RENAME_REQUIRED',
    maintenance: 'GAME_MAINTENANCE',
    world_unavailable: 'SERVER_UNAVAILABLE',
    world_changed: 'CHANNEL_UNAVAILABLE',
    channel_full: 'CHANNEL_FULL',
    channel_unavailable: 'CHANNEL_UNAVAILABLE',
    closed: 'ACCESS_REVOKED',
  };
  return codes[denial];
}

function closeReasonForDenial(denial: RealtimeDenial): string {
  if (denial === 'player_suspended') return 'player_suspended';
  if (denial === 'rename_required') return 'rename_required';
  if (denial === 'maintenance') return 'maintenance';
  if (denial === 'world_changed') return 'world_transition';
  return 'access_revoked';
}

function liveSessionChatBootstrap(chat: ChatBootstrap): ChatBootstrap {
  return {
    ...chat,
    histories: chat.histories.map((history) => ({
      ...history,
      messages: [],
      hasMore: false,
    })),
  };
}

function presenceFromAdmission(admission: RealtimeAdmission): PublicPresence {
  return {
    presenceId: admission.presenceId,
    displayName: admission.displayName,
    level: admission.level,
    worldId: admission.worldId,
    worldVersionId: admission.worldVersionId,
    channelId: admission.channelId,
    channelNumber: admission.channelNumber,
    x: admission.x,
    y: admission.y,
    facingDirection: admission.facingDirection,
    movementState: 'idle',
    appearancePreset: admission.appearancePreset,
    sequence: 0,
    connected: true,
  };
}

export function buildRealtimeApp({
  config,
  logger,
  persistence,
}: BuildRealtimeAppOptions): RealtimeApp {
  const app = Fastify({ logger: false });
  const allowedOrigins = new Set(config.allowedOrigins);
  const connections = new ConnectionRegistry(config.connectionLimit);
  const rooms = new RoomRegistry();
  const channelsByWorld = new Map<string, RealtimeAdmission['channels']>();
  const channelAuthority = new ChannelAuthority([]);
  const activeByConnection = new Map<string, ActiveConnection>();
  const activePrivateHomeByConnection = new Map<string, ActivePrivateHomeConnection>();
  const activeHomeVisitByConnection = new Map<string, ActiveHomeVisitConnection>();
  const connectionByPresence = new Map<string, ActiveConnection>();
  const socketByConnection = new Map<string, WebSocket>();
  const chatRates = new ChatRateAuthority(config.chatRateLimits);
  const activityRates = new ActivityRateAuthority();
  const socialRates = new SocialRateAuthority(config.socialRateLimits);
  const socialGraphRates = new SocialGraphRateAuthority(config.socialGraphRateLimits);
  let systemSequence = 0;

  function refreshChannelDefinitions(): void {
    channelAuthority.replaceChannels([...channelsByWorld.values()].flat());
  }

  function send(socket: WebSocket, message: RealtimeServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(serializeRealtimeServerMessage(message));
  }

  function envelope() {
    return { version: REALTIME_PROTOCOL_VERSION, serverTime: Date.now() } as const;
  }

  function sendPrivateHome(socket: WebSocket, message: PrivateHomeRealtimeServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(privateHomeRealtimeServerMessageSchema.parse(message)));
    }
  }

  function sendHomeVisit(socket: WebSocket, message: HomeVisitRealtimeServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(homeVisitRealtimeServerMessageSchema.parse(message)));
    }
  }

  function homeVisitErrorCode(denial: HomeVisitRealtimeDenial) {
    if (denial === 'invalid_ticket' || denial === 'invalid_session')
      return 'INVALID_TICKET' as const;
    if (denial === 'home_visit_blocked') return 'HOME_VISIT_BLOCKED' as const;
    if (denial === 'home_visitor_not_found' || denial === 'home_visit_reconnect_expired')
      return 'HOME_VISITOR_NOT_FOUND' as const;
    if (denial === 'home_visit_session_closing' || denial === 'closed')
      return 'HOME_VISIT_CLOSED' as const;
    if (denial === 'invalid_position') return 'INVALID_POSITION' as const;
    if (denial === 'stale_sequence') return 'STALE_SEQUENCE' as const;
    if (denial === 'maintenance') return 'SERVICE_UNAVAILABLE' as const;
    return 'ACCESS_REVOKED' as const;
  }

  async function finalizeHomeVisit(connection: ActiveHomeVisitConnection, reason: string) {
    if (!activeHomeVisitByConnection.delete(connection.connectionId)) return;
    await persistence
      .closeHomeVisit(connection.realtimeSessionId, reason, connection.requestId)
      .catch((error) => {
        logger
          .child({ connectionId: connection.connectionId })
          .warn('realtime.home_visit.finalize_failed', { error, reason });
        return false;
      });
  }

  async function admitHomeVisit(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    ticket: string,
  ) {
    let result;
    try {
      result = await persistence.admitHomeVisit(
        hashAccessSessionToken(ticket, config.ticketSecret),
        connectionId,
        requestId,
      );
    } catch (error) {
      logger
        .child({ connectionId, requestId })
        .error('realtime.home_visit.admission_unavailable', { error });
      sendHomeVisit(socket, { type: 'error', code: 'SERVICE_UNAVAILABLE', retryable: true });
      socket.close(1013, 'Home-visit authorization unavailable');
      return;
    }
    if (typeof result === 'string') {
      sendHomeVisit(socket, {
        type: 'error',
        code: homeVisitErrorCode(result),
        retryable: result === 'maintenance',
      });
      socket.close(result === 'maintenance' ? 1013 : 1008, 'Home-visit admission denied');
      return;
    }
    const now = Date.now();
    activeHomeVisitByConnection.set(connectionId, {
      connectionId,
      requestId,
      socket,
      realtimeSessionId: result.realtimeSessionId,
      visitSessionId: result.visitSessionId,
      participantId: result.participantId,
      homeId: result.homeId,
      lastEventNumber: result.lastEventNumber,
      lastSeenAt: now,
      lastPolledAt: now,
      lastRevalidatedAt: now,
      windowStartedAt: now,
      messagesInWindow: 0,
    });
    sendHomeVisit(socket, {
      type: 'authenticated',
      realtimeSessionId: result.realtimeSessionId,
      visitSessionId: result.visitSessionId,
      participantId: result.participantId,
      homeId: result.homeId,
      lastEventNumber: result.lastEventNumber,
      snapshot: result.snapshot,
    });
  }

  async function refreshHomeVisit(connection: ActiveHomeVisitConnection, forceSnapshot: boolean) {
    const result = await persistence.homeVisitEvents(
      connection.realtimeSessionId,
      connection.lastEventNumber,
      forceSnapshot,
    );
    if (result === 'no_changes') return;
    if (typeof result === 'string') {
      connection.closingReason = result;
      sendHomeVisit(connection.socket, {
        type: 'error',
        code: homeVisitErrorCode(result),
        retryable: result === 'maintenance',
      });
      connection.socket.close(1008, 'Home-visit access changed');
      return;
    }
    connection.lastEventNumber = result.lastEventNumber;
    sendHomeVisit(connection.socket, {
      type: 'snapshot',
      lastEventNumber: result.lastEventNumber,
      events: [...result.events],
      snapshot: result.snapshot,
    });
  }

  async function handleHomeVisitMessage(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    data: RawData,
  ) {
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      raw = undefined;
    }
    const parsed = homeVisitRealtimeClientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      sendHomeVisit(socket, { type: 'error', code: 'INVALID_MESSAGE', retryable: false });
      return;
    }
    const active = activeHomeVisitByConnection.get(connectionId);
    if (active === undefined) {
      if (parsed.data.type !== 'authenticate') {
        sendHomeVisit(socket, { type: 'error', code: 'INVALID_TICKET', retryable: false });
        return;
      }
      await admitHomeVisit(connectionId, requestId, socket, parsed.data.ticket);
      return;
    }
    const now = Date.now();
    if (now - active.windowStartedAt >= 1_000) {
      active.windowStartedAt = now;
      active.messagesInWindow = 0;
    }
    active.messagesInWindow += 1;
    if (active.messagesInWindow > 20) {
      sendHomeVisit(socket, { type: 'error', code: 'SERVICE_UNAVAILABLE', retryable: true });
      return;
    }
    active.lastSeenAt = now;
    if (parsed.data.type === 'authenticate') {
      sendHomeVisit(socket, { type: 'error', code: 'INVALID_MESSAGE', retryable: false });
    } else if (parsed.data.type === 'ping') {
      sendHomeVisit(socket, { type: 'pong', nonce: parsed.data.nonce });
    } else if (parsed.data.type === 'movement') {
      const result = await persistence.checkpointHomeVisit(active.realtimeSessionId, parsed.data);
      if (typeof result === 'string') {
        sendHomeVisit(socket, {
          type: 'error',
          code: homeVisitErrorCode(result),
          retryable: false,
        });
      } else {
        sendHomeVisit(socket, { type: 'movement_ack', participant: result.participant });
      }
    } else {
      active.lastEventNumber = parsed.data.afterEventNumber;
      await refreshHomeVisit(active, parsed.data.forceSnapshot);
    }
  }

  function privateHomeErrorCode(denial: PrivateHomeRealtimeDenial) {
    if (denial === 'invalid_ticket' || denial === 'invalid_session')
      return 'INVALID_TICKET' as const;
    if (denial === 'player_suspended') return 'PLAYER_SUSPENDED' as const;
    if (denial === 'plot_unavailable') return 'PLOT_UNAVAILABLE' as const;
    if (denial === 'plot_world_mismatch') return 'PLOT_WORLD_MISMATCH' as const;
    if (denial === 'maintenance' || denial === 'world_unavailable') {
      return 'SERVER_UNAVAILABLE' as const;
    }
    return 'ACCESS_REVOKED' as const;
  }

  function privateHomeCloseReason(denial: PrivateHomeRealtimeDenial): string {
    if (denial === 'player_suspended') return 'player_suspended';
    if (denial === 'plot_unavailable') return 'plot_unavailable';
    if (denial === 'plot_world_mismatch' || denial === 'world_changed') {
      return 'world_transition';
    }
    if (denial === 'maintenance') return 'maintenance';
    return 'access_changed';
  }

  async function finalizePrivateHome(
    connection: ActivePrivateHomeConnection,
    reason: string,
  ): Promise<void> {
    if (!activePrivateHomeByConnection.delete(connection.connectionId)) return;
    await persistence
      .closePrivateHome(connection.sessionId, reason, connection.requestId)
      .catch((error) => {
        logger
          .child({ connectionId: connection.connectionId })
          .warn('realtime.private_home.finalize_failed', { error, reason });
        return false;
      });
  }

  async function admitPrivateHome(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    ticket: string,
  ): Promise<void> {
    let result;
    try {
      result = await persistence.admitPrivateHome(
        hashAccessSessionToken(ticket, config.ticketSecret),
        connectionId,
        requestId,
      );
    } catch (error) {
      logger
        .child({ connectionId, requestId })
        .error('realtime.private_home.admission_unavailable', { error });
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        retryable: true,
      });
      socket.close(1013, 'Private-home authorization unavailable');
      return;
    }

    if (typeof result === 'string') {
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: privateHomeErrorCode(result),
        retryable: result === 'world_changed' || result === 'world_unavailable',
      });
      socket.close(result === 'world_unavailable' ? 1013 : 1008, 'Private-home admission denied');
      return;
    }

    const now = Date.now();
    const connection: ActivePrivateHomeConnection = {
      connectionId,
      requestId,
      socket,
      sessionId: result.sessionId,
      homeId: result.homeId,
      lastEventNumber: result.lastEventNumber,
      lastSeenAt: now,
      lastPolledAt: now,
      lastRevalidatedAt: now,
      windowStartedAt: now,
      messagesInWindow: 0,
    };
    activePrivateHomeByConnection.set(connectionId, connection);
    sendPrivateHome(socket, {
      ...envelope(),
      type: 'admitted',
      sessionId: result.sessionId,
      homeId: result.homeId,
      lastEventNumber: result.lastEventNumber,
      view: result.view,
    });
    logger.child({ connectionId, requestId }).info('realtime.private_home.admitted', {
      homeId: result.homeId,
    });
  }

  async function refreshPrivateHome(
    connection: ActivePrivateHomeConnection,
    forceSnapshot: boolean,
  ): Promise<void> {
    const result = await persistence.privateHomeEvents(
      connection.sessionId,
      connection.lastEventNumber,
      forceSnapshot,
    );
    if (result === 'no_changes') return;
    if (typeof result === 'string') {
      connection.closingReason = privateHomeCloseReason(result);
      sendPrivateHome(connection.socket, {
        ...envelope(),
        type: 'error',
        code: privateHomeErrorCode(result),
        retryable: result === 'world_changed',
      });
      connection.socket.close(1008, 'Private-home access changed');
      return;
    }
    connection.lastEventNumber = result.lastEventNumber;
    sendPrivateHome(connection.socket, {
      ...envelope(),
      type: 'events',
      lastEventNumber: result.lastEventNumber,
      events: [...result.events],
      view: result.view,
    });
  }

  async function handlePrivateHomeMessage(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    data: RawData,
  ): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      raw = undefined;
    }
    const parsed = privateHomeRealtimeClientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: 'INVALID_MESSAGE',
        retryable: false,
      });
      return;
    }

    const active = activePrivateHomeByConnection.get(connectionId);
    if (active === undefined) {
      if (parsed.data.type !== 'authenticate') {
        sendPrivateHome(socket, {
          ...envelope(),
          type: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          retryable: false,
        });
        return;
      }
      await admitPrivateHome(connectionId, requestId, socket, parsed.data.ticket);
      return;
    }

    const now = Date.now();
    if (now - active.windowStartedAt >= 1_000) {
      active.windowStartedAt = now;
      active.messagesInWindow = 0;
    }
    active.messagesInWindow += 1;
    if (active.messagesInWindow > 12) {
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: 'RATE_LIMITED',
        retryable: true,
      });
      return;
    }
    active.lastSeenAt = now;

    if (parsed.data.type === 'authenticate') {
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: 'INVALID_MESSAGE',
        retryable: false,
      });
      return;
    }
    if (parsed.data.type === 'ping') {
      sendPrivateHome(socket, { ...envelope(), type: 'pong', nonce: parsed.data.nonce });
      return;
    }
    await refreshPrivateHome(active, true).catch((error) => {
      logger
        .child({ connectionId, requestId })
        .warn('realtime.private_home.snapshot_failed', { error });
      sendPrivateHome(socket, {
        ...envelope(),
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        retryable: true,
      });
    });
  }

  function sendSystemMessage(
    connection: ActiveConnection,
    text: string,
    sourceCategory: 'connection' | 'channel' | 'maintenance' | 'moderation' | 'live_operations',
  ): void {
    systemSequence += 1;
    send(connection.socket, {
      ...envelope(),
      type: 'chat.system_message',
      message: {
        id: randomUUID(),
        sequence: Date.now() * 1_000 + systemSequence,
        scope: 'system',
        senderPresenceId: null,
        senderDisplayName: 'Starville',
        senderLevel: null,
        worldId: connection.presence.worldId,
        channelId: connection.presence.channelId,
        sentAt: new Date().toISOString(),
        text,
        sourceCategory,
      },
    });
  }

  function broadcast(
    source: PublicPresence,
    message: RealtimeServerMessage,
    excludePresenceId?: string,
  ): void {
    const sourceConnection = connectionByPresence.get(source.presenceId);
    const sourceActivityId = sourceConnection?.activity.instance?.instanceId;
    for (const member of channelAuthority.members(source.worldId, source.channelId)) {
      if (member.presenceId === excludePresenceId) continue;
      const connection = connectionByPresence.get(member.presenceId);
      if (connection?.activity.instance?.instanceId !== sourceActivityId) continue;
      if (connection !== undefined) send(connection.socket, message);
    }
  }

  function hasActiveActivity(connection: ActiveConnection): boolean {
    return connection.activity.instance !== null;
  }

  function activityErrorCode(status: string): CooperativeActivityErrorCode {
    const known: readonly CooperativeActivityErrorCode[] = [
      'activity_unavailable',
      'party_required',
      'leader_required',
      'party_changed',
      'party_size',
      'not_ready',
      'already_active',
      'entry_conflict',
      'objective_changed',
      'invalid_object',
      'out_of_range',
      'not_participant',
      'activity_expired',
      'cooldown',
      'daily_limit',
      'rate_limited',
      'maintenance',
      'access_changed',
      'persistence_unavailable',
    ];
    return known.includes(status as CooperativeActivityErrorCode)
      ? (status as CooperativeActivityErrorCode)
      : 'activity_unavailable';
  }

  function sendActivityError(
    connection: ActiveConnection,
    status: string,
    requestId?: string,
  ): void {
    send(connection.socket, {
      ...envelope(),
      type: 'activity.error',
      ...(requestId === undefined ? {} : { requestId }),
      code: activityErrorCode(status),
    });
  }

  async function refreshActivityForPresenceIds(presenceIds: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(presenceIds)].map(async (presenceId) => {
        const connection = connectionByPresence.get(presenceId);
        if (connection === undefined) return;
        try {
          const activity = await persistence.cooperativeActivityBootstrap(connection.sessionId);
          connection.activity = activity;
          send(connection.socket, { ...envelope(), type: 'activity.bootstrap', activity });
        } catch (error) {
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.activity.bootstrap_refresh_failed', { error });
        }
      }),
    );
  }

  async function publishActivityOperation(
    actor: ActiveConnection,
    result: CooperativeActivityOperationResult,
  ): Promise<void> {
    const affected = [actor.presence.presenceId, ...(result.affectedPresenceIds ?? [])];
    await refreshActivityForPresenceIds(affected);
  }

  function broadcastChat(source: ActiveConnection, message: RealtimeServerMessage): void {
    if (message.type !== 'chat.message') return;
    if (message.message.scope === 'party') {
      const party = source.socialGraph.party;
      if (party === null || message.message.partyId !== party.partyId) return;
      for (const member of party.members) {
        const connection = connectionByPresence.get(member.presenceId);
        if (
          connection !== undefined &&
          !connection.hiddenPresenceIds.has(source.presence.presenceId)
        ) {
          send(connection.socket, message);
        }
      }
      return;
    }
    const recipients = chatRecipients(
      message.message.scope === 'nearby' ? 'nearby' : 'channel',
      source.presence,
      channelAuthority
        .members(source.presence.worldId, source.presence.channelId)
        .filter(
          (presence) =>
            connectionByPresence.get(presence.presenceId)?.activity.instance?.instanceId ===
            source.activity.instance?.instanceId,
        ),
      config.chatNearbyDistance,
    );
    for (const recipient of recipients) {
      const connection = connectionByPresence.get(recipient.presenceId);
      if (
        connection !== undefined &&
        !connection.hiddenPresenceIds.has(source.presence.presenceId)
      ) {
        send(connection.socket, message);
      }
    }
  }

  function socialParticipants(interaction: SocialInteractionView): readonly string[] {
    return interaction.kind === 'gift'
      ? [interaction.sender.presenceId, interaction.target.presenceId]
      : [
          interaction.senderOffer.participant.presenceId,
          interaction.targetOffer.participant.presenceId,
        ];
  }

  function sendToSocialParticipants(
    interaction: SocialInteractionView,
    message: RealtimeServerMessage,
  ): void {
    for (const presenceId of socialParticipants(interaction)) {
      const connection = connectionByPresence.get(presenceId);
      if (connection !== undefined) send(connection.socket, message);
    }
  }

  function socialErrorCode(status: string): SocialInteractionErrorCode {
    const known: readonly SocialInteractionErrorCode[] = [
      'player_unavailable',
      'too_far_away',
      'blocked',
      'request_expired',
      'request_changed',
      'item_unavailable',
      'item_restricted',
      'inventory_full',
      'trade_changed',
      'trade_paused',
      'interaction_active',
      'rate_limited',
      'access_changed',
      'maintenance',
      'settlement_failed',
      'persistence_unavailable',
    ];
    return known.includes(status as SocialInteractionErrorCode)
      ? (status as SocialInteractionErrorCode)
      : 'request_changed';
  }

  function sendSocialError(
    connection: ActiveConnection,
    requestId: string,
    status: string,
    retryAfterMs?: number,
  ): void {
    send(connection.socket, {
      ...envelope(),
      type: 'social.interaction.error',
      requestId,
      code: socialErrorCode(status),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }

  async function refreshSocialForPresenceIds(presenceIds: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(presenceIds)].map(async (presenceId) => {
        const connection = connectionByPresence.get(presenceId);
        if (connection === undefined) return;
        try {
          const social = await persistence.socialBootstrap(connection.sessionId);
          send(connection.socket, { ...envelope(), type: 'social.bootstrap', social });
        } catch (error) {
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.social.bootstrap_refresh_failed', { error });
        }
      }),
    );
  }

  function socialGraphErrorCode(status: string): SocialGraphErrorCode {
    const known: readonly SocialGraphErrorCode[] = [
      'player_unavailable',
      'already_friends',
      'friend_limit_reached',
      'request_changed',
      'request_expired',
      'party_changed',
      'party_full',
      'already_in_party',
      'not_party_leader',
      'invitation_changed',
      'blocked',
      'rate_limited',
      'access_changed',
      'maintenance',
      'persistence_unavailable',
    ];
    return known.includes(status as SocialGraphErrorCode)
      ? (status as SocialGraphErrorCode)
      : 'request_changed';
  }

  function sendSocialGraphError(
    connection: ActiveConnection,
    requestId: string,
    status: string,
    retryAfterMs?: number,
  ): void {
    send(connection.socket, {
      ...envelope(),
      type: 'social.error',
      requestId,
      code: socialGraphErrorCode(status),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }

  async function refreshSocialGraphForPresenceIds(presenceIds: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(presenceIds)].map(async (presenceId) => {
        const connection = connectionByPresence.get(presenceId);
        if (connection === undefined) return;
        try {
          const socialGraph = await persistence.socialGraphBootstrap(connection.sessionId);
          const previousRevision = connection.socialGraph.party?.revision ?? 0;
          connection.socialGraph = socialGraph;
          send(connection.socket, { ...envelope(), type: 'friends.snapshot', socialGraph });
          if ((socialGraph.party?.revision ?? 0) >= previousRevision) {
            send(connection.socket, {
              ...envelope(),
              type: 'party.snapshot',
              party: socialGraph.party,
            });
          }
        } catch (error) {
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.social_graph.bootstrap_refresh_failed', { error });
        }
      }),
    );
  }

  async function publishSocialGraphOperation(
    actor: ActiveConnection,
    result: SocialGraphOperationResult,
  ): Promise<void> {
    if (result.friendRequest !== undefined && result.status === 'created') {
      const target = connectionByPresence.get(result.friendRequest.target.presenceId);
      if (target !== undefined) {
        send(target.socket, {
          ...envelope(),
          type: 'friends.request.received',
          request: result.friendRequest,
        });
      }
    }
    if (result.invitation !== undefined && result.status === 'created') {
      const target = connectionByPresence.get(result.invitation.target.presenceId);
      if (target !== undefined) {
        send(target.socket, {
          ...envelope(),
          type: 'party.invitation.received',
          invitation: result.invitation,
        });
      }
    }
    if (result.notification !== undefined) {
      const targetPresenceId =
        result.friendRequest?.target.presenceId ?? result.invitation?.target.presenceId;
      const target =
        targetPresenceId === undefined ? undefined : connectionByPresence.get(targetPresenceId);
      if (target !== undefined) {
        send(target.socket, {
          ...envelope(),
          type: 'social.notification',
          notification: result.notification,
        });
      }
    }
    await refreshSocialGraphForPresenceIds([
      actor.presence.presenceId,
      ...result.affectedPresenceIds,
    ]);
  }

  async function checkpointNearbyPair(
    source: ActiveConnection,
    targetPresenceId: string,
  ): Promise<
    | { readonly status: 'available'; readonly target: ActiveConnection }
    | { readonly status: 'player_unavailable' | 'too_far_away' | 'access_changed' }
  > {
    const target = connectionByPresence.get(targetPresenceId);
    if (
      target === undefined ||
      hasActiveActivity(source) ||
      hasActiveActivity(target) ||
      target.presence.presenceId === source.presence.presenceId ||
      target.presence.worldId !== source.presence.worldId ||
      target.presence.worldVersionId !== source.presence.worldVersionId ||
      target.presence.channelId !== source.presence.channelId
    ) {
      return { status: 'player_unavailable' };
    }
    if (socialDistance(source.presence, target.presence) > SOCIAL_INTERACTION_DISTANCE) {
      return { status: 'too_far_away' };
    }
    const checkpoints = await Promise.all([
      persistence.checkpoint(source.sessionId, source.presence),
      persistence.checkpoint(target.sessionId, target.presence),
    ]);
    return checkpoints.every((status) => status === 'checkpointed')
      ? { status: 'available', target }
      : { status: 'access_changed' };
  }

  function publishSocialOperation(
    actor: ActiveConnection,
    result: SocialOperationResult,
    createdTargetPresenceId?: string,
  ): void {
    const interaction = result.interaction;
    if (interaction === undefined) return;
    if (result.status === 'created') {
      send(actor.socket, { ...envelope(), type: 'social.request.updated', interaction });
      const targetPresenceId = result.targetPresenceId ?? createdTargetPresenceId;
      const target =
        targetPresenceId === undefined ? undefined : connectionByPresence.get(targetPresenceId);
      if (target !== undefined) {
        send(target.socket, { ...envelope(), type: 'social.request.received', interaction });
      }
      return;
    }
    if (interaction.kind === 'gift') {
      if (result.status === 'completed' && result.receipt !== undefined) {
        sendToSocialParticipants(interaction, {
          ...envelope(),
          type: 'social.gift.completed',
          gift: interaction,
          receipt: result.receipt,
        });
      } else {
        sendToSocialParticipants(interaction, {
          ...envelope(),
          type: 'social.request.updated',
          interaction,
        });
      }
      return;
    }
    if (result.status === 'completed' && result.receipt !== undefined) {
      sendToSocialParticipants(interaction, {
        ...envelope(),
        type: 'social.trade.completed',
        trade: interaction,
        receipt: result.receipt,
      });
    } else if (result.status === 'cancelled') {
      sendToSocialParticipants(interaction, {
        ...envelope(),
        type: 'social.trade.cancelled',
        trade: interaction,
      });
    } else {
      sendToSocialParticipants(interaction, {
        ...envelope(),
        type:
          result.status === 'opened'
            ? 'social.trade.opened'
            : result.status === 'confirmed'
              ? 'social.trade.confirmation_changed'
              : 'social.trade.updated',
        trade: interaction,
      });
    }
  }

  function publishInvalidatedInteractions(interactions: readonly SocialInteractionView[]): void {
    for (const interaction of interactions) {
      if (interaction.kind === 'trade') {
        sendToSocialParticipants(interaction, {
          ...envelope(),
          type:
            interaction.status === 'negotiating' && interaction.reconnectDeadline !== null
              ? 'social.trade.updated'
              : 'social.trade.invalidated',
          trade: interaction,
        });
      } else {
        sendToSocialParticipants(interaction, {
          ...envelope(),
          type: 'social.request.updated',
          interaction,
        });
      }
    }
  }

  async function finalize(connection: ActiveConnection, reason: string): Promise<void> {
    if (!activeByConnection.delete(connection.connectionId)) return;
    try {
      const interactions = await persistence.socialDisconnect(
        connection.sessionId,
        reason,
        connection.requestId,
      );
      publishInvalidatedInteractions(interactions);
    } catch (error) {
      logger
        .child({ connectionId: connection.connectionId })
        .warn('realtime.social.disconnect_failed', { error, reason });
    }
    try {
      const result = await persistence.socialGraphDisconnect(
        connection.sessionId,
        reason,
        connection.requestId,
      );
      await publishSocialGraphOperation(connection, result);
    } catch (error) {
      logger
        .child({ connectionId: connection.connectionId })
        .warn('realtime.social_graph.disconnect_failed', { error, reason });
    }
    try {
      const result = await persistence.cooperativeActivityDisconnect(
        connection.sessionId,
        reason,
        connection.requestId,
      );
      await refreshActivityForPresenceIds(
        (result.affectedPresenceIds ?? []).filter(
          (presenceId) => presenceId !== connection.presence.presenceId,
        ),
      );
    } catch (error) {
      logger
        .child({ connectionId: connection.connectionId })
        .warn('realtime.activity.disconnect_failed', { error, reason });
    }
    broadcast(
      connection.presence,
      {
        ...envelope(),
        type: 'presence_left',
        presenceId: connection.presence.presenceId,
      },
      connection.presence.presenceId,
    );
    connectionByPresence.delete(connection.presence.presenceId);
    channelAuthority.leave(connection.presence.presenceId);
    rooms.removeConnection(connection.connectionId);
    try {
      if (!hasActiveActivity(connection)) {
        await persistence.checkpoint(connection.sessionId, connection.presence);
      }
      await persistence.close(connection.sessionId, reason, connection.requestId);
    } catch (error) {
      logger.child({ connectionId: connection.connectionId }).warn('realtime.finalize.failed', {
        error,
        reason,
      });
    }
    chatRates.clear(connection.presence.presenceId);
    activityRates.clear(connection.presence.presenceId);
    socialRates.clear(connection.presence.presenceId);
    socialGraphRates.clear(connection.presence.presenceId);
  }

  async function admit(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    ticket: string,
  ): Promise<void> {
    let result: RealtimeAdmission | RealtimeDenial;
    try {
      result = await persistence.admit(
        hashAccessSessionToken(ticket, config.ticketSecret),
        connectionId,
        requestId,
      );
    } catch (error) {
      logger.child({ connectionId, requestId }).error('realtime.admission.unavailable', { error });
      send(socket, {
        ...envelope(),
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        retryable: true,
        requestId,
      });
      socket.close(1013, 'Realtime authorization unavailable');
      return;
    }

    if (typeof result === 'string') {
      send(socket, {
        ...envelope(),
        type: 'error',
        code: safeErrorForDenial(result),
        retryable: result === 'channel_full' || result === 'world_unavailable',
        requestId,
      });
      socket.close(result === 'channel_full' ? 1013 : 1008, 'Realtime admission denied');
      return;
    }

    channelsByWorld.set(result.worldId, result.channels);
    refreshChannelDefinitions();
    let presence = presenceFromAdmission(result);
    const replaced = connectionByPresence.get(presence.presenceId);
    if (replaced !== undefined) {
      replaced.closingReason = 'replaced';
      await finalize(replaced, 'replaced');
      replaced.socket.close(4001, 'A newer connection replaced this session');
    }
    if (!channelAuthority.join(presence)) {
      await persistence
        .close(result.sessionId, 'authorization_failed', requestId)
        .catch(() => false);
      send(socket, {
        ...envelope(),
        type: 'error',
        code: 'CHANNEL_FULL',
        retryable: true,
        requestId,
      });
      socket.close(1013, 'Channel is full');
      return;
    }

    let chat;
    let social;
    let socialGraph;
    let activity;
    let appearance;
    try {
      [chat, social, socialGraph, activity, appearance] = await Promise.all([
        persistence.chatBootstrap(result.sessionId),
        persistence.socialBootstrap(result.sessionId),
        persistence.socialGraphBootstrap(result.sessionId),
        persistence.cooperativeActivityBootstrap(result.sessionId),
        persistence.avatarProfile(result.sessionId, requestId),
      ]);
    } catch (error) {
      channelAuthority.leave(presence.presenceId);
      await persistence
        .close(result.sessionId, 'authorization_failed', requestId)
        .catch(() => false);
      logger.child({ connectionId, requestId }).error('realtime.bootstrap_failed', { error });
      send(socket, {
        ...envelope(),
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        retryable: true,
        requestId,
      });
      socket.close(1013, 'Realtime authorization unavailable');
      return;
    }

    if (typeof appearance !== 'string') {
      presence = { ...presence, ...appearance };
      channelAuthority.update(presence);
    }

    const now = Date.now();
    const connection: ActiveConnection = {
      connectionId,
      requestId,
      socket,
      sessionId: result.sessionId,
      manifest: result.manifest,
      presence,
      acceptedAt: now,
      lastSeenAt: now,
      lastCheckpointAt: now,
      lastRevalidatedAt: now,
      windowStartedAt: now,
      messagesInWindow: 0,
      lastAppearanceRefreshAt: 0,
      hiddenPresenceIds: new Set(chat.preferences.map((preference) => preference.targetPresenceId)),
      chatMutedUntil: chat.mutedUntil ?? undefined,
      socialGraph,
      activity,
    };
    activeByConnection.set(connectionId, connection);
    connectionByPresence.set(presence.presenceId, connection);
    rooms.join(presence.channelId, connectionId);

    send(socket, {
      ...envelope(),
      type: 'admitted',
      self: presence,
      channels: [...channelAuthority.list(presence.worldId)],
      checkpointIntervalMs: config.checkpointIntervalMs,
    });
    send(socket, {
      ...envelope(),
      type: 'snapshot',
      worldId: presence.worldId,
      channelId: presence.channelId,
      presences: channelAuthority
        .members(presence.worldId, presence.channelId)
        .filter(
          (member) =>
            member.presenceId !== presence.presenceId &&
            connectionByPresence.get(member.presenceId)?.activity.instance?.instanceId ===
              activity.instance?.instanceId,
        ),
    });
    send(socket, {
      ...envelope(),
      type: 'chat.bootstrap',
      chat: liveSessionChatBootstrap(chat),
    });
    send(socket, { ...envelope(), type: 'social.bootstrap', social });
    send(socket, { ...envelope(), type: 'social_graph.bootstrap', socialGraph });
    send(socket, { ...envelope(), type: 'activity.bootstrap', activity });
    sendSystemMessage(
      connection,
      `Connection restored. You are chatting in Channel ${String(presence.channelNumber)}.`,
      'connection',
    );
    broadcast(presence, { ...envelope(), type: 'presence_joined', presence }, presence.presenceId);
    logger.child({ connectionId, requestId }).info('realtime.connection.admitted', {
      channelId: presence.channelId,
      worldId: presence.worldId,
    });
  }

  async function handleChatMessage(
    active: ActiveConnection,
    message: ChatClientMessage,
  ): Promise<void> {
    if (message.type === 'chat.send') {
      const decision = chatRates.evaluateSend(active.presence.presenceId, message.text);
      if (!decision.accepted) {
        send(active.socket, {
          ...envelope(),
          type: 'chat.message_rejected',
          requestId: message.requestId,
          reason: decision.reason,
          ...(decision.retryAfterMs === undefined ? {} : { retryAfterMs: decision.retryAfterMs }),
        });
        return;
      }
      try {
        const accepted = await persistence.acceptChat(
          active.sessionId,
          message.requestId,
          message.scope,
          decision.text,
          { x: active.presence.x, y: active.presence.y },
        );
        if (accepted.status === 'chat_muted') {
          active.chatMutedUntil = accepted.mutedUntil;
          send(active.socket, {
            ...envelope(),
            type: 'chat.message_rejected',
            requestId: message.requestId,
            reason: 'chat_muted',
            mutedUntil: accepted.mutedUntil,
          });
          send(active.socket, {
            ...envelope(),
            type: 'chat.moderation_notice',
            code: 'chat_muted',
            mutedUntil: accepted.mutedUntil,
          });
          return;
        }
        if (accepted.status !== 'accepted' && accepted.status !== 'replayed') {
          send(active.socket, {
            ...envelope(),
            type: 'chat.message_rejected',
            requestId: message.requestId,
            reason: accepted.status === 'invalid_content' ? 'invalid_content' : 'access_changed',
          });
          return;
        }
        const outbound = {
          ...envelope(),
          type: 'chat.message',
          message: accepted.message,
        } as const;
        if (accepted.status === 'replayed') send(active.socket, outbound);
        else broadcastChat(active, outbound);
      } catch (error) {
        logger
          .child({ connectionId: active.connectionId, requestId: active.requestId })
          .warn('realtime.chat.send_failed', { error, scope: message.scope });
        send(active.socket, {
          ...envelope(),
          type: 'chat.message_rejected',
          requestId: message.requestId,
          reason: 'persistence_unavailable',
        });
      }
      return;
    }
    if (message.type === 'chat.history.request') {
      send(active.socket, {
        ...envelope(),
        type: 'chat.history',
        history: { scope: message.scope, messages: [], hasMore: false },
      });
      return;
    }
    if (message.type === 'chat.mark_read') {
      send(active.socket, {
        ...envelope(),
        type: 'chat.unread_count',
        scope: message.scope,
        count: 0,
      });
      return;
    }
    if (message.type === 'chat.report') {
      if (!chatRates.allowReport(active.presence.presenceId)) {
        send(active.socket, {
          ...envelope(),
          type: 'chat.message_rejected',
          requestId: message.requestId,
          reason: 'rate_limited',
          retryAfterMs: 60_000,
        });
        return;
      }
      try {
        const report = await persistence.reportChat(
          active.sessionId,
          message.messageId,
          message.category,
          message.reason,
          message.requestId,
        );
        send(active.socket, {
          ...envelope(),
          type: 'chat.report_received',
          requestId: message.requestId,
          reportId: report.reportId,
        });
      } catch (error) {
        logger.child({ connectionId: active.connectionId }).warn('realtime.chat.report_failed', {
          error,
        });
        send(active.socket, {
          ...envelope(),
          type: 'chat.message_rejected',
          requestId: message.requestId,
          reason: 'persistence_unavailable',
        });
      }
      return;
    }
    if (!chatRates.allowSafetyAction(active.presence.presenceId)) return;
    const action = {
      'chat.mute_player': 'mute',
      'chat.unmute_player': 'unmute',
      'chat.block_player': 'block',
      'chat.unblock_player': 'unblock',
    }[message.type] as 'mute' | 'unmute' | 'block' | 'unblock';
    try {
      const preference = await persistence.updateChatPreference(
        active.sessionId,
        message.targetPresenceId,
        action,
      );
      if (preference.muted || preference.blocked) {
        active.hiddenPresenceIds.add(preference.targetPresenceId);
      } else {
        active.hiddenPresenceIds.delete(preference.targetPresenceId);
      }
      const type = {
        mute: 'chat.player_muted',
        unmute: 'chat.player_unmuted',
        block: 'chat.player_blocked',
        unblock: 'chat.player_unblocked',
      }[action] as
        | 'chat.player_muted'
        | 'chat.player_unmuted'
        | 'chat.player_blocked'
        | 'chat.player_unblocked';
      send(active.socket, {
        ...envelope(),
        type,
        targetPresenceId: preference.targetPresenceId,
      });
      if (action === 'block') {
        const [interactions, socialGraphResult] = await Promise.all([
          persistence.invalidateSocialPair(
            active.sessionId,
            preference.targetPresenceId,
            active.requestId,
          ),
          persistence.invalidateSocialGraphPair(
            active.sessionId,
            preference.targetPresenceId,
            active.requestId,
          ),
        ]);
        publishInvalidatedInteractions(interactions);
        await publishSocialGraphOperation(active, socialGraphResult);
        await refreshSocialForPresenceIds([
          active.presence.presenceId,
          preference.targetPresenceId,
        ]);
      }
    } catch (error) {
      logger.child({ connectionId: active.connectionId }).warn('realtime.chat.preference_failed', {
        error,
        action,
      });
    }
  }

  async function checkpointSocialChannel(active: ActiveConnection): Promise<void> {
    const members = channelAuthority.members(active.presence.worldId, active.presence.channelId);
    await Promise.all(
      members.map(async (member) => {
        const connection = connectionByPresence.get(member.presenceId);
        if (connection !== undefined) {
          await persistence.checkpoint(connection.sessionId, connection.presence);
        }
      }),
    );
  }

  async function handleSocialMessage(
    active: ActiveConnection,
    message: SocialClientMessage,
  ): Promise<void> {
    const action =
      message.type === 'social.inspect.request'
        ? 'inspect'
        : message.type === 'social.gift.create' || message.type === 'social.trade.request'
          ? 'request'
          : message.type === 'social.trade.offer.update'
            ? 'offer'
            : message.type === 'social.trade.confirm'
              ? 'confirm'
              : message.type === 'social.gift.cancel' || message.type === 'social.trade.cancel'
                ? 'cancel'
                : 'response';
    if (!socialRates.allow(active.presence.presenceId, action)) {
      sendSocialError(active, message.requestId, 'rate_limited', 60_000);
      return;
    }

    try {
      if (message.type === 'social.inspect.request') {
        const proximity = await checkpointNearbyPair(active, message.targetPresenceId);
        if (proximity.status !== 'available') {
          sendSocialError(active, message.requestId, proximity.status);
          return;
        }
        const result = await persistence.inspectSocialPlayer(
          active.sessionId,
          message.targetPresenceId,
        );
        if (result.status !== 'ok' || result.profile === undefined) {
          sendSocialError(active, message.requestId, result.status);
          return;
        }
        send(active.socket, {
          ...envelope(),
          type: 'social.inspect.result',
          requestId: message.requestId,
          profile: result.profile,
        });
        return;
      }

      let result: SocialOperationResult;
      let createdTargetPresenceId: string | undefined;
      if (message.type === 'social.gift.create') {
        const proximity = await checkpointNearbyPair(active, message.targetPresenceId);
        if (proximity.status !== 'available') {
          sendSocialError(active, message.requestId, proximity.status);
          return;
        }
        createdTargetPresenceId = proximity.target.presence.presenceId;
        result = await persistence.createSocialGift(
          active.sessionId,
          message.targetPresenceId,
          message.itemSlug,
          message.quantity,
          message.requestId,
        );
      } else if (message.type === 'social.trade.request') {
        const proximity = await checkpointNearbyPair(active, message.targetPresenceId);
        if (proximity.status !== 'available') {
          sendSocialError(active, message.requestId, proximity.status);
          return;
        }
        createdTargetPresenceId = proximity.target.presence.presenceId;
        result = await persistence.createSocialTrade(
          active.sessionId,
          message.targetPresenceId,
          message.requestId,
        );
      } else {
        await checkpointSocialChannel(active);
        if (message.type === 'social.gift.accept' || message.type === 'social.gift.decline') {
          result = await persistence.respondSocialGift(
            active.sessionId,
            message.interactionId,
            message.type === 'social.gift.accept' ? 'accept' : 'decline',
            message.requestId,
          );
        } else if (message.type === 'social.gift.cancel') {
          result = await persistence.cancelSocialGift(
            active.sessionId,
            message.interactionId,
            message.requestId,
          );
        } else if (
          message.type === 'social.trade.accept' ||
          message.type === 'social.trade.decline'
        ) {
          result = await persistence.respondSocialTrade(
            active.sessionId,
            message.interactionId,
            message.type === 'social.trade.accept' ? 'accept' : 'decline',
            message.requestId,
          );
        } else if (message.type === 'social.trade.offer.update') {
          result = await persistence.updateSocialTradeOffer(
            active.sessionId,
            message.interactionId,
            message.expectedRevision,
            message.items,
            message.requestId,
          );
        } else if (message.type === 'social.trade.confirm') {
          result = await persistence.confirmSocialTrade(
            active.sessionId,
            message.interactionId,
            message.expectedRevision,
            message.requestId,
          );
        } else if (message.type === 'social.trade.cancel') {
          result = await persistence.cancelSocialTrade(
            active.sessionId,
            message.interactionId,
            message.requestId,
          );
        } else {
          result = await persistence.resumeSocialTrade(
            active.sessionId,
            message.interactionId,
            message.requestId,
          );
        }
      }

      const successfulStatuses = new Set([
        'created',
        'opened',
        'updated',
        'confirmed',
        'declined',
        'cancelled',
        'completed',
        'resumed',
      ]);
      if (!successfulStatuses.has(result.status)) {
        sendSocialError(active, message.requestId, result.status);
        if (result.interaction !== undefined) publishSocialOperation(active, result);
        return;
      }
      publishSocialOperation(active, result, createdTargetPresenceId);
      const participants =
        result.interaction === undefined
          ? [active.presence.presenceId, createdTargetPresenceId].filter(
              (presenceId): presenceId is string => presenceId !== undefined,
            )
          : socialParticipants(result.interaction);
      await refreshSocialForPresenceIds(participants);
    } catch (error) {
      logger
        .child({ connectionId: active.connectionId, requestId: message.requestId })
        .warn('realtime.social.operation_failed', { error, messageType: message.type });
      sendSocialError(active, message.requestId, 'persistence_unavailable');
    }
  }

  async function handleSocialGraphMessage(
    active: ActiveConnection,
    message: SocialGraphClientMessage,
  ): Promise<void> {
    if (message.type === 'friends.list.request' || message.type === 'party.snapshot.request') {
      await refreshSocialGraphForPresenceIds([active.presence.presenceId]);
      return;
    }

    const action =
      message.type === 'friends.request.send'
        ? 'friend_request'
        : message.type === 'friends.remove'
          ? 'friend_remove'
          : message.type.startsWith('friends.request.')
            ? 'friend_response'
            : message.type === 'party.create'
              ? 'party_create'
              : message.type === 'party.invite.send'
                ? 'party_invite'
                : message.type.startsWith('party.invite.')
                  ? 'party_response'
                  : message.type === 'party.ready_check.start'
                    ? 'ready_start'
                    : message.type === 'party.ready_check.respond'
                      ? 'ready_response'
                      : 'party_membership';
    if (!socialGraphRates.allow(active.presence.presenceId, action)) {
      sendSocialGraphError(active, message.requestId, 'rate_limited', 60_000);
      return;
    }

    try {
      let result: SocialGraphOperationResult;
      if (message.type === 'friends.request.send') {
        result = await persistence.sendFriendRequest(
          active.sessionId,
          message.targetPresenceId,
          message.requestId,
        );
      } else if (
        message.type === 'friends.request.accept' ||
        message.type === 'friends.request.decline'
      ) {
        result = await persistence.respondFriendRequest(
          active.sessionId,
          message.friendRequestId,
          message.type === 'friends.request.accept' ? 'accept' : 'decline',
          message.requestId,
        );
      } else if (message.type === 'friends.request.cancel') {
        result = await persistence.cancelFriendRequest(
          active.sessionId,
          message.friendRequestId,
          message.requestId,
        );
      } else if (message.type === 'friends.remove') {
        result = await persistence.removeFriend(
          active.sessionId,
          message.targetPresenceId,
          message.requestId,
        );
      } else if (message.type === 'party.create') {
        result = await persistence.createParty(active.sessionId, message.requestId);
      } else if (message.type === 'party.invite.send') {
        result = await persistence.sendPartyInvitation(
          active.sessionId,
          message.targetPresenceId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (
        message.type === 'party.invite.accept' ||
        message.type === 'party.invite.decline'
      ) {
        result = await persistence.respondPartyInvitation(
          active.sessionId,
          message.invitationId,
          message.expectedRevision,
          message.type === 'party.invite.accept' ? 'accept' : 'decline',
          message.requestId,
        );
      } else if (message.type === 'party.invite.cancel') {
        result = await persistence.cancelPartyInvitation(
          active.sessionId,
          message.invitationId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.leave') {
        result = await persistence.leaveParty(
          active.sessionId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.kick') {
        result = await persistence.kickPartyMember(
          active.sessionId,
          message.targetPresenceId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.promote') {
        result = await persistence.promotePartyLeader(
          active.sessionId,
          message.targetPresenceId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.disband') {
        result = await persistence.disbandParty(
          active.sessionId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.ready_check.start') {
        result = await persistence.startPartyReadyCheck(
          active.sessionId,
          message.expectedRevision,
          message.requestId,
        );
      } else if (message.type === 'party.ready_check.respond') {
        result = await persistence.respondPartyReadyCheck(
          active.sessionId,
          message.readyCheckId,
          message.expectedRevision,
          message.response,
          message.requestId,
        );
      } else {
        sendSocialGraphError(active, message.requestId, 'request_changed');
        return;
      }

      const successfulStatuses = new Set([
        'accepted',
        'cancelled',
        'created',
        'declined',
        'disbanded',
        'invalidated',
        'joined',
        'kicked',
        'left',
        'promoted',
        'removed',
        'replayed',
        'reverse_pending',
        'started',
        'unchanged',
        'updated',
      ]);
      if (!successfulStatuses.has(result.status)) {
        sendSocialGraphError(active, message.requestId, result.status);
        return;
      }
      await publishSocialGraphOperation(active, result);
    } catch (error) {
      logger
        .child({ connectionId: active.connectionId, requestId: message.requestId })
        .warn('realtime.social_graph.operation_failed', { error, messageType: message.type });
      sendSocialGraphError(active, message.requestId, 'persistence_unavailable');
    }
  }

  async function handleActivityMessage(
    active: ActiveConnection,
    message: ActivityClientMessage,
  ): Promise<void> {
    const action =
      message.type === 'activity.catalog.request'
        ? 'catalog'
        : message.type === 'activity.instance.snapshot.request' ||
            message.type === 'activity.resume'
          ? 'snapshot'
          : message.type === 'activity.entry.prepare'
            ? 'prepare'
            : message.type === 'activity.entry.ready'
              ? 'ready'
              : message.type === 'activity.entry.enter'
                ? 'enter'
                : message.type === 'activity.interact'
                  ? 'interact'
                  : 'leave';
    if (!activityRates.allow(active.presence.presenceId, action)) {
      sendActivityError(
        active,
        'rate_limited',
        'requestId' in message ? message.requestId : undefined,
      );
      return;
    }
    try {
      if (
        message.type === 'activity.catalog.request' ||
        message.type === 'activity.instance.snapshot.request' ||
        message.type === 'activity.resume'
      ) {
        const activity = await persistence.cooperativeActivityBootstrap(active.sessionId);
        active.activity = activity;
        if (message.type === 'activity.catalog.request') {
          send(active.socket, {
            ...envelope(),
            type: 'activity.catalog',
            catalog: activity.catalog,
          });
        } else if (activity.instance !== null) {
          send(active.socket, {
            ...envelope(),
            type: 'activity.instance.snapshot',
            instance: activity.instance,
          });
        } else {
          send(active.socket, { ...envelope(), type: 'activity.bootstrap', activity });
        }
        return;
      }

      if (message.type === 'activity.entry.ready') {
        const result = await persistence.respondPartyReadyCheck(
          active.sessionId,
          message.readyCheckId,
          message.expectedPartyRevision,
          message.response,
          message.requestId,
        );
        if (!['updated', 'replayed'].includes(result.status)) {
          sendActivityError(active, result.status, message.requestId);
          return;
        }
        await Promise.all([
          publishSocialGraphOperation(active, result),
          refreshActivityForPresenceIds([
            active.presence.presenceId,
            ...result.affectedPresenceIds,
          ]),
        ]);
        return;
      }

      let result: CooperativeActivityOperationResult;
      if (message.type === 'activity.entry.prepare') {
        result = await persistence.prepareCooperativeActivityEntry(
          active.sessionId,
          message.activityKey,
          message.expectedPartyRevision,
          message.requestId,
        );
      } else if (message.type === 'activity.entry.enter') {
        result = await persistence.enterCooperativeActivity(
          active.sessionId,
          message.preparationId,
          message.requestId,
        );
      } else if (message.type === 'activity.interact') {
        result = await persistence.interactCooperativeActivity(
          active.sessionId,
          message.intent.instanceId,
          message.intent.expectedRevision,
          message.intent.objectiveKey,
          message.intent.objectKey,
          { x: active.presence.x, y: active.presence.y },
          message.requestId,
        );
      } else {
        result = await persistence.leaveCooperativeActivity(
          active.sessionId,
          message.instanceId,
          message.requestId,
        );
      }

      const successful = new Set([
        'ready_check',
        'ready',
        'entered',
        'progressed',
        'completed',
        'left',
        'replayed',
      ]);
      if (!successful.has(result.status)) {
        sendActivityError(active, result.status, message.requestId);
        if (result.snapshot !== undefined) {
          send(active.socket, {
            ...envelope(),
            type: 'activity.instance.snapshot',
            instance: result.snapshot,
          });
        }
        return;
      }
      await publishActivityOperation(active, result);
    } catch (error) {
      logger
        .child({ connectionId: active.connectionId })
        .warn('realtime.activity.operation_failed', { error, messageType: message.type });
      sendActivityError(
        active,
        'persistence_unavailable',
        'requestId' in message ? message.requestId : undefined,
      );
    }
  }

  async function handleMessage(
    connectionId: string,
    requestId: string,
    socket: WebSocket,
    data: RawData,
  ): Promise<void> {
    const message = parseRealtimeClientMessage(data.toString());
    if (message === undefined) {
      send(socket, {
        ...envelope(),
        type: 'error',
        code: 'INVALID_MESSAGE',
        retryable: false,
        requestId,
      });
      if (!chatRates.noteMalformed(connectionId)) socket.close(1008, 'Too many invalid messages');
      return;
    }

    const active = activeByConnection.get(connectionId);
    if (active === undefined) {
      if (message.type !== 'authenticate') {
        send(socket, {
          ...envelope(),
          type: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          retryable: false,
          requestId,
        });
        return;
      }
      await admit(connectionId, requestId, socket, message.ticket);
      return;
    }

    active.lastSeenAt = Date.now();
    if (message.type === 'authenticate') {
      send(socket, {
        ...envelope(),
        type: 'error',
        code: 'INVALID_MESSAGE',
        retryable: false,
        requestId,
      });
      return;
    }
    if (message.type === 'ping') {
      send(socket, { ...envelope(), type: 'pong', nonce: message.nonce });
      return;
    }
    if (message.type === 'appearance.refresh') {
      const now = Date.now();
      if (now - active.lastAppearanceRefreshAt < 1_000) {
        send(socket, {
          ...envelope(),
          type: 'error',
          code: 'RATE_LIMITED',
          retryable: true,
          requestId,
        });
        return;
      }
      active.lastAppearanceRefreshAt = now;
      try {
        const appearance = await persistence.avatarProfile(active.sessionId, requestId);
        if (typeof appearance === 'string') return;
        if (
          active.presence.appearanceId === appearance.appearanceId &&
          active.presence.appearanceRevision === appearance.appearanceRevision
        ) {
          return;
        }
        active.presence = { ...active.presence, ...appearance };
        channelAuthority.update(active.presence);
        broadcast(active.presence, {
          ...envelope(),
          type: 'appearance_updated',
          presenceId: active.presence.presenceId,
          appearanceId: appearance.appearanceId,
          appearanceRevision: appearance.appearanceRevision,
        });
      } catch (error) {
        logger
          .child({ connectionId, requestId })
          .warn('realtime.appearance.refresh_failed', { error });
        send(socket, {
          ...envelope(),
          type: 'error',
          code: 'SERVER_UNAVAILABLE',
          retryable: true,
          requestId,
        });
      }
      return;
    }
    if (message.type === 'emote.activate') {
      try {
        const result = await persistence.activateEmote(
          active.sessionId,
          message.emoteKey,
          message.requestId,
        );
        if (result.status !== 'activated') {
          send(socket, {
            ...envelope(),
            type: 'emote.rejected',
            requestId: message.requestId,
            reason: result.status,
          });
          return;
        }
        if (
          result.presenceId !== active.presence.presenceId ||
          result.channelId !== active.presence.channelId
        ) {
          send(socket, {
            ...envelope(),
            type: 'emote.rejected',
            requestId: message.requestId,
            reason: 'access_changed',
          });
          return;
        }
        broadcast(active.presence, {
          ...envelope(),
          type: 'emote.activated',
          requestId: message.requestId,
          presenceId: result.presenceId,
          emoteKey: result.emoteKey,
          activationId: result.activationId,
          startedAt: result.startedAt,
          durationMs: result.durationMs,
        });
      } catch (error) {
        logger.child({ connectionId, requestId }).warn('realtime.emote.activate_failed', { error });
        send(socket, {
          ...envelope(),
          type: 'error',
          code: 'SERVER_UNAVAILABLE',
          retryable: true,
          requestId: message.requestId,
        });
      }
      return;
    }
    if (message.type === 'resync') {
      send(socket, {
        ...envelope(),
        type: 'snapshot',
        worldId: active.presence.worldId,
        channelId: active.presence.channelId,
        presences: channelAuthority
          .members(active.presence.worldId, active.presence.channelId)
          .filter(
            (member) =>
              member.presenceId !== active.presence.presenceId &&
              connectionByPresence.get(member.presenceId)?.activity.instance?.instanceId ===
                active.activity.instance?.instanceId,
          ),
      });
      void Promise.all([
        persistence.chatBootstrap(active.sessionId),
        persistence.socialBootstrap(active.sessionId),
        persistence.socialGraphBootstrap(active.sessionId),
        persistence.cooperativeActivityBootstrap(active.sessionId),
      ])
        .then(([chat, social, socialGraph, activity]) => {
          active.hiddenPresenceIds = new Set(
            chat.preferences.map((preference) => preference.targetPresenceId),
          );
          active.chatMutedUntil = chat.mutedUntil ?? undefined;
          active.socialGraph = socialGraph;
          active.activity = activity;
          send(socket, {
            ...envelope(),
            type: 'chat.bootstrap',
            chat: liveSessionChatBootstrap(chat),
          });
          send(socket, { ...envelope(), type: 'social.bootstrap', social });
          send(socket, { ...envelope(), type: 'social_graph.bootstrap', socialGraph });
          send(socket, { ...envelope(), type: 'activity.bootstrap', activity });
        })
        .catch((error) => logger.child({ connectionId }).warn('realtime.resync_failed', { error }));
      return;
    }
    if (message.type === 'switch_channel') {
      if (hasActiveActivity(active)) {
        sendActivityError(active, 'entry_conflict');
        return;
      }
      try {
        await persistence.checkpoint(active.sessionId, active.presence);
        const invalidated = await persistence.socialDisconnect(
          active.sessionId,
          'channel_switch',
          requestId,
        );
        publishInvalidatedInteractions(invalidated);
        const switched = await persistence.switchChannel(
          active.sessionId,
          message.channelId,
          requestId,
        );
        if (typeof switched === 'string') {
          if (switched === 'unchanged') {
            send(socket, {
              ...envelope(),
              type: 'channels',
              channels: [...channelAuthority.list(active.presence.worldId)],
            });
            return;
          }
          send(socket, {
            ...envelope(),
            type: 'error',
            code: switched === 'channel_full' ? 'CHANNEL_FULL' : 'CHANNEL_UNAVAILABLE',
            retryable: switched !== 'closed',
            requestId,
          });
          if (switched === 'closed') socket.close(1008, 'Realtime session closed');
          return;
        }

        const previous = active.presence;
        broadcast(
          previous,
          { ...envelope(), type: 'presence_left', presenceId: previous.presenceId },
          previous.presenceId,
        );
        channelAuthority.leave(previous.presenceId);
        rooms.leave(previous.channelId, active.connectionId);
        channelsByWorld.set(previous.worldId, switched.channels);
        refreshChannelDefinitions();
        active.presence = {
          ...previous,
          channelId: switched.channelId,
          channelNumber: switched.channelNumber,
          movementState: 'idle',
        };
        if (!channelAuthority.join(active.presence)) {
          active.closingReason = 'authorization_failed';
          socket.close(1013, 'Channel admission changed');
          return;
        }
        rooms.join(active.presence.channelId, active.connectionId);
        send(socket, {
          ...envelope(),
          type: 'channel_changed',
          self: active.presence,
          channels: [...channelAuthority.list(active.presence.worldId)],
        });
        send(socket, {
          ...envelope(),
          type: 'snapshot',
          worldId: active.presence.worldId,
          channelId: active.presence.channelId,
          presences: channelAuthority
            .members(active.presence.worldId, active.presence.channelId)
            .filter((member) => member.presenceId !== active.presence.presenceId),
        });
        broadcast(
          active.presence,
          { ...envelope(), type: 'presence_joined', presence: active.presence },
          active.presence.presenceId,
        );
        const [chat, social, socialGraph] = await Promise.all([
          persistence.chatBootstrap(active.sessionId),
          persistence.socialBootstrap(active.sessionId),
          persistence.socialGraphBootstrap(active.sessionId),
        ]);
        active.hiddenPresenceIds = new Set(
          chat.preferences.map((preference) => preference.targetPresenceId),
        );
        active.chatMutedUntil = chat.mutedUntil ?? undefined;
        active.socialGraph = socialGraph;
        send(socket, {
          ...envelope(),
          type: 'chat.bootstrap',
          chat: liveSessionChatBootstrap(chat),
        });
        send(socket, { ...envelope(), type: 'social.bootstrap', social });
        send(socket, { ...envelope(), type: 'social_graph.bootstrap', socialGraph });
        sendSystemMessage(
          active,
          `You are now chatting in Channel ${String(active.presence.channelNumber)}.`,
          'channel',
        );
      } catch (error) {
        logger.child({ connectionId, requestId }).warn('realtime.channel_switch.failed', { error });
        send(socket, {
          ...envelope(),
          type: 'error',
          code: 'SERVER_UNAVAILABLE',
          retryable: true,
          requestId,
        });
      }
      return;
    }

    if (message.type !== 'movement') {
      if (isActivityClientMessage(message)) await handleActivityMessage(active, message);
      else if (isSocialGraphClientMessage(message)) await handleSocialGraphMessage(active, message);
      else if (isSocialClientMessage(message)) await handleSocialMessage(active, message);
      else await handleChatMessage(active, message);
      return;
    }

    const now = Date.now();
    if (now - active.windowStartedAt >= 1_000) {
      active.windowStartedAt = now;
      active.messagesInWindow = 0;
    }
    const validation = validateAuthoritativeMovement(
      {
        x: active.presence.x,
        y: active.presence.y,
        sequence: active.presence.sequence,
        facingDirection: active.presence.facingDirection,
        acceptedAt: active.acceptedAt,
        messagesInWindow: active.messagesInWindow,
        windowStartedAt: active.windowStartedAt,
      },
      { ...message, receivedAt: now },
      active.manifest,
    );
    active.messagesInWindow += 1;
    if (!validation.accepted) {
      send(socket, {
        ...envelope(),
        type: 'movement_rejected',
        reason: validation.reason,
        authoritative: active.presence,
      });
      return;
    }

    active.acceptedAt = now;
    active.presence = {
      ...active.presence,
      ...validation.position,
      facingDirection: validation.facingDirection,
      movementState: validation.movementState,
      sequence: message.sequence,
    };
    channelAuthority.update(active.presence);
    broadcast(
      active.presence,
      { ...envelope(), type: 'presence_updated', presence: active.presence },
      active.presence.presenceId,
    );
  }

  app.get('/health', async (): Promise<ServiceHealth> => ({
    service: 'realtime-server',
    environment: config.environment,
    status: 'ok',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get('/ready', async () => ({
    service: 'realtime-server' as const,
    environment: config.environment,
    status: 'ok' as const,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    connections: {
      active: connections.size,
      admitted:
        activeByConnection.size +
        activePrivateHomeByConnection.size +
        activeHomeVisitByConnection.size,
      limit: connections.limit,
    },
    channels: [...channelsByWorld.values()].flat().length,
  }));

  void app.register(async function registerRealtimeWebSocket(instance) {
    await instance.register(websocket, {
      options: {
        maxPayload: 16 * 1024,
        verifyClient(info: WebSocketVerificationInfo, callback: WebSocketVerificationCallback) {
          if (!isAllowedRealtimeOrigin(info.origin, allowedOrigins)) {
            callback(false, 403, 'Origin is not allowed');
            return;
          }
          if (connections.isFull) {
            callback(false, 503, 'Connection limit reached');
            return;
          }
          callback(true);
        },
      },
    });

    instance.get('/connect', { websocket: true }, (candidate, request) => {
      const socket = normalizeWebSocket(
        candidate as unknown as WebSocket | { readonly socket: WebSocket },
      );
      const registration = connections.register();
      if (registration === undefined) {
        socket.close(1013, 'Connection limit reached');
        return;
      }
      const { connectionId } = registration;
      const requestId = request.id;
      socketByConnection.set(connectionId, socket);
      let released = false;
      const authTimer = setTimeout(() => {
        if (!activeByConnection.has(connectionId)) {
          send(socket, {
            ...envelope(),
            type: 'error',
            code: 'AUTHENTICATION_TIMEOUT',
            retryable: true,
            requestId,
          });
          socket.close(1008, 'Authentication timeout');
        }
      }, config.authenticationTimeoutMs);

      socket.on(
        'message',
        (data: RawData) => void handleMessage(connectionId, requestId, socket, data),
      );
      socket.once('close', () => {
        if (released) return;
        released = true;
        clearTimeout(authTimer);
        socketByConnection.delete(connectionId);
        const active = activeByConnection.get(connectionId);
        if (active !== undefined) void finalize(active, active.closingReason ?? 'connection_lost');
        connections.release(connectionId);
        logger.child({ connectionId, requestId }).info('realtime.connection.closed');
      });
      socket.once('error', (error: Error) => {
        logger.child({ connectionId, requestId }).warn('realtime.connection.error', { error });
      });
    });

    instance.get('/private-home', { websocket: true }, (candidate, request) => {
      const socket = normalizeWebSocket(
        candidate as unknown as WebSocket | { readonly socket: WebSocket },
      );
      const registration = connections.register();
      if (registration === undefined) {
        socket.close(1013, 'Connection limit reached');
        return;
      }
      const { connectionId } = registration;
      const requestId = request.id;
      socketByConnection.set(connectionId, socket);
      let released = false;
      const authTimer = setTimeout(() => {
        if (!activePrivateHomeByConnection.has(connectionId)) {
          sendPrivateHome(socket, {
            ...envelope(),
            type: 'error',
            code: 'AUTHENTICATION_TIMEOUT',
            retryable: true,
          });
          socket.close(1008, 'Authentication timeout');
        }
      }, config.authenticationTimeoutMs);

      socket.on(
        'message',
        (data: RawData) => void handlePrivateHomeMessage(connectionId, requestId, socket, data),
      );
      socket.once('close', () => {
        if (released) return;
        released = true;
        clearTimeout(authTimer);
        socketByConnection.delete(connectionId);
        const active = activePrivateHomeByConnection.get(connectionId);
        if (active !== undefined) {
          void finalizePrivateHome(active, active.closingReason ?? 'connection_lost');
        }
        connections.release(connectionId);
        logger.child({ connectionId, requestId }).info('realtime.private_home.closed');
      });
      socket.once('error', (error: Error) => {
        logger
          .child({ connectionId, requestId })
          .warn('realtime.private_home.connection_error', { error });
      });
    });

    instance.get('/home-visit', { websocket: true }, (candidate, request) => {
      const socket = normalizeWebSocket(
        candidate as unknown as WebSocket | { readonly socket: WebSocket },
      );
      const registration = connections.register();
      if (registration === undefined) {
        socket.close(1013, 'Connection limit reached');
        return;
      }
      const { connectionId } = registration;
      const requestId = request.id;
      socketByConnection.set(connectionId, socket);
      let released = false;
      const authTimer = setTimeout(() => {
        if (!activeHomeVisitByConnection.has(connectionId)) {
          sendHomeVisit(socket, { type: 'error', code: 'AUTHENTICATION_TIMEOUT', retryable: true });
          socket.close(1008, 'Authentication timeout');
        }
      }, config.authenticationTimeoutMs);
      socket.on(
        'message',
        (data: RawData) => void handleHomeVisitMessage(connectionId, requestId, socket, data),
      );
      socket.once('close', () => {
        if (released) return;
        released = true;
        clearTimeout(authTimer);
        socketByConnection.delete(connectionId);
        const active = activeHomeVisitByConnection.get(connectionId);
        if (active !== undefined)
          void finalizeHomeVisit(active, active.closingReason ?? 'connection_lost');
        connections.release(connectionId);
        logger.child({ connectionId, requestId }).info('realtime.home_visit.closed');
      });
      socket.once('error', (error: Error) => {
        logger
          .child({ connectionId, requestId })
          .warn('realtime.home_visit.connection_error', { error });
      });
    });
  });

  const reconciliationTimer = setInterval(() => {
    const now = Date.now();
    for (const connection of activeByConnection.values()) {
      if (now - connection.lastSeenAt > config.idleTimeoutMs) {
        connection.closingReason = 'idle_timeout';
        connection.socket.close(4002, 'Realtime connection timed out');
        continue;
      }
      if (
        !hasActiveActivity(connection) &&
        now - connection.lastCheckpointAt >= config.checkpointIntervalMs
      ) {
        connection.lastCheckpointAt = now;
        void persistence.checkpoint(connection.sessionId, connection.presence).catch((error) =>
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.checkpoint.failed', {
              error,
            }),
        );
      }
      if (now - connection.lastRevalidatedAt >= config.revalidationIntervalMs) {
        connection.lastRevalidatedAt = now;
        void persistence
          .revalidate(connection.sessionId)
          .then((status) => {
            if (status === 'active') {
              return Promise.all([
                persistence.chatBootstrap(connection.sessionId),
                persistence.socialBootstrap(connection.sessionId),
                persistence.socialGraphBootstrap(connection.sessionId),
                persistence.cooperativeActivityBootstrap(connection.sessionId),
              ]).then(([chat, social, socialGraph, activity]) => {
                const previousMute = connection.chatMutedUntil;
                connection.hiddenPresenceIds = new Set(
                  chat.preferences.map((preference) => preference.targetPresenceId),
                );
                connection.chatMutedUntil = chat.mutedUntil ?? undefined;
                connection.socialGraph = socialGraph;
                connection.activity = activity;
                send(connection.socket, { ...envelope(), type: 'social.bootstrap', social });
                send(connection.socket, {
                  ...envelope(),
                  type: 'friends.snapshot',
                  socialGraph,
                });
                send(connection.socket, { ...envelope(), type: 'activity.bootstrap', activity });
                if (previousMute !== connection.chatMutedUntil) {
                  send(connection.socket, {
                    ...envelope(),
                    type: 'chat.moderation_notice',
                    code: connection.chatMutedUntil === undefined ? 'chat_unmuted' : 'chat_muted',
                    ...(connection.chatMutedUntil === undefined
                      ? {}
                      : { mutedUntil: connection.chatMutedUntil }),
                  });
                }
                return undefined;
              });
            }
            connection.closingReason = closeReasonForDenial(status);
            send(connection.socket, {
              ...envelope(),
              type: 'error',
              code: safeErrorForDenial(status),
              retryable: status === 'world_changed',
              requestId: connection.requestId,
            });
            connection.socket.close(1008, 'Realtime access changed');
            return undefined;
          })
          .catch((error) => {
            logger
              .child({ connectionId: connection.connectionId })
              .warn('realtime.revalidation.failed', { error });
            connection.closingReason = 'authorization_failed';
            connection.socket.close(1013, 'Realtime authorization unavailable');
          });
      }
    }
    for (const connection of activePrivateHomeByConnection.values()) {
      if (now - connection.lastSeenAt > config.idleTimeoutMs) {
        connection.closingReason = 'idle_timeout';
        connection.socket.close(4002, 'Private-home connection timed out');
        continue;
      }
      if (now - connection.lastPolledAt >= 1_000) {
        connection.lastPolledAt = now;
        void refreshPrivateHome(connection, false).catch((error) => {
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.private_home.poll_failed', { error });
        });
      }
      if (now - connection.lastRevalidatedAt >= config.revalidationIntervalMs) {
        connection.lastRevalidatedAt = now;
        void persistence
          .revalidatePrivateHome(connection.sessionId)
          .then((status) => {
            if (status === 'active') return;
            connection.closingReason = privateHomeCloseReason(status);
            sendPrivateHome(connection.socket, {
              ...envelope(),
              type: 'error',
              code: privateHomeErrorCode(status),
              retryable: status === 'world_changed',
            });
            connection.socket.close(1008, 'Private-home access changed');
          })
          .catch((error) => {
            logger
              .child({ connectionId: connection.connectionId })
              .warn('realtime.private_home.revalidation_failed', { error });
            connection.closingReason = 'authorization_failed';
            connection.socket.close(1013, 'Private-home authorization unavailable');
          });
      }
    }
    for (const connection of activeHomeVisitByConnection.values()) {
      if (now - connection.lastSeenAt > config.idleTimeoutMs) {
        connection.closingReason = 'idle_timeout';
        connection.socket.close(4002, 'Home-visit connection timed out');
        continue;
      }
      if (now - connection.lastPolledAt >= 1_000) {
        connection.lastPolledAt = now;
        void refreshHomeVisit(connection, false).catch((error) => {
          logger
            .child({ connectionId: connection.connectionId })
            .warn('realtime.home_visit.poll_failed', { error });
        });
      }
      if (now - connection.lastRevalidatedAt >= config.revalidationIntervalMs) {
        connection.lastRevalidatedAt = now;
        void persistence
          .revalidateHomeVisit(connection.realtimeSessionId)
          .then((status) => {
            if (status === 'active') return;
            connection.closingReason = status;
            sendHomeVisit(connection.socket, {
              type: 'error',
              code: homeVisitErrorCode(status),
              retryable: status === 'maintenance',
            });
            connection.socket.close(1008, 'Home-visit access changed');
          })
          .catch((error) => {
            logger
              .child({ connectionId: connection.connectionId })
              .warn('realtime.home_visit.revalidation_failed', { error });
            connection.closingReason = 'authorization_failed';
            connection.socket.close(1013, 'Home-visit authorization unavailable');
          });
      }
    }
  }, 1_000);
  reconciliationTimer.unref();

  app.addHook('onClose', async () => {
    clearInterval(reconciliationTimer);
    const active = [...activeByConnection.values()];
    for (const connection of active) {
      connection.closingReason = 'server_shutdown';
      await finalize(connection, 'server_shutdown');
      connection.socket.close(1012, 'Realtime server restarting');
    }
    const activePrivateHomes = [...activePrivateHomeByConnection.values()];
    for (const connection of activePrivateHomes) {
      connection.closingReason = 'server_shutdown';
      await finalizePrivateHome(connection, 'server_shutdown');
      connection.socket.close(1012, 'Realtime server restarting');
    }
    const activeHomeVisits = [...activeHomeVisitByConnection.values()];
    for (const connection of activeHomeVisits) {
      connection.closingReason = 'server_shutdown';
      await finalizeHomeVisit(connection, 'server_shutdown');
      connection.socket.close(1012, 'Realtime server restarting');
    }
    for (const socket of socketByConnection.values())
      socket.close(1012, 'Realtime server restarting');
  });

  return { app, connections, rooms };
}
