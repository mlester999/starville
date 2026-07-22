import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

import { getWorldManifest } from '@starville/game-content';
import { homeVisitGameTestFixture } from '@starville/housing';
import {
  MOONPETAL_HARVEST_HELP,
  type CooperativeActivityBootstrap,
  type CooperativeActivityInstanceSnapshot,
} from '@starville/cooperative-activities';
import type {
  SocialGiftView,
  SocialInteractionView,
  SocialGraphBootstrap,
  SocialGraphOperationResult,
  PartySnapshot,
  SocialReceipt,
  SocialTradeView,
} from '@starville/realtime';

import type { ServiceLogger, LogContext } from './contracts.js';
import type { RealtimePersistenceGateway } from './persistence/gateway.js';
import { createRealtimeService } from './service.js';

class LoadLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string, _context?: LogContext): void {}
  debug(_message: string, _context?: LogContext): void {}
  info(_message: string, _context?: LogContext): void {}
  warn(_message: string, _context?: LogContext): void {}
  error(_message: string, _context?: LogContext): void {}
  fatal(_message: string, _context?: LogContext): void {}
}

interface ScenarioResult {
  readonly scenario: string;
  readonly players: number;
  readonly channels: number;
  readonly reconnects: number;
  readonly mobileClients: number;
  readonly hiddenTabClients: number;
  readonly hiddenTabDwellMs: number;
  readonly admittedAfterHiddenDwell: number;
  readonly durationMs: number;
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
  readonly heapDeltaBytes: number;
  readonly sentMovements: number;
  readonly movementBurstMessages: number;
  readonly receivedMovementBroadcasts: number;
  readonly receivedTrailingIdleBroadcasts: number;
  readonly rejectedMovements: number;
  readonly authoritativeFacingChecks: number;
  readonly authoritativeMovementStateChecks: number;
  readonly trailingIdleChecks: number;
  readonly trailingIdleFacingChecks: number;
  readonly averageVisibleLatencyMs: number;
  readonly maximumVisibleLatencyMs: number;
  readonly sentAppearanceRefreshes: number;
  readonly receivedAppearanceUpdateBroadcasts: number;
  readonly sentEmoteActivations: number;
  readonly receivedEmoteActivationBroadcasts: number;
  readonly rejectedEmoteActivations: number;
  readonly unsafeCosmeticPayloads: number;
  readonly averageCosmeticBroadcastLatencyMs: number;
  readonly maximumCosmeticBroadcastLatencyMs: number;
  readonly sentChatMessages: number;
  readonly chatBurstMessages: number;
  readonly acceptedChatMessages: number;
  readonly receivedChatBroadcasts: number;
  readonly rejectedChatMessages: number;
  readonly acceptedReports: number;
  readonly mutedSendRejections: number;
  readonly chatMessagesPerSecond: number;
  readonly averageChatBroadcastLatencyMs: number;
  readonly maximumChatBroadcastLatencyMs: number;
  readonly averagePersistenceLatencyMs: number;
  readonly maximumPersistenceLatencyMs: number;
  readonly sentInspectRequests: number;
  readonly sentGiftRequests: number;
  readonly sentTradeRequests: number;
  readonly completedSocialSettlements: number;
  readonly receivedSocialEvents: number;
  readonly rejectedSocialRequests: number;
  readonly rateLimitedSocialRequests: number;
  readonly blockedSocialRequests: number;
  readonly replayedSocialRequests: number;
  readonly resumedSocialTrades: number;
  readonly socialPersistenceOperations: number;
  readonly averageSocialRequestLatencyMs: number;
  readonly maximumSocialRequestLatencyMs: number;
  readonly averageSettlementLatencyMs: number;
  readonly maximumSettlementLatencyMs: number;
  readonly remainingReservations: number;
  readonly sentFriendRequests: number;
  readonly createdFriendRequests: number;
  readonly sentPartyCreations: number;
  readonly createdParties: number;
  readonly sentPartyInvitations: number;
  readonly createdPartyInvitations: number;
  readonly sentReadyChecks: number;
  readonly startedReadyChecks: number;
  readonly sentPartyChatMessages: number;
  readonly receivedSocialGraphEvents: number;
  readonly rateLimitedSocialGraphRequests: number;
  readonly reconnectingLeaders: number;
  readonly averageSocialGraphPersistenceLatencyMs: number;
  readonly maximumSocialGraphPersistenceLatencyMs: number;
  readonly activityInstances: number;
  readonly twoPlayerActivityInstances: number;
  readonly fourPlayerActivityInstances: number;
  readonly activityPlayers: number;
  readonly publicPlayers: number;
  readonly sentActivityInteractions: number;
  readonly completedActivityInstances: number;
  readonly activityRewardReceipts: number;
  readonly rejectedActivityInteractions: number;
  readonly activityPersistenceOperations: number;
  readonly averageObjectiveLatencyMs: number;
  readonly maximumObjectiveLatencyMs: number;
  readonly averageRewardSettlementLatencyMs: number;
  readonly maximumRewardSettlementLatencyMs: number;
  readonly maximumActivitySnapshotBytes: number;
  readonly restoredActivityReconnects: number;
  readonly activityCleanupRuns: number;
  readonly leakedTemporaryItems: number;
  readonly leakedActiveActivityInstances: number;
  readonly homeVisitVisitors: number;
  readonly homeVisitMovementUpdates: number;
  readonly homeVisitMovementAcknowledgements: number;
  readonly homeVisitSnapshotMessages: number;
  readonly homeVisitEmoteEvents: number;
  readonly homeVisitReconnects: number;
  readonly homeVisitCloseCheckpoints: number;
  readonly homeVisitDroppedMovementUpdates: number;
  readonly homeVisitDuplicateMovementAcknowledgements: number;
  readonly homeVisitMessagesPerSecond: number;
  readonly averageHomeVisitUpdateLatencyMs: number;
  readonly maximumHomeVisitUpdateLatencyMs: number;
  readonly publicCloseCheckpoints: number;
}

interface ScenarioOptions {
  readonly scenario: string;
  readonly mobileClients?: number;
  readonly hiddenTabClients?: number;
  readonly hiddenTabDwellMs?: number;
}

function waitFor(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}.`)), 10_000);
    const listener = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message['type'] !== type) return;
      clearTimeout(timeout);
      socket.off('message', listener);
      resolve(message);
    };
    socket.on('message', listener);
  });
}

async function waitForCondition(
  condition: () => boolean,
  failureMessage: string | (() => string),
): Promise<void> {
  const expiresAt = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() >= expiresAt) {
      throw new Error(typeof failureMessage === 'function' ? failureMessage() : failureMessage);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function runScenario(
  players: number,
  channelCount: number,
  reconnects: number,
  options: ScenarioOptions,
): Promise<ScenarioResult> {
  const manifest = getWorldManifest('lantern-square');
  if (manifest === undefined) throw new Error('Load fixture manifest is unavailable.');
  let admitted = 0;
  let chatSequence = 0;
  let acceptedChatMessages = 0;
  let sentChatMessages = 0;
  let chatBurstMessages = 0;
  let sentMovements = 0;
  let movementBurstMessages = 0;
  let publicCloseCheckpoints = 0;
  let admittedAfterHiddenDwell = players;
  const mobileClients = Math.min(players, options.mobileClients ?? 0);
  const hiddenTabClients = Math.min(players, options.hiddenTabClients ?? 0);
  const hiddenTabDwellMs = hiddenTabClients === 0 ? 0 : (options.hiddenTabDwellMs ?? 500);
  const persistenceLatencies: number[] = [];
  const socialPersistenceLatencies: number[] = [];
  const socialRequestLatencies: number[] = [];
  const settlementLatencies: number[] = [];
  let socialPersistenceOperations = 0;
  let completedSocialSettlements = 0;
  let replayedSocialRequests = 0;
  let resumedSocialTrades = 0;
  let reservations = 0;
  let createdFriendRequests = 0;
  let createdParties = 0;
  let createdPartyInvitations = 0;
  let startedReadyChecks = 0;
  let reconnectingLeaders = 0;
  const socialGraphPersistenceLatencies: number[] = [];
  const partyByPresence = new Map<string, PartySnapshot>();
  const invitationsByTarget = new Map<string, SocialGraphBootstrap['invitations']>();
  const admissionsBySession = new Map<
    string,
    {
      readonly presenceId: string;
      readonly displayName: string;
      readonly channelId: string;
      readonly channelNumber: number;
    }
  >();
  const appearanceRevisions = new Map<string, number>();
  const sessionByPresence = new Map<string, string>();
  const socialInteractions = new Map<string, SocialInteractionView>();
  const socialReceipts = new Map<string, SocialReceipt>();
  const socialReplays = new Map<
    string,
    Awaited<ReturnType<RealtimePersistenceGateway['createSocialGift']>>
  >();
  const blockedPairs = new Set<string>();
  const mutedSessions = new Set<string>();
  const channels = Array.from({ length: channelCount }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    worldId: 'lantern-square' as const,
    number: index + 1,
    capacity: 40,
    population: 0,
    available: true,
  }));
  const pairKey = (leftPresenceId: string, rightPresenceId: string) =>
    [leftPresenceId, rightPresenceId].sort().join(':');
  const participant = (presenceId: string) => {
    const sessionId = sessionByPresence.get(presenceId);
    const admission = sessionId === undefined ? undefined : admissionsBySession.get(sessionId);
    if (admission === undefined) throw new Error('Social load participant is unavailable.');
    return { presenceId: admission.presenceId, displayName: admission.displayName };
  };
  const currentTimestamp = () => new Date().toISOString();
  const expiryTimestamp = (milliseconds: number) =>
    new Date(Date.now() + milliseconds).toISOString();
  const recordSocialOperation = <T>(started: number, value: T): T => {
    socialPersistenceOperations += 1;
    socialPersistenceLatencies.push(performance.now() - started);
    return value;
  };
  const graphSettings = {
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
  } as const;
  const graphBootstrap = (sessionId: string): SocialGraphBootstrap => {
    const presenceId = admissionsBySession.get(sessionId)?.presenceId;
    return {
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      party: presenceId === undefined ? null : (partyByPresence.get(presenceId) ?? null),
      invitations: presenceId === undefined ? [] : [...(invitationsByTarget.get(presenceId) ?? [])],
      notifications: [],
      settings: graphSettings,
    };
  };
  const recordGraphOperation = (started: number, value: SocialGraphOperationResult) => {
    socialGraphPersistenceLatencies.push(performance.now() - started);
    return value;
  };
  const activityLoadEnabled = players >= 40 && channelCount >= 2;
  const objectiveLatencies: number[] = [];
  const rewardSettlementLatencies: number[] = [];
  let activityPersistenceOperations = 0;
  let sentActivityInteractions = 0;
  let rejectedActivityInteractions = 0;
  let restoredActivityReconnects = 0;
  let activityCleanupRuns = 0;
  let maximumActivitySnapshotBytes = 0;
  const activitySockets = new Map<number, WebSocket>();
  interface ActivityLoadState {
    snapshot: CooperativeActivityInstanceSnapshot;
    readonly memberIndexes: readonly number[];
    readonly requestIds: Set<string>;
  }
  const activityStates = new Map<string, ActivityLoadState>();
  const activityInstanceForPlayer = new Map<number, string>();
  const activityGroup = (playerIndex: number) => {
    if (!activityLoadEnabled || playerIndex < 0 || playerIndex >= 30) return undefined;
    if (playerIndex < 10) {
      const groupIndex = Math.floor(playerIndex / 2);
      return { groupIndex, memberIndexes: [groupIndex * 2, groupIndex * 2 + 1] };
    }
    const groupIndex = 5 + Math.floor((playerIndex - 10) / 4);
    const first = 10 + (groupIndex - 5) * 4;
    return { groupIndex, memberIndexes: [first, first + 1, first + 2, first + 3] };
  };
  const activityPresenceId = (playerIndex: number) =>
    `20000000-0000-4000-8000-${String(playerIndex + 1).padStart(12, '0')}`;
  const activityInstanceId = (groupIndex: number) =>
    `8d0b1000-0000-4000-8000-${String(groupIndex + 1).padStart(12, '0')}`;
  const activityReceiptId = (groupIndex: number, playerIndex: number) =>
    `8d0b2000-${String(groupIndex + 1).padStart(4, '0')}-4000-8000-${String(playerIndex + 1).padStart(12, '0')}`;
  const activityStateForPlayer = (playerIndex: number) => {
    const instanceId = activityInstanceForPlayer.get(playerIndex);
    return instanceId === undefined ? undefined : activityStates.get(instanceId);
  };
  if (activityLoadEnabled) {
    for (let playerIndex = 0; playerIndex < 30; playerIndex += 1) {
      const group = activityGroup(playerIndex);
      if (group === undefined) continue;
      const instanceId = activityInstanceId(group.groupIndex);
      activityInstanceForPlayer.set(playerIndex, instanceId);
      if (activityStates.has(instanceId)) continue;
      const startedAt = currentTimestamp();
      activityStates.set(instanceId, {
        memberIndexes: group.memberIndexes,
        requestIds: new Set(),
        snapshot: {
          instanceId,
          activity: MOONPETAL_HARVEST_HELP,
          status: 'active',
          revision: 1,
          currentObjectiveKey: 'gather-seed-bundles',
          objectives: [
            {
              key: 'gather-seed-bundles',
              label: 'Gather Seed Bundles',
              type: 'shared_collect_count',
              current: 0,
              target: 6,
              status: 'active',
              startedAt,
              completedAt: null,
              timerEndsAt: null,
            },
          ],
          participants: group.memberIndexes.map((memberIndex) => ({
            presenceId: activityPresenceId(memberIndex),
            displayName: `Load Player ${String(memberIndex + 1)}`,
            level: 1,
            connectionStatus: 'online',
            contribution: 0,
            rewardEligible: true,
            reconnectDeadline: null,
          })),
          objects: Array.from({ length: 6 }, (_, objectIndex) => ({
            key: `seed-bundle-${String(objectIndex + 1)}`,
            interactionKey: 'activity-seed-bundle',
            label: `Seed bundle ${String(objectIndex + 1)}`,
            objectType: 'supply' as const,
            x: 7 + objectIndex,
            y: 5,
            interactionRange: 1.65,
            active: true,
          })),
          personalContribution: 0,
          temporaryItemCount: 0,
          startedAt,
          expiresAt: expiryTimestamp(480_000),
          pausedAt: null,
          completedAt: null,
          resultCode: null,
          receipts: [],
          spawn: { x: 10, y: 13 },
        },
      });
    }
  }
  const activityBootstrap = (sessionId: string): CooperativeActivityBootstrap => {
    activityPersistenceOperations += 1;
    const playerIndex = Number(sessionId.slice(-12)) - 1;
    const state = activityStateForPlayer(playerIndex);
    const catalog = {
      generatedAt: currentTimestamp(),
      activities: [
        {
          activity: MOONPETAL_HARVEST_HELP,
          availability: state === undefined ? ('available' as const) : ('already_active' as const),
          availableAt: null,
          rewardedCompletionsToday: 0,
          partyEligible: true,
          leader: true,
        },
      ],
    };
    if (state === undefined) return { catalog, preparation: null, instance: null };
    const snapshot = structuredClone(state.snapshot);
    snapshot.personalContribution =
      snapshot.participants.find(
        (participant) => participant.presenceId === activityPresenceId(playerIndex),
      )?.contribution ?? 0;
    const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot));
    maximumActivitySnapshotBytes = Math.max(maximumActivitySnapshotBytes, snapshotBytes);
    return { catalog, preparation: null, instance: snapshot };
  };
  const refreshReservationCount = () => {
    reservations = [...socialInteractions.values()].reduce(
      (total, interaction) =>
        interaction.kind === 'trade' && interaction.status === 'negotiating'
          ? total + interaction.senderOffer.items.length + interaction.targetOffer.items.length
          : total,
      0,
    );
  };
  const homeVisitVisitors =
    players === 10 ? 1 : players === 20 ? 5 : players === 40 && channelCount === 1 ? 10 : 0;
  const homeVisitParticipants = homeVisitGameTestFixture.participants.slice(
    0,
    homeVisitVisitors + 1,
  );
  const homeVisitParticipantByRealtimeSession = new Map<
    string,
    (typeof homeVisitParticipants)[number]
  >();
  let homeVisitAdmissionIndex = 0;
  let homeVisitForcedAdmissionIndex: number | undefined;
  let homeVisitCloseCheckpoints = 0;
  const persistence: RealtimePersistenceGateway = {
    async admit(_ticketHash, _connectionId) {
      const index = admitted++ % players;
      const channel = channels[index % channelCount];
      if (channel === undefined) return 'channel_full';
      const admission = {
        status: 'admitted',
        sessionId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        presenceId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        displayName: `Load Player ${String(index + 1)}`.slice(0, 20),
        level: 1,
        appearancePreset: 'moss',
        worldId: 'lantern-square',
        worldVersionId: '30000000-0000-4000-8000-000000000001',
        manifest,
        channelId: channel.id,
        channelNumber: channel.number,
        x: manifest.spawn.x,
        y: manifest.spawn.y,
        facingDirection: 'south',
        channels,
      } as const;
      admissionsBySession.set(admission.sessionId, {
        presenceId: admission.presenceId,
        displayName: admission.displayName,
        channelId: admission.channelId,
        channelNumber: admission.channelNumber,
      });
      sessionByPresence.set(admission.presenceId, admission.sessionId);
      return admission;
    },
    async admitPrivateHome() {
      return 'invalid_ticket';
    },
    async privateHomeEvents() {
      return 'no_changes';
    },
    async revalidatePrivateHome() {
      return 'active';
    },
    async closePrivateHome() {
      return true;
    },
    async admitHomeVisit() {
      const participantIndex = homeVisitForcedAdmissionIndex ?? homeVisitAdmissionIndex;
      homeVisitForcedAdmissionIndex = undefined;
      homeVisitAdmissionIndex += 1;
      const participant = homeVisitParticipants[participantIndex];
      const session = homeVisitGameTestFixture.hostSession;
      const home = homeVisitGameTestFixture.ownedHome;
      if (participant === undefined || session === null || home === null) return 'invalid_ticket';
      const realtimeSessionId = `f11f0000-0000-4000-9000-${String(homeVisitAdmissionIndex).padStart(12, '0')}`;
      homeVisitParticipantByRealtimeSession.set(realtimeSessionId, participant);
      return {
        status: 'admitted',
        realtimeSessionId,
        visitSessionId: session.id,
        participantId: participant.id,
        homeId: home.id,
        lastEventNumber: '0',
        snapshot: { session, participants: homeVisitParticipants },
      };
    },
    async homeVisitEvents() {
      const session = homeVisitGameTestFixture.hostSession;
      if (session === null) return 'closed';
      return {
        status: 'loaded',
        lastEventNumber: String(homeVisitVisitors),
        events: homeVisitParticipants.slice(1).map((participant, index) => ({
          eventNumber: String(index + 1),
          eventKey: 'home_visitor_emote',
          actorParticipantId: participant.id,
          payload: { emoteKey: 'wave' },
          createdAt: new Date().toISOString(),
        })),
        snapshot: { session, participants: homeVisitParticipants },
      };
    },
    async checkpointHomeVisit(sessionId, movement) {
      const participant = homeVisitParticipantByRealtimeSession.get(sessionId);
      if (participant === undefined) return 'closed';
      const moved = {
        ...participant,
        x: movement.x,
        y: movement.y,
        facingDirection: movement.facingDirection as typeof participant.facingDirection,
        movementSequence: String(movement.sequence),
        socialState: 'moving' as const,
        stateVersion: participant.stateVersion + 1,
      };
      homeVisitParticipantByRealtimeSession.set(sessionId, moved);
      return { status: 'checkpointed', participant: moved };
    },
    async revalidateHomeVisit() {
      return 'active';
    },
    async closeHomeVisit() {
      homeVisitCloseCheckpoints += 1;
      return true;
    },
    async checkpoint() {
      return 'checkpointed';
    },
    async switchChannel() {
      return 'unchanged';
    },
    async revalidate() {
      return 'active';
    },
    async avatarProfile(sessionId) {
      const admission = admissionsBySession.get(sessionId);
      if (admission === undefined) return 'not_found';
      const index = Number(sessionId.slice(-12));
      return {
        appearanceId: `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        appearanceRevision: appearanceRevisions.get(sessionId) ?? 1,
      };
    },
    async activateEmote(sessionId, emoteKey) {
      const admission = admissionsBySession.get(sessionId);
      if (admission === undefined) return { status: 'access_changed' };
      return {
        status: 'activated',
        presenceId: admission.presenceId,
        channelId: admission.channelId,
        emoteKey,
        activationId: `a1000000-0000-4000-8000-${sessionId.slice(-12)}`,
        startedAt: Date.now(),
        durationMs: 1_800,
      };
    },
    async close() {
      publicCloseCheckpoints += 1;
      return true;
    },
    async chatBootstrap() {
      return {
        histories: [
          { scope: 'nearby', messages: [], hasMore: false },
          { scope: 'channel', messages: [], hasMore: false },
          { scope: 'system', messages: [], hasMore: false },
        ],
        preferences: [],
        mutedUntil: null,
      };
    },
    async acceptChat(sessionId, _requestId, scope, text, _position) {
      const started = performance.now();
      const admission = admissionsBySession.get(sessionId);
      if (admission === undefined) return { status: 'access_changed' };
      if (mutedSessions.has(sessionId)) {
        return { status: 'chat_muted', mutedUntil: new Date(Date.now() + 60_000).toISOString() };
      }
      chatSequence += 1;
      acceptedChatMessages += 1;
      const result = {
        status: 'accepted' as const,
        message: {
          id: randomUUID(),
          sequence: chatSequence,
          scope,
          ...(scope === 'party'
            ? { partyId: partyByPresence.get(admission.presenceId)?.partyId }
            : {}),
          senderPresenceId: admission.presenceId,
          senderDisplayName: admission.displayName,
          senderLevel: 1,
          worldId: 'lantern-square' as const,
          channelId: admission.channelId,
          sentAt: new Date().toISOString(),
          text,
          sourceCategory: 'player' as const,
        },
      };
      persistenceLatencies.push(performance.now() - started);
      return result;
    },
    async chatHistory(_sessionId, scope) {
      return { scope, messages: [], hasMore: false };
    },
    async updateChatPreference(sessionId, targetPresenceId, action) {
      const source = admissionsBySession.get(sessionId);
      if (source !== undefined && action === 'block') {
        blockedPairs.add(pairKey(source.presenceId, targetPresenceId));
      }
      if (source !== undefined && action === 'unblock') {
        blockedPairs.delete(pairKey(source.presenceId, targetPresenceId));
      }
      return {
        targetPresenceId,
        muted: action === 'mute',
        blocked: action === 'block',
      };
    },
    async reportChat() {
      return {
        status: 'accepted',
        reportId: randomUUID(),
      };
    },
    async socialBootstrap(sessionId) {
      const admission = admissionsBySession.get(sessionId);
      const presenceId = admission?.presenceId;
      const interactions = [...socialInteractions.values()].filter((interaction) => {
        const participants =
          interaction.kind === 'gift'
            ? [interaction.sender.presenceId, interaction.target.presenceId]
            : [
                interaction.senderOffer.participant.presenceId,
                interaction.targetOffer.participant.presenceId,
              ];
        return presenceId !== undefined && participants.includes(presenceId);
      });
      return {
        inventory: [
          {
            itemSlug: 'moonbean-seed',
            name: 'Moonbean Seed',
            category: 'seed',
            assetRef: 'item-moonbean-seed',
            availableQuantity: 100,
            reservedQuantity: 0,
            minimumTransferQuantity: 1,
            maximumTransferQuantity: 99,
            giftable: true,
            tradable: true,
          },
        ],
        pendingRequests: interactions.filter((interaction) => interaction.status === 'pending'),
        activeTrade:
          interactions.find(
            (interaction): interaction is SocialTradeView =>
              interaction.kind === 'trade' && interaction.status === 'negotiating',
          ) ?? null,
        recentReceipts: [...socialReceipts.values()]
          .filter((receipt) =>
            receipt.participants.some((entry) => entry.presenceId === presenceId),
          )
          .slice(-10),
        interactionDistance: 3,
        dustTransferEnabled: false,
      };
    },
    async inspectSocialPlayer(sessionId, targetPresenceId) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      const targetSessionId = sessionByPresence.get(targetPresenceId);
      const target =
        targetSessionId === undefined ? undefined : admissionsBySession.get(targetSessionId);
      if (
        source === undefined ||
        target === undefined ||
        source.channelId !== target.channelId ||
        blockedPairs.has(pairKey(source.presenceId, targetPresenceId))
      ) {
        return recordSocialOperation(started, { status: 'player_unavailable', profile: undefined });
      }
      return recordSocialOperation(started, {
        status: 'ok',
        profile: {
          presenceId: targetPresenceId,
          displayName: target.displayName,
          level: 1,
          appearancePreset: 'moss' as const,
          worldId: 'lantern-square',
          worldName: 'Lantern Square',
          channelNumber: target.channelNumber,
        },
      });
    },
    async createSocialGift(sessionId, targetPresenceId, itemSlug, quantity, requestId) {
      const started = performance.now();
      const replayKey = `${sessionId}:gift_create:${requestId}`;
      const replay = socialReplays.get(replayKey);
      if (replay !== undefined) {
        replayedSocialRequests += 1;
        return recordSocialOperation(started, replay);
      }
      const source = admissionsBySession.get(sessionId);
      const targetSessionId = sessionByPresence.get(targetPresenceId);
      const target =
        targetSessionId === undefined ? undefined : admissionsBySession.get(targetSessionId);
      if (source === undefined || target === undefined) {
        return recordSocialOperation(started, { status: 'player_unavailable' });
      }
      if (blockedPairs.has(pairKey(source.presenceId, targetPresenceId))) {
        return recordSocialOperation(started, { status: 'blocked' });
      }
      const interaction: SocialGiftView = {
        id: randomUUID(),
        kind: 'gift',
        status: 'pending',
        sender: participant(source.presenceId),
        target: participant(targetPresenceId),
        item: {
          itemSlug,
          name: 'Moonbean Seed',
          category: 'seed',
          assetRef: 'item-moonbean-seed',
          quantity,
        },
        createdAt: currentTimestamp(),
        expiresAt: expiryTimestamp(90_000),
      };
      socialInteractions.set(interaction.id, interaction);
      const result = {
        status: 'created',
        interaction,
        senderPresenceId: source.presenceId,
        targetPresenceId,
      } as const;
      socialReplays.set(replayKey, result);
      return recordSocialOperation(started, result);
    },
    async respondSocialGift(sessionId, interactionId, action) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      const actor = admissionsBySession.get(sessionId);
      if (interaction?.kind !== 'gift' || actor === undefined || interaction.status !== 'pending') {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      if (actor.presenceId !== interaction.target.presenceId) {
        return recordSocialOperation(started, { status: 'access_changed' });
      }
      if (action === 'decline') {
        const declined = { ...interaction, status: 'declined' as const };
        socialInteractions.set(interactionId, declined);
        return recordSocialOperation(started, { status: 'declined', interaction: declined });
      }
      const completed = { ...interaction, status: 'completed' as const };
      const receipt: SocialReceipt = {
        id: randomUUID(),
        interactionId,
        kind: 'gift',
        status: 'completed',
        participants: [interaction.sender, interaction.target],
        items: [
          {
            ...interaction.item,
            fromPresenceId: interaction.sender.presenceId,
            toPresenceId: interaction.target.presenceId,
          },
        ],
        completedAt: currentTimestamp(),
      };
      socialInteractions.set(interactionId, completed);
      socialReceipts.set(interactionId, receipt);
      completedSocialSettlements += 1;
      settlementLatencies.push(performance.now() - started);
      return recordSocialOperation(started, {
        status: 'completed',
        interaction: completed,
        receipt,
      });
    },
    async cancelSocialGift(sessionId, interactionId) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      const actor = admissionsBySession.get(sessionId);
      if (interaction?.kind !== 'gift' || actor?.presenceId !== interaction.sender.presenceId) {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      const cancelled = { ...interaction, status: 'cancelled' as const };
      socialInteractions.set(interactionId, cancelled);
      return recordSocialOperation(started, { status: 'cancelled', interaction: cancelled });
    },
    async createSocialTrade(sessionId, targetPresenceId) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      const targetSessionId = sessionByPresence.get(targetPresenceId);
      const target =
        targetSessionId === undefined ? undefined : admissionsBySession.get(targetSessionId);
      if (source === undefined || target === undefined) {
        return recordSocialOperation(started, { status: 'player_unavailable' });
      }
      if (blockedPairs.has(pairKey(source.presenceId, targetPresenceId))) {
        return recordSocialOperation(started, { status: 'blocked' });
      }
      const interaction: SocialTradeView = {
        id: randomUUID(),
        kind: 'trade',
        status: 'pending',
        revision: 1,
        senderOffer: {
          participant: participant(source.presenceId),
          items: [],
          confirmedRevision: null,
        },
        targetOffer: {
          participant: participant(targetPresenceId),
          items: [],
          confirmedRevision: null,
        },
        createdAt: currentTimestamp(),
        expiresAt: expiryTimestamp(600_000),
        reconnectDeadline: null,
      };
      socialInteractions.set(interaction.id, interaction);
      return recordSocialOperation(started, {
        status: 'created',
        interaction,
        senderPresenceId: source.presenceId,
        targetPresenceId,
      });
    },
    async respondSocialTrade(sessionId, interactionId, action) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      const actor = admissionsBySession.get(sessionId);
      if (
        interaction?.kind !== 'trade' ||
        actor === undefined ||
        interaction.status !== 'pending'
      ) {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      if (actor.presenceId !== interaction.targetOffer.participant.presenceId) {
        return recordSocialOperation(started, { status: 'access_changed' });
      }
      const next = {
        ...interaction,
        status: action === 'accept' ? ('negotiating' as const) : ('declined' as const),
      };
      socialInteractions.set(interactionId, next);
      return recordSocialOperation(started, {
        status: action === 'accept' ? 'opened' : 'declined',
        interaction: next,
      });
    },
    async updateSocialTradeOffer(sessionId, interactionId, expectedRevision, items) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      const actor = admissionsBySession.get(sessionId);
      if (
        interaction?.kind !== 'trade' ||
        actor === undefined ||
        interaction.status !== 'negotiating'
      ) {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      if (interaction.revision !== expectedRevision) {
        return recordSocialOperation(started, { status: 'trade_changed', interaction });
      }
      const offerItems = items.map((item) => ({
        ...item,
        name: 'Moonbean Seed',
        category: 'seed' as const,
        assetRef: 'item-moonbean-seed',
      }));
      const sender = actor.presenceId === interaction.senderOffer.participant.presenceId;
      const next: SocialTradeView = {
        ...interaction,
        revision: interaction.revision + 1,
        senderOffer: {
          ...interaction.senderOffer,
          items: sender ? offerItems : interaction.senderOffer.items,
          confirmedRevision: null,
        },
        targetOffer: {
          ...interaction.targetOffer,
          items: sender ? interaction.targetOffer.items : offerItems,
          confirmedRevision: null,
        },
      };
      socialInteractions.set(interactionId, next);
      refreshReservationCount();
      return recordSocialOperation(started, { status: 'updated', interaction: next });
    },
    async confirmSocialTrade(sessionId, interactionId, expectedRevision) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      const actor = admissionsBySession.get(sessionId);
      if (
        interaction?.kind !== 'trade' ||
        actor === undefined ||
        interaction.status !== 'negotiating'
      ) {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      if (interaction.revision !== expectedRevision) {
        return recordSocialOperation(started, { status: 'trade_changed', interaction });
      }
      const sender = actor.presenceId === interaction.senderOffer.participant.presenceId;
      const confirmed: SocialTradeView = {
        ...interaction,
        senderOffer: {
          ...interaction.senderOffer,
          confirmedRevision: sender ? expectedRevision : interaction.senderOffer.confirmedRevision,
        },
        targetOffer: {
          ...interaction.targetOffer,
          confirmedRevision: sender ? interaction.targetOffer.confirmedRevision : expectedRevision,
        },
      };
      if (
        confirmed.senderOffer.confirmedRevision !== expectedRevision ||
        confirmed.targetOffer.confirmedRevision !== expectedRevision
      ) {
        socialInteractions.set(interactionId, confirmed);
        return recordSocialOperation(started, { status: 'confirmed', interaction: confirmed });
      }
      const completed: SocialTradeView = { ...confirmed, status: 'completed' };
      const receipt: SocialReceipt = {
        id: randomUUID(),
        interactionId,
        kind: 'trade',
        status: 'completed',
        participants: [interaction.senderOffer.participant, interaction.targetOffer.participant],
        items: [
          ...interaction.senderOffer.items.map((item) => ({
            ...item,
            fromPresenceId: interaction.senderOffer.participant.presenceId,
            toPresenceId: interaction.targetOffer.participant.presenceId,
          })),
          ...interaction.targetOffer.items.map((item) => ({
            ...item,
            fromPresenceId: interaction.targetOffer.participant.presenceId,
            toPresenceId: interaction.senderOffer.participant.presenceId,
          })),
        ],
        completedAt: currentTimestamp(),
      };
      socialInteractions.set(interactionId, completed);
      socialReceipts.set(interactionId, receipt);
      completedSocialSettlements += 1;
      settlementLatencies.push(performance.now() - started);
      refreshReservationCount();
      return recordSocialOperation(started, {
        status: 'completed',
        interaction: completed,
        receipt,
      });
    },
    async cancelSocialTrade(_sessionId, interactionId) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      if (interaction?.kind !== 'trade') {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      const cancelled: SocialTradeView = { ...interaction, status: 'cancelled' };
      socialInteractions.set(interactionId, cancelled);
      refreshReservationCount();
      return recordSocialOperation(started, { status: 'cancelled', interaction: cancelled });
    },
    async resumeSocialTrade(_sessionId, interactionId) {
      const started = performance.now();
      const interaction = socialInteractions.get(interactionId);
      if (interaction?.kind !== 'trade' || interaction.status !== 'negotiating') {
        return recordSocialOperation(started, { status: 'request_changed' });
      }
      const resumed: SocialTradeView = { ...interaction, reconnectDeadline: null };
      socialInteractions.set(interactionId, resumed);
      resumedSocialTrades += 1;
      return recordSocialOperation(started, { status: 'resumed', interaction: resumed });
    },
    async socialDisconnect(sessionId) {
      const actor = admissionsBySession.get(sessionId);
      if (actor === undefined) return [];
      const changed: SocialInteractionView[] = [];
      for (const interaction of socialInteractions.values()) {
        if (interaction.kind !== 'trade' || interaction.status !== 'negotiating') continue;
        const participants = [
          interaction.senderOffer.participant.presenceId,
          interaction.targetOffer.participant.presenceId,
        ];
        if (!participants.includes(actor.presenceId)) continue;
        const paused: SocialTradeView = {
          ...interaction,
          reconnectDeadline: expiryTimestamp(30_000),
        };
        socialInteractions.set(interaction.id, paused);
        changed.push(paused);
      }
      return changed;
    },
    async invalidateSocialPair(sessionId, targetPresenceId) {
      const actor = admissionsBySession.get(sessionId);
      if (actor === undefined) return [];
      const changed: SocialInteractionView[] = [];
      for (const interaction of socialInteractions.values()) {
        const participants =
          interaction.kind === 'gift'
            ? [interaction.sender.presenceId, interaction.target.presenceId]
            : [
                interaction.senderOffer.participant.presenceId,
                interaction.targetOffer.participant.presenceId,
              ];
        if (
          !['pending', 'negotiating'].includes(interaction.status) ||
          !participants.includes(actor.presenceId) ||
          !participants.includes(targetPresenceId)
        ) {
          continue;
        }
        const invalidated = { ...interaction, status: 'invalidated' as const };
        socialInteractions.set(interaction.id, invalidated);
        changed.push(invalidated);
      }
      refreshReservationCount();
      return changed;
    },
    async socialGraphBootstrap(sessionId) {
      return graphBootstrap(sessionId);
    },
    async sendFriendRequest(sessionId, targetPresenceId) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      const targetSession = sessionByPresence.get(targetPresenceId);
      const target =
        targetSession === undefined ? undefined : admissionsBySession.get(targetSession);
      if (
        source === undefined ||
        target === undefined ||
        source.presenceId === targetPresenceId ||
        blockedPairs.has(pairKey(source.presenceId, targetPresenceId))
      ) {
        return recordGraphOperation(started, {
          status: 'player_unavailable',
          affectedPresenceIds: [],
        });
      }
      createdFriendRequests += 1;
      return recordGraphOperation(started, {
        status: 'created',
        friendRequest: {
          id: randomUUID(),
          status: 'pending',
          sender: {
            presenceId: source.presenceId,
            displayName: source.displayName,
            level: 1,
            appearancePreset: 'moss',
          },
          target: {
            presenceId: target.presenceId,
            displayName: target.displayName,
            level: 1,
            appearancePreset: 'moss',
          },
          createdAt: currentTimestamp(),
          expiresAt: expiryTimestamp(604_800_000),
        },
        affectedPresenceIds: [source.presenceId, target.presenceId],
      });
    },
    async respondFriendRequest() {
      return { status: 'request_changed', affectedPresenceIds: [] };
    },
    async cancelFriendRequest() {
      return { status: 'request_changed', affectedPresenceIds: [] };
    },
    async removeFriend() {
      return { status: 'request_changed', affectedPresenceIds: [] };
    },
    async createParty(sessionId) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      if (source === undefined || partyByPresence.has(source.presenceId)) {
        return recordGraphOperation(started, {
          status: 'already_in_party',
          affectedPresenceIds: [],
        });
      }
      const party: PartySnapshot = {
        partyId: randomUUID(),
        revision: 1,
        status: 'active',
        capacity: 4,
        leaderPresenceId: source.presenceId,
        members: [
          {
            presenceId: source.presenceId,
            displayName: source.displayName,
            level: 1,
            appearancePreset: 'moss',
            role: 'leader',
            connectionStatus: 'online',
            worldId: 'lantern-square',
            worldName: 'Lantern Square',
            channelNumber: source.channelNumber,
            readyState: 'waiting',
            joinedAt: currentTimestamp(),
          },
        ],
        pendingInvitationCount: 0,
        readyCheck: null,
        leaderReconnectDeadline: null,
      };
      partyByPresence.set(source.presenceId, party);
      createdParties += 1;
      return recordGraphOperation(started, {
        status: 'created',
        party,
        affectedPresenceIds: [source.presenceId],
      });
    },
    async sendPartyInvitation(sessionId, targetPresenceId, expectedRevision) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      const targetSession = sessionByPresence.get(targetPresenceId);
      const target =
        targetSession === undefined ? undefined : admissionsBySession.get(targetSession);
      const party = source === undefined ? undefined : partyByPresence.get(source.presenceId);
      if (
        source === undefined ||
        target === undefined ||
        party === undefined ||
        party.revision !== expectedRevision ||
        partyByPresence.has(targetPresenceId) ||
        blockedPairs.has(pairKey(source.presenceId, targetPresenceId))
      ) {
        return recordGraphOperation(started, {
          status: 'party_changed',
          affectedPresenceIds: [],
        });
      }
      const nextParty = {
        ...party,
        revision: party.revision + 1,
        pendingInvitationCount: party.pendingInvitationCount + 1,
      };
      partyByPresence.set(source.presenceId, nextParty);
      const invitation = {
        id: randomUUID(),
        partyId: party.partyId,
        partyRevision: nextParty.revision,
        status: 'pending' as const,
        inviter: {
          presenceId: source.presenceId,
          displayName: source.displayName,
          level: 1,
          appearancePreset: 'moss' as const,
        },
        target: {
          presenceId: target.presenceId,
          displayName: target.displayName,
          level: 1,
          appearancePreset: 'moss' as const,
        },
        createdAt: currentTimestamp(),
        expiresAt: expiryTimestamp(120_000),
      };
      invitationsByTarget.set(targetPresenceId, [
        invitation,
        ...(invitationsByTarget.get(targetPresenceId) ?? []),
      ]);
      createdPartyInvitations += 1;
      return recordGraphOperation(started, {
        status: 'created',
        party: nextParty,
        invitation,
        affectedPresenceIds: [source.presenceId, targetPresenceId],
      });
    },
    async respondPartyInvitation() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async cancelPartyInvitation() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async leaveParty() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async kickPartyMember() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async promotePartyLeader() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async disbandParty() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async startPartyReadyCheck(sessionId, expectedRevision) {
      const started = performance.now();
      const source = admissionsBySession.get(sessionId);
      const party = source === undefined ? undefined : partyByPresence.get(source.presenceId);
      if (source === undefined || party === undefined || party.revision !== expectedRevision) {
        return recordGraphOperation(started, {
          status: 'party_changed',
          affectedPresenceIds: [],
        });
      }
      const nextParty: PartySnapshot = {
        ...party,
        revision: party.revision + 1,
        readyCheck: {
          id: randomUUID(),
          status: 'active',
          partyRevision: party.revision + 1,
          createdAt: currentTimestamp(),
          expiresAt: expiryTimestamp(30_000),
          responses: party.members.map((member) => ({
            presenceId: member.presenceId,
            state: 'waiting',
            respondedAt: null,
          })),
        },
      };
      partyByPresence.set(source.presenceId, nextParty);
      startedReadyChecks += 1;
      return recordGraphOperation(started, {
        status: 'started',
        party: nextParty,
        affectedPresenceIds: nextParty.members.map((member) => member.presenceId),
      });
    },
    async respondPartyReadyCheck() {
      return { status: 'party_changed', affectedPresenceIds: [] };
    },
    async socialGraphDisconnect(sessionId) {
      const source = admissionsBySession.get(sessionId);
      const party = source === undefined ? undefined : partyByPresence.get(source.presenceId);
      if (source === undefined || party === undefined) {
        return { status: 'unchanged', affectedPresenceIds: [] };
      }
      const nextParty: PartySnapshot = {
        ...party,
        revision: party.revision + 1,
        leaderReconnectDeadline: expiryTimestamp(60_000),
        members: party.members.map((member) =>
          member.presenceId === source.presenceId
            ? { ...member, connectionStatus: 'reconnecting' as const }
            : member,
        ),
      };
      partyByPresence.set(source.presenceId, nextParty);
      reconnectingLeaders += 1;
      return {
        status: 'reconnecting',
        party: nextParty,
        affectedPresenceIds: [source.presenceId],
      };
    },
    async invalidateSocialGraphPair() {
      return { status: 'unchanged', affectedPresenceIds: [] };
    },
    async cooperativeActivityBootstrap(sessionId) {
      const playerIndex = Number(sessionId.slice(-12)) - 1;
      const state = activityStateForPlayer(playerIndex);
      if (state !== undefined) {
        const presenceId = activityPresenceId(playerIndex);
        const reconnecting = state.snapshot.participants.some(
          (participant) =>
            participant.presenceId === presenceId &&
            participant.connectionStatus === 'reconnecting',
        );
        if (reconnecting) {
          state.snapshot = {
            ...state.snapshot,
            revision: state.snapshot.revision + 1,
            participants: state.snapshot.participants.map((participant) =>
              participant.presenceId === presenceId
                ? { ...participant, connectionStatus: 'online', reconnectDeadline: null }
                : participant,
            ),
          };
          restoredActivityReconnects += 1;
        }
      }
      return activityBootstrap(sessionId);
    },
    async prepareCooperativeActivityEntry() {
      return { status: 'activity_unavailable' };
    },
    async enterCooperativeActivity() {
      return { status: 'not_ready' };
    },
    async interactCooperativeActivity(
      sessionId,
      instanceId,
      expectedRevision,
      objectiveKey,
      objectKey,
      _position,
      requestId,
    ) {
      const started = performance.now();
      activityPersistenceOperations += 1;
      const playerIndex = Number(sessionId.slice(-12)) - 1;
      const state = activityStateForPlayer(playerIndex);
      if (state === undefined || state.snapshot.instanceId !== instanceId) {
        rejectedActivityInteractions += 1;
        return { status: 'not_participant' };
      }
      if (state.requestIds.has(requestId)) {
        return {
          status: 'replayed',
          snapshot: structuredClone(state.snapshot),
          affectedPresenceIds: state.snapshot.participants.map(({ presenceId }) => presenceId),
        };
      }
      if (
        state.snapshot.status !== 'active' ||
        state.snapshot.revision !== expectedRevision ||
        state.snapshot.currentObjectiveKey !== objectiveKey
      ) {
        rejectedActivityInteractions += 1;
        return { status: 'objective_changed', snapshot: structuredClone(state.snapshot) };
      }
      const activityObject = state.snapshot.objects.find(({ key }) => key === objectKey);
      if (activityObject === undefined || !activityObject.active) {
        rejectedActivityInteractions += 1;
        return { status: 'invalid_object', snapshot: structuredClone(state.snapshot) };
      }
      state.requestIds.add(requestId);
      const current = Math.min(6, (state.snapshot.objectives[0]?.current ?? 0) + 1);
      const completed = current === 6;
      const completedAt = completed ? currentTimestamp() : null;
      const presenceId = activityPresenceId(playerIndex);
      state.snapshot = {
        ...state.snapshot,
        status: completed ? 'completed' : 'active',
        revision: state.snapshot.revision + 1,
        currentObjectiveKey: completed ? null : 'gather-seed-bundles',
        objectives: [
          {
            key: 'gather-seed-bundles',
            label: 'Gather Seed Bundles',
            type: 'shared_collect_count',
            current,
            target: 6,
            status: completed ? 'completed' : 'active',
            startedAt: state.snapshot.startedAt,
            completedAt,
            timerEndsAt: null,
          },
        ],
        participants: state.snapshot.participants.map((participant) =>
          participant.presenceId === presenceId
            ? { ...participant, contribution: participant.contribution + 1 }
            : participant,
        ),
        objects: state.snapshot.objects.map((object) =>
          object.key === objectKey ? { ...object, active: false } : object,
        ),
        temporaryItemCount: 0,
        completedAt,
        resultCode: completed ? 'community_harvest_complete' : null,
        receipts: completed
          ? state.memberIndexes.map((memberIndex) => ({
              receiptId: activityReceiptId(
                Math.max(0, Number(instanceId.slice(-12)) - 1),
                memberIndex,
              ),
              status: 'settled' as const,
              dust: 15,
              items: [{ itemSlug: 'moonbean', quantity: 2 }],
              settledAt: completedAt ?? currentTimestamp(),
              dailyRewardNumber: 1,
            }))
          : [],
      };
      const elapsed = performance.now() - started;
      objectiveLatencies.push(elapsed);
      if (completed) rewardSettlementLatencies.push(elapsed);
      return {
        status: completed ? 'completed' : 'progressed',
        snapshot: structuredClone(state.snapshot),
        affectedPresenceIds: state.snapshot.participants.map(({ presenceId: id }) => id),
      };
    },
    async leaveCooperativeActivity() {
      return { status: 'not_participant' };
    },
    async cooperativeActivityDisconnect(sessionId) {
      activityPersistenceOperations += 1;
      const playerIndex = Number(sessionId.slice(-12)) - 1;
      const state = activityStateForPlayer(playerIndex);
      if (state === undefined || state.snapshot.status !== 'active') {
        return { status: 'unchanged' };
      }
      const presenceId = activityPresenceId(playerIndex);
      state.snapshot = {
        ...state.snapshot,
        revision: state.snapshot.revision + 1,
        participants: state.snapshot.participants.map((participant) =>
          participant.presenceId === presenceId
            ? {
                ...participant,
                connectionStatus: 'reconnecting',
                reconnectDeadline: expiryTimestamp(60_000),
              }
            : participant,
        ),
      };
      return {
        status: 'updated',
        snapshot: structuredClone(state.snapshot),
        affectedPresenceIds: state.snapshot.participants.map(({ presenceId: id }) => id),
      };
    },
  };
  const service = createRealtimeService({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['http://localhost:3001'],
      connectionLimit: Math.max(players + reconnects + homeVisitVisitors + 10, 50),
      ticketSecret: 'load-test-ticket-secret-at-least-thirty-two',
      authenticationTimeoutMs: 5_000,
      checkpointIntervalMs: 15_000,
      revalidationIntervalMs: 15_000,
      idleTimeoutMs: 45_000,
    },
    logger: new LoadLogger(),
    persistence,
  });
  const address = await service.start();
  const url = address.replace(/^http/u, 'ws') + '/connect';
  const homeVisitUrl = address.replace(/^http/u, 'ws') + '/home-visit';
  const sockets: WebSocket[] = [];
  const homeVisitSockets: WebSocket[] = [];
  const socketPresences: string[] = [];
  const latencies: number[] = [];
  const chatLatencies: number[] = [];
  const routingScope = (playerIndex: number) =>
    `${String(playerIndex % channelCount)}:${activityInstanceForPlayer.get(playerIndex) ?? 'public'}`;
  const expectedMovementBroadcasts = Array.from(
    { length: players },
    (_, sourceIndex) =>
      Array.from({ length: players }, (_, targetIndex) => targetIndex).filter(
        (targetIndex) =>
          targetIndex !== sourceIndex && routingScope(targetIndex) === routingScope(sourceIndex),
      ).length,
  ).reduce((total, recipients) => total + recipients, 0);
  const expectedCosmeticBroadcasts = Array.from(
    { length: players },
    (_, sourceIndex) =>
      Array.from({ length: players }, (_, targetIndex) => targetIndex).filter(
        (targetIndex) => routingScope(targetIndex) === routingScope(sourceIndex),
      ).length,
  ).reduce((total, recipients) => total + recipients, 0);
  let receivedMovementBroadcasts = 0;
  let receivedTrailingIdleBroadcasts = 0;
  let rejectedMovements = 0;
  let authoritativeFacingChecks = 0;
  let authoritativeMovementStateChecks = 0;
  let trailingIdleChecks = 0;
  let trailingIdleFacingChecks = 0;
  const expectedMotionSequenceByPresence = new Map<string, number>();
  const expectedIdleSequenceByPresence = new Map<string, number>();
  const authoritativeMotionByPresence = new Map<
    string,
    { readonly facingDirection: unknown; readonly movementState: unknown }
  >();
  const trailingIdleByPresence = new Map<
    string,
    { readonly facingDirection: unknown; readonly movementState: unknown }
  >();
  const motionProbePresences = new Set<string>();
  const idleProbePresences = new Set<string>();
  const cosmeticBroadcastLatencies: number[] = [];
  const appearanceRefreshStartedAt = new Map<string, number>();
  const emoteActivationStartedAt = new Map<string, number>();
  let sentAppearanceRefreshes = 0;
  let receivedAppearanceUpdateBroadcasts = 0;
  let sentEmoteActivations = 0;
  let receivedEmoteActivationBroadcasts = 0;
  let rejectedEmoteActivations = 0;
  let unsafeCosmeticPayloads = 0;
  let receivedChatBroadcasts = 0;
  let rejectedChatMessages = 0;
  let acceptedReports = 0;
  let mutedSendRejections = 0;
  let sentInspectRequests = 0;
  let sentGiftRequests = 0;
  let sentTradeRequests = 0;
  let receivedSocialEvents = 0;
  let rejectedSocialRequests = 0;
  let rateLimitedSocialRequests = 0;
  let blockedSocialRequests = 0;
  let sentFriendRequests = 0;
  let sentPartyCreations = 0;
  let sentPartyInvitations = 0;
  let sentReadyChecks = 0;
  let sentPartyChatMessages = 0;
  let receivedSocialGraphEvents = 0;
  let rateLimitedSocialGraphRequests = 0;
  let activityErrorResponses = 0;
  let homeVisitReceivedMessages = 0;
  let homeVisitMovementAcknowledgements = 0;
  let homeVisitDuplicateMovementAcknowledgements = 0;
  let homeVisitSnapshotMessages = 0;
  let homeVisitEmoteEvents = 0;
  let homeVisitReconnects = 0;
  const homeVisitAcknowledgedParticipants = new Set<string>();
  const homeVisitUpdateLatencies: number[] = [];
  const socialRequestStartedAt = new Map<string, number>();
  const settlementStartedAt = new Map<string, number>();
  const startedAt = performance.now();
  const cpuStart = process.cpuUsage();
  const heapStart = process.memoryUsage().heapUsed;

  try {
    for (let index = 0; index < players; index += 1) {
      const socket = new WebSocket(url, {
        origin: 'http://localhost:3001',
        headers: {
          'user-agent':
            index < mobileClients
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'
              : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0',
        },
      });
      sockets.push(socket);
      activitySockets.set(index, socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      const admittedMessage = waitFor(socket, 'admitted');
      socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: 'a'.repeat(43) }));
      const admittedPayload = await admittedMessage;
      const admittedSelf = admittedPayload['self'] as Record<string, unknown>;
      socketPresences.push(String(admittedSelf['presenceId']));
    }

    if (hiddenTabDwellMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, hiddenTabDwellMs));
      const readiness = await fetch(`${address}/ready`);
      const readinessBody = (await readiness.json()) as {
        readonly connections?: { readonly admitted?: number };
      };
      admittedAfterHiddenDwell = readinessBody.connections?.admitted ?? -1;
      if (readiness.status !== 200 || admittedAfterHiddenDwell !== players) {
        throw new Error('Hidden-tab dwell did not preserve the authenticated connection set.');
      }
    }

    const connectHomeVisitParticipant = async (): Promise<WebSocket> => {
      const socket = new WebSocket(homeVisitUrl, { origin: 'http://localhost:3001' });
      homeVisitSockets.push(socket);
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        homeVisitReceivedMessages += 1;
        if (message['type'] === 'movement_ack') {
          homeVisitMovementAcknowledgements += 1;
          const participant = message['participant'] as Record<string, unknown>;
          const participantId = String(participant['id']);
          if (homeVisitAcknowledgedParticipants.has(participantId)) {
            homeVisitDuplicateMovementAcknowledgements += 1;
          }
          homeVisitAcknowledgedParticipants.add(participantId);
        }
        if (message['type'] === 'snapshot') {
          homeVisitSnapshotMessages += 1;
          const events = message['events'];
          if (Array.isArray(events)) {
            homeVisitEmoteEvents += events.filter(
              (event) =>
                typeof event === 'object' &&
                event !== null &&
                (event as Record<string, unknown>)['eventKey'] === 'home_visitor_emote',
            ).length;
          }
        }
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      const authenticated = waitFor(socket, 'authenticated');
      socket.send(JSON.stringify({ type: 'authenticate', ticket: 'h'.repeat(43) }));
      await authenticated;
      return socket;
    };
    const closeHomeVisitSocket = async (socket: WebSocket): Promise<void> => {
      if (socket.readyState === socket.CLOSED) return;
      const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
      socket.close(1000, 'bounded load transition');
      await closed;
    };

    if (homeVisitVisitors > 0) {
      for (let index = 0; index <= homeVisitVisitors; index += 1) {
        await connectHomeVisitParticipant();
      }
      await Promise.all(
        homeVisitSockets.slice(1, homeVisitVisitors + 1).map(async (socket, index) => {
          const participant = homeVisitParticipants[index + 1];
          if (participant === undefined) throw new Error('Home-visit load participant missing.');
          const started = performance.now();
          const acknowledgement = waitFor(socket, 'movement_ack');
          socket.send(
            JSON.stringify({
              type: 'movement',
              x: participant.x + 0.25,
              y: participant.y,
              facingDirection: 'east',
              sequence: 1,
            }),
          );
          await acknowledgement;
          homeVisitUpdateLatencies.push(performance.now() - started);
        }),
      );
      await Promise.all(
        homeVisitSockets.slice(0, homeVisitVisitors + 1).map(async (socket) => {
          const snapshot = waitFor(socket, 'snapshot');
          socket.send(JSON.stringify({ type: 'sync', afterEventNumber: '0', forceSnapshot: true }));
          await snapshot;
        }),
      );

      const visitorSocket = homeVisitSockets[1];
      if (visitorSocket !== undefined) {
        await closeHomeVisitSocket(visitorSocket);
        homeVisitForcedAdmissionIndex = 1;
        await connectHomeVisitParticipant();
        homeVisitReconnects += 1;
      }
      const ownerSocket = homeVisitSockets[0];
      if (ownerSocket !== undefined) {
        await closeHomeVisitSocket(ownerSocket);
        homeVisitForcedAdmissionIndex = 0;
        await connectHomeVisitParticipant();
        homeVisitReconnects += 1;
      }
      await waitForCondition(
        () => homeVisitCloseCheckpoints >= 2,
        'Home-visit disconnect checkpoints were not persisted.',
      );
      if (
        homeVisitMovementAcknowledgements !== homeVisitVisitors ||
        homeVisitDuplicateMovementAcknowledgements !== 0 ||
        homeVisitSnapshotMessages !== homeVisitVisitors + 1 ||
        homeVisitEmoteEvents !== homeVisitVisitors * (homeVisitVisitors + 1)
      ) {
        throw new Error('Bounded home-visit movement or event delivery was incomplete.');
      }
    }

    const sentAtBySequence = new Map<number, number>();
    const captureAuthoritativePresence = (presence: Record<string, unknown>): void => {
      const presenceId = String(presence['presenceId']);
      const sequence = Number(presence['sequence']);
      const movementState = presence['movementState'];
      if (
        expectedMotionSequenceByPresence.get(presenceId) === sequence &&
        movementState !== 'idle' &&
        !authoritativeMotionByPresence.has(presenceId)
      ) {
        authoritativeMotionByPresence.set(presenceId, {
          facingDirection: presence['facingDirection'],
          movementState,
        });
      } else if (
        expectedIdleSequenceByPresence.get(presenceId) === sequence &&
        movementState === 'idle' &&
        authoritativeMotionByPresence.has(presenceId) &&
        !trailingIdleByPresence.has(presenceId)
      ) {
        trailingIdleByPresence.set(presenceId, {
          facingDirection: presence['facingDirection'],
          movementState,
        });
      }
    };
    for (const socket of sockets) {
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message['type'] === 'presence_updated') {
          const presence = message['presence'] as Record<string, unknown>;
          const presenceId = String(presence['presenceId']);
          const sequence = Number(presence['sequence']);
          const movementState = presence['movementState'];
          const expectedSequence = expectedMotionSequenceByPresence.get(presenceId);
          if (expectedSequence === sequence && movementState !== 'idle') {
            receivedMovementBroadcasts += 1;
            const sentAt = sentAtBySequence.get(sequence);
            if (sentAt !== undefined) latencies.push(performance.now() - sentAt);
          }
          if (
            expectedIdleSequenceByPresence.get(presenceId) === sequence &&
            movementState === 'idle'
          ) {
            receivedTrailingIdleBroadcasts += 1;
          }
          captureAuthoritativePresence(presence);
        }
        if (message['type'] === 'movement_rejected') {
          const authoritative = message['authoritative'] as Record<string, unknown>;
          const presenceId = String(authoritative['presenceId']);
          const sequence = Number(authoritative['sequence']);
          const movementState = authoritative['movementState'];
          const expectedMotionProbe =
            message['reason'] === 'stale_sequence' &&
            expectedMotionSequenceByPresence.get(presenceId) === sequence &&
            movementState !== 'idle';
          const expectedIdleProbe =
            message['reason'] === 'stale_sequence' &&
            expectedIdleSequenceByPresence.get(presenceId) === sequence &&
            movementState === 'idle';
          if (expectedMotionProbe || expectedIdleProbe) {
            (expectedMotionProbe ? motionProbePresences : idleProbePresences).add(presenceId);
            captureAuthoritativePresence(authoritative);
          } else {
            rejectedMovements += 1;
          }
        }
        if (message['type'] === 'appearance_updated') {
          receivedAppearanceUpdateBroadcasts += 1;
          const started = appearanceRefreshStartedAt.get(String(message['presenceId']));
          if (started !== undefined) cosmeticBroadcastLatencies.push(performance.now() - started);
          if (
            'assetUrl' in message ||
            'selection' in message ||
            'ownership' in message ||
            'grantReason' in message
          ) {
            unsafeCosmeticPayloads += 1;
          }
        }
        if (message['type'] === 'emote.activated') {
          receivedEmoteActivationBroadcasts += 1;
          const started = emoteActivationStartedAt.get(String(message['requestId']));
          if (started !== undefined) cosmeticBroadcastLatencies.push(performance.now() - started);
          if (
            'assetUrl' in message ||
            'selection' in message ||
            'ownership' in message ||
            'grantReason' in message
          ) {
            unsafeCosmeticPayloads += 1;
          }
        }
        if (message['type'] === 'emote.rejected') rejectedEmoteActivations += 1;
        if (message['type'] === 'chat.message') {
          receivedChatBroadcasts += 1;
          const chat = message['message'] as Record<string, unknown>;
          const match = /^load\|(\d+(?:\.\d+)?)\|/u.exec(String(chat['text']));
          if (match?.[1] !== undefined) {
            chatLatencies.push(performance.now() - Number(match[1]));
          }
        }
        if (message['type'] === 'chat.message_rejected') {
          rejectedChatMessages += 1;
          if (message['reason'] === 'chat_muted') mutedSendRejections += 1;
        }
        if (message['type'] === 'chat.report_received') acceptedReports += 1;
        if (String(message['type']).startsWith('social.')) {
          receivedSocialEvents += 1;
          const requestId = message['requestId'];
          if (typeof requestId === 'string') {
            const started = socialRequestStartedAt.get(requestId);
            if (started !== undefined) {
              socialRequestLatencies.push(performance.now() - started);
              socialRequestStartedAt.delete(requestId);
            }
          }
          if (message['type'] === 'social.interaction.error') {
            rejectedSocialRequests += 1;
            if (message['code'] === 'rate_limited') rateLimitedSocialRequests += 1;
            if (message['code'] === 'blocked') blockedSocialRequests += 1;
          }
          if (message['type'] === 'social.error' && message['code'] === 'rate_limited') {
            rateLimitedSocialGraphRequests += 1;
          }
          if (
            message['type'] === 'social.gift.completed' ||
            message['type'] === 'social.trade.completed'
          ) {
            const interaction = (message['gift'] ?? message['trade']) as Record<string, unknown>;
            const started = settlementStartedAt.get(String(interaction['id']));
            if (started !== undefined) settlementLatencies.push(performance.now() - started);
          }
        }
        if (
          String(message['type']).startsWith('friends.') ||
          String(message['type']).startsWith('party.') ||
          message['type'] === 'social_graph.bootstrap'
        ) {
          receivedSocialGraphEvents += 1;
        }
        if (message['type'] === 'activity.error') activityErrorResponses += 1;
      });
    }

    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      const presenceId = socketPresences[index];
      const sessionId = presenceId === undefined ? undefined : sessionByPresence.get(presenceId);
      if (socket === undefined || presenceId === undefined || sessionId === undefined) continue;
      appearanceRevisions.set(sessionId, 2);
      appearanceRefreshStartedAt.set(presenceId, performance.now());
      sentAppearanceRefreshes += 1;
      socket.send(JSON.stringify({ version: 1, type: 'appearance.refresh' }));
    }
    await waitForCondition(
      () => receivedAppearanceUpdateBroadcasts === expectedCosmeticBroadcasts,
      () =>
        `Appearance load broadcasts were incomplete (${String(receivedAppearanceUpdateBroadcasts)}/${String(expectedCosmeticBroadcasts)}).`,
    );
    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      if (socket === undefined) continue;
      const requestId = `load-emote-${index}`;
      emoteActivationStartedAt.set(requestId, performance.now());
      sentEmoteActivations += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'emote.activate',
          requestId,
          emoteKey: 'wave',
        }),
      );
    }
    await waitForCondition(
      () =>
        receivedEmoteActivationBroadcasts === expectedCosmeticBroadcasts &&
        rejectedEmoteActivations === 0,
      () =>
        `Emote load broadcasts were incomplete (${String(receivedEmoteActivationBroadcasts)}/${String(expectedCosmeticBroadcasts)}, ${String(rejectedEmoteActivations)} rejected).`,
    );
    if (unsafeCosmeticPayloads !== 0) {
      throw new Error('Realtime cosmetic load emitted a private or raw-asset field.');
    }
    let sequence = 1;
    for (const socket of sockets) {
      sentMovements += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'movement',
          sequence,
          x: manifest.spawn.x,
          y: manifest.spawn.y,
          facingDirection: 'north',
          movementState: 'jogging',
        }),
      );
      sequence += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 160));

    const motionDelta = 0.08;
    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      const presenceId = socketPresences[index];
      if (socket === undefined || presenceId === undefined) continue;
      expectedMotionSequenceByPresence.set(presenceId, sequence);
      sentAtBySequence.set(sequence, performance.now());
      const movement = JSON.stringify({
        version: 1,
        type: 'movement',
        sequence,
        x: manifest.spawn.x + motionDelta,
        y: manifest.spawn.y - motionDelta,
        facingDirection: 'west',
        movementState: 'jogging',
      });
      sentMovements += 2;
      movementBurstMessages += 2;
      socket.send(movement);
      // The duplicate yields the sender's authoritative stale-sequence snapshot even when
      // channel/activity isolation leaves that presence without a remote observer.
      socket.send(movement);
      sequence += 1;
    }

    await waitForCondition(
      () =>
        authoritativeMotionByPresence.size === players &&
        motionProbePresences.size === players &&
        receivedMovementBroadcasts === expectedMovementBroadcasts,
      () =>
        `Authoritative movement checks were incomplete for the ${String(players)}-player scenario (${String(authoritativeMotionByPresence.size)}/${String(players)} observed, ${String(motionProbePresences.size)}/${String(players)} probes, ${String(receivedMovementBroadcasts)}/${String(expectedMovementBroadcasts)} broadcasts, ${String(rejectedMovements)} unexpected rejections).`,
    );

    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      const presenceId = socketPresences[index];
      if (socket === undefined || presenceId === undefined) continue;
      expectedIdleSequenceByPresence.set(presenceId, sequence);
      const trailingIdle = JSON.stringify({
        version: 1,
        type: 'movement',
        sequence,
        x: manifest.spawn.x + motionDelta,
        y: manifest.spawn.y - motionDelta,
        facingDirection: 'north',
        movementState: 'jogging',
      });
      sentMovements += 2;
      movementBurstMessages += 2;
      socket.send(trailingIdle);
      socket.send(trailingIdle);
      sequence += 1;
    }

    await waitForCondition(
      () =>
        trailingIdleByPresence.size === players &&
        idleProbePresences.size === players &&
        receivedTrailingIdleBroadcasts === expectedMovementBroadcasts,
      () =>
        `Trailing idle checks were incomplete for the ${String(players)}-player scenario (${String(trailingIdleByPresence.size)}/${String(players)} observed, ${String(idleProbePresences.size)}/${String(players)} probes, ${String(receivedTrailingIdleBroadcasts)}/${String(expectedMovementBroadcasts)} broadcasts, ${String(rejectedMovements)} unexpected rejections).`,
    );

    authoritativeFacingChecks = [...authoritativeMotionByPresence.values()].filter(
      ({ facingDirection }) => facingDirection === 'east',
    ).length;
    authoritativeMovementStateChecks = [...authoritativeMotionByPresence.values()].filter(
      ({ movementState }) => movementState === 'walking',
    ).length;
    trailingIdleChecks = [...trailingIdleByPresence.values()].filter(
      ({ movementState }) => movementState === 'idle',
    ).length;
    trailingIdleFacingChecks = [...trailingIdleByPresence.values()].filter(
      ({ facingDirection }) => facingDirection === 'east',
    ).length;
    if (
      authoritativeFacingChecks !== players ||
      authoritativeMovementStateChecks !== players ||
      trailingIdleChecks !== players ||
      trailingIdleFacingChecks !== players
    ) {
      throw new Error(
        `Authoritative motion assertions failed for the ${String(players)}-player scenario.`,
      );
    }

    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < sockets.length; index += 1) {
        const socket = sockets[index];
        if (socket === undefined) continue;
        sentChatMessages += 1;
        chatBurstMessages += 1;
        socket.send(
          JSON.stringify({
            version: 1,
            type: 'chat.send',
            requestId: `load-chat-${round}-${index}`,
            scope: round === 0 ? 'channel' : 'nearby',
            text: `load|${String(performance.now())}|player-${index}-round-${round}`,
          }),
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 750));

    const spamSocket = sockets[0];
    if (spamSocket !== undefined) {
      for (let index = 0; index < 6; index += 1) {
        sentChatMessages += 1;
        chatBurstMessages += 1;
        spamSocket.send(
          JSON.stringify({
            version: 1,
            type: 'chat.send',
            requestId: `load-spam-${index}`,
            scope: 'channel',
            text: 'Repeated load-test spam',
          }),
        );
      }
      for (let index = 0; index < 6; index += 1) {
        spamSocket.send(
          JSON.stringify({
            version: 1,
            type: 'chat.report',
            requestId: `load-report-${index}`,
            messageId: '50000000-0000-4000-8000-000000000001',
            category: 'spam',
            reason: 'Controlled load-test report',
          }),
        );
      }
      const mutedSession = [...admissionsBySession.keys()][1] ?? [...admissionsBySession.keys()][0];
      const mutedSocket = sockets[1] ?? spamSocket;
      if (mutedSession !== undefined) mutedSessions.add(mutedSession);
      sentChatMessages += 1;
      mutedSocket.send(
        JSON.stringify({
          version: 1,
          type: 'chat.send',
          requestId: 'load-muted-send',
          scope: 'channel',
          text: 'Muted load-test send',
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 750));

    const graphTargetIndex = (index: number) =>
      (index + Math.max(1, Math.floor(players / 2))) % players;
    for (let index = 0; index < Math.min(10, players); index += 1) {
      const socket = sockets[index];
      const targetPresenceId = socketPresences[graphTargetIndex(index)];
      if (socket === undefined || targetPresenceId === undefined) continue;
      sentFriendRequests += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'friends.request.send',
          requestId: `load-friend-${index}`,
          targetPresenceId,
        }),
      );
    }
    for (let index = 0; index < Math.min(10, players); index += 1) {
      const socket = sockets[index];
      if (socket === undefined) continue;
      sentPartyCreations += 1;
      socket.send(
        JSON.stringify({ version: 1, type: 'party.create', requestId: `load-party-${index}` }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));

    for (let index = 0; index < Math.min(5, players); index += 1) {
      const socket = sockets[index];
      const leaderPresenceId = socketPresences[index];
      const targetPresenceId = socketPresences[graphTargetIndex(index)];
      const party =
        leaderPresenceId === undefined ? undefined : partyByPresence.get(leaderPresenceId);
      if (socket === undefined || targetPresenceId === undefined || party === undefined) continue;
      sentPartyInvitations += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'party.invite.send',
          requestId: `load-party-invite-${index}`,
          targetPresenceId,
          expectedRevision: party.revision,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const burstSocket = sockets[0];
    const burstLeader = socketPresences[0];
    const burstTarget = socketPresences[graphTargetIndex(0)];
    const burstParty = burstLeader === undefined ? undefined : partyByPresence.get(burstLeader);
    if (burstSocket !== undefined && burstTarget !== undefined && burstParty !== undefined) {
      for (let index = 0; index < 10; index += 1) {
        sentPartyInvitations += 1;
        burstSocket.send(
          JSON.stringify({
            version: 1,
            type: 'party.invite.send',
            requestId: `load-party-invite-burst-${index}`,
            targetPresenceId: burstTarget,
            expectedRevision: burstParty.revision,
          }),
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));

    for (let index = 0; index < Math.min(5, players); index += 1) {
      const socket = sockets[index];
      const leaderPresenceId = socketPresences[index];
      const party =
        leaderPresenceId === undefined ? undefined : partyByPresence.get(leaderPresenceId);
      if (socket === undefined || party === undefined) continue;
      sentReadyChecks += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'party.ready_check.start',
          requestId: `load-ready-${index}`,
          expectedRevision: party.revision,
        }),
      );
      sentPartyChatMessages += 1;
      sentChatMessages += 1;
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'chat.send',
          requestId: `load-party-chat-${index}`,
          scope: 'party',
          text: `Party load message ${index}`,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 350));

    const socialTargetIndex = (index: number) => (index + channelCount) % players;
    const inspectCount = Math.min(players, 10);
    for (let index = 0; index < inspectCount; index += 1) {
      const targetPresenceId = socketPresences[socialTargetIndex(index)];
      const socket = sockets[index];
      if (socket === undefined || targetPresenceId === undefined) continue;
      const requestId = `load-inspect-${index}`;
      sentInspectRequests += 1;
      socialRequestStartedAt.set(requestId, performance.now());
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'social.inspect.request',
          requestId,
          targetPresenceId,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));

    const giftCount = Math.min(players, 20);
    for (let index = 0; index < giftCount; index += 1) {
      const targetPresenceId = socketPresences[socialTargetIndex(index)];
      const socket = sockets[index];
      if (socket === undefined || targetPresenceId === undefined) continue;
      const requestId = `load-gift-${index}`;
      sentGiftRequests += 1;
      socialRequestStartedAt.set(requestId, performance.now());
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'social.gift.create',
          requestId,
          targetPresenceId,
          itemSlug: 'moonbean-seed',
          quantity: 1,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pendingGifts = [...socialInteractions.values()].filter(
      (interaction): interaction is SocialGiftView =>
        interaction.kind === 'gift' && interaction.status === 'pending',
    );
    for (const gift of pendingGifts.slice(0, Math.min(10, pendingGifts.length))) {
      const targetIndex = socketPresences.indexOf(gift.target.presenceId);
      const socket = sockets[targetIndex];
      if (socket === undefined) continue;
      settlementStartedAt.set(gift.id, performance.now());
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'social.gift.accept',
          requestId: `load-gift-accept-${gift.id}`,
          interactionId: gift.id,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (players >= 20 && reconnects === 0) {
      const duplicateSocket = sockets[0];
      const duplicateTarget = socketPresences[socialTargetIndex(0)];
      if (duplicateSocket !== undefined && duplicateTarget !== undefined) {
        for (let index = 0; index < 8; index += 1) {
          sentGiftRequests += 1;
          duplicateSocket.send(
            JSON.stringify({
              version: 1,
              type: 'social.gift.create',
              requestId: 'load-gift-duplicate',
              targetPresenceId: duplicateTarget,
              itemSlug: 'moonbean-seed',
              quantity: 1,
            }),
          );
        }
      }
      const blockingIndex = players - 1;
      const blockingSocket = sockets[blockingIndex];
      const blockedPresenceId = socketPresences[socialTargetIndex(blockingIndex)];
      if (blockingSocket !== undefined && blockedPresenceId !== undefined) {
        blockingSocket.send(
          JSON.stringify({
            version: 1,
            type: 'chat.block_player',
            targetPresenceId: blockedPresenceId,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        sentGiftRequests += 1;
        blockingSocket.send(
          JSON.stringify({
            version: 1,
            type: 'social.gift.create',
            requestId: 'load-gift-blocked',
            targetPresenceId: blockedPresenceId,
            itemSlug: 'moonbean-seed',
            quantity: 1,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (players >= 40 && channelCount >= 2) {
      const tradePairs = [0, 1, 4, 5].map((senderIndex) => ({
        senderIndex,
        targetIndex: socialTargetIndex(senderIndex),
      }));
      for (const pair of tradePairs) {
        const socket = sockets[pair.senderIndex];
        const targetPresenceId = socketPresences[pair.targetIndex];
        if (socket === undefined || targetPresenceId === undefined) continue;
        sentTradeRequests += 1;
        socket.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.request',
            requestId: `load-trade-${pair.senderIndex}`,
            targetPresenceId,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const pendingTrades = [...socialInteractions.values()].filter(
        (interaction): interaction is SocialTradeView =>
          interaction.kind === 'trade' && interaction.status === 'pending',
      );
      for (const trade of pendingTrades) {
        const targetIndex = socketPresences.indexOf(trade.targetOffer.participant.presenceId);
        sockets[targetIndex]?.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.accept',
            requestId: `load-trade-accept-${trade.id}`,
            interactionId: trade.id,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const negotiating = [...socialInteractions.values()].filter(
        (interaction): interaction is SocialTradeView =>
          interaction.kind === 'trade' && interaction.status === 'negotiating',
      );
      for (const initialTrade of negotiating) {
        const senderIndex = socketPresences.indexOf(
          initialTrade.senderOffer.participant.presenceId,
        );
        const targetIndex = socketPresences.indexOf(
          initialTrade.targetOffer.participant.presenceId,
        );
        sockets[senderIndex]?.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.offer.update',
            requestId: `load-trade-sender-offer-${initialTrade.id}`,
            interactionId: initialTrade.id,
            expectedRevision: initialTrade.revision,
            items: [{ itemSlug: 'moonbean-seed', quantity: 1 }],
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 40));
        const senderUpdated = socialInteractions.get(initialTrade.id);
        if (senderUpdated?.kind !== 'trade') continue;
        sockets[targetIndex]?.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.offer.update',
            requestId: `load-trade-target-offer-${initialTrade.id}`,
            interactionId: initialTrade.id,
            expectedRevision: senderUpdated.revision,
            items: [{ itemSlug: 'moonbean-seed', quantity: 1 }],
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      const offeredTrades = [...socialInteractions.values()].filter(
        (interaction): interaction is SocialTradeView =>
          interaction.kind === 'trade' && interaction.status === 'negotiating',
      );
      for (const trade of offeredTrades) {
        const senderIndex = socketPresences.indexOf(trade.senderOffer.participant.presenceId);
        const targetIndex = socketPresences.indexOf(trade.targetOffer.participant.presenceId);
        settlementStartedAt.set(trade.id, performance.now());
        sockets[senderIndex]?.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.confirm',
            requestId: `load-trade-sender-confirm-${trade.id}`,
            interactionId: trade.id,
            expectedRevision: trade.revision,
          }),
        );
        sockets[targetIndex]?.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.confirm',
            requestId: `load-trade-target-confirm-${trade.id}`,
            interactionId: trade.id,
            expectedRevision: trade.revision,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const reconnectTradeByIndex = new Map<number, string>();
    if (reconnects > 0 && players >= 8) {
      const senderIndex = Math.min(reconnects - 1, 4);
      const targetIndex = socialTargetIndex(senderIndex);
      const senderSocket = sockets[senderIndex];
      const targetPresenceId = socketPresences[targetIndex];
      if (senderSocket !== undefined && targetPresenceId !== undefined) {
        sentTradeRequests += 1;
        senderSocket.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.request',
            requestId: 'load-reconnect-trade',
            targetPresenceId,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        const pending = [...socialInteractions.values()].find(
          (interaction): interaction is SocialTradeView =>
            interaction.kind === 'trade' &&
            interaction.status === 'pending' &&
            interaction.senderOffer.participant.presenceId === socketPresences[senderIndex],
        );
        if (pending !== undefined) {
          sockets[targetIndex]?.send(
            JSON.stringify({
              version: 1,
              type: 'social.trade.accept',
              requestId: 'load-reconnect-trade-accept',
              interactionId: pending.id,
            }),
          );
          reconnectTradeByIndex.set(senderIndex, pending.id);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    }

    const runActivityRound = async (round: number) => {
      if (!activityLoadEnabled) return;
      const responses: Promise<Record<string, unknown>>[] = [];
      for (const state of activityStates.values()) {
        if (state.snapshot.status !== 'active') continue;
        const playerIndex = state.memberIndexes[round % state.memberIndexes.length];
        if (playerIndex === undefined) continue;
        const socket = activitySockets.get(playerIndex);
        if (socket === undefined || socket.readyState !== WebSocket.OPEN) continue;
        const response = waitFor(socket, 'activity.bootstrap');
        responses.push(response);
        sentActivityInteractions += 1;
        socket.send(
          JSON.stringify({
            version: 1,
            type: 'activity.interact',
            requestId: `activity-load-${round}-${state.snapshot.instanceId}`,
            intent: {
              instanceId: state.snapshot.instanceId,
              expectedRevision: state.snapshot.revision,
              objectiveKey: 'gather-seed-bundles',
              objectKey: `seed-bundle-${String(round + 1)}`,
            },
          }),
        );
      }
      await Promise.all(responses);
    };

    for (let round = 0; round < 3; round += 1) await runActivityRound(round);

    if (activityLoadEnabled) {
      const spamSocket = activitySockets.get(0);
      const spamState = activityStateForPlayer(0);
      if (spamSocket !== undefined && spamState !== undefined) {
        for (let attempt = 0; attempt < 16; attempt += 1) {
          sentActivityInteractions += 1;
          spamSocket.send(
            JSON.stringify({
              version: 1,
              type: 'activity.interact',
              requestId: `activity-invalid-spam-${attempt}`,
              intent: {
                instanceId: spamState.snapshot.instanceId,
                expectedRevision: spamState.snapshot.revision,
                objectiveKey: 'gather-seed-bundles',
                objectKey: 'not-an-activity-object',
              },
            }),
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    for (let index = 0; index < reconnects; index += 1) {
      sockets[index]?.terminate();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const replacement = new WebSocket(url, { origin: 'http://localhost:3001' });
      sockets.push(replacement);
      activitySockets.set(index, replacement);
      await new Promise<void>((resolve, reject) => {
        replacement.once('open', resolve);
        replacement.once('error', reject);
      });
      const admittedMessage = waitFor(replacement, 'admitted');
      replacement.send(
        JSON.stringify({ version: 1, type: 'authenticate', ticket: 'b'.repeat(43) }),
      );
      await admittedMessage;
      const reconnectTradeId = reconnectTradeByIndex.get(index);
      if (reconnectTradeId !== undefined) {
        replacement.send(
          JSON.stringify({
            version: 1,
            type: 'social.trade.resume',
            requestId: `load-trade-resume-${index}`,
            interactionId: reconnectTradeId,
          }),
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (let round = 3; round < 6; round += 1) await runActivityRound(round);
    if (activityLoadEnabled) {
      activityCleanupRuns += 1;
      activityPersistenceOperations += 1;
      for (const state of activityStates.values()) {
        if (state.snapshot.status === 'completed' && state.snapshot.temporaryItemCount !== 0) {
          state.snapshot = { ...state.snapshot, temporaryItemCount: 0 };
        }
      }
    }
  } finally {
    for (const socket of sockets) socket.close(1000);
    for (const socket of homeVisitSockets) {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
        socket.close(1000, 'bounded load complete');
      }
    }
    await service.stop();
  }

  if (publicCloseCheckpoints < players) {
    throw new Error(
      `Disconnect cleanup was incomplete for ${options.scenario} (${String(publicCloseCheckpoints)}/${String(players)} checkpoints).`,
    );
  }

  const cpu = process.cpuUsage(cpuStart);
  const durationMs = Math.round(performance.now() - startedAt);
  const completedActivityInstances = [...activityStates.values()].filter(
    ({ snapshot }) => snapshot.status === 'completed',
  ).length;
  const activityRewardReceipts = [...activityStates.values()].reduce(
    (count, { snapshot }) => count + snapshot.receipts.length,
    0,
  );
  const leakedTemporaryItems = [...activityStates.values()].reduce(
    (count, { snapshot }) => count + snapshot.temporaryItemCount,
    0,
  );
  const leakedActiveActivityInstances = [...activityStates.values()].filter(({ snapshot }) =>
    ['preparing', 'waiting_for_players', 'active', 'paused'].includes(snapshot.status),
  ).length;
  return {
    scenario: options.scenario,
    players,
    channels: channelCount,
    reconnects,
    mobileClients,
    hiddenTabClients,
    hiddenTabDwellMs,
    admittedAfterHiddenDwell,
    durationMs,
    cpuUserMs: Math.round(cpu.user / 1_000),
    cpuSystemMs: Math.round(cpu.system / 1_000),
    heapDeltaBytes: process.memoryUsage().heapUsed - heapStart,
    sentMovements,
    movementBurstMessages,
    receivedMovementBroadcasts,
    receivedTrailingIdleBroadcasts,
    rejectedMovements,
    authoritativeFacingChecks,
    authoritativeMovementStateChecks,
    trailingIdleChecks,
    trailingIdleFacingChecks,
    averageVisibleLatencyMs:
      latencies.length === 0
        ? 0
        : Math.round(latencies.reduce((total, latency) => total + latency, 0) / latencies.length),
    maximumVisibleLatencyMs: Math.round(Math.max(0, ...latencies)),
    sentAppearanceRefreshes,
    receivedAppearanceUpdateBroadcasts,
    sentEmoteActivations,
    receivedEmoteActivationBroadcasts,
    rejectedEmoteActivations,
    unsafeCosmeticPayloads,
    averageCosmeticBroadcastLatencyMs:
      cosmeticBroadcastLatencies.length === 0
        ? 0
        : Math.round(
            cosmeticBroadcastLatencies.reduce((total, latency) => total + latency, 0) /
              cosmeticBroadcastLatencies.length,
          ),
    maximumCosmeticBroadcastLatencyMs: Math.round(Math.max(0, ...cosmeticBroadcastLatencies)),
    sentChatMessages,
    chatBurstMessages,
    acceptedChatMessages,
    receivedChatBroadcasts,
    rejectedChatMessages,
    acceptedReports,
    mutedSendRejections,
    chatMessagesPerSecond: Number((acceptedChatMessages / (durationMs / 1_000)).toFixed(2)),
    averageChatBroadcastLatencyMs:
      chatLatencies.length === 0
        ? 0
        : Math.round(
            chatLatencies.reduce((total, latency) => total + latency, 0) / chatLatencies.length,
          ),
    maximumChatBroadcastLatencyMs: Math.round(Math.max(0, ...chatLatencies)),
    averagePersistenceLatencyMs:
      persistenceLatencies.length === 0
        ? 0
        : Math.round(
            (persistenceLatencies.reduce((total, latency) => total + latency, 0) /
              persistenceLatencies.length) *
              1_000,
          ) / 1_000,
    maximumPersistenceLatencyMs: Math.round(Math.max(0, ...persistenceLatencies) * 1_000) / 1_000,
    sentInspectRequests,
    sentGiftRequests,
    sentTradeRequests,
    completedSocialSettlements,
    receivedSocialEvents,
    rejectedSocialRequests,
    rateLimitedSocialRequests,
    blockedSocialRequests,
    replayedSocialRequests,
    resumedSocialTrades,
    socialPersistenceOperations,
    averageSocialRequestLatencyMs:
      socialRequestLatencies.length === 0
        ? 0
        : Math.round(
            (socialRequestLatencies.reduce((total, latency) => total + latency, 0) /
              socialRequestLatencies.length) *
              1_000,
          ) / 1_000,
    maximumSocialRequestLatencyMs:
      Math.round(Math.max(0, ...socialRequestLatencies) * 1_000) / 1_000,
    averageSettlementLatencyMs:
      settlementLatencies.length === 0
        ? 0
        : Math.round(
            (settlementLatencies.reduce((total, latency) => total + latency, 0) /
              settlementLatencies.length) *
              1_000,
          ) / 1_000,
    maximumSettlementLatencyMs: Math.round(Math.max(0, ...settlementLatencies) * 1_000) / 1_000,
    remainingReservations: reservations,
    sentFriendRequests,
    createdFriendRequests,
    sentPartyCreations,
    createdParties,
    sentPartyInvitations,
    createdPartyInvitations,
    sentReadyChecks,
    startedReadyChecks,
    sentPartyChatMessages,
    receivedSocialGraphEvents,
    rateLimitedSocialGraphRequests,
    reconnectingLeaders: Math.max(0, reconnectingLeaders - createdParties),
    averageSocialGraphPersistenceLatencyMs:
      socialGraphPersistenceLatencies.length === 0
        ? 0
        : Math.round(
            (socialGraphPersistenceLatencies.reduce((total, latency) => total + latency, 0) /
              socialGraphPersistenceLatencies.length) *
              1_000,
          ) / 1_000,
    maximumSocialGraphPersistenceLatencyMs:
      Math.round(Math.max(0, ...socialGraphPersistenceLatencies) * 1_000) / 1_000,
    activityInstances: activityStates.size,
    twoPlayerActivityInstances: activityLoadEnabled ? 5 : 0,
    fourPlayerActivityInstances: activityLoadEnabled ? 5 : 0,
    activityPlayers: activityLoadEnabled ? 30 : 0,
    publicPlayers: activityLoadEnabled ? players - 30 : players,
    sentActivityInteractions,
    completedActivityInstances,
    activityRewardReceipts,
    rejectedActivityInteractions: Math.max(rejectedActivityInteractions, activityErrorResponses),
    activityPersistenceOperations,
    averageObjectiveLatencyMs:
      objectiveLatencies.length === 0
        ? 0
        : Math.round(
            (objectiveLatencies.reduce((total, latency) => total + latency, 0) /
              objectiveLatencies.length) *
              1_000,
          ) / 1_000,
    maximumObjectiveLatencyMs: Math.round(Math.max(0, ...objectiveLatencies) * 1_000) / 1_000,
    averageRewardSettlementLatencyMs:
      rewardSettlementLatencies.length === 0
        ? 0
        : Math.round(
            (rewardSettlementLatencies.reduce((total, latency) => total + latency, 0) /
              rewardSettlementLatencies.length) *
              1_000,
          ) / 1_000,
    maximumRewardSettlementLatencyMs:
      Math.round(Math.max(0, ...rewardSettlementLatencies) * 1_000) / 1_000,
    maximumActivitySnapshotBytes,
    restoredActivityReconnects,
    activityCleanupRuns,
    leakedTemporaryItems,
    leakedActiveActivityInstances,
    homeVisitVisitors,
    homeVisitMovementUpdates: homeVisitVisitors,
    homeVisitMovementAcknowledgements,
    homeVisitSnapshotMessages,
    homeVisitEmoteEvents,
    homeVisitReconnects,
    homeVisitCloseCheckpoints,
    homeVisitDroppedMovementUpdates: Math.max(
      0,
      homeVisitVisitors - homeVisitMovementAcknowledgements,
    ),
    homeVisitDuplicateMovementAcknowledgements,
    homeVisitMessagesPerSecond:
      homeVisitVisitors === 0
        ? 0
        : Number((homeVisitReceivedMessages / (durationMs / 1_000)).toFixed(2)),
    averageHomeVisitUpdateLatencyMs:
      homeVisitUpdateLatencies.length === 0
        ? 0
        : Math.round(
            (homeVisitUpdateLatencies.reduce((total, latency) => total + latency, 0) /
              homeVisitUpdateLatencies.length) *
              1_000,
          ) / 1_000,
    maximumHomeVisitUpdateLatencyMs:
      Math.round(Math.max(0, ...homeVisitUpdateLatencies) * 1_000) / 1_000,
    publicCloseCheckpoints,
  };
}

const results = [
  await runScenario(1, 1, 0, { scenario: 'single-client-baseline', mobileClients: 1 }),
  await runScenario(5, 1, 0, {
    scenario: 'small-mixed-client-hidden-tab-dwell',
    mobileClients: 3,
    hiddenTabClients: 2,
    hiddenTabDwellMs: 750,
  }),
  await runScenario(10, 1, 0, { scenario: 'small-public-channel' }),
  await runScenario(20, 1, 0, { scenario: 'medium-public-channel', mobileClients: 8 }),
  await runScenario(40, 1, 0, { scenario: 'capacity-public-channel', mobileClients: 16 }),
  await runScenario(40, 2, 0, { scenario: 'split-channel-routing', mobileClients: 16 }),
  await runScenario(40, 2, 5, {
    scenario: 'split-channel-reconnect-storm',
    mobileClients: 16,
    hiddenTabClients: 10,
    hiddenTabDwellMs: 750,
  }),
];

process.stdout.write(
  `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
