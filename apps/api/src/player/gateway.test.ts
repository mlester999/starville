import { describe, expect, it, vi } from 'vitest';

import { createSupabasePlayerGateway, PlayerPersistenceError } from './gateway.js';

const PROFILE_ID = '19e72014-a546-4f45-8232-6a286f889453';
const MAP_VERSION_ID = '29e72014-a546-4f45-8232-6a286f889453';

function phase6PlayerProfileJson(overrides: Record<string, unknown> = {}) {
  return {
    status: 'loaded',
    id: PROFILE_ID,
    displayName: 'Luna Vale',
    appearancePreset: 'river',
    mapId: 'lantern-square',
    mapVersionId: MAP_VERSION_ID,
    x: 12,
    y: 7.5,
    facingDirection: 'south',
    gameStateVersion: 2,
    stateVersion: 2,
    lastTransitionAt: null,
    createdAt: '2026-07-11T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    lastEnteredAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  };
}

function phase6EntryJson(overrides: Record<string, unknown> = {}) {
  const profile = phase6PlayerProfileJson();
  const { status: _status, ...profileWithoutStatus } = profile;
  void _status;
  return {
    status: 'loaded',
    entryState: 'active',
    profile: profileWithoutStatus,
    ...overrides,
  };
}

function clientWithRpc(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

describe('player gateway Phase 6 / Phase 7 entry contract', () => {
  it('parses load_player_entry_state payloads that include Phase 6 multi-map fields', async () => {
    const client = clientWithRpc(phase6EntryJson());
    const gateway = createSupabasePlayerGateway(client as never);

    await expect(
      gateway.loadEntry('11111111111111111111111111111111', 'request-entry', true),
    ).resolves.toMatchObject({
      entryState: 'active',
      profile: {
        id: PROFILE_ID,
        mapId: 'lantern-square',
        mapVersionId: MAP_VERSION_ID,
        gameStateVersion: 2,
        stateVersion: 2,
        lastTransitionAt: null,
      },
    });
    expect(client.rpc).toHaveBeenCalledWith('load_player_entry_state', {
      p_wallet_address: '11111111111111111111111111111111',
      p_request_id: 'request-entry',
      p_touch_entry: true,
    });
  });

  it('parses create_player_profile payloads that include Phase 6 multi-map fields', async () => {
    const client = clientWithRpc(phase6PlayerProfileJson({ gameStateVersion: 1, stateVersion: 1 }));
    const gateway = createSupabasePlayerGateway(client as never);

    await expect(
      gateway.createProfile(
        '11111111111111111111111111111111',
        { displayName: 'Luna Vale', appearancePreset: 'river' },
        'request-create',
        6,
      ),
    ).resolves.toMatchObject({
      mapVersionId: MAP_VERSION_ID,
      stateVersion: 1,
      lastTransitionAt: null,
    });
  });

  it('rejects mismatched stateVersion and gameStateVersion without leaking raw payloads', async () => {
    const mismatched = phase6EntryJson();
    (mismatched.profile as Record<string, unknown>)['stateVersion'] = 3;
    const gateway = createSupabasePlayerGateway(clientWithRpc(mismatched) as never);

    await expect(
      gateway.loadEntry('11111111111111111111111111111111', 'request-mismatch', true),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'PlayerPersistenceError',
        stage: 'parse',
        operation: 'load_player_entry_state',
      } satisfies Partial<PlayerPersistenceError>),
    );
  });

  it('rejects unknown unexpected profile fields safely', async () => {
    const payload = phase6EntryJson();
    (payload.profile as Record<string, unknown>)['walletAddress'] = 'attacker';
    const gateway = createSupabasePlayerGateway(clientWithRpc(payload) as never);

    await expect(
      gateway.loadEntry('11111111111111111111111111111111', 'request-unknown', true),
    ).rejects.toMatchObject({
      name: 'PlayerPersistenceError',
      stage: 'parse',
      operation: 'load_player_entry_state',
      details: expect.objectContaining({
        parseIssues: expect.arrayContaining(['unrecognized_keys']),
      }),
    });
  });

  it('records a safe PostgreSQL code on RPC failure without secret material', async () => {
    const gateway = createSupabasePlayerGateway(
      clientWithRpc(null, {
        code: 'PGRST202',
        message: 'Could not find the function public.load_player_entry_state',
        details: 'service_role key must never appear',
        hint: 'postgresql://user:secret@host/db',
      }) as never,
    );

    try {
      await gateway.loadEntry('11111111111111111111111111111111', 'request-rpc', true);
      expect.unreachable('expected persistence failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PlayerPersistenceError);
      const failure = error as PlayerPersistenceError;
      expect(failure.stage).toBe('rpc');
      expect(failure.details.postgresCode).toBe('PGRST202');
      expect(failure.details.rpcName).toBe('load_player_entry_state');
      expect(JSON.stringify(failure)).not.toContain('secret');
      expect(JSON.stringify(failure)).not.toContain('postgresql://');
      expect(JSON.stringify(failure)).not.toContain('service_role');
    }
  });

  it('accepts bigint-safe integer versions and ISO timestamps with offsets', async () => {
    const gateway = createSupabasePlayerGateway(
      clientWithRpc(
        phase6EntryJson({
          profile: {
            id: PROFILE_ID,
            displayName: 'Luna Vale',
            appearancePreset: 'river',
            mapId: 'moonpetal-meadow',
            mapVersionId: null,
            x: 10.25,
            y: 8.5,
            facingDirection: 'east',
            gameStateVersion: 1,
            stateVersion: 1,
            lastTransitionAt: '2026-07-12T15:30:00+00:00',
            createdAt: '2026-07-11T10:00:00+00:00',
            updatedAt: '2026-07-12T15:30:00+00:00',
            lastEnteredAt: '2026-07-12T15:30:00+00:00',
          },
        }),
      ) as never,
    );

    await expect(
      gateway.loadEntry('11111111111111111111111111111111', 'request-types', false),
    ).resolves.toMatchObject({
      profile: {
        mapId: 'moonpetal-meadow',
        mapVersionId: null,
        lastTransitionAt: '2026-07-12T15:30:00+00:00',
        gameStateVersion: 1,
        stateVersion: 1,
      },
    });
  });
});
