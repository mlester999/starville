import { randomUUID } from 'node:crypto';

import {
  SUPABASE_REALTIME_MAX_PAYLOAD_BYTES,
  SUPABASE_REALTIME_PROTOCOL_VERSION,
} from '@starville/realtime';
import { describe, expect, it, vi } from 'vitest';

import {
  MovementThrottle,
  PHASE13E_REALTIME_HOSTED_PLAN,
  acceptMovementBroadcast,
  assertPrivateRealtimeExecutionSettings,
  classifyNegativeSubscriptionStatus,
  corruptAuthToken,
  createFixtureTag,
  expectSubscriptionRejected,
  fixtureWallet,
  parseHostedHarnessMode,
  runWithCriticalCleanup,
  type MovementAcceptanceContext,
} from './phase13e-hosted-realtime-validation';

const context: MovementAcceptanceContext = {
  membershipId: '8e000000-0000-4000-8000-000000000001',
  presenceId: '8e000000-0000-4000-8000-000000000002',
  worldId: 'lantern-square',
  worldVersionId: '8e000000-0000-4000-8000-000000000003',
  channelId: '8e000000-0000-4000-8000-000000000004',
  now: 10_000,
};
const movement = {
  version: SUPABASE_REALTIME_PROTOCOL_VERSION,
  membershipId: context.membershipId,
  presenceId: context.presenceId,
  worldId: context.worldId,
  worldVersionId: context.worldVersionId,
  channelId: context.channelId,
  sequence: 1,
  timestamp: context.now,
  x: 12,
  y: 8,
  facingDirection: 'east',
  movementState: 'walking',
  animationState: 'walk-east',
} as const;

describe('Phase 13E hosted Realtime harness', () => {
  it('is a no-network, no-write dry-run by default and requires exact execution syntax', () => {
    expect(parseHostedHarnessMode([])).toBe('dry-run');
    expect(parseHostedHarnessMode(['--dry-run'])).toBe('dry-run');
    expect(parseHostedHarnessMode(['--', '--dry-run'])).toBe('dry-run');
    expect(parseHostedHarnessMode(['--execute'])).toBe('execute');
    expect(() => parseHostedHarnessMode(['--run'])).toThrow();
  });

  it('pins public rejection, private channels, Auth denials, and cleanup in the plan', () => {
    expect(PHASE13E_REALTIME_HOSTED_PLAN.publicChannel).toMatchObject({
      private: false,
      expectation: 'PUBLIC_CHANNEL_REJECTED',
      payload: 'none',
    });
    expect(PHASE13E_REALTIME_HOSTED_PLAN.privateChannel.private).toBe(true);
    expect(PHASE13E_REALTIME_HOSTED_PLAN.privateChannel.fallback).toBe('none');
    expect(PHASE13E_REALTIME_HOSTED_PLAN.target).toContain('starville-dev');
    expect(PHASE13E_REALTIME_HOSTED_PLAN.fixtures).toContain('unique run-tagged');
    expect(PHASE13E_REALTIME_HOSTED_PLAN.authNegativeCases).toEqual(
      expect.arrayContaining([
        'unbound-authenticated',
        'wrong-player-binding',
        'suspended-player',
        'anonymous-identity',
        'missing-token',
        'malformed-token',
        'corrupted-token',
        'expired-starville-access-session',
        'one-use-magic-link-replay',
        'cross-environment',
      ]),
    );
    expect(PHASE13E_REALTIME_HOSTED_PLAN.cleanup).toContain('finally');
  });

  it('classifies only an explicit channel denial as a negative-test success', () => {
    expect(classifyNegativeSubscriptionStatus('CHANNEL_ERROR')).toBe('rejected');
    expect(classifyNegativeSubscriptionStatus('CLOSED')).toBe('rejected');
    expect(classifyNegativeSubscriptionStatus('SUBSCRIBED')).toBe('unexpectedly-allowed');
    expect(classifyNegativeSubscriptionStatus('TIMED_OUT')).toBe('inconclusive');
    expect(classifyNegativeSubscriptionStatus('CONNECTING')).toBe('pending');
  });

  it('removes the controlled public channel and treats subscription success as critical', async () => {
    const send = vi.fn();
    const rejectedChannel = {
      send,
      subscribe: (callback: (status: string) => void) => {
        callback('CHANNEL_ERROR');
        return rejectedChannel;
      },
    };
    const rejectedClient = {
      channel: vi.fn(() => rejectedChannel),
      removeChannel: vi.fn(async () => 'ok'),
    };
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(
      expectSubscriptionRejected(rejectedClient as never, 'negative-public-topic', {
        label: 'public-channel access',
        private: false,
        publicChannelProbe: true,
      }),
    ).resolves.toBeUndefined();
    expect(rejectedClient.channel).toHaveBeenCalledWith('negative-public-topic');
    expect(rejectedClient.removeChannel).toHaveBeenCalledWith(rejectedChannel);
    expect(send).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('PUBLIC_CHANNEL_REJECTED\n');

    const allowedChannel = {
      subscribe: (callback: (status: string) => void) => {
        callback('SUBSCRIBED');
        return allowedChannel;
      },
    };
    const allowedClient = {
      channel: vi.fn(() => allowedChannel),
      removeChannel: vi.fn(async () => 'ok'),
    };
    await expect(
      expectSubscriptionRejected(allowedClient as never, 'negative-public-topic', {
        label: 'public-channel access',
        private: false,
        publicChannelProbe: true,
      }),
    ).rejects.toThrow('unexpectedly allowed');
    expect(allowedClient.removeChannel).toHaveBeenCalledWith(allowedChannel);
    expect(output).toHaveBeenCalledWith('PUBLIC_CHANNEL_UNEXPECTEDLY_ALLOWED\n');
    output.mockRestore();
  });

  it('requires enabled Realtime with public access disabled before execution', () => {
    expect(() =>
      assertPrivateRealtimeExecutionSettings({ suspend: false, private_only: true }),
    ).not.toThrow();
    expect(() =>
      assertPrivateRealtimeExecutionSettings({ suspend: false, private_only: false }),
    ).toThrow('private-only');
    expect(() =>
      assertPrivateRealtimeExecutionSettings({ suspend: true, private_only: true }),
    ).toThrow('private-only');
    expect(() => assertPrivateRealtimeExecutionSettings({ suspend: false })).toThrow(
      'private-only',
    );
  });

  it('corrupts a token without exposing or accepting the original value', () => {
    const token = 'header.payload.signature';
    const corrupted = corruptAuthToken(token);
    expect(corrupted).not.toBe(token);
    expect(corrupted).toHaveLength(token.length);
  });

  it('always runs cleanup and treats cleanup failure as critical', async () => {
    const calls: string[] = [];
    await expect(
      runWithCriticalCleanup(
        async () => {
          calls.push('validation');
          throw new Error('negative-case-failure');
        },
        async () => {
          calls.push('cleanup');
          return [];
        },
      ),
    ).rejects.toThrow('negative-case-failure');
    expect(calls).toEqual(['validation', 'cleanup']);

    await expect(
      runWithCriticalCleanup(
        async () => undefined,
        async () => ['database-fixture'],
      ),
    ).rejects.toThrow('cleanup failed');
  });

  it('creates unique deterministic safe fixture identities without real player identifiers', () => {
    const tag = createFixtureTag(randomUUID());
    expect(tag).toMatch(/^phase13e-[a-f0-9]{12}$/u);
    expect(fixtureWallet(tag, 'a')).toMatch(/^[1-9A-HJ-NP-Za-km-z]{40}$/u);
    expect(fixtureWallet(tag, 'a')).toBe(fixtureWallet(tag, 'a'));
    expect(fixtureWallet(tag, 'a')).not.toBe(fixtureWallet(tag, 'b'));
  });

  it('accepts valid movement and rejects duplicate, stale, malformed, oversized, or wrong scope', () => {
    expect(acceptMovementBroadcast(movement, context, -1)).toEqual(movement);
    expect(acceptMovementBroadcast(movement, context, 1)).toBeUndefined();
    expect(acceptMovementBroadcast({ ...movement, sequence: 0 }, context, 1)).toBeUndefined();
    expect(acceptMovementBroadcast({ ...movement, x: Number.NaN }, context, -1)).toBeUndefined();
    expect(acceptMovementBroadcast({ ...movement, unknown: true }, context, -1)).toBeUndefined();
    expect(acceptMovementBroadcast({ ...movement, version: 2 }, context, -1)).toBeUndefined();
    expect(
      acceptMovementBroadcast({ ...movement, worldId: 'wrong-world' }, context, -1),
    ).toBeUndefined();
    expect(
      acceptMovementBroadcast(
        { ...movement, animationState: 'x'.repeat(SUPABASE_REALTIME_MAX_PAYLOAD_BYTES) },
        context,
        -1,
      ),
    ).toBeUndefined();
  });

  it('does not admit gameplay-authority fields through the strict movement schema', () => {
    for (const field of [
      'inventory',
      'currency',
      'progression',
      'collision',
      'trade',
      'gift',
      'moderation',
    ]) {
      expect(acceptMovementBroadcast({ ...movement, [field]: true }, context, -1)).toBeUndefined();
    }
  });

  it('enforces the 100 ms outbound movement interval', () => {
    const throttle = new MovementThrottle();
    throttle.record(1_000);
    expect(throttle.remaining(1_050)).toBe(50);
    expect(() => throttle.record(1_099)).toThrow('throttle');
    expect(() => throttle.record(1_100)).not.toThrow();
  });
});
