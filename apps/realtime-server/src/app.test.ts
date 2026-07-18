import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import {
  MOONPETAL_HARVEST_HELP,
  type CooperativeActivityBootstrap,
} from '@starville/cooperative-activities';
import { getWorldManifest } from '@starville/game-content';
import { homeVisitGameTestFixture } from '@starville/housing';
import { buildRealtimeApp } from './app.js';
import { ConnectionRegistry } from './connections/connection-registry.js';
import type { LogContext, ServiceLogger } from './contracts.js';
import { isAllowedRealtimeOrigin } from './origins.js';
import { createRealtimeService } from './service.js';
import type { RealtimeAdmission, RealtimePersistenceGateway } from './persistence/gateway.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }

  debug(_message: string, _context?: LogContext): void {}

  trace(_message: string, _context?: LogContext): void {}

  info(_message: string, _context?: LogContext): void {}

  warn(_message: string, _context?: LogContext): void {}

  error(_message: string, _context?: LogContext): void {}

  fatal(_message: string, _context?: LogContext): void {}
}

const closeTasks: Array<() => Promise<void>> = [];

const config = {
  environment: 'test' as const,
  host: '127.0.0.1',
  port: 0,
  allowedOrigins: ['http://localhost:3001'],
  connectionLimit: 25,
  ticketSecret: 'test-realtime-ticket-secret-long-enough',
  authenticationTimeoutMs: 5_000,
  checkpointIntervalMs: 15_000,
  revalidationIntervalMs: 15_000,
  idleTimeoutMs: 45_000,
};

const TEST_CHANNELS = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    worldId: 'lantern-square' as const,
    number: 1,
    capacity: 40,
    population: 0,
    available: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    worldId: 'lantern-square' as const,
    number: 2,
    capacity: 40,
    population: 0,
    available: true,
  },
] as const;

function admission(index: number, channelNumber = 1, presenceIndex = index): RealtimeAdmission {
  const manifest = getWorldManifest('lantern-square');
  if (manifest === undefined) throw new Error('Lantern Square fixture missing.');
  const channel = TEST_CHANNELS[channelNumber - 1];
  if (channel === undefined) throw new Error('Realtime channel fixture missing.');
  return {
    status: 'admitted',
    sessionId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    presenceId: `20000000-0000-4000-8000-${String(presenceIndex).padStart(12, '0')}`,
    displayName: `Moss Friend ${String(presenceIndex)}`,
    level: 1,
    appearancePreset: 'moss',
    worldId: 'lantern-square',
    worldVersionId: '30000000-0000-4000-8000-000000000001',
    manifest,
    channelId: channel.id,
    channelNumber,
    x: manifest.spawn.x,
    y: manifest.spawn.y,
    facingDirection: 'south',
    channels: [...TEST_CHANNELS],
  };
}

async function connectAndAuthenticate(
  address: string,
  ticketCharacter: string,
  messages: Array<Record<string, unknown>>,
): Promise<WebSocket> {
  const socket = new WebSocket(address.replace(/^http/u, 'ws') + '/connect', {
    origin: 'http://localhost:3001',
  });
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(
    JSON.stringify({
      version: 1,
      type: 'authenticate',
      ticket: ticketCharacter.repeat(43),
    }),
  );
  await vi.waitFor(() =>
    expect(messages.some((message) => message['type'] === 'admitted')).toBe(true),
  );
  return socket;
}

function persistence(
  overrides: Partial<RealtimePersistenceGateway> = {},
): RealtimePersistenceGateway {
  return {
    admit: vi.fn().mockResolvedValue('invalid_ticket'),
    checkpoint: vi.fn().mockResolvedValue('checkpointed'),
    switchChannel: vi.fn().mockResolvedValue('unchanged'),
    revalidate: vi.fn().mockResolvedValue('active'),
    avatarProfile: vi.fn().mockResolvedValue('not_found'),
    activateEmote: vi.fn().mockResolvedValue({ status: 'not_owned' }),
    close: vi.fn().mockResolvedValue(true),
    chatBootstrap: vi.fn().mockResolvedValue({
      histories: [
        { scope: 'nearby', messages: [], hasMore: false },
        { scope: 'channel', messages: [], hasMore: false },
        { scope: 'system', messages: [], hasMore: false },
      ],
      preferences: [],
      mutedUntil: null,
    }),
    acceptChat: vi.fn().mockResolvedValue({ status: 'invalid_content' }),
    chatHistory: vi.fn().mockImplementation(async (_sessionId, scope) => ({
      scope,
      messages: [],
      hasMore: false,
    })),
    updateChatPreference: vi.fn().mockImplementation(async (_sessionId, targetPresenceId) => ({
      targetPresenceId,
      muted: true,
      blocked: false,
    })),
    reportChat: vi.fn().mockResolvedValue({
      status: 'accepted',
      reportId: '50000000-0000-4000-8000-000000000001',
    }),
    socialBootstrap: vi.fn().mockResolvedValue({
      inventory: [],
      pendingRequests: [],
      activeTrade: null,
      recentReceipts: [],
      interactionDistance: 3,
      dustTransferEnabled: false,
    }),
    inspectSocialPlayer: vi.fn().mockResolvedValue({
      status: 'player_unavailable',
      profile: undefined,
    }),
    createSocialGift: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    respondSocialGift: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    cancelSocialGift: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    createSocialTrade: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    respondSocialTrade: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    updateSocialTradeOffer: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    confirmSocialTrade: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    cancelSocialTrade: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    resumeSocialTrade: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    socialDisconnect: vi.fn().mockResolvedValue([]),
    invalidateSocialPair: vi.fn().mockResolvedValue([]),
    socialGraphBootstrap: vi.fn().mockResolvedValue({
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
    }),
    sendFriendRequest: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    respondFriendRequest: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    cancelFriendRequest: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    removeFriend: vi.fn().mockResolvedValue({ status: 'request_changed' }),
    createParty: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    sendPartyInvitation: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    respondPartyInvitation: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    cancelPartyInvitation: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    leaveParty: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    kickPartyMember: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    promotePartyLeader: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    disbandParty: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    startPartyReadyCheck: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    respondPartyReadyCheck: vi.fn().mockResolvedValue({ status: 'party_changed' }),
    socialGraphDisconnect: vi.fn().mockResolvedValue({ status: 'unchanged' }),
    invalidateSocialGraphPair: vi.fn().mockResolvedValue({ status: 'unchanged' }),
    cooperativeActivityBootstrap: vi.fn().mockResolvedValue({
      catalog: { generatedAt: '2026-07-15T00:00:00.000Z', activities: [] },
      preparation: null,
      instance: null,
    }),
    prepareCooperativeActivityEntry: vi.fn().mockResolvedValue({
      status: 'activity_unavailable',
    }),
    enterCooperativeActivity: vi.fn().mockResolvedValue({ status: 'not_ready' }),
    interactCooperativeActivity: vi.fn().mockResolvedValue({ status: 'not_participant' }),
    leaveCooperativeActivity: vi.fn().mockResolvedValue({ status: 'not_participant' }),
    cooperativeActivityDisconnect: vi.fn().mockResolvedValue({ status: 'unchanged' }),
    admitPrivateHome: vi.fn().mockResolvedValue('invalid_ticket'),
    privateHomeEvents: vi.fn().mockResolvedValue('no_changes'),
    revalidatePrivateHome: vi.fn().mockResolvedValue('active'),
    closePrivateHome: vi.fn().mockResolvedValue(true),
    admitHomeVisit: vi.fn().mockResolvedValue('invalid_ticket'),
    homeVisitEvents: vi.fn().mockResolvedValue('no_changes'),
    checkpointHomeVisit: vi.fn().mockResolvedValue('closed'),
    revalidateHomeVisit: vi.fn().mockResolvedValue('active'),
    closeHomeVisit: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function activeActivity(
  first: RealtimeAdmission,
  second: RealtimeAdmission,
): CooperativeActivityBootstrap {
  return {
    catalog: {
      generatedAt: '2026-07-15T00:00:00.000Z',
      activities: [
        {
          activity: MOONPETAL_HARVEST_HELP,
          availability: 'already_active',
          availableAt: null,
          rewardedCompletionsToday: 0,
          partyEligible: true,
          leader: true,
        },
      ],
    },
    preparation: null,
    instance: {
      instanceId: '8d0b0000-0000-4000-8000-000000000010',
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
          startedAt: '2026-07-15T00:00:00.000Z',
          completedAt: null,
          timerEndsAt: null,
        },
      ],
      participants: [first, second].map((participant) => ({
        presenceId: participant.presenceId,
        displayName: participant.displayName,
        level: participant.level,
        connectionStatus: 'online' as const,
        contribution: 0,
        rewardEligible: true,
        reconnectDeadline: null,
      })),
      objects: [
        {
          key: 'seed-bundle-1',
          interactionKey: 'activity-seed-bundle',
          label: 'Moonpetal seed bundle',
          objectType: 'supply',
          x: first.x,
          y: first.y,
          interactionRange: 2,
          active: true,
        },
      ],
      personalContribution: 0,
      temporaryItemCount: 0,
      startedAt: '2026-07-15T00:00:00.000Z',
      expiresAt: '2026-07-15T00:08:00.000Z',
      pausedAt: null,
      completedAt: null,
      resultCode: null,
      receipts: [],
      spawn: { x: first.x, y: first.y },
    },
  };
}

afterEach(async () => {
  for (const close of closeTasks.splice(0).reverse()) await close();
});

describe('real-time service foundation', () => {
  it('reports health and configured connection capacity', async () => {
    const realtime = buildRealtimeApp({
      config: {
        ...config,
        port: 4001,
        connectionLimit: 25,
      },
      logger: new SilentLogger(),
      persistence: persistence(),
    });
    closeTasks.push(async () => realtime.app.close());

    const health = await realtime.app.inject({ method: 'GET', url: '/health' });
    const readiness = await realtime.app.inject({ method: 'GET', url: '/ready' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      service: 'realtime-server',
      environment: 'test',
      status: 'ok',
    });
    expect(readiness.json()).toMatchObject({
      connections: { active: 0, limit: 25 },
    });
  });

  it('enforces the configured connection limit in the registry', () => {
    const registry = new ConnectionRegistry(1);
    const first = registry.register();

    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('Expected the first connection to be registered.');
    }
    expect(registry.register()).toBeUndefined();
    expect(registry.size).toBe(1);

    registry.release(first.connectionId);
    expect(registry.size).toBe(0);
  });

  it('requires an exact configured WebSocket origin', () => {
    const origins = new Set(['http://localhost:3001']);

    expect(isAllowedRealtimeOrigin('http://localhost:3001', origins)).toBe(true);
    expect(isAllowedRealtimeOrigin('https://untrusted.example', origins)).toBe(false);
    expect(isAllowedRealtimeOrigin(undefined, origins)).toBe(false);
  });

  it('starts on configured host and an ephemeral test port', async () => {
    const service = createRealtimeService({
      config: {
        ...config,
        connectionLimit: 10,
      },
      logger: new SilentLogger(),
      persistence: persistence(),
    });
    closeTasks.push(async () => service.stop());

    const address = await service.start();
    const response = await fetch(`${address}/health`);

    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(response.status).toBe(200);
  });

  it('admits a valid ticket, sends a snapshot, and rejects impossible movement', async () => {
    const manifest = getWorldManifest('lantern-square');
    if (manifest === undefined) throw new Error('Lantern Square fixture missing.');
    const gateway = persistence({
      admit: vi.fn().mockResolvedValue({
        status: 'admitted',
        sessionId: '10000000-0000-4000-8000-000000000001',
        presenceId: '20000000-0000-4000-8000-000000000001',
        displayName: 'Moss Friend',
        level: 1,
        appearancePreset: 'moss',
        worldId: 'lantern-square',
        worldVersionId: '30000000-0000-4000-8000-000000000001',
        manifest,
        channelId: '40000000-0000-4000-8000-000000000001',
        channelNumber: 1,
        x: manifest.spawn.x,
        y: manifest.spawn.y,
        facingDirection: 'south',
        channels: [
          {
            id: '40000000-0000-4000-8000-000000000001',
            worldId: 'lantern-square',
            number: 1,
            capacity: 40,
            population: 1,
            available: true,
          },
        ],
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(address.replace(/^http/u, 'ws') + '/connect', {
      origin: 'http://localhost:3001',
    });
    closeTasks.push(async () => socket.close());
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: 'a'.repeat(43) }));
    await vi.waitFor(() =>
      expect(messages.map((message) => message['type'])).toContain('snapshot'),
    );
    socket.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 1,
        x: manifest.spawn.x + 10,
        y: manifest.spawn.y,
        facingDirection: 'east',
        movementState: 'jogging',
      }),
    );
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'movement_rejected')).toBe(true),
    );
  });

  it('hydrates compact appearance and publishes a server-resolved update without resetting movement', async () => {
    let firstRevision = 1;
    const avatarProfile = vi.fn().mockImplementation(async (sessionId: string) => ({
      appearanceId:
        sessionId === admission(1).sessionId
          ? 'a0000000-0000-4000-8000-000000000001'
          : 'a0000000-0000-4000-8000-000000000002',
      appearanceRevision: sessionId === admission(1).sessionId ? firstRevision : 1,
    }));
    const gateway = persistence({
      admit: vi.fn().mockResolvedValueOnce(admission(1)).mockResolvedValueOnce(admission(2)),
      avatarProfile,
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const secondMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'a', firstMessages);
    const second = await connectAndAuthenticate(address, 'b', secondMessages);
    closeTasks.push(async () => first.close());
    closeTasks.push(async () => second.close());

    expect(
      (firstMessages.find((message) => message['type'] === 'admitted')?.['self'] as Record<
        string,
        unknown
      >) ?? {},
    ).toMatchObject({
      appearanceId: 'a0000000-0000-4000-8000-000000000001',
      appearanceRevision: 1,
      x: admission(1).x,
      y: admission(1).y,
      sequence: 0,
    });

    firstRevision = 2;
    first.send(JSON.stringify({ version: 1, type: 'appearance.refresh' }));
    await vi.waitFor(() =>
      expect(
        secondMessages.some(
          (message) =>
            message['type'] === 'appearance_updated' &&
            message['presenceId'] === admission(1).presenceId &&
            message['appearanceRevision'] === 2,
        ),
      ).toBe(true),
    );

    second.send(JSON.stringify({ version: 1, type: 'resync' }));
    await vi.waitFor(() => {
      const snapshots = secondMessages.filter((message) => message['type'] === 'snapshot');
      const latest = snapshots.at(-1)?.['presences'] as Array<Record<string, unknown>> | undefined;
      expect(
        latest?.find((presence) => presence['presenceId'] === admission(1).presenceId),
      ).toMatchObject({
        appearanceId: 'a0000000-0000-4000-8000-000000000001',
        appearanceRevision: 2,
        x: admission(1).x,
        y: admission(1).y,
        movementState: 'idle',
        sequence: 0,
      });
    });

    first.send(
      JSON.stringify({
        version: 1,
        type: 'appearance.refresh',
        appearanceId: 'a0000000-0000-4000-8000-000000000099',
      }),
    );
    await vi.waitFor(() =>
      expect(firstMessages.some((message) => message['code'] === 'INVALID_MESSAGE')).toBe(true),
    );
  });

  it('authorizes emotes server-side, broadcasts only to the current channel, and rejects unsafe input', async () => {
    const activation = {
      status: 'activated' as const,
      presenceId: admission(1).presenceId,
      channelId: admission(1).channelId,
      emoteKey: 'wave',
      activationId: '60000000-0000-4000-8000-000000000001',
      startedAt: 1_786_656_000_000,
      durationMs: 1_200,
    };
    const activateEmote = vi.fn().mockResolvedValue(activation);
    const gateway = persistence({
      admit: vi
        .fn()
        .mockResolvedValueOnce(admission(1))
        .mockResolvedValueOnce(admission(2))
        .mockResolvedValueOnce(admission(3, 2)),
      activateEmote,
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const secondMessages: Array<Record<string, unknown>> = [];
    const isolatedMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'a', firstMessages);
    const second = await connectAndAuthenticate(address, 'b', secondMessages);
    const isolated = await connectAndAuthenticate(address, 'c', isolatedMessages);
    closeTasks.push(async () => first.close());
    closeTasks.push(async () => second.close());
    closeTasks.push(async () => isolated.close());

    first.send(
      JSON.stringify({
        version: 1,
        type: 'emote.activate',
        requestId: 'emote-request-1',
        emoteKey: 'wave',
      }),
    );
    await vi.waitFor(() =>
      expect(
        secondMessages.some(
          (message) =>
            message['type'] === 'emote.activated' &&
            message['presenceId'] === admission(1).presenceId &&
            message['emoteKey'] === 'wave',
        ),
      ).toBe(true),
    );
    expect(firstMessages.some((message) => message['type'] === 'emote.activated')).toBe(true);
    expect(isolatedMessages.some((message) => message['type'] === 'emote.activated')).toBe(false);
    expect(activateEmote).toHaveBeenCalledWith(admission(1).sessionId, 'wave', 'emote-request-1');

    first.send(
      JSON.stringify({
        version: 1,
        type: 'emote.activate',
        requestId: 'emote-request-2',
        emoteKey: 'x'.repeat(81),
      }),
    );
    await vi.waitFor(() =>
      expect(firstMessages.some((message) => message['code'] === 'INVALID_MESSAGE')).toBe(true),
    );
    expect(activateEmote).toHaveBeenCalledTimes(1);
  });

  it('does not broadcast rejected or stale-channel emote activations', async () => {
    const gateway = persistence({
      admit: vi.fn().mockResolvedValue(admission(1)),
      activateEmote: vi
        .fn()
        .mockResolvedValueOnce({ status: 'not_owned' })
        .mockResolvedValueOnce({
          status: 'activated',
          presenceId: admission(1).presenceId,
          channelId: admission(1, 2).channelId,
          emoteKey: 'wave',
          activationId: '60000000-0000-4000-8000-000000000002',
          startedAt: 1_786_656_000_000,
          durationMs: 1_200,
        }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const messages: Array<Record<string, unknown>> = [];
    const socket = await connectAndAuthenticate(address, 'd', messages);
    closeTasks.push(async () => socket.close());

    for (const requestId of ['rejected-emote-1', 'rejected-emote-2']) {
      socket.send(
        JSON.stringify({ version: 1, type: 'emote.activate', requestId, emoteKey: 'wave' }),
      );
    }
    await vi.waitFor(() =>
      expect(messages.filter((message) => message['type'] === 'emote.rejected')).toHaveLength(2),
    );
    expect(messages.filter((message) => message['type'] === 'emote.activated')).toHaveLength(0);
    expect(
      messages
        .filter((message) => message['type'] === 'emote.rejected')
        .map((message) => message['reason']),
    ).toEqual(['not_owned', 'access_changed']);
  });

  it('denies an invalid or revoked admission before creating presence', async () => {
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: persistence(),
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(address.replace(/^http/u, 'ws') + '/connect', {
      origin: 'http://localhost:3001',
    });
    closeTasks.push(async () => socket.close());
    const error = new Promise<Record<string, unknown>>((resolve) => {
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message['type'] === 'error') resolve(message);
      });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: 'a'.repeat(43) }));
    await expect(error).resolves.toMatchObject({ code: 'INVALID_TICKET' });
  });

  it.each([
    ['access_revoked', 'ACCESS_REVOKED'],
    ['player_suspended', 'PLAYER_SUSPENDED'],
    ['rename_required', 'PLAYER_RENAME_REQUIRED'],
    ['maintenance', 'GAME_MAINTENANCE'],
    ['channel_full', 'CHANNEL_FULL'],
  ] as const)('maps %s admission denial to the safe %s code', async (denial, safeCode) => {
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: persistence({ admit: vi.fn().mockResolvedValue(denial) }),
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(address.replace(/^http/u, 'ws') + '/connect', {
      origin: 'http://localhost:3001',
    });
    closeTasks.push(async () => socket.close());
    const error = new Promise<Record<string, unknown>>((resolve) => {
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message['type'] === 'error') resolve(message);
      });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: 'b'.repeat(43) }));
    await expect(error).resolves.toMatchObject({ code: safeCode });
  });

  it('broadcasts movement and cleanup only within the admitted world channel', async () => {
    const gateway = persistence({
      admit: vi
        .fn()
        .mockResolvedValueOnce(admission(1, 1))
        .mockResolvedValueOnce(admission(2, 1))
        .mockResolvedValueOnce(admission(3, 2)),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const secondMessages: Array<Record<string, unknown>> = [];
    const isolatedMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'c', firstMessages);
    const second = await connectAndAuthenticate(address, 'd', secondMessages);
    const isolated = await connectAndAuthenticate(address, 'e', isolatedMessages);
    closeTasks.push(async () => first.close());
    closeTasks.push(async () => second.close());
    closeTasks.push(async () => isolated.close());

    await vi.waitFor(() =>
      expect(
        firstMessages.some(
          (message) =>
            message['type'] === 'presence_joined' &&
            (message['presence'] as { presenceId?: string } | undefined)?.presenceId ===
              admission(2).presenceId,
        ),
      ).toBe(true),
    );
    expect(
      firstMessages.some(
        (message) =>
          message['type'] === 'presence_joined' &&
          (message['presence'] as { presenceId?: string } | undefined)?.presenceId ===
            admission(3).presenceId,
      ),
    ).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 120));
    const manifest = getWorldManifest('lantern-square');
    if (manifest === undefined) throw new Error('Lantern Square fixture missing.');
    second.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 1,
        x: manifest.spawn.x + 0.1,
        y: manifest.spawn.y,
        facingDirection: 'northwest',
        movementState: 'idle',
      }),
    );
    await vi.waitFor(() =>
      expect(
        firstMessages.some(
          (message) =>
            message['type'] === 'presence_updated' &&
            (message['presence'] as { presenceId?: string } | undefined)?.presenceId ===
              admission(2).presenceId,
        ),
      ).toBe(true),
    );
    expect(
      firstMessages.find(
        (message) =>
          message['type'] === 'presence_updated' &&
          (message['presence'] as { presenceId?: string } | undefined)?.presenceId ===
            admission(2).presenceId,
      )?.['presence'],
    ).toMatchObject({
      presenceId: admission(2).presenceId,
      facingDirection: 'southeast',
      movementState: 'walking',
      sequence: 1,
    });

    second.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 2,
        x: manifest.spawn.x + 0.1,
        y: manifest.spawn.y,
        facingDirection: 'north',
        movementState: 'jogging',
      }),
    );
    await vi.waitFor(() =>
      expect(
        firstMessages.some(
          (message) =>
            message['type'] === 'presence_updated' &&
            (message['presence'] as { presenceId?: string; sequence?: number } | undefined)
              ?.presenceId === admission(2).presenceId &&
            (message['presence'] as { sequence?: number } | undefined)?.sequence === 2,
        ),
      ).toBe(true),
    );
    const stationaryPresence = firstMessages.find(
      (message) =>
        message['type'] === 'presence_updated' &&
        (message['presence'] as { presenceId?: string; sequence?: number } | undefined)
          ?.presenceId === admission(2).presenceId &&
        (message['presence'] as { sequence?: number } | undefined)?.sequence === 2,
    )?.['presence'];
    expect(stationaryPresence).toMatchObject({
      facingDirection: 'southeast',
      movementState: 'idle',
      sequence: 2,
    });

    second.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 1,
        x: manifest.spawn.x + 0.2,
        y: manifest.spawn.y,
        facingDirection: 'west',
        movementState: 'walking',
      }),
    );
    await vi.waitFor(() =>
      expect(
        secondMessages.some(
          (message) =>
            message['type'] === 'movement_rejected' &&
            message['reason'] === 'stale_sequence' &&
            (message['authoritative'] as { sequence?: number } | undefined)?.sequence === 2,
        ),
      ).toBe(true),
    );

    second.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 3,
        x: manifest.spawn.x + 0.1,
        y: manifest.spawn.y,
        facingDirection: 'administrator',
        movementState: 'flying',
      }),
    );
    await vi.waitFor(() =>
      expect(
        secondMessages.some(
          (message) => message['type'] === 'error' && message['code'] === 'INVALID_MESSAGE',
        ),
      ).toBe(true),
    );
    expect(
      firstMessages
        .filter(
          (message) =>
            message['type'] === 'presence_updated' &&
            (message['presence'] as { presenceId?: string } | undefined)?.presenceId ===
              admission(2).presenceId,
        )
        .map((message) => (message['presence'] as { sequence?: number }).sequence),
    ).toEqual([1, 2]);
    expect(isolatedMessages.some((message) => message['type'] === 'presence_updated')).toBe(false);
    expect(gateway.checkpoint).not.toHaveBeenCalled();

    second.close(1000, 'test disconnect');
    await vi.waitFor(() =>
      expect(
        firstMessages.some(
          (message) =>
            message['type'] === 'presence_left' &&
            message['presenceId'] === admission(2).presenceId,
        ),
      ).toBe(true),
    );
    await vi.waitFor(() => expect(gateway.checkpoint).toHaveBeenCalledTimes(1));
    expect(gateway.close).toHaveBeenCalledWith(
      admission(2).sessionId,
      'connection_lost',
      expect.any(String),
    );
  });

  it('checkpoints before a safe channel switch and clears the original channel', async () => {
    const gateway = persistence({
      admit: vi.fn().mockResolvedValue(admission(4, 1)),
      switchChannel: vi.fn().mockResolvedValue({
        status: 'switched',
        channelId: TEST_CHANNELS[1].id,
        channelNumber: 2,
        channels: [...TEST_CHANNELS],
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const messages: Array<Record<string, unknown>> = [];
    const socket = await connectAndAuthenticate(address, 'f', messages);
    closeTasks.push(async () => socket.close());
    socket.send(
      JSON.stringify({ version: 1, type: 'switch_channel', channelId: TEST_CHANNELS[1].id }),
    );
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'channel_changed')).toBe(true),
    );
    expect(gateway.checkpoint).toHaveBeenCalledTimes(1);
    expect(gateway.switchChannel).toHaveBeenCalledWith(
      admission(4).sessionId,
      TEST_CHANNELS[1].id,
      expect.any(String),
    );
    const readiness = await fetch(`${address}/ready`).then(async (response) => response.json());
    expect(readiness).toMatchObject({ connections: { admitted: 1 } });
  });

  it('persists and delivers channel chat once without leaking across channels', async () => {
    const acceptedMessage = {
      id: '50000000-0000-4000-8000-000000000001',
      sequence: 1,
      scope: 'channel' as const,
      senderPresenceId: admission(2).presenceId,
      senderDisplayName: admission(2).displayName,
      senderLevel: 1,
      worldId: 'lantern-square' as const,
      channelId: TEST_CHANNELS[0].id,
      sentAt: '2026-07-14T00:00:00.000Z',
      text: 'Hello from Channel 1',
      sourceCategory: 'player' as const,
    };
    const gateway = persistence({
      admit: vi
        .fn()
        .mockResolvedValueOnce(admission(1, 1))
        .mockResolvedValueOnce(admission(2, 1))
        .mockResolvedValueOnce(admission(3, 2)),
      acceptChat: vi
        .fn()
        .mockResolvedValueOnce({ status: 'accepted', message: acceptedMessage })
        .mockResolvedValueOnce({ status: 'replayed', message: acceptedMessage }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const secondMessages: Array<Record<string, unknown>> = [];
    const isolatedMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'i', firstMessages);
    const second = await connectAndAuthenticate(address, 'j', secondMessages);
    const isolated = await connectAndAuthenticate(address, 'k', isolatedMessages);
    closeTasks.push(async () => first.close());
    closeTasks.push(async () => second.close());
    closeTasks.push(async () => isolated.close());
    const payload = {
      version: 1,
      type: 'chat.send',
      requestId: 'chat-request-1',
      scope: 'channel',
      text: acceptedMessage.text,
    };
    second.send(JSON.stringify(payload));
    await vi.waitFor(() =>
      expect(firstMessages.filter((message) => message['type'] === 'chat.message')).toHaveLength(1),
    );
    expect(secondMessages.filter((message) => message['type'] === 'chat.message')).toHaveLength(1);
    expect(isolatedMessages.some((message) => message['type'] === 'chat.message')).toBe(false);
    second.send(JSON.stringify(payload));
    await vi.waitFor(() =>
      expect(secondMessages.filter((message) => message['type'] === 'chat.message')).toHaveLength(
        2,
      ),
    );
    expect(firstMessages.filter((message) => message['type'] === 'chat.message')).toHaveLength(1);
  });

  it('never replays messages that were persisted while the player was offline', async () => {
    const offlineMessage = {
      id: '50000000-0000-4000-8000-000000000009',
      sequence: 9,
      scope: 'channel' as const,
      senderPresenceId: admission(12).presenceId,
      senderDisplayName: admission(12).displayName,
      senderLevel: 1,
      worldId: 'lantern-square' as const,
      channelId: TEST_CHANNELS[0].id,
      sentAt: '2026-07-14T00:00:00.000Z',
      text: 'This was sent before the current live session.',
      sourceCategory: 'player' as const,
    };
    const gateway = persistence({
      admit: vi.fn().mockResolvedValue(admission(12, 1)),
      chatBootstrap: vi.fn().mockResolvedValue({
        histories: [
          { scope: 'nearby', messages: [], hasMore: false },
          { scope: 'channel', messages: [offlineMessage], hasMore: false },
          { scope: 'system', messages: [], hasMore: false },
        ],
        preferences: [],
        mutedUntil: null,
      }),
      chatHistory: vi.fn().mockResolvedValue({
        scope: 'channel',
        messages: [offlineMessage],
        hasMore: false,
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const messages: Array<Record<string, unknown>> = [];
    const socket = await connectAndAuthenticate(address, 'q', messages);
    closeTasks.push(async () => socket.close());

    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'chat.bootstrap')).toBe(true),
    );
    const bootstrap = messages.find((message) => message['type'] === 'chat.bootstrap');
    const histories = (bootstrap?.['chat'] as { histories?: Array<{ messages?: unknown[] }> })
      .histories;
    expect(histories?.every((history) => history.messages?.length === 0)).toBe(true);

    socket.send(
      JSON.stringify({
        version: 1,
        type: 'chat.history.request',
        scope: 'channel',
        afterSequence: 0,
      }),
    );
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'chat.history')).toBe(true),
    );
    const history = messages.find((message) => message['type'] === 'chat.history');
    expect(history?.['history']).toEqual({ scope: 'channel', messages: [], hasMore: false });
    expect(gateway.chatHistory).not.toHaveBeenCalled();
  });

  it('applies recipient mute preferences and enforces chat mutes on send', async () => {
    const gateway = persistence({
      admit: vi.fn().mockResolvedValueOnce(admission(7, 1)).mockResolvedValueOnce(admission(8, 1)),
      chatBootstrap: vi
        .fn()
        .mockResolvedValueOnce({
          histories: [
            { scope: 'nearby', messages: [], hasMore: false },
            { scope: 'channel', messages: [], hasMore: false },
            { scope: 'system', messages: [], hasMore: false },
          ],
          preferences: [{ targetPresenceId: admission(8).presenceId, muted: true, blocked: false }],
          mutedUntil: null,
        })
        .mockResolvedValueOnce({
          histories: [
            { scope: 'nearby', messages: [], hasMore: false },
            { scope: 'channel', messages: [], hasMore: false },
            { scope: 'system', messages: [], hasMore: false },
          ],
          preferences: [],
          mutedUntil: '2026-07-15T01:00:00.000Z',
        }),
      acceptChat: vi.fn().mockResolvedValue({
        status: 'chat_muted',
        mutedUntil: '2026-07-15T01:00:00.000Z',
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const mutedMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'l', firstMessages);
    const muted = await connectAndAuthenticate(address, 'm', mutedMessages);
    closeTasks.push(async () => first.close());
    closeTasks.push(async () => muted.close());
    muted.send(
      JSON.stringify({
        version: 1,
        type: 'chat.send',
        requestId: 'chat-muted-1',
        scope: 'channel',
        text: 'This is blocked by the active chat mute.',
      }),
    );
    await vi.waitFor(() =>
      expect(
        mutedMessages.some(
          (message) =>
            message['type'] === 'chat.message_rejected' && message['reason'] === 'chat_muted',
        ),
      ).toBe(true),
    );
    expect(firstMessages.some((message) => message['type'] === 'chat.message')).toBe(false);
    expect(mutedMessages.some((message) => message['type'] === 'chat.moderation_notice')).toBe(
      true,
    );
  });

  it('routes player preference and immutable-evidence report requests through persistence', async () => {
    const gateway = persistence({ admit: vi.fn().mockResolvedValue(admission(9, 1)) });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const messages: Array<Record<string, unknown>> = [];
    const socket = await connectAndAuthenticate(address, 'n', messages);
    closeTasks.push(async () => socket.close());
    const targetPresenceId = admission(10).presenceId;
    socket.send(JSON.stringify({ version: 1, type: 'chat.block_player', targetPresenceId }));
    await vi.waitFor(() => expect(gateway.updateChatPreference).toHaveBeenCalled());
    socket.send(
      JSON.stringify({
        version: 1,
        type: 'chat.report',
        requestId: 'report-1',
        messageId: '50000000-0000-4000-8000-000000000001',
        category: 'spam',
        reason: 'Repeated unsolicited messages.',
      }),
    );
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'chat.report_received')).toBe(true),
    );
    expect(gateway.reportChat).toHaveBeenCalledWith(
      admission(9).sessionId,
      '50000000-0000-4000-8000-000000000001',
      'spam',
      'Repeated unsolicited messages.',
      'report-1',
    );
    expect(gateway.invalidateSocialPair).toHaveBeenCalledWith(
      admission(9).sessionId,
      targetPresenceId,
      expect.any(String),
    );
    expect(gateway.invalidateSocialGraphPair).toHaveBeenCalledWith(
      admission(9).sessionId,
      targetPresenceId,
      expect.any(String),
    );
  });

  it('checkpoints nearby players and routes inspect and gift intent without trusting identity', async () => {
    const sender = admission(11, 1);
    const target = admission(12, 1);
    const interaction = {
      id: '60000000-0000-4000-8000-000000000001',
      kind: 'gift' as const,
      status: 'pending' as const,
      sender: { presenceId: sender.presenceId, displayName: sender.displayName },
      target: { presenceId: target.presenceId, displayName: target.displayName },
      item: {
        itemSlug: 'moonbean-seed',
        quantity: 1,
        name: 'Moonbean Seed',
        category: 'seed' as const,
        assetRef: 'item-moonbean-seed',
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2026-07-14T00:01:30.000Z',
    };
    const gateway = persistence({
      admit: vi.fn().mockResolvedValueOnce(sender).mockResolvedValueOnce(target),
      inspectSocialPlayer: vi.fn().mockResolvedValue({
        status: 'ok',
        profile: {
          presenceId: target.presenceId,
          displayName: target.displayName,
          level: 1,
          appearancePreset: 'moss',
          worldId: 'lantern-square',
          worldName: 'Lantern Square',
          channelNumber: 1,
        },
      }),
      createSocialGift: vi.fn().mockResolvedValue({
        status: 'created',
        interaction,
        senderPresenceId: sender.presenceId,
        targetPresenceId: target.presenceId,
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const senderMessages: Array<Record<string, unknown>> = [];
    const targetMessages: Array<Record<string, unknown>> = [];
    const senderSocket = await connectAndAuthenticate(address, 'o', senderMessages);
    const targetSocket = await connectAndAuthenticate(address, 'p', targetMessages);
    closeTasks.push(async () => senderSocket.close());
    closeTasks.push(async () => targetSocket.close());

    senderSocket.send(
      JSON.stringify({
        version: 1,
        type: 'social.inspect.request',
        requestId: 'inspect-1',
        targetPresenceId: target.presenceId,
      }),
    );
    await vi.waitFor(() =>
      expect(senderMessages.some((message) => message['type'] === 'social.inspect.result')).toBe(
        true,
      ),
    );
    senderSocket.send(
      JSON.stringify({
        version: 1,
        type: 'social.gift.create',
        requestId: 'gift-1',
        targetPresenceId: target.presenceId,
        itemSlug: 'moonbean-seed',
        quantity: 1,
      }),
    );
    await vi.waitFor(() =>
      expect(targetMessages.some((message) => message['type'] === 'social.request.received')).toBe(
        true,
      ),
    );
    expect(gateway.createSocialGift).toHaveBeenCalledWith(
      sender.sessionId,
      target.presenceId,
      'moonbean-seed',
      1,
      'gift-1',
    );
    expect(gateway.checkpoint).toHaveBeenCalledWith(sender.sessionId, expect.any(Object));
    expect(gateway.checkpoint).toHaveBeenCalledWith(target.sessionId, expect.any(Object));
  });

  it('rejects an out-of-range social target before persistence with a safe distance error', async () => {
    const sender = admission(13, 1);
    const target = { ...admission(14, 1), x: sender.x + 4 };
    const gateway = persistence({
      admit: vi.fn().mockResolvedValueOnce(sender).mockResolvedValueOnce(target),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const senderMessages: Array<Record<string, unknown>> = [];
    const targetMessages: Array<Record<string, unknown>> = [];
    const senderSocket = await connectAndAuthenticate(address, 'q', senderMessages);
    const targetSocket = await connectAndAuthenticate(address, 'r', targetMessages);
    closeTasks.push(async () => senderSocket.close());
    closeTasks.push(async () => targetSocket.close());

    senderSocket.send(
      JSON.stringify({
        version: 1,
        type: 'social.inspect.request',
        requestId: 'inspect-far',
        targetPresenceId: target.presenceId,
      }),
    );

    await vi.waitFor(() =>
      expect(senderMessages).toContainEqual(
        expect.objectContaining({
          type: 'social.interaction.error',
          requestId: 'inspect-far',
          code: 'too_far_away',
        }),
      ),
    );
    expect(gateway.inspectSocialPlayer).not.toHaveBeenCalled();
  });

  it('routes friend intent through persistence and notifies the authenticated target once', async () => {
    const sender = admission(15, 1);
    const target = admission(16, 1);
    const friendRequest = {
      id: '85000000-0000-4000-8000-000000000001',
      status: 'pending' as const,
      sender: {
        presenceId: sender.presenceId,
        displayName: sender.displayName,
        level: sender.level,
        appearancePreset: sender.appearancePreset,
      },
      target: {
        presenceId: target.presenceId,
        displayName: target.displayName,
        level: target.level,
        appearancePreset: target.appearancePreset,
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2026-07-21T00:00:00.000Z',
    };
    const gateway = persistence({
      admit: vi.fn().mockResolvedValueOnce(sender).mockResolvedValueOnce(target),
      sendFriendRequest: vi.fn().mockResolvedValue({
        status: 'created',
        friendRequest,
        affectedPresenceIds: [sender.presenceId, target.presenceId],
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const senderMessages: Array<Record<string, unknown>> = [];
    const targetMessages: Array<Record<string, unknown>> = [];
    const senderSocket = await connectAndAuthenticate(address, 's', senderMessages);
    const targetSocket = await connectAndAuthenticate(address, 't', targetMessages);
    closeTasks.push(async () => senderSocket.close());
    closeTasks.push(async () => targetSocket.close());

    senderSocket.send(
      JSON.stringify({
        version: 1,
        type: 'friends.request.send',
        requestId: 'friend-request-1',
        targetPresenceId: target.presenceId,
      }),
    );

    await vi.waitFor(() =>
      expect(
        targetMessages.filter((message) => message['type'] === 'friends.request.received'),
      ).toHaveLength(1),
    );
    expect(gateway.sendFriendRequest).toHaveBeenCalledWith(
      sender.sessionId,
      target.presenceId,
      'friend-request-1',
    );
    expect(targetMessages).not.toContainEqual(
      expect.objectContaining({ walletAddress: expect.anything() }),
    );
  });

  it('isolates activity movement and routes interaction intent with authenticated position', async () => {
    const first = admission(21, 1);
    const second = admission(22, 1);
    const publicPlayer = admission(23, 1);
    const activity = activeActivity(first, second);
    const emptyActivity: CooperativeActivityBootstrap = {
      catalog: { generatedAt: '2026-07-15T00:00:00.000Z', activities: [] },
      preparation: null,
      instance: null,
    };
    const gateway = persistence({
      admit: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
        .mockResolvedValueOnce(publicPlayer),
      cooperativeActivityBootstrap: vi.fn(async (sessionId: string) =>
        sessionId === publicPlayer.sessionId ? emptyActivity : activity,
      ),
      interactCooperativeActivity: vi.fn().mockResolvedValue({
        status: 'progressed',
        affectedPresenceIds: [first.presenceId, second.presenceId],
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const secondMessages: Array<Record<string, unknown>> = [];
    const publicMessages: Array<Record<string, unknown>> = [];
    const firstSocket = await connectAndAuthenticate(address, 'u', firstMessages);
    const secondSocket = await connectAndAuthenticate(address, 'v', secondMessages);
    const publicSocket = await connectAndAuthenticate(address, 'w', publicMessages);
    closeTasks.push(async () => firstSocket.close());
    closeTasks.push(async () => secondSocket.close());
    closeTasks.push(async () => publicSocket.close());

    await new Promise((resolve) => setTimeout(resolve, 120));
    firstSocket.send(
      JSON.stringify({
        version: 1,
        type: 'movement',
        sequence: 1,
        x: first.x + 0.1,
        y: first.y,
        facingDirection: 'east',
        movementState: 'walking',
      }),
    );
    await vi.waitFor(() =>
      expect(secondMessages).toContainEqual(
        expect.objectContaining({
          type: 'presence_updated',
          presence: expect.objectContaining({ presenceId: first.presenceId }),
        }),
      ),
    );
    expect(publicMessages).not.toContainEqual(
      expect.objectContaining({
        type: 'presence_updated',
        presence: expect.objectContaining({ presenceId: first.presenceId }),
      }),
    );

    firstSocket.send(
      JSON.stringify({
        version: 1,
        type: 'activity.interact',
        requestId: 'activity-interact-1',
        intent: {
          instanceId: activity.instance?.instanceId,
          expectedRevision: 1,
          objectiveKey: 'gather-seed-bundles',
          objectKey: 'seed-bundle-1',
        },
      }),
    );
    await vi.waitFor(() => expect(gateway.interactCooperativeActivity).toHaveBeenCalled());
    expect(gateway.interactCooperativeActivity).toHaveBeenCalledWith(
      first.sessionId,
      activity.instance?.instanceId,
      1,
      'gather-seed-bundles',
      'seed-bundle-1',
      { x: first.x + 0.1, y: first.y },
      'activity-interact-1',
    );
    await vi.waitFor(() =>
      expect(
        secondMessages.filter((message) => message['type'] === 'activity.bootstrap').length,
      ).toBeGreaterThan(1),
    );
    expect(
      publicMessages.filter((message) => message['type'] === 'activity.bootstrap'),
    ).toHaveLength(1);
  });

  it('replaces duplicate presence and disconnects a suspended admitted session', async () => {
    const gateway = persistence({
      admit: vi
        .fn()
        .mockResolvedValueOnce(admission(5, 1, 5))
        .mockResolvedValueOnce(admission(6, 1, 5)),
      revalidate: vi.fn().mockResolvedValue('player_suspended'),
    });
    const service = createRealtimeService({
      config: { ...config, revalidationIntervalMs: 1 },
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const firstMessages: Array<Record<string, unknown>> = [];
    const replacementMessages: Array<Record<string, unknown>> = [];
    const first = await connectAndAuthenticate(address, 'g', firstMessages);
    closeTasks.push(async () => first.close());
    const replacedClose = new Promise<number>((resolve) => first.once('close', resolve));
    const replacement = await connectAndAuthenticate(address, 'h', replacementMessages);
    closeTasks.push(async () => replacement.close());
    await expect(replacedClose).resolves.toBe(4001);
    await vi.waitFor(
      () =>
        expect(
          replacementMessages.some(
            (message) => message['type'] === 'error' && message['code'] === 'PLAYER_SUSPENDED',
          ),
        ).toBe(true),
      { timeout: 2_500 },
    );
    await vi.waitFor(() =>
      expect(gateway.close).toHaveBeenCalledWith(
        admission(6, 1, 5).sessionId,
        'player_suspended',
        expect.any(String),
      ),
    );
    const readiness = await fetch(`${address}/ready`).then(async (response) => response.json());
    expect(readiness).toMatchObject({ connections: { admitted: 0 } });
  });

  it('authorizes the private-home socket separately and fails closed for an invalid ticket', async () => {
    const gateway = persistence({ admitPrivateHome: vi.fn().mockResolvedValue('invalid_ticket') });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(`${address.replace('http', 'ws')}/private-home`, {
      headers: { origin: config.allowedOrigins[0] },
    });
    closeTasks.push(async () => socket.close());
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: 'p'.repeat(43) }));
    await vi.waitFor(() =>
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'error', code: 'INVALID_TICKET' }),
      ),
    );
    expect(gateway.admit).not.toHaveBeenCalled();
    expect(gateway.admitPrivateHome).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/u),
      expect.any(String),
      expect.any(String),
    );
  });

  it('fails closed on an unauthorized isolated home-visit channel', async () => {
    const gateway = persistence({ admitHomeVisit: vi.fn().mockResolvedValue('invalid_ticket') });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(`${address.replace('http', 'ws')}/home-visit`, {
      headers: { origin: config.allowedOrigins[0] },
    });
    closeTasks.push(async () => socket.close());
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'authenticate', ticket: 'v'.repeat(43) }));
    await vi.waitFor(() =>
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'error', code: 'INVALID_TICKET' }),
      ),
    );
    expect(gateway.admit).not.toHaveBeenCalled();
    expect(gateway.admitPrivateHome).not.toHaveBeenCalled();
    expect(gateway.admitHomeVisit).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/u),
      expect.any(String),
      expect.any(String),
    );
  });

  it('admits a participant, checkpoints movement, and returns home-isolated snapshots', async () => {
    const participant = homeVisitGameTestFixture.participants[1];
    const session = homeVisitGameTestFixture.hostSession;
    const home = homeVisitGameTestFixture.ownedHome;
    if (participant === undefined || session === null || home === null)
      throw new Error('Phase 11F fixture incomplete');
    const movedParticipant = {
      ...participant,
      x: 4,
      y: 3,
      movementSequence: '1',
      stateVersion: participant.stateVersion + 1,
    };
    const gateway = persistence({
      admitHomeVisit: vi.fn().mockResolvedValue({
        status: 'admitted',
        realtimeSessionId: 'f1100000-0000-4000-8000-000000000301',
        visitSessionId: session.id,
        participantId: participant.id,
        homeId: home.id,
        lastEventNumber: '0',
        snapshot: { session, participants: homeVisitGameTestFixture.participants },
      }),
      checkpointHomeVisit: vi
        .fn()
        .mockResolvedValue({ status: 'checkpointed', participant: movedParticipant }),
      homeVisitEvents: vi.fn().mockResolvedValue({
        lastEventNumber: '1',
        events: [{ eventNumber: '1', eventKey: 'home_visitor_moved' }],
        snapshot: { session, participants: [movedParticipant] },
      }),
    });
    const service = createRealtimeService({
      config,
      logger: new SilentLogger(),
      persistence: gateway,
    });
    closeTasks.push(async () => service.stop());
    const address = await service.start();
    const socket = new WebSocket(`${address.replace('http', 'ws')}/home-visit`, {
      headers: { origin: config.allowedOrigins[0] },
    });
    closeTasks.push(async () => socket.close());
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'authenticate', ticket: 'w'.repeat(43) }));
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'authenticated')).toBe(true),
    );
    socket.send(
      JSON.stringify({ type: 'movement', x: 4, y: 3, facingDirection: 'east', sequence: 1 }),
    );
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'movement_ack')).toBe(true),
    );
    socket.send(JSON.stringify({ type: 'sync', afterEventNumber: '0', forceSnapshot: true }));
    await vi.waitFor(() =>
      expect(messages.some((message) => message['type'] === 'snapshot')).toBe(true),
    );
    expect(gateway.checkpointHomeVisit).toHaveBeenCalledWith(
      'f1100000-0000-4000-8000-000000000301',
      expect.objectContaining({ sequence: 1, x: 4, y: 3, facingDirection: 'east' }),
    );
    expect(gateway.homeVisitEvents).toHaveBeenCalledWith(
      'f1100000-0000-4000-8000-000000000301',
      '0',
      true,
    );
  });
});
