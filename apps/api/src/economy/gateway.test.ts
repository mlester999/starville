import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  createSupabaseEconomyGateway,
  economyPolicyDraftSchema,
  economyShopDraftSchema,
  EconomyRateLimitError,
} from './gateway.js';

const identity = {
  userId: '90000000-0000-4000-8000-000000000001',
  authSessionId: '90000000-0000-4000-8000-000000000002',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'] as const,
};

describe('economy gateway', () => {
  it('runs deterministic simulation locally and persists only isolated aggregate output', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        runId: '90000000-0000-4000-8000-000000000003',
        createdAt: '2026-07-15T00:00:00.000Z',
        playerBalancesMutated: false,
      },
      error: null,
    }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    const input = {
      seed: 9001,
      playerCount: 100 as const,
      durationDays: 30 as const,
      starterGrant: 250,
      meanDailySource: 18,
      sourceParticipationRate: 0.55,
      meanDailySink: 16,
      sinkParticipationRate: 0.5,
      beginnerProtectionDays: 3,
    };
    const first = await gateway.simulate(identity, input, 'request-1');
    const second = await gateway.simulate(identity, input, 'request-2');
    expect({ ...first, runId: undefined }).toEqual({ ...second, runId: undefined });
    expect(first.negativeBalanceCount).toBe(0);
    expect(rpc).toHaveBeenCalledWith(
      'record_admin_economy_simulation',
      expect.objectContaining({ p_input: input, p_result: expect.any(Object) }),
    );
  });

  it('sends expected price and immutable shop version to purchase settlement', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'shop_changed' }, error: null }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    expect(
      await gateway.purchase(
        '11111111111111111111111111111111',
        'lantern-general-store',
        {
          offerId: '74000000-0000-4000-8000-000000000011',
          quantity: 1,
          expectedUnitPrice: 8,
          expectedShopVersionId: '99000000-0000-4000-8000-000000000031',
          expectedShopRevision: 1,
          expectedDustStateVersion: 1,
          expectedInventoryStateVersion: 1,
          idempotencyKey: '90000000-0000-4000-8000-000000000004',
        },
        'request-3',
      ),
    ).toBe('shop_changed');
    expect(rpc).toHaveBeenCalledWith(
      'purchase_player_economy_shop',
      expect.objectContaining({
        p_expected_unit_price: 8,
        p_expected_shop_version_id: '99000000-0000-4000-8000-000000000031',
      }),
    );
  });

  it('reads bounded shop events through an owner-authorized cursor RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'loaded',
        events: [
          {
            eventNumber: 4,
            eventKey: 'receipt_available',
            visibility: 'owner',
            relatedEntityId: '11c00000-0000-4000-8000-000000000030',
            payload: { receiptId: 'STORE-0123456789ABCDEF0123' },
            createdAt: '2026-07-17T00:00:00.000Z',
          },
        ],
        lastEventNumber: 4,
        requiresRehydrate: true,
      },
      error: null,
    }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.shopEvents(
        '11111111111111111111111111111111',
        'phase7-general-store',
        { after: 3, limit: 20 },
        'shop-events-1',
      ),
    ).resolves.toMatchObject({ lastEventNumber: 4, requiresRehydrate: true });
    expect(rpc).toHaveBeenCalledWith('get_player_shop_events', {
      p_wallet_address: '11111111111111111111111111111111',
      p_shop_interaction_id: 'phase7-general-store',
      p_after_event_number: 3,
      p_limit: 20,
      p_request_id: 'shop-events-1',
    });
  });

  it('creates and removes only revision-checked catalog draft entries', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'updated' }, error: null }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    const versionId = '90000000-0000-4000-8000-000000000020';
    const offerId = '90000000-0000-4000-8000-000000000021';
    const entryId = '90000000-0000-4000-8000-000000000022';
    await gateway.addShopCatalogEntry(
      identity,
      versionId,
      {
        offerId,
        expectedVersionRevision: 4,
        reason: 'Add an approved offer to this successor draft.',
      },
      'shop-entry-add',
    );
    await gateway.removeShopCatalogEntry(
      identity,
      versionId,
      entryId,
      {
        expectedVersionRevision: 5,
        expectedEntryRevision: 1,
        reason: 'Remove an unreferenced entry from this successor draft.',
      },
      'shop-entry-remove',
    );
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'add_admin_shop_catalog_entry',
      expect.objectContaining({
        p_shop_version_id: versionId,
        p_offer_id: offerId,
        p_expected_version_revision: 4,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'remove_admin_shop_catalog_entry',
      expect.objectContaining({
        p_shop_version_id: versionId,
        p_entry_id: entryId,
        p_expected_version_revision: 5,
        p_expected_entry_revision: 1,
      }),
    );
  });

  it('surfaces durable administrator rate limits as a safe typed boundary', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'rate_limited' }, error: null }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    await expect(gateway.overview(identity)).rejects.toBeInstanceOf(EconomyRateLimitError);
  });

  it('forwards bounded ledger filters to the narrow filtered read RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { items: [], page: 2, pageSize: 50, total: 0, totalPages: 0 },
      error: null,
    }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    await gateway.ledger(identity, {
      search: '',
      page: 2,
      pageSize: 50,
      direction: 'debit',
      sinkKey: 'village-supply-shop',
      minimumAmount: 5,
      maximumAmount: 100,
      status: 'completed',
    });
    expect(rpc).toHaveBeenCalledWith(
      'get_admin_economy_ledger_filtered',
      expect.objectContaining({
        p_direction: 'debit',
        p_sink_key: 'village-supply-shop',
        p_minimum_amount: 5,
        p_maximum_amount: 100,
        p_status: 'completed',
      }),
    );
  });

  it('uses exact-revision reviewed lifecycle RPCs for policy and shop actions', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'approved', revision: 4 },
      error: null,
    }));
    const gateway = createSupabaseEconomyGateway({ rpc } as unknown as SupabaseClient);
    await gateway.transitionPolicy(
      identity,
      '90000000-0000-4000-8000-000000000010',
      { action: 'approve', expectedRevision: 3, effectiveAt: null },
      'request-policy-approval',
    );
    await gateway.transitionShop(
      identity,
      '90000000-0000-4000-8000-000000000011',
      {
        action: 'schedule',
        expectedRevision: 4,
        effectiveAt: '2026-07-16T10:00:00.000Z',
      },
      'request-shop-schedule',
    );
    await gateway.transitionPolicy(
      identity,
      '90000000-0000-4000-8000-000000000012',
      { action: 'rollback', expectedRevision: 9, effectiveAt: null },
      'request-policy-rollback',
    );
    await gateway.transitionShop(
      identity,
      '90000000-0000-4000-8000-000000000013',
      { action: 'rollback', expectedRevision: 7, effectiveAt: null },
      'request-shop-rollback',
    );
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'operate_admin_economy_policy_version',
      expect.objectContaining({ p_action: 'approve', p_expected_revision: 3 }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'operate_admin_economy_shop_version',
      expect.objectContaining({
        p_action: 'schedule',
        p_effective_at: '2026-07-16T10:00:00.000Z',
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      'operate_admin_economy_policy_version',
      expect.objectContaining({ p_action: 'rollback', p_expected_revision: 9 }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      'operate_admin_economy_shop_version',
      expect.objectContaining({ p_action: 'rollback', p_expected_revision: 7 }),
    );
  });

  it('bounds all administrator-authored policy and shop text before persistence', () => {
    expect(
      economyPolicyDraftSchema.safeParse({
        baseVersionId: '90000000-0000-4000-8000-000000000010',
        economyEnabled: true,
        purchasesEnabled: true,
        rewardsEnabled: true,
        correctionsEnabled: true,
        starterGrant: 250,
        beginnerProtectionHours: 24,
        lowValueCorrectionLimit: 500,
        highValueCorrectionLimit: 5_000,
        purchaseRateLimitPerMinute: 10,
        historyRetentionDays: 730,
        riskReviewThreshold: 60,
        effectiveAt: '2026-07-16T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      economyShopDraftSchema.safeParse({
        expectedActiveVersionId: '90000000-0000-4000-8000-000000000010',
        name: 'x'.repeat(81),
        description: 'A bounded shop description.',
        effectiveAt: '2026-07-16T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
