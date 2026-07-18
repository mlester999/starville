import { describe, expect, it } from 'vitest';

import { getWorldManifest } from '@starville/game-content';

import {
  adminRealtimeOverviewSchema,
  adminChatReportActionSchema,
  chatMessageSchema,
  normalizeChatText,
  parseRealtimeClientMessage,
  PresenceInterpolationBuffer,
  publicPresenceSchema,
  publicPlayerInspectSchema,
  realtimeClientMessageSchema,
  realtimeServerMessageSchema,
  socialGraphBootstrapSchema,
  partySnapshotSchema,
  socialDistance,
  type PublicPresence,
} from '../src/index.js';
import {
  ActivityRateAuthority,
  ChannelAuthority,
  SocialGraphRateAuthority,
  SocialRateAuthority,
  validateAuthoritativeMovement,
} from '../src/server.js';
import { ChatRateAuthority, chatRecipients } from '../src/chat-authority.js';

const channel = {
  id: '10000000-0000-4000-8000-000000000001',
  worldId: 'lantern-square' as const,
  number: 1,
  capacity: 2,
  population: 0,
  available: true,
};

function presence(id: string, sequence = 0): PublicPresence {
  return publicPresenceSchema.parse({
    presenceId: id,
    displayName: 'Moss Friend',
    level: 1,
    worldId: 'lantern-square',
    worldVersionId: '20000000-0000-4000-8000-000000000001',
    channelId: channel.id,
    channelNumber: 1,
    x: 12,
    y: 7.5,
    facingDirection: 'south',
    movementState: 'idle',
    appearancePreset: 'moss',
    sequence,
    connected: true,
  });
}

describe('realtime protocol', () => {
  it('rejects unknown, oversized, and private client fields', () => {
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'movement',
        sequence: 1,
        x: 12,
        y: 7,
        facingDirection: 'south',
        movementState: 'walking',
        walletAddress: 'private',
      }).success,
    ).toBe(false);
    expect(parseRealtimeClientMessage('{not-json')).toBeUndefined();
    expect(parseRealtimeClientMessage(' '.repeat(16 * 1024 + 1))).toBeUndefined();
  });

  it('accepts only compact server-resolved appearance refresh messages', () => {
    expect(
      realtimeClientMessageSchema.safeParse({ version: 1, type: 'appearance.refresh' }).success,
    ).toBe(true);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'appearance.refresh',
        appearanceId: '10000000-0000-4000-8000-000000000010',
      }).success,
    ).toBe(false);
    expect(
      realtimeServerMessageSchema.safeParse({
        version: 1,
        serverTime: 1,
        type: 'appearance_updated',
        presenceId: '10000000-0000-4000-8000-000000000010',
        appearanceId: '20000000-0000-4000-8000-000000000010',
        appearanceRevision: 3,
      }).success,
    ).toBe(true);
    expect(
      realtimeServerMessageSchema.safeParse({
        version: 1,
        serverTime: 1,
        type: 'appearance_updated',
        presenceId: '10000000-0000-4000-8000-000000000010',
        appearanceId: '20000000-0000-4000-8000-000000000010',
        appearanceRevision: 3,
        assetUrl: 'https://evil.invalid/avatar.webp',
      }).success,
    ).toBe(false);
  });

  it('rejects private data from administrator population visibility', () => {
    expect(
      adminRealtimeOverviewSchema.safeParse({
        generatedAt: '2026-07-14T00:00:00.000Z',
        activeSessions: 1,
        staleSessions: 0,
        reconnectingSessions: 0,
        maintenanceActive: false,
        populations: [],
        recentDisconnects: [],
        walletAddress: 'private',
      }).success,
    ).toBe(false);
  });

  it('interpolates in order and rejects stale snapshots', () => {
    const buffer = new PresenceInterpolationBuffer(100, 80);
    expect(buffer.push(presence('10000000-0000-4000-8000-000000000010', 1), 1_000)).toBe(true);
    expect(
      buffer.push({ ...presence('10000000-0000-4000-8000-000000000010', 2), x: 14 }, 1_200),
    ).toBe(true);
    expect(buffer.push(presence('10000000-0000-4000-8000-000000000010', 1), 1_300)).toBe(false);
    expect(buffer.sample(1_200)?.x).toBeCloseTo(13);
  });

  it('strictly parses bounded player chat without accepting identity or system spoofing', () => {
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'chat.send',
        requestId: 'chat-1',
        scope: 'channel',
        text: 'Hello, neighbors!',
      }).success,
    ).toBe(true);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'chat.send',
        requestId: 'chat-1',
        scope: 'system',
        text: 'Maintenance now',
      }).success,
    ).toBe(false);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'chat.send',
        requestId: 'chat-1',
        scope: 'channel',
        text: 'Hello',
        senderPresenceId: '10000000-0000-4000-8000-000000000010',
      }).success,
    ).toBe(false);
  });

  it('normalizes plain text and rejects empty, control, HTML, unsafe URL, and impersonation text', () => {
    expect(normalizeChatText('  Cozy\t hello\r\nneighbor  ')).toEqual({
      accepted: true,
      text: 'Cozy hello\nneighbor',
    });
    for (const text of [
      '',
      '   ',
      'hello\u0000',
      '<script>alert(1)</script>',
      'javascript:alert(1)',
      'System: restart now',
      'noooooooooooooooo',
      '\ud800',
    ]) {
      expect(normalizeChatText(text).accepted).toBe(false);
    }
    expect(normalizeChatText('🌟'.repeat(401)).accepted).toBe(false);
  });

  it('requires bounded, revision-safe moderation actions', () => {
    expect(
      adminChatReportActionSchema.safeParse({
        action: 'chat_mute',
        reason: 'Repeated abusive messages in nearby chat.',
        expectedRevision: 1,
        requestId: 'moderation-1',
        muteDurationMinutes: 60,
      }).success,
    ).toBe(true);
    expect(
      adminChatReportActionSchema.safeParse({
        action: 'dismiss',
        reason: 'A sufficiently clear dismissal reason.',
        expectedRevision: 1,
        requestId: 'moderation-2',
        muteDurationMinutes: 60,
      }).success,
    ).toBe(false);
  });

  it('accepts only safe public chat message fields', () => {
    expect(
      chatMessageSchema.safeParse({
        id: '30000000-0000-4000-8000-000000000001',
        sequence: 1,
        scope: 'channel',
        senderPresenceId: '10000000-0000-4000-8000-000000000010',
        senderDisplayName: 'Moss Friend',
        senderLevel: 1,
        worldId: 'lantern-square',
        channelId: channel.id,
        sentAt: '2026-07-14T00:00:00.000Z',
        text: 'Hello!',
        sourceCategory: 'player',
        walletAddress: 'private',
      }).success,
    ).toBe(false);
  });

  it('accepts only strict client-authored social intent', () => {
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'social.inspect.request',
        requestId: 'inspect-1',
        targetPresenceId: '10000000-0000-4000-8000-000000000011',
      }).success,
    ).toBe(true);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'social.gift.create',
        requestId: 'gift-1',
        targetPresenceId: '10000000-0000-4000-8000-000000000011',
        itemSlug: 'turnip-seed',
        quantity: 1,
        senderPresenceId: '10000000-0000-4000-8000-000000000010',
      }).success,
    ).toBe(false);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'social.trade.offer.update',
        requestId: 'trade-1',
        interactionId: '30000000-0000-4000-8000-000000000001',
        expectedRevision: 1,
        items: [
          { itemSlug: 'turnip-seed', quantity: 1 },
          { itemSlug: 'turnip-seed', quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps inspected profiles public-safe and computes logical-world distance', () => {
    expect(
      publicPlayerInspectSchema.safeParse({
        presenceId: '10000000-0000-4000-8000-000000000011',
        displayName: 'Moss Friend',
        level: 7,
        appearancePreset: 'moss',
        worldId: 'lantern-square',
        worldName: 'Lantern Square',
        channelNumber: 1,
        walletAddress: 'must-not-leak',
      }).success,
    ).toBe(false);
    expect(socialDistance({ x: 2, y: 2 }, { x: 5, y: 6 })).toBe(5);
  });
});

describe('social authority', () => {
  it('applies independent bounded action limits and clears disconnected players', () => {
    const authority = new SocialRateAuthority({
      inspectPerMinute: 2,
      requestsPerMinute: 1,
      responsesPerMinute: 1,
      offersPerMinute: 1,
      confirmationsPerMinute: 1,
      cancellationsPerMinute: 1,
    });
    expect(authority.allow('player', 'inspect', 1_000)).toBe(true);
    expect(authority.allow('player', 'inspect', 2_000)).toBe(true);
    expect(authority.allow('player', 'inspect', 3_000)).toBe(false);
    expect(authority.allow('player', 'request', 3_000)).toBe(true);
    expect(authority.allow('player', 'request', 4_000)).toBe(false);
    authority.clear('player');
    expect(authority.allow('player', 'request', 4_000)).toBe(true);
  });
});

describe('friends and party authority', () => {
  it('accepts only strict client intent and privacy-safe graph snapshots', () => {
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'friends.request.send',
        requestId: 'friend-1',
        targetPresenceId: '10000000-0000-4000-8000-000000000011',
      }).success,
    ).toBe(true);
    expect(
      realtimeClientMessageSchema.safeParse({
        version: 1,
        type: 'party.invite.send',
        requestId: 'party-1',
        targetPresenceId: '10000000-0000-4000-8000-000000000011',
        expectedRevision: 2,
        leaderPresenceId: '10000000-0000-4000-8000-000000000010',
      }).success,
    ).toBe(false);
    expect(
      socialGraphBootstrapSchema.safeParse({
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
        walletAddress: 'private',
      }).success,
    ).toBe(false);
  });

  it('requires exactly one authoritative leader in every active party snapshot', () => {
    const member = {
      presenceId: '10000000-0000-4000-8000-000000000010',
      displayName: 'Moss Friend',
      level: 1,
      appearancePreset: 'moss' as const,
      role: 'member' as const,
      connectionStatus: 'online' as const,
      worldId: 'lantern-square' as const,
      worldName: 'Lantern Square',
      channelNumber: 1,
      readyState: 'waiting' as const,
      joinedAt: '2026-07-14T00:00:00.000Z',
    };
    expect(
      partySnapshotSchema.safeParse({
        partyId: '30000000-0000-4000-8000-000000000001',
        revision: 1,
        status: 'active',
        capacity: 4,
        leaderPresenceId: member.presenceId,
        members: [member],
        pendingInvitationCount: 0,
        readyCheck: null,
        leaderReconnectDeadline: null,
      }).success,
    ).toBe(false);
  });

  it('rate-limits independent graph actions and clears disconnected players', () => {
    const authority = new SocialGraphRateAuthority({
      friendRequestsPerMinute: 1,
      friendResponsesPerMinute: 1,
      friendRemovalsPerMinute: 1,
      partyCreationsPerHour: 1,
      partyInvitationsPerMinute: 1,
      partyResponsesPerMinute: 1,
      partyMembershipActionsPerMinute: 1,
      readyChecksPerMinute: 1,
      readyResponsesPerMinute: 1,
    });
    expect(authority.allow('player', 'friend_request', 1_000)).toBe(true);
    expect(authority.allow('player', 'friend_request', 2_000)).toBe(false);
    expect(authority.allow('player', 'party_invite', 2_000)).toBe(true);
    authority.clear('player');
    expect(authority.allow('player', 'friend_request', 2_000)).toBe(true);
  });
});

describe('cooperative activity authority', () => {
  it('accepts only strict bounded activity intent and rejects client-authored progress', () => {
    const valid = {
      version: 1,
      type: 'activity.interact',
      requestId: 'activity-interact-1',
      intent: {
        instanceId: '8d0b0000-0000-4000-8000-000000000010',
        expectedRevision: 3,
        objectiveKey: 'gather-seed-bundles',
        objectKey: 'seed-bundle-1',
      },
    } as const;
    expect(realtimeClientMessageSchema.safeParse(valid).success).toBe(true);
    expect(
      realtimeClientMessageSchema.safeParse({
        ...valid,
        intent: {
          ...valid.intent,
          progress: 100,
          playerPresenceId: presence('10000000-0000-4000-8000-000000000010').presenceId,
        },
      }).success,
    ).toBe(false);
    expect(
      realtimeServerMessageSchema.safeParse({
        version: 1,
        serverTime: 1,
        type: 'activity.error',
        requestId: 'activity-interact-1',
        code: 'out_of_range',
        databaseId: 'private',
      }).success,
    ).toBe(false);
  });

  it('bounds catalog, entry, interaction, and leave independently and clears reconnect state', () => {
    const authority = new ActivityRateAuthority();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(authority.allow('player', 'catalog', 1_000)).toBe(true);
    }
    expect(authority.allow('player', 'catalog', 1_000)).toBe(false);
    expect(authority.allow('player', 'interact', 1_000)).toBe(true);
    expect(authority.allow('player', 'leave', 1_000)).toBe(true);
    authority.clear('player');
    expect(authority.allow('player', 'catalog', 1_000)).toBe(true);
  });
});

describe('chat authority', () => {
  it('isolates nearby delivery by authoritative world, channel, and distance', () => {
    const sender = presence('10000000-0000-4000-8000-000000000010');
    const near = { ...presence('10000000-0000-4000-8000-000000000011'), x: 18 };
    const far = { ...presence('10000000-0000-4000-8000-000000000012'), x: 24 };
    const otherChannel = {
      ...presence('10000000-0000-4000-8000-000000000013'),
      channelId: '10000000-0000-4000-8000-000000000002',
    };
    expect(chatRecipients('nearby', sender, [sender, near, far, otherChannel])).toEqual([
      sender,
      near,
    ]);
    expect(chatRecipients('channel', sender, [sender, near, far, otherChannel])).toEqual([
      sender,
      near,
      far,
    ]);
  });

  it('allows normal conversation but limits bursts, duplicate spam, reports, and malformed floods', () => {
    const authority = new ChatRateAuthority();
    expect(authority.evaluateSend('player', 'one', 1_000).accepted).toBe(true);
    expect(authority.evaluateSend('player', 'two', 1_500).accepted).toBe(true);
    expect(authority.evaluateSend('player', 'same', 2_000).accepted).toBe(true);
    expect(authority.evaluateSend('player', 'same', 2_500).accepted).toBe(true);
    expect(authority.evaluateSend('player', 'same', 7_100)).toMatchObject({
      accepted: false,
      reason: 'duplicate_spam',
    });
    const nearDuplicate = new ChatRateAuthority();
    expect(nearDuplicate.evaluateSend('other', 'Visit the meadow!', 1_000).accepted).toBe(true);
    expect(nearDuplicate.evaluateSend('other', 'Visit the meadow.', 2_000).accepted).toBe(true);
    expect(nearDuplicate.evaluateSend('other', 'Visit the meadow???', 3_000)).toMatchObject({
      accepted: false,
      reason: 'duplicate_spam',
    });
    expect(authority.allowReport('player', 1_000)).toBe(true);
    expect(authority.allowSafetyAction('player', 1_000)).toBe(true);
    for (let index = 0; index < 10; index += 1)
      expect(authority.noteMalformed('socket', 1_000)).toBe(true);
    expect(authority.noteMalformed('socket', 1_000)).toBe(false);
  });
});

describe('channel authority', () => {
  it('assigns, isolates, caps, and prevents duplicate joins', () => {
    const authority = new ChannelAuthority([channel]);
    const first = presence('10000000-0000-4000-8000-000000000010');
    const second = presence('10000000-0000-4000-8000-000000000011');
    expect(authority.assign('lantern-square')?.id).toBe(channel.id);
    expect(authority.join(first)).toBe(true);
    expect(authority.join(first)).toBe(false);
    expect(authority.join(second)).toBe(true);
    expect(authority.assign('lantern-square')).toBeUndefined();
    expect(authority.members('moonpetal-meadow', channel.id)).toEqual([]);
    expect(authority.leave(first.presenceId)?.presenceId).toBe(first.presenceId);
  });

  it('keeps same-world channels isolated during leave and rejoin switching', () => {
    const otherChannel = {
      ...channel,
      id: '10000000-0000-4000-8000-000000000002',
      number: 2,
    };
    const authority = new ChannelAuthority([channel, otherChannel]);
    const first = presence('10000000-0000-4000-8000-000000000010');
    const second = {
      ...presence('10000000-0000-4000-8000-000000000011'),
      channelId: otherChannel.id,
      channelNumber: 2,
    };
    expect(authority.join(first)).toBe(true);
    expect(authority.join(second)).toBe(true);
    expect(authority.members('lantern-square', channel.id)).toEqual([first]);
    expect(authority.members('lantern-square', otherChannel.id)).toEqual([second]);
    expect(authority.leave(first.presenceId)).toEqual(first);
    const switched = { ...first, channelId: otherChannel.id, channelNumber: 2 };
    expect(authority.join(switched)).toBe(true);
    expect(authority.members('lantern-square', channel.id)).toEqual([]);
    expect(authority.members('lantern-square', otherChannel.id)).toEqual([second, switched]);
  });
});

describe('movement authority', () => {
  const manifest = getWorldManifest('lantern-square');
  if (manifest === undefined) throw new Error('Lantern Square fixture is required.');
  const state = {
    x: manifest.spawn.x,
    y: manifest.spawn.y,
    sequence: 4,
    facingDirection: 'west' as const,
    acceptedAt: 1_000,
    messagesInWindow: 1,
    windowStartedAt: 900,
  };

  it('accepts bounded movement and rejects stale, impossible, and colliding movement', () => {
    expect(
      validateAuthoritativeMovement(
        { ...state, acceptedAt: 1_000 },
        {
          x: state.x + 0.2,
          y: state.y,
          sequence: 5,
          movementState: 'walking',
          receivedAt: 1_100,
        },
        manifest,
      ).accepted,
    ).toBe(true);
    expect(
      validateAuthoritativeMovement(
        state,
        { ...state, sequence: 4, movementState: 'walking', receivedAt: 1_100 },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'stale_sequence' });
    expect(
      validateAuthoritativeMovement(
        state,
        { x: state.x + 8, y: state.y, sequence: 5, movementState: 'jogging', receivedAt: 1_100 },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'speed' });
    expect(
      validateAuthoritativeMovement(
        state,
        { x: -1, y: -1, sequence: 5, movementState: 'walking', receivedAt: 1_100 },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'bounds' });
  });

  it.each([
    [-0.1, -0.1, 'north'],
    [0, -0.1, 'northeast'],
    [0.1, -0.1, 'east'],
    [0.1, 0, 'southeast'],
    [0.1, 0.1, 'south'],
    [0, 0.1, 'southwest'],
    [-0.1, 0.1, 'west'],
    [-0.1, 0, 'northwest'],
  ] as const)('derives %s/%s as authoritative %s facing', (deltaX, deltaY, facingDirection) => {
    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x + deltaX,
          y: state.y + deltaY,
          sequence: 5,
          movementState: 'walking',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toMatchObject({ accepted: true, facingDirection, movementState: 'walking' });
  });

  it('preserves facing while stationary and derives pace from the accepted displacement', () => {
    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x,
          y: state.y,
          sequence: 5,
          movementState: 'jogging',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toMatchObject({ accepted: true, facingDirection: 'west', movementState: 'idle' });

    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x + 0.000_05,
          y: state.y - 0.000_05,
          sequence: 5,
          movementState: 'jogging',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toMatchObject({ accepted: true, facingDirection: 'west', movementState: 'idle' });

    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x + 0.2,
          y: state.y,
          sequence: 5,
          movementState: 'jogging',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toMatchObject({ accepted: true, movementState: 'walking' });

    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x + 0.34,
          y: state.y,
          sequence: 5,
          movementState: 'jogging',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toMatchObject({ accepted: true, movementState: 'jogging' });

    expect(
      validateAuthoritativeMovement(
        state,
        {
          x: state.x + 0.34,
          y: state.y,
          sequence: 5,
          movementState: 'walking',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'speed' });
  });

  it('rate limits excessive updates without writing persistence', () => {
    expect(
      validateAuthoritativeMovement(
        { ...state, messagesInWindow: 20 },
        { ...state, sequence: 5, movementState: 'idle', receivedAt: 1_100 },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'frequency' });
  });

  it('rejects malformed time and a walk into collision geometry', () => {
    expect(
      validateAuthoritativeMovement(
        state,
        { ...state, sequence: 5, movementState: 'walking', receivedAt: 999 },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'malformed' });

    const collision = manifest.collisions.find((entry) => entry.shape === 'circle');
    expect(collision).toBeDefined();
    if (collision === undefined || collision.shape !== 'circle') return;
    expect(
      validateAuthoritativeMovement(
        { ...state, x: collision.x - collision.radius - 0.2, y: collision.y },
        {
          x: collision.x,
          y: collision.y,
          sequence: 5,
          movementState: 'walking',
          receivedAt: 1_100,
        },
        manifest,
      ),
    ).toEqual({ accepted: false, reason: 'collision' });
  });
});
