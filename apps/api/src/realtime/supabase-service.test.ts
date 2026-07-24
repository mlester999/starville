import { describe, expect, it, vi } from 'vitest';

import type {
  SupabaseRealtimeAuthorizationPersistenceResult,
  SupabaseRealtimeGateway,
  SupabaseRealtimePlayerSessionResult,
} from './supabase-contracts.js';
import { createSupabaseRealtimeAuthorizationService } from './supabase-service.js';

const membershipId = '11111111-1111-4111-8111-111111111111';
const presenceId = '22222222-2222-4222-8222-222222222222';
const worldVersionId = '33333333-3333-4333-8333-333333333333';
const channelId = '44444444-4444-4444-8444-444444444444';

function gateway(): SupabaseRealtimeGateway {
  return {
    issuePlayerSession: vi.fn(async (): Promise<SupabaseRealtimePlayerSessionResult> => ({
      status: 'issued',
      tokenHash: 'c'.repeat(64),
      tokenType: 'magiclink',
    })),
    verifyPlayerIdentity: vi.fn(async () => '55555555-5555-4555-8555-555555555555'),
    authorize: vi.fn(async (): Promise<SupabaseRealtimeAuthorizationPersistenceResult> => ({
      status: 'authorized',
      membershipId,
      topic: `starville:test:world:lantern-square:channel:${channelId}`,
      authorizationExpiresAt: '2026-07-24T10:05:00.000Z',
      self: {
        presenceId,
        displayName: 'Juniper',
        level: 1,
        worldId: 'lantern-square',
        worldVersionId,
        channelId,
        channelNumber: 1,
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        movementState: 'idle',
        appearancePreset: 'moss',
        sequence: 0,
        connected: true,
      },
      channels: [
        {
          id: channelId,
          worldId: 'lantern-square',
          number: 1,
          capacity: 40,
          population: 1,
          available: true,
        },
      ],
    })),
    close: vi.fn(async () => true),
  };
}

describe('Supabase Realtime authorization service', () => {
  it('issues a non-anonymous player session bound to the hashed wallet session', async () => {
    const persistence = gateway();
    const service = createSupabaseRealtimeAuthorizationService({
      gateway: persistence,
      environment: 'test',
      accessTokenSecret: 'a'.repeat(32),
    });
    await expect(
      service.issuePlayerSession({
        rawAccessToken: 'b'.repeat(43),
        requestId: 'session-request',
      }),
    ).resolves.toEqual({ tokenHash: 'c'.repeat(64), tokenType: 'magiclink' });
    expect(persistence.issuePlayerSession).toHaveBeenCalledWith({
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      requestId: 'session-request',
    });
  });

  it('binds a signed-in player identity to a hashed wallet session', async () => {
    const persistence = gateway();
    const service = createSupabaseRealtimeAuthorizationService({
      gateway: persistence,
      environment: 'test',
      accessTokenSecret: 'a'.repeat(32),
    });
    const view = await service.authorize({
      bearerToken: 'a'.repeat(64),
      rawAccessToken: 'b'.repeat(43),
      expectedWorldId: 'lantern-square',
      expectedWorldVersionId: worldVersionId,
      requestedChannelId: channelId,
      requestId: 'request-1',
    });
    expect(view.membershipId).toBe(membershipId);
    expect(persistence.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'test',
        accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
  });

  it('fails closed for invalid bearer identities and invalid channels', async () => {
    const persistence = gateway();
    vi.mocked(persistence.verifyPlayerIdentity).mockResolvedValue(undefined);
    const service = createSupabaseRealtimeAuthorizationService({
      gateway: persistence,
      environment: 'test',
      accessTokenSecret: 'a'.repeat(32),
    });
    await expect(
      service.authorize({
        bearerToken: 'a'.repeat(64),
        rawAccessToken: 'b'.repeat(43),
        expectedWorldId: 'lantern-square',
        expectedWorldVersionId: worldVersionId,
        requestedChannelId: channelId,
        requestId: 'request-2',
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED' });
    await expect(
      service.authorize({
        bearerToken: 'a'.repeat(64),
        rawAccessToken: 'b'.repeat(43),
        expectedWorldId: 'lantern-square',
        expectedWorldVersionId: worldVersionId,
        requestedChannelId: 'not-a-channel',
        requestId: 'request-3',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST' });
  });
});
