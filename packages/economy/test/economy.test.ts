import { describe, expect, it } from 'vitest';

import {
  ECONOMY_SINK_CATALOG,
  ECONOMY_SOURCE_CATALOG,
  STAR_UTILITY_CATALOG,
  dustLedgerEntrySchema,
  economyRegistryKeySchema,
  economyRegistryOperationKeySchema,
  economyPolicySchema,
  findActiveEconomySink,
  findActiveEconomySource,
  shopEventPageSchema,
  shopReceiptSchema,
  shopTransactionRequestV2Schema,
} from '../src';

describe('economy catalogs', () => {
  it('bounds canonical economy and operation keys between 3 and 80 characters', () => {
    const keyAt80Characters = `a${'b'.repeat(79)}`;
    const keyAt81Characters = `a${'b'.repeat(80)}`;

    expect(economyRegistryKeySchema.safeParse('ab').success).toBe(false);
    expect(economyRegistryKeySchema.safeParse('abc').success).toBe(true);
    expect(economyRegistryKeySchema.safeParse(keyAt80Characters).success).toBe(true);
    expect(economyRegistryKeySchema.safeParse(keyAt81Characters).success).toBe(false);
    expect(economyRegistryOperationKeySchema.safeParse('ab').success).toBe(false);
    expect(economyRegistryOperationKeySchema.safeParse('abc').success).toBe(true);
    expect(economyRegistryOperationKeySchema.safeParse(keyAt80Characters).success).toBe(true);
    expect(economyRegistryOperationKeySchema.safeParse(keyAt81Characters).success).toBe(false);
  });

  it('contains the exact reviewed economy source and sink set through Phase 11C', () => {
    expect(ECONOMY_SOURCE_CATALOG.map(({ key }) => key)).toEqual([
      'starter-grant',
      'starter-farming-tutorial',
      'shop-sale',
      'starter-shop-tutorial',
      'moonpetal-harvest-help',
    ]);
    expect(ECONOMY_SINK_CATALOG.map(({ key }) => key)).toEqual([
      'village-supply-shop',
      'crafting-fee',
    ]);
  });

  it('rejects unknown and disabled operations from active settlement lookup', () => {
    expect(findActiveEconomySource('unknown')).toBeUndefined();
    expect(findActiveEconomySink('crafting_fee')).toBeUndefined();
    expect(findActiveEconomySink('shop_purchase')?.key).toBe('village-supply-shop');
  });

  it('validates arithmetic and source/sink direction on ledger entries', () => {
    const entry = {
      publicReceiptId: 'DUST-0123456789ABCDEF0123',
      operationKey: 'shop_purchase',
      sourceKey: null,
      sinkKey: 'village-supply-shop',
      delta: -25,
      balanceBefore: 250,
      balanceAfter: 225,
      referenceType: 'shop_transaction',
      referenceId: null,
      correlationId: 'request-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    };
    expect(dustLedgerEntrySchema.parse(entry).balanceAfter).toBe(225);
    expect(dustLedgerEntrySchema.safeParse({ ...entry, balanceAfter: 224 }).success).toBe(false);
    expect(dustLedgerEntrySchema.safeParse({ ...entry, sourceKey: 'starter-grant' }).success).toBe(
      false,
    );
  });

  it('keeps policies bounded and exact-balance reconciliation strict', () => {
    const policy = {
      versionId: '99000000-0000-4000-8000-000000000001',
      versionNumber: 1,
      status: 'published',
      economyEnabled: true,
      purchasesEnabled: true,
      rewardsEnabled: true,
      correctionsEnabled: true,
      starterGrant: 250,
      beginnerProtectionHours: 24,
      lowValueCorrectionLimit: 500,
      highValueCorrectionLimit: 5_000,
      reconciliationTolerance: 0,
      purchaseRateLimitPerMinute: 10,
      historyRetentionDays: 730,
      riskReviewThreshold: 60,
      revision: 1,
      effectiveAt: '2026-07-15T00:00:00.000Z',
      publishedAt: '2026-07-15T00:00:00.000Z',
    };
    expect(economyPolicySchema.parse(policy).reconciliationTolerance).toBe(0);
    expect(
      economyPolicySchema.safeParse({ ...policy, lowValueCorrectionLimit: 6_000 }).success,
    ).toBe(false);
  });

  it('defines $STAR utility without transfers, custody, gameplay power, or DUST multipliers', () => {
    expect(STAR_UTILITY_CATALOG).not.toHaveLength(0);
    for (const utility of STAR_UTILITY_CATALOG) {
      expect(utility.requiresTransaction).toBe(false);
      expect(utility.transfersValue).toBe(false);
      expect(utility.custodyRequired).toBe(false);
      expect(utility.changesGameplayPower).toBe(false);
      expect(utility.changesDustRewards).toBe(false);
    }
  });

  it('keeps Phase 11C transaction intent strict and excludes client-selected settlement results', () => {
    const request = {
      entryId: '11c00000-0000-4000-8000-000000000021',
      direction: 'buy' as const,
      quantity: 2,
      expectedUnitPrice: 8,
      expectedCatalogVersionId: '11c00000-0000-4000-8000-000000000011',
      expectedCatalogRevision: 1,
      expectedEntryRevision: 1,
      expectedStockRevision: 1,
      expectedDustStateVersion: 1,
      expectedInventoryStateVersion: 1,
      idempotencyKey: 'phase11c-contract-request-1',
    };
    expect(shopTransactionRequestV2Schema.parse(request)).toEqual(request);
    expect(shopTransactionRequestV2Schema.safeParse({ ...request, quantity: 100 }).success).toBe(
      false,
    );
    expect(
      shopTransactionRequestV2Schema.safeParse({ ...request, resultingDustBalance: 999_999 })
        .success,
    ).toBe(false);
  });

  it('accepts immutable receipt snapshots and rejects operations visibility in player events', () => {
    const receipt = {
      receiptId: 'STORE-0123456789ABCDEF0123',
      transactionId: '11c00000-0000-4000-8000-000000000031',
      shopName: 'Lantern General Store',
      itemName: 'Moonbean Seed',
      itemSlug: 'moonbean-seed',
      direction: 'buy' as const,
      quantity: 1,
      unitPrice: 8,
      totalDust: 8,
      currency: 'DUST' as const,
      status: 'completed' as const,
      catalogVersion: 2,
      resultingInventoryQuantity: 1,
      resultingDustBalance: 242,
      dustLedgerReceiptId: 'DUST-0123456789ABCDEF0123',
      supportReference: 'STORE-0123456789ABCDEF0123',
      correctionLinked: false,
      createdAt: '2026-07-17T00:00:00.000Z',
    };
    expect(shopReceiptSchema.parse(receipt).unitPrice).toBe(8);
    const page = {
      events: [
        {
          eventNumber: 1,
          eventKey: 'shop_stock_changed' as const,
          visibility: 'public_stock' as const,
          relatedEntityId: '11c00000-0000-4000-8000-000000000021',
          payload: { stock: 4 },
          createdAt: '2026-07-17T00:00:00.000Z',
        },
      ],
      lastEventNumber: 1,
      requiresRehydrate: true,
    };
    expect(shopEventPageSchema.parse(page)).toEqual(page);
    expect(
      shopEventPageSchema.safeParse({
        ...page,
        events: [{ ...page.events[0], visibility: 'operations' }],
      }).success,
    ).toBe(false);
  });
});
