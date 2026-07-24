import { randomUUID } from 'node:crypto';

import {
  SUPABASE_REALTIME_MAX_PAYLOAD_BYTES,
  SUPABASE_REALTIME_PROTOCOL_VERSION,
} from '@starville/realtime';
import { describe, expect, it } from 'vitest';

import {
  MovementThrottle,
  PHASE13E_REALTIME_HOSTED_PLAN,
  acceptMovementBroadcast,
  createFixtureTag,
  fixtureWallet,
  parseHostedHarnessMode,
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

  it('pins private channels, isolated fixtures, and finally cleanup in the reviewed plan', () => {
    expect(PHASE13E_REALTIME_HOSTED_PLAN.channel.private).toBe(true);
    expect(PHASE13E_REALTIME_HOSTED_PLAN.target).toContain('starville-dev');
    expect(PHASE13E_REALTIME_HOSTED_PLAN.fixtures).toContain('uniquely tagged');
    expect(PHASE13E_REALTIME_HOSTED_PLAN.cleanup).toContain('finally');
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
