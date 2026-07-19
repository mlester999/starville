import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOONPETAL_HARVEST_HELP } from '@starville/cooperative-activities';
import type { PublicPresence, RealtimeServerMessage } from '@starville/realtime';
import {
  INITIAL_REALTIME_VIEW,
  RealtimeConnection,
  reconnectDelay,
  reconcileRealtimeMessage,
} from './realtime-client';

const self: PublicPresence = {
  presenceId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Local Friend',
  level: 1,
  worldId: 'lantern-square',
  worldVersionId: '20000000-0000-4000-8000-000000000001',
  channelId: '30000000-0000-4000-8000-000000000001',
  channelNumber: 1,
  x: 12,
  y: 7,
  facingDirection: 'south',
  movementState: 'idle',
  appearancePreset: 'moss',
  sequence: 0,
  connected: true,
};
const remote = {
  ...self,
  presenceId: '10000000-0000-4000-8000-000000000002',
  displayName: 'Remote Friend',
};
const envelope = { version: 1 as const, serverTime: 1 };

class FakeRealtimeSocket extends EventTarget {
  public readyState: number = WebSocket.CONNECTING;
  public readonly sent: string[] = [];

  public send(payload: string): void {
    this.sent.push(payload);
  }

  public open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  public receive(payload: RealtimeServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  public close(code = 1000, reason = ''): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
}

function movementPayloads(socket: FakeRealtimeSocket): Array<Record<string, unknown>> {
  return socket.sent
    .map((payload) => JSON.parse(payload) as Record<string, unknown>)
    .filter((payload) => payload['type'] === 'movement');
}

async function connectedRealtime(): Promise<{
  readonly connection: RealtimeConnection;
  readonly socket: FakeRealtimeSocket;
}> {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          ticket: 'a'.repeat(43),
          expiresAt: '2026-07-15T01:00:00.000Z',
        },
        requestId: 'realtime-ticket-test',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  const socket = new FakeRealtimeSocket();
  let created = false;
  const connection = new RealtimeConnection({
    apiUrl: 'http://localhost:3002',
    realtimeUrl: 'ws://localhost:3003',
    worldId: self.worldId,
    worldVersionId: self.worldVersionId,
    onState: () => undefined,
    onAccessInvalid: () => undefined,
    createSocket: () => {
      created = true;
      return socket as unknown as WebSocket;
    },
  });
  connection.start();
  await vi.waitFor(() => expect(created).toBe(true));
  socket.open();
  socket.receive({
    ...envelope,
    type: 'admitted',
    self,
    channels: [],
    checkpointIntervalMs: 15_000,
  });
  await Promise.resolve();
  return { connection, socket };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('game realtime reconciliation', () => {
  it('deduplicates snapshots and rejects stale remote movement', () => {
    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'admitted',
      self,
      channels: [],
      checkpointIntervalMs: 15_000,
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'snapshot',
      worldId: self.worldId,
      channelId: self.channelId,
      presences: [remote, remote],
    });
    expect(state.remotes).toHaveLength(1);
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'presence_updated',
      presence: { ...remote, sequence: 2, x: 13 },
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'presence_updated',
      presence: { ...remote, sequence: 1, x: 8 },
    });
    expect(state.remotes[0]?.x).toBe(13);
  });

  it('reconciles compact appearance references without resetting movement state', () => {
    const populated = {
      ...INITIAL_REALTIME_VIEW,
      status: 'connected' as const,
      self,
      remotes: [{ ...remote, sequence: 9, x: 13.5, movementState: 'jogging' as const }],
    };
    const remoteUpdated = reconcileRealtimeMessage(populated, {
      ...envelope,
      type: 'appearance_updated',
      presenceId: remote.presenceId,
      appearanceId: '40000000-0000-4000-8000-000000000004',
      appearanceRevision: 7,
    });

    expect(remoteUpdated.remotes[0]).toEqual({
      ...populated.remotes[0],
      appearanceId: '40000000-0000-4000-8000-000000000004',
      appearanceRevision: 7,
    });
    expect(remoteUpdated.remotes[0]).toMatchObject({
      x: 13.5,
      sequence: 9,
      movementState: 'jogging',
    });

    const selfUpdated = reconcileRealtimeMessage(populated, {
      ...envelope,
      type: 'appearance_updated',
      presenceId: self.presenceId,
      appearanceId: '50000000-0000-4000-8000-000000000005',
      appearanceRevision: 4,
    });
    expect(selfUpdated.self).toEqual({
      ...self,
      appearanceId: '50000000-0000-4000-8000-000000000005',
      appearanceRevision: 4,
    });
    expect(selfUpdated.remotes).toBe(populated.remotes);

    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'appearance_updated',
        presenceId: '60000000-0000-4000-8000-000000000006',
        appearanceId: '70000000-0000-4000-8000-000000000007',
        appearanceRevision: 1,
      }),
    ).toBe(populated);
  });

  it('clears remote entities on channel change and leave', () => {
    const populated = {
      ...INITIAL_REALTIME_VIEW,
      status: 'connected' as const,
      self,
      remotes: [remote],
    };
    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'channel_changed',
        self: { ...self, channelId: '30000000-0000-4000-8000-000000000002', channelNumber: 2 },
        channels: [],
      }).remotes,
    ).toEqual([]);
    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'presence_left',
        presenceId: remote.presenceId,
      }).remotes,
    ).toEqual([]);
  });

  it('keeps compact emote state, records rejection, and interrupts it on movement', () => {
    const populated = {
      ...INITIAL_REALTIME_VIEW,
      status: 'connected' as const,
      self,
      remotes: [remote],
    };
    const activated = reconcileRealtimeMessage(populated, {
      ...envelope,
      type: 'emote.activated',
      requestId: 'emote-request-1',
      presenceId: remote.presenceId,
      emoteKey: 'wave',
      activationId: '60000000-0000-4000-8000-000000000001',
      startedAt: 1_786_656_000_000,
      durationMs: 1_200,
    });
    expect(activated.emotes.activations).toEqual([
      {
        presenceId: remote.presenceId,
        emoteKey: 'wave',
        activationId: '60000000-0000-4000-8000-000000000001',
        startedAt: 1_786_656_000_000,
        durationMs: 1_200,
      },
    ]);

    const rejected = reconcileRealtimeMessage(activated, {
      ...envelope,
      type: 'emote.rejected',
      requestId: 'emote-request-2',
      reason: 'rate_limited',
    });
    expect(rejected.emotes.lastRejection).toEqual({
      requestId: 'emote-request-2',
      reason: 'rate_limited',
    });

    const interrupted = reconcileRealtimeMessage(rejected, {
      ...envelope,
      type: 'presence_updated',
      presence: { ...remote, sequence: 2, movementState: 'walking' },
    });
    expect(interrupted.emotes.activations).toEqual([]);
  });

  it('ignores snapshots and presence from another world or channel', () => {
    const populated = {
      ...INITIAL_REALTIME_VIEW,
      status: 'connected' as const,
      self,
      remotes: [remote],
    };
    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'snapshot',
        worldId: 'moonpetal-meadow',
        channelId: self.channelId,
        presences: [],
      }),
    ).toBe(populated);
    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'presence_joined',
        presence: { ...remote, worldId: 'moonpetal-meadow' },
      }),
    ).toBe(populated);
    expect(
      reconcileRealtimeMessage(populated, {
        ...envelope,
        type: 'presence_updated',
        presence: {
          ...remote,
          channelId: '30000000-0000-4000-8000-000000000002',
          sequence: 2,
        },
      }),
    ).toBe(populated);
  });

  it('uses bounded exponential backoff with jitter', () => {
    expect(reconnectDelay(0, () => 0.5)).toBe(500);
    expect(reconnectDelay(20, () => 0.5)).toBe(10_000);
  });

  it('reconciles activity catalog, preparation errors, and reconnect bootstrap state', () => {
    const catalog = {
      generatedAt: '2026-07-15T00:00:00.000Z',
      activities: [
        {
          activity: MOONPETAL_HARVEST_HELP,
          availability: 'available' as const,
          availableAt: null,
          rewardedCompletionsToday: 0,
          partyEligible: true,
          leader: true,
        },
      ],
    };
    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'activity.catalog',
      catalog,
    });
    expect(state.activity.catalog.activities[0]?.activity.activityKey).toBe(
      'moonpetal-harvest-help',
    );
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'activity.error',
      requestId: 'activity-prepare-1',
      code: 'not_ready',
    });
    expect(state.activity.lastError).toEqual({
      requestId: 'activity-prepare-1',
      code: 'not_ready',
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'activity.bootstrap',
      activity: { catalog, preparation: null, instance: null },
    });
    expect(state.activity).toEqual({ catalog, preparation: null, instance: null });
  });

  it('starts fresh and preserves only live messages already seen in this play session', () => {
    const offlineMessage = {
      id: '40000000-0000-4000-8000-000000000001',
      sequence: 7,
      scope: 'channel' as const,
      senderPresenceId: remote.presenceId,
      senderDisplayName: remote.displayName,
      senderLevel: 1,
      worldId: self.worldId,
      channelId: self.channelId,
      sentAt: '2026-07-14T00:00:00.000Z',
      text: 'Welcome back!',
      sourceCategory: 'player' as const,
    };
    const liveMessage = {
      ...offlineMessage,
      id: '40000000-0000-4000-8000-000000000003',
      sequence: 8,
      sentAt: '2026-07-14T00:00:01.000Z',
      text: 'Sent while this session is online',
    };
    const bootstrap: RealtimeServerMessage = {
      ...envelope,
      type: 'chat.bootstrap',
      chat: {
        histories: [
          { scope: 'nearby', messages: [], hasMore: false },
          { scope: 'channel', messages: [offlineMessage], hasMore: false },
          { scope: 'system', messages: [], hasMore: false },
        ],
        preferences: [],
        mutedUntil: null,
      },
    };

    expect(
      reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, bootstrap).chat.messages.channel,
    ).toEqual([]);

    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'chat.message',
      message: liveMessage,
    });
    state = reconcileRealtimeMessage(state, bootstrap);
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'chat.history',
      history: { scope: 'channel', messages: [offlineMessage], hasMore: false },
    });
    expect(state.chat.messages.channel).toEqual([liveMessage]);
  });

  it('removes muted and blocked player messages while preserving system history', () => {
    const playerMessage = {
      id: '40000000-0000-4000-8000-000000000002',
      sequence: 8,
      scope: 'nearby' as const,
      senderPresenceId: remote.presenceId,
      senderDisplayName: remote.displayName,
      senderLevel: 1,
      worldId: self.worldId,
      channelId: self.channelId,
      sentAt: '2026-07-14T00:00:01.000Z',
      text: 'Nearby hello',
      sourceCategory: 'player' as const,
    };
    const populated = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'chat.message',
      message: playerMessage,
    });
    const muted = reconcileRealtimeMessage(populated, {
      ...envelope,
      type: 'chat.player_muted',
      targetPresenceId: remote.presenceId,
    });
    expect(muted.chat.messages.nearby).toEqual([]);
    expect(muted.chat.preferences).toEqual([
      { targetPresenceId: remote.presenceId, muted: true, blocked: false },
    ]);
  });

  it('retains safe rejection and report confirmation state', () => {
    const rejected = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'chat.message_rejected',
      requestId: 'chat-1',
      reason: 'chat_muted',
      mutedUntil: '2026-07-15T00:00:00.000Z',
    });
    expect(rejected.chat.lastRejection).toMatchObject({ reason: 'chat_muted' });
    const reported = reconcileRealtimeMessage(rejected, {
      ...envelope,
      type: 'chat.report_received',
      requestId: 'report-1',
      reportId: '50000000-0000-4000-8000-000000000001',
    });
    expect(reported.chat.latestReportId).toBe('50000000-0000-4000-8000-000000000001');
  });

  it('reconciles inspect, pending gift, and exactly-once receipt state', () => {
    const gift = {
      id: '60000000-0000-4000-8000-000000000001',
      kind: 'gift' as const,
      status: 'pending' as const,
      sender: { presenceId: self.presenceId, displayName: self.displayName },
      target: { presenceId: remote.presenceId, displayName: remote.displayName },
      item: {
        itemSlug: 'moonbean-seed',
        name: 'Moonbean Seed',
        category: 'seed' as const,
        assetRef: 'item-moonbean-seed',
        quantity: 2,
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2026-07-14T00:01:30.000Z',
    };
    const receipt = {
      id: '70000000-0000-4000-8000-000000000001',
      interactionId: gift.id,
      kind: 'gift' as const,
      status: 'completed' as const,
      participants: [gift.sender, gift.target],
      items: [
        {
          ...gift.item,
          fromPresenceId: self.presenceId,
          toPresenceId: remote.presenceId,
        },
      ],
      completedAt: '2026-07-14T00:00:10.000Z',
    };
    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'social.inspect.result',
      requestId: 'inspect-1',
      profile: {
        presenceId: remote.presenceId,
        displayName: remote.displayName,
        level: remote.level,
        appearancePreset: remote.appearancePreset,
        worldId: remote.worldId,
        worldName: 'Lantern Square',
        channelNumber: remote.channelNumber,
      },
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.request.received',
      interaction: gift,
    });
    expect(state.social.inspectedProfile).not.toHaveProperty('wallet');
    expect(state.social.pendingRequests).toEqual([gift]);

    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.gift.completed',
      gift: { ...gift, status: 'completed' },
      receipt,
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.gift.completed',
      gift: { ...gift, status: 'completed' },
      receipt,
    });
    expect(state.social.pendingRequests).toEqual([]);
    expect(state.social.recentReceipts).toEqual([receipt]);
  });

  it('replaces active trade revisions, clears settled state, and keeps safe errors', () => {
    const baseTrade = {
      id: '60000000-0000-4000-8000-000000000002',
      kind: 'trade' as const,
      status: 'negotiating' as const,
      revision: 2,
      senderOffer: {
        participant: { presenceId: self.presenceId, displayName: self.displayName },
        items: [],
        confirmedRevision: 2,
      },
      targetOffer: {
        participant: { presenceId: remote.presenceId, displayName: remote.displayName },
        items: [],
        confirmedRevision: null,
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2026-07-14T00:10:00.000Z',
      reconnectDeadline: null,
    };
    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'social.trade.opened',
      trade: baseTrade,
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.trade.confirmation_changed',
      trade: {
        ...baseTrade,
        revision: 3,
        senderOffer: { ...baseTrade.senderOffer, confirmedRevision: null },
      },
    });
    expect(state.social.activeTrade?.revision).toBe(3);
    expect(state.social.activeTrade?.senderOffer.confirmedRevision).toBeNull();

    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.interaction.error',
      requestId: 'trade-stale',
      code: 'trade_changed',
    });
    expect(state.social.lastError).toEqual({ requestId: 'trade-stale', code: 'trade_changed' });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'social.trade.invalidated',
      trade: { ...baseTrade, revision: 3, status: 'invalidated' },
    });
    expect(state.social.activeTrade).toBeNull();
  });

  it('restores durable social state and ignores stale party snapshots after reconnect', () => {
    const leader = {
      presenceId: self.presenceId,
      displayName: self.displayName,
      level: 1,
      appearancePreset: 'moss' as const,
      role: 'leader' as const,
      connectionStatus: 'online' as const,
      worldId: 'lantern-square' as const,
      worldName: 'Lantern Square',
      channelNumber: 1,
      readyState: 'waiting' as const,
      joinedAt: '2026-07-14T00:00:00.000Z',
    };
    const party = {
      partyId: '80000000-0000-4000-8000-000000000001',
      revision: 4,
      status: 'active' as const,
      capacity: 4,
      leaderPresenceId: self.presenceId,
      members: [leader],
      pendingInvitationCount: 0,
      readyCheck: null,
      leaderReconnectDeadline: null,
    };
    let state = reconcileRealtimeMessage(INITIAL_REALTIME_VIEW, {
      ...envelope,
      type: 'social_graph.bootstrap',
      socialGraph: {
        ...INITIAL_REALTIME_VIEW.socialGraph,
        friends: [
          {
            friendshipId: '81000000-0000-4000-8000-000000000001',
            presenceId: remote.presenceId,
            displayName: remote.displayName,
            level: 1,
            appearancePreset: 'moss',
            connectionStatus: 'online',
            worldId: 'lantern-square',
            worldName: 'Lantern Square',
            channelNumber: 1,
            partyState: 'none',
            lastSeenCategory: null,
          },
        ],
        party,
      },
    });
    state = reconcileRealtimeMessage(state, {
      ...envelope,
      type: 'party.snapshot',
      party: { ...party, revision: 3 },
    });
    expect(state.socialGraph.friends).toHaveLength(1);
    expect(state.socialGraph.party?.revision).toBe(4);
    expect(state.socialGraph.friends[0]).not.toHaveProperty('walletAddress');
  });
});

describe('coalesced realtime movement', () => {
  it('requests an authoritative appearance refresh without sending appearance data', async () => {
    const { connection, socket } = await connectedRealtime();

    connection.refreshAppearance();

    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({
      version: 1,
      type: 'appearance.refresh',
    });
    connection.dispose();
  });

  it('sends one trailing idle after walking and does not emit idle every frame', async () => {
    const { connection, socket } = await connectedRealtime();
    vi.useFakeTimers();
    const walking = { ...self, mapId: self.worldId, x: self.x + 0.1 };

    connection.sendMovement(walking);
    vi.advanceTimersByTime(50);
    connection.stopMovement(walking);
    connection.stopMovement(walking);
    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
    ]);

    vi.advanceTimersByTime(50);
    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
      'idle',
    ]);
    vi.advanceTimersByTime(500);
    expect(movementPayloads(socket)).toHaveLength(2);
    connection.dispose();
  });

  it('sends an unsent final displacement before the same-position trailing idle', async () => {
    const { connection, socket } = await connectedRealtime();
    vi.useFakeTimers();
    const first = { ...self, mapId: self.worldId, x: self.x + 0.1 };
    const final = { ...first, x: self.x + 0.2 };

    connection.sendMovement(first);
    vi.advanceTimersByTime(50);
    connection.sendMovement(final);
    connection.stopMovement(final);
    vi.advanceTimersByTime(50);
    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
      'walking',
    ]);

    vi.advanceTimersByTime(100);
    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
      'walking',
      'idle',
    ]);
    expect(movementPayloads(socket).at(-1)).toMatchObject({
      x: final.x,
      y: final.y,
      facingDirection: final.facingDirection,
    });
    connection.dispose();
  });

  it('replaces an obsolete queued idle when movement resumes', async () => {
    const { connection, socket } = await connectedRealtime();
    vi.useFakeTimers();
    const first = { ...self, mapId: self.worldId, x: self.x + 0.1 };
    const resumed = { ...first, x: self.x + 0.2, facingDirection: 'southeast' as const };

    connection.sendMovement(first);
    vi.advanceTimersByTime(50);
    connection.stopMovement(first);
    vi.advanceTimersByTime(25);
    connection.sendMovement(resumed);
    vi.advanceTimersByTime(25);

    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
      'walking',
    ]);
    vi.advanceTimersByTime(200);
    expect(movementPayloads(socket)).toHaveLength(2);
    connection.dispose();
  });

  it('publishes jogging intent followed by idle and flushes a safe stop when hidden', async () => {
    const { connection, socket } = await connectedRealtime();
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const jogging = {
      ...self,
      mapId: self.worldId,
      x: self.x + 0.34,
      facingDirection: 'southeast' as const,
    };

    connection.sendMovement(jogging);
    expect(movementPayloads(socket).at(-1)).toMatchObject({ movementState: 'jogging' });
    vi.advanceTimersByTime(50);
    visibility = 'hidden';
    connection.reconcileVisibility();
    vi.advanceTimersByTime(50);

    expect(movementPayloads(socket).at(-1)).toMatchObject({
      movementState: 'idle',
      x: jogging.x,
      y: jogging.y,
    });
    connection.dispose();
  });

  it('cancels queued movement across a channel transition and resumes from its snapshot', async () => {
    const { connection, socket } = await connectedRealtime();
    vi.useFakeTimers();
    const moving = { ...self, mapId: self.worldId, x: self.x + 0.1 };

    connection.sendMovement(moving);
    vi.advanceTimersByTime(50);
    connection.stopMovement(moving);
    connection.switchChannel('30000000-0000-4000-8000-000000000002');
    vi.advanceTimersByTime(250);
    expect(movementPayloads(socket)).toHaveLength(1);

    socket.receive({
      ...envelope,
      type: 'channel_changed',
      self: {
        ...self,
        channelId: '30000000-0000-4000-8000-000000000002',
        channelNumber: 2,
        movementState: 'idle',
        sequence: 1,
      },
      channels: [],
    });
    connection.sendMovement({ ...moving, x: self.x + 0.2 });
    expect(movementPayloads(socket)).toHaveLength(2);
    connection.dispose();
  });

  it('flushes at most one safe idle and cancels stale timers on clean disconnect', async () => {
    const { connection, socket } = await connectedRealtime();
    const removeListener = vi.spyOn(socket, 'removeEventListener');
    vi.useFakeTimers();
    const moving = { ...self, mapId: self.worldId, x: self.x + 0.1 };

    connection.sendMovement(moving);
    vi.advanceTimersByTime(50);
    connection.stopMovement(moving);
    connection.dispose();
    vi.advanceTimersByTime(500);

    expect(movementPayloads(socket).map((payload) => payload['movementState'])).toEqual([
      'walking',
      'idle',
    ]);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(removeListener).toHaveBeenCalledTimes(3);
  });

  it('uses an explicit retry to resync one live socket without creating a duplicate', async () => {
    const { connection, socket } = await connectedRealtime();
    const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.length;

    connection.retryNow();

    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({
      version: 1,
      type: 'resync',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(fetchCalls);
    connection.dispose();
  });
});
