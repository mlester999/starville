import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseRealtimeConnection } from './supabase-realtime-client';

const membershipId = '11111111-1111-4111-8111-111111111111';
const presenceId = '22222222-2222-4222-8222-222222222222';
const worldVersionId = '33333333-3333-4333-8333-333333333333';
const channelId = '44444444-4444-4444-8444-444444444444';
const remoteMembershipId = '55555555-5555-4555-8555-555555555555';
const remotePresenceId = '66666666-6666-4666-8666-666666666666';

const player = {
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
} as const;

async function flush(): Promise<void> {
  for (let count = 0; count < 8; count += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Supabase realtime browser transport', () => {
  it('uses a private channel, throttles frames, rejects stale movement, and cleans up', async () => {
    vi.useFakeTimers();
    let now = 1_800_000_000_000;
    const callbacks = new Map<string, (value?: unknown) => void>();
    let presenceState: Readonly<Record<string, readonly unknown[]>> = {};
    const send = vi.fn(async () => 'ok');
    const untrack = vi.fn(async () => 'ok');
    const track = vi.fn(async () => 'ok');
    const channel = {
      on(type: string, filter: { readonly event: string }, callback: (value?: unknown) => void) {
        callbacks.set(`${type}:${filter.event}`, callback);
        return this;
      },
      subscribe(callback: (status: string) => void) {
        void callback('SUBSCRIBED');
        return this;
      },
      track,
      untrack,
      send,
      presenceState: () => presenceState,
    };
    const removeChannel = vi.fn(async () => 'ok');
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: {
              access_token: 'a'.repeat(64),
              user: {
                is_anonymous: false,
                user_metadata: { starville_identity: 'player' },
              },
            },
          },
          error: null,
        })),
        signOut: vi.fn(),
        verifyOtp: vi.fn(),
      },
      realtime: { setAuth: vi.fn(async () => undefined) },
      channel: vi.fn(() => channel),
      removeChannel,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          success: true,
          requestId: 'request-1',
          data: {
            membershipId,
            topic: `starville:test:world:lantern-square:channel:${channelId}`,
            authorizationExpiresAt: new Date(Date.now() + 300_000).toISOString(),
            self: player,
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
          },
        }),
      ),
    );
    const states: unknown[] = [];
    const transport = new SupabaseRealtimeConnection({
      apiUrl: 'http://localhost:4000',
      supabase: { url: 'http://127.0.0.1:54321', anonKey: 'test-anon-key' },
      worldId: 'lantern-square',
      worldVersionId,
      onState: (state) => states.push(state),
      onAccessInvalid: vi.fn(),
      createClient: () =>
        client as unknown as ReturnType<
          NonNullable<ConstructorParameters<typeof SupabaseRealtimeConnection>[0]['createClient']>
        >,
      now: () => now,
    });

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(client.channel).toHaveBeenCalledWith(
      `starville:test:world:lantern-square:channel:${channelId}`,
      expect.objectContaining({ config: expect.objectContaining({ private: true }) }),
    );
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ membershipId, status: 'online' }));

    transport.sendMovement({
      mapId: 'lantern-square',
      x: 13,
      y: 8,
      facingDirection: 'east',
    });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    now += 50;
    transport.sendMovement({
      mapId: 'lantern-square',
      x: 14,
      y: 8,
      facingDirection: 'east',
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(send).toHaveBeenCalledTimes(1);
    now += 50;
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);

    presenceState = {
      [remoteMembershipId]: [
        {
          presence_ref: 'supabase-transport-only',
          version: 1,
          membershipId: remoteMembershipId,
          status: 'online',
          player: {
            ...player,
            presenceId: remotePresenceId,
            displayName: 'Rowan',
          },
        },
      ],
    };
    callbacks.get('presence:sync')?.();
    callbacks.get('broadcast:movement')?.({
      payload: {
        version: 1,
        membershipId: remoteMembershipId,
        presenceId: remotePresenceId,
        worldId: 'lantern-square',
        worldVersionId,
        channelId,
        sequence: 2,
        timestamp: now,
        x: 20,
        y: 10,
        facingDirection: 'north',
        movementState: 'walking',
        animationState: 'walk-north',
      },
    });
    callbacks.get('broadcast:movement')?.({
      payload: {
        version: 1,
        membershipId: remoteMembershipId,
        presenceId: remotePresenceId,
        worldId: 'lantern-square',
        worldVersionId,
        channelId,
        sequence: 1,
        timestamp: now,
        x: 99,
        y: 99,
        facingDirection: 'north',
        movementState: 'walking',
        animationState: 'walk-north',
      },
    });
    expect(states.at(-1)).toMatchObject({
      remotes: [{ presenceId: remotePresenceId, sequence: 2, x: 20, y: 10 }],
    });

    transport.dispose();
    await flush();
    expect(untrack).toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('exchanges the wallet session for a non-anonymous player JWT', async () => {
    const channel = {
      on() {
        return this;
      },
      subscribe(callback: (status: string) => void) {
        void callback('SUBSCRIBED');
        return this;
      },
      track: vi.fn(async () => 'ok'),
      untrack: vi.fn(async () => 'ok'),
      send: vi.fn(async () => 'ok'),
      presenceState: () => ({}),
    };
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: {
        session: {
          access_token: 'p'.repeat(64),
          user: {
            is_anonymous: false,
            user_metadata: { starville_identity: 'player' },
          },
        },
        user: {
          is_anonymous: false,
          user_metadata: { starville_identity: 'player' },
        },
      },
      error: null,
    }));
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: {
              access_token: 'a'.repeat(64),
              user: { is_anonymous: true, user_metadata: {} },
            },
          },
          error: null,
        })),
        signOut,
        verifyOtp,
      },
      realtime: { setAuth: vi.fn(async () => undefined) },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => 'ok'),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          requestId: 'session-request',
          data: { tokenHash: 'h'.repeat(64), tokenType: 'signup' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          requestId: 'authorization-request',
          data: {
            membershipId,
            topic: `starville:test:world:lantern-square:channel:${channelId}`,
            authorizationExpiresAt: new Date(Date.now() + 300_000).toISOString(),
            self: player,
            channels: [],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const transport = new SupabaseRealtimeConnection({
      apiUrl: 'http://localhost:4000',
      supabase: { url: 'http://127.0.0.1:54321', anonKey: 'test-anon-key' },
      worldId: 'lantern-square',
      worldVersionId,
      onState: vi.fn(),
      onAccessInvalid: vi.fn(),
      createClient: () =>
        client as unknown as ReturnType<
          NonNullable<ConstructorParameters<typeof SupabaseRealtimeConnection>[0]['createClient']>
        >,
    });

    transport.start();
    await vi.waitFor(() => expect(verifyOtp).toHaveBeenCalled());

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/supabase-realtime/session');
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'h'.repeat(64),
      type: 'signup',
    });
    expect(client.realtime.setAuth).toHaveBeenCalledWith('p'.repeat(64));
    transport.dispose();
    await flush();
  });
});
