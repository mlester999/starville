import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadEconomyShop,
  loadGeneralStoreEvents,
  loadPlayerEconomy,
  purchaseEconomyShop,
} from './economy-client';

const offer = {
  offerId: '74000000-0000-4000-8000-000000000011',
  itemSlug: 'moonbean-seed',
  itemName: 'Moonbean Seed',
  unitPrice: 8,
  maximumQuantity: 20,
  dailyLimit: 40,
  cooldownSeconds: 0,
  inventoryCapacityCost: 1,
  protectedItem: false as const,
  enabled: true,
  revision: 1,
};

const shop = {
  shopKey: 'village-supply-shop',
  name: 'Village Supply Shop',
  versionId: '99000000-0000-4000-8000-000000000031',
  versionNumber: 1,
  revision: 1,
  status: 'published' as const,
  interactionKey: 'phase7-general-store',
  publishedAt: '2026-07-15T00:00:00.000Z',
};

describe('economy client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits versioned server-rechecked shop intent without a target balance', async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        quantity: 3,
        expectedUnitPrice: 8,
        expectedShopVersionId: '99000000-0000-4000-8000-000000000031',
        expectedShopRevision: 1,
        idempotencyKey: '01234567-89ab-4def-8123-456789abcdef',
      });
      expect(body).not.toHaveProperty('dustBalance');
      expect(body).not.toHaveProperty('resultingBalance');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: 'updated',
            replayed: false,
            transactionId: '90000000-0000-4000-8000-000000000001',
            operation: 'buy',
            itemSlug: 'moonbean-seed',
            quantity: 3,
            dustDelta: -24,
            dustBalance: 226,
            dustStateVersion: 2,
            inventoryStateVersion: 2,
            receipt: {
              receiptId: 'SHOP-0123456789ABCDEF0123',
              shopVersionId: '99000000-0000-4000-8000-000000000031',
              offerId: '74000000-0000-4000-8000-000000000011',
              itemSlug: 'moonbean-seed',
              quantity: 3,
              unitPrice: 8,
              totalPrice: 24,
              ledgerReceiptId: 'DUST-0123456789ABCDEF0123',
              settledAt: '2026-07-15T00:00:00.000Z',
            },
          },
          requestId: 'request-1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await purchaseEconomyShop(
      'http://localhost:4000',
      'lantern-general-store',
      offer,
      shop,
      { inventory: 1, dust: 1 },
      3,
      '01234567-89ab-4def-8123-456789abcdef',
    );
    expect(result.receipt.totalPrice).toBe(24);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a client quantity outside the approved offer before sending a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      purchaseEconomyShop(
        'http://localhost:4000',
        'lantern-general-store',
        offer,
        shop,
        { inventory: 1, dust: 1 },
        21,
      ),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_ECONOMY_QUANTITY' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts authoritative limit, cooldown, description, and safe receipt metadata', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/shops/')) {
        return Response.json({
          success: true,
          data: {
            shop,
            availability: 'open',
            offers: [
              {
                ...offer,
                itemDescription: 'A gentle meadow seed for Moonbeans.',
                itemCategory: 'seed',
                purchasedToday: 2,
                remainingToday: 38,
                availableAt: null,
              },
            ],
            generatedAt: '2026-07-15T00:00:00.000Z',
          },
          requestId: 'request-shop',
        });
      }
      return Response.json({
        success: true,
        data: {
          dustBalance: 242,
          dustStateVersion: 2,
          policyVersion: 1,
          history: [
            {
              publicReceiptId: 'DUST-0123456789ABCDEF0123',
              operationKey: 'shop_purchase',
              sourceKey: null,
              sinkKey: 'village-supply-shop',
              delta: -8,
              balanceBefore: 250,
              balanceAfter: 242,
              referenceType: 'shop_transaction',
              referenceId: '90000000-0000-4000-8000-000000000001',
              correlationId: null,
              relatedPublicReceiptId: 'SHOP-0123456789ABCDEF0123',
              referenceLabel: 'Village Supply Shop',
              createdAt: '2026-07-15T00:00:00.000Z',
            },
          ],
          nextCursor: null,
          generatedAt: '2026-07-15T00:00:00.000Z',
        },
        requestId: 'request-history',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [catalog, history] = await Promise.all([
      loadEconomyShop('http://localhost:4000', 'lantern-general-store'),
      loadPlayerEconomy('http://localhost:4000'),
    ]);
    expect(catalog.offers[0]).toMatchObject({ remainingToday: 38, availableAt: null });
    expect(history.history[0]).toMatchObject({
      relatedPublicReceiptId: 'SHOP-0123456789ABCDEF0123',
      referenceLabel: 'Village Supply Shop',
    });
  });

  it('reads only bounded owner/public shop events and advances the rehydration cursor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain(
        '/economy/shops/interactions/phase7-general-store/events?after=12&limit=20',
      );
      return Response.json({
        success: true,
        data: {
          events: [
            {
              eventNumber: 13,
              eventKey: 'shop_stock_changed',
              visibility: 'public_stock',
              relatedEntityId: '11c00000-0000-4000-8000-000000000021',
              payload: { entryId: '11c00000-0000-4000-8000-000000000021', stock: 4 },
              createdAt: '2026-07-17T00:00:00.000Z',
            },
          ],
          lastEventNumber: 13,
          requiresRehydrate: true,
        },
        requestId: 'shop-events-1',
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = await loadGeneralStoreEvents('http://localhost:4000', 'phase7-general-store', 12);
    expect(page).toMatchObject({ lastEventNumber: 13, requiresRehydrate: true });
    expect(page.events[0]?.visibility).toBe('public_stock');
  });
});
