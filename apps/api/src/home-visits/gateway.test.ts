import type { SupabaseClient } from '@supabase/supabase-js';
import { homeVisitGameTestFixture } from '@starville/housing';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseHomeVisitGateway } from './gateway.js';

const wallet = '11111111111111111111111111111111';

describe('Phase 11F home-visit gateway', () => {
  it('strictly loads the private player projection through one narrow RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'loaded', workspace: { ...homeVisitGameTestFixture, gameTest: false } },
      error: null,
    }));
    const gateway = createSupabaseHomeVisitGateway({ rpc } as unknown as SupabaseClient);
    await expect(gateway.workspace(wallet, 'phase11f-workspace-request')).resolves.toMatchObject({
      gameTest: false,
      participants: expect.any(Array),
    });
    expect(rpc).toHaveBeenCalledWith('get_player_home_visit_workspace', {
      p_wallet_address: wallet,
      p_request_id: 'phase11f-workspace-request',
    });
  });

  it('forwards the exact session identity and optimistic revision for admission', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'joined' }, error: null }));
    const gateway = createSupabaseHomeVisitGateway({ rpc } as unknown as SupabaseClient);
    await gateway.join(
      wallet,
      {
        visitSessionId: 'f1100000-0000-4000-8000-000000000001',
        invitationId: 'f1100000-0000-4000-8000-000000000002',
        expectedSessionRevision: 7,
        idempotencyKey: 'phase11f-admission-0001',
      },
      'phase11f-admission-request',
    );
    expect(rpc).toHaveBeenCalledWith('join_player_home_visit', {
      p_wallet_address: wallet,
      p_visit_session_id: 'f1100000-0000-4000-8000-000000000001',
      p_invitation_id: 'f1100000-0000-4000-8000-000000000002',
      p_expected_session_revision: 7,
      p_idempotency_key: 'phase11f-admission-0001',
      p_request_id: 'phase11f-admission-request',
    });
  });

  it('does not drop owner moderation concurrency or reason fields', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'removed' }, error: null }));
    const gateway = createSupabaseHomeVisitGateway({ rpc } as unknown as SupabaseClient);
    await gateway.moderateVisitor(
      wallet,
      {
        visitSessionId: 'f1100000-0000-4000-8000-000000000001',
        visitorParticipantId: 'f1100000-0000-4000-8000-000000000003',
        action: 'remove',
        reason: 'Owner ended this visit.',
        expectedSessionRevision: 9,
        idempotencyKey: 'phase11f-moderation-0001',
      },
      'phase11f-moderation-request',
    );
    expect(rpc).toHaveBeenCalledWith(
      'moderate_player_home_visitor',
      expect.objectContaining({
        p_expected_session_revision: 9,
        p_reason: 'Owner ended this visit.',
      }),
    );
  });

  it('keeps Game Test deterministic and entirely outside database persistence', () => {
    const rpc = vi.fn();
    const gateway = createSupabaseHomeVisitGateway({ rpc } as unknown as SupabaseClient);
    expect(gateway.gameTest()).toEqual(homeVisitGameTestFixture);
    expect(gateway.gameTest().participants).toHaveLength(11);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed loaded projection', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'loaded', workspace: {} }, error: null }));
    const gateway = createSupabaseHomeVisitGateway({ rpc } as unknown as SupabaseClient);
    await expect(gateway.workspace(wallet, 'phase11f-malformed-request')).rejects.toThrow();
  });
});
