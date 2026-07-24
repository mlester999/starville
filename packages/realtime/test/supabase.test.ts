import { describe, expect, it } from 'vitest';

import {
  SUPABASE_REALTIME_MAX_PAYLOAD_BYTES,
  homeRealtimeTopic,
  parseSupabaseRealtimePayload,
  partyRealtimeTopic,
  playerRealtimeTopic,
  supabaseMovementBroadcastSchema,
  worldRealtimeTopic,
} from '../src/supabase';

const membershipId = '11111111-1111-4111-8111-111111111111';
const presenceId = '22222222-2222-4222-8222-222222222222';
const worldVersionId = '33333333-3333-4333-8333-333333333333';
const channelId = '44444444-4444-4444-8444-444444444444';

describe('Supabase Realtime transport contract', () => {
  it('constructs exact environment-scoped topics and rejects unsafe identifiers', () => {
    expect(worldRealtimeTopic('test', 'lantern-square', channelId)).toBe(
      `starville:test:world:lantern-square:channel:${channelId}`,
    );
    expect(playerRealtimeTopic('production', presenceId)).toBe(
      `starville:production:player:${presenceId}`,
    );
    expect(partyRealtimeTopic('development', presenceId)).toContain(':party:');
    expect(homeRealtimeTopic('development', presenceId)).toContain(':home:');
    expect(() => worldRealtimeTopic('test', '../private', channelId)).toThrow();
    expect(() => playerRealtimeTopic('test', 'not-a-uuid')).toThrow();
  });

  it('accepts only strict bounded movement frames', () => {
    const valid = {
      version: 1,
      membershipId,
      presenceId,
      worldId: 'lantern-square',
      worldVersionId,
      channelId,
      sequence: 12,
      timestamp: 1_800_000_000_000,
      x: 12,
      y: 7.5,
      facingDirection: 'south',
      movementState: 'walking',
      animationState: 'walk-south',
    } as const;
    expect(parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, valid)).toEqual(valid);
    expect(
      parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, {
        ...valid,
        sequence: 11,
        inventory: ['forged'],
      }),
    ).toBeUndefined();
    expect(
      parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, {
        ...valid,
        x: Number.NaN,
      }),
    ).toBeUndefined();
  });

  it('rejects serialized payloads over the shared protocol ceiling', () => {
    expect(
      parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, {
        payload: 'x'.repeat(SUPABASE_REALTIME_MAX_PAYLOAD_BYTES),
      }),
    ).toBeUndefined();
  });
});
