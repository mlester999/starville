import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlayerExperienceGameTestFixture } from '@starville/player-experience';

import { createSupabasePlayerExperienceGateway, PlayerExperiencePersistenceError } from './gateway';

function clientWith(data: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  } as unknown as SupabaseClient;
}

describe('player experience gateway', () => {
  it('parses the shared workspace and forwards bounded feedback pagination', async () => {
    const client = clientWith({
      status: 'loaded',
      experience: createPlayerExperienceGameTestFixture(),
    });
    const gateway = createSupabasePlayerExperienceGateway(client);
    await expect(
      gateway.workspace('11111111111111111111111111111111', 5, 10, 'req-1'),
    ).resolves.toMatchObject({ persistence: 'game_test' });
    expect(client.rpc).toHaveBeenCalledWith('get_player_experience_workspace', {
      p_wallet_address: '11111111111111111111111111111111',
      p_feedback_after: 5,
      p_feedback_limit: 10,
      p_request_id: 'req-1',
    });
  });

  it('returns safe persistence statuses without exposing database errors', async () => {
    const gateway = createSupabasePlayerExperienceGateway(
      clientWith({ status: 'expected_revision_conflict' }),
    );
    await expect(
      gateway.start('11111111111111111111111111111111', 2, 'safe-key-12345678', 'req-2'),
    ).resolves.toBe('expected_revision_conflict');
  });

  it('keeps Game Test data isolated from persistence', () => {
    const gateway = createSupabasePlayerExperienceGateway(clientWith(null));
    expect(gateway.gameTest().persistence).toBe('game_test');
  });

  it('creates only a revision-bound administrator daily-policy successor', async () => {
    const client = clientWith({ status: 'created', activePolicyUnchanged: true });
    const gateway = createSupabasePlayerExperienceGateway(client);
    await gateway.adminCreateDailyPolicySuccessor(
      {
        userId: '12a00000-0000-4000-8000-000000000101',
        authSessionId: '12a00000-0000-4000-8000-000000000102',
        assuranceLevel: 'aal2',
        authenticationMethods: ['password', 'totp'],
      },
      {
        basePolicyVersionId: '12000000-0000-4000-8000-000000000201',
        expectedRevision: 1,
        effectiveAt: '2026-07-18T10:00:00.000Z',
        reason: 'Create a reviewed successor without changing the active daily policy.',
      },
      'req-policy-1',
    );
    expect(client.rpc).toHaveBeenCalledWith(
      'create_admin_player_experience_daily_policy_successor',
      expect.objectContaining({
        p_assurance_level: 'aal2',
        p_base_policy_version_id: '12000000-0000-4000-8000-000000000201',
        p_expected_configuration_revision: 1,
        p_request_id: 'req-policy-1',
      }),
    );
  });

  it('redacts raw database failures behind the persistence boundary', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'secret relation and SQL detail' },
      }),
    } as unknown as SupabaseClient;
    const gateway = createSupabasePlayerExperienceGateway(client);
    const failure = gateway.workspace('11111111111111111111111111111111', 0, 20, 'req-3');
    await expect(failure).rejects.toBeInstanceOf(PlayerExperiencePersistenceError);
    await expect(failure).rejects.not.toThrow('secret relation');
  });
});
