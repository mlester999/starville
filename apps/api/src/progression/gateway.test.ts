import type { SupabaseClient } from '@supabase/supabase-js';
import { createProgressionGameTestFixture } from '@starville/progression';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseProgressionGateway } from './gateway.js';

const identity = {
  userId: 'd1100000-0000-4000-8000-000000009001',
  authSessionId: 'd1100000-0000-4000-8000-000000009002',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'] as const,
};

describe('progression gateway', () => {
  it('strictly parses a bounded player workspace through the owner RPC', async () => {
    const progression = createProgressionGameTestFixture();
    const rpc = vi.fn(async () => ({ data: { status: 'loaded', progression }, error: null }));
    const gateway = createSupabaseProgressionGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.workspace('11111111111111111111111111111111', 'progression-workspace-1'),
    ).resolves.toEqual(progression);
    expect(rpc).toHaveBeenCalledWith('get_player_progression_workspace', {
      p_wallet_address: '11111111111111111111111111111111',
      p_recent_xp_limit: 20,
      p_request_id: 'progression-workspace-1',
    });
  });

  it('forwards immutable quest identity and optimistic revision fields', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'quest_prerequisite_not_met' },
      error: null,
    }));
    const gateway = createSupabaseProgressionGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.acceptQuest(
        '11111111111111111111111111111111',
        'd1100000-0000-4000-8000-000000000301',
        4,
        'progression-quest-idempotency-1',
        'progression-quest-request-1',
      ),
    ).resolves.toBe('quest_prerequisite_not_met');
    expect(rpc).toHaveBeenCalledWith(
      'accept_player_progression_quest',
      expect.objectContaining({
        p_quest_definition_id: 'd1100000-0000-4000-8000-000000000301',
        p_expected_configuration_revision: 4,
        p_idempotency_key: 'progression-quest-idempotency-1',
      }),
    );
  });

  it('activates reviewed curves without a player-migration operation', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'activated', playersMigrated: 0 },
      error: null,
    }));
    const gateway = createSupabaseProgressionGateway({ rpc } as unknown as SupabaseClient);
    await gateway.activateCurve(
      identity,
      'd1100000-0000-4000-8000-000000009003',
      { expectedRevision: 2, reason: 'Activate the reviewed local curve.' },
      'progression-curve-activate-1',
    );
    expect(rpc).toHaveBeenCalledWith(
      'activate_admin_progression_curve',
      expect.objectContaining({
        p_expected_revision: 2,
        p_curve_version_id: 'd1100000-0000-4000-8000-000000009003',
      }),
    );
    expect(rpc.mock.calls.flat().join(' ')).not.toContain('migrate');
  });

  it('uses one audited optimistic presentation RPC for title and badge management', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'updated' }, error: null }));
    const gateway = createSupabaseProgressionGateway({ rpc } as unknown as SupabaseClient);
    await gateway.updatePresentation(
      identity,
      'title',
      'd1100000-0000-4000-8000-000000000602',
      {
        expectedRevision: 3,
        definition: { enabled: false, visible: true },
        reason: 'Preserve ownership while disabling presentation.',
      },
      'progression-title-update-1',
    );
    expect(rpc).toHaveBeenCalledWith(
      'update_admin_progression_presentation',
      expect.objectContaining({ p_kind: 'title', p_expected_revision: 3 }),
    );
  });
});
