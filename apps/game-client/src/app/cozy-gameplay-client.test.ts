import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapCozyGameplay, executeShopTransaction, mutateFarm } from './cozy-gameplay-client';

const originalFetch = globalThis.fetch;
const now = '2026-07-13T04:00:00.000Z';

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function success(data: unknown): Response {
  return Response.json({ success: true, data, requestId: 'request-phase-7' });
}

describe('cozy gameplay browser boundary', () => {
  it('bootstraps through the protected player route with a unique mutation key', async () => {
    globalThis.fetch = vi.fn(async () =>
      success({
        contentVersion: 1,
        dust: {
          playerId: '11111111-1111-4111-8111-111111111111',
          balance: 250,
          stateVersion: 1,
          starterGrantAppliedAt: now,
          updatedAt: now,
        },
        inventory: {
          capacity: { capacity: 24, usedSlots: 0, stateVersion: 1 },
          stacks: [],
        },
        quickbar: {
          assignments: Array.from({ length: 8 }, (_, index) => ({
            slot: index + 1,
            inventoryStackId: null,
            assignedItemSlug: null,
          })),
          stateVersion: 1,
        },
        generatedAt: now,
      }),
    );

    const result = await bootstrapCozyGameplay('http://localhost:4000');

    expect(result.dust.balance).toBe(250);
    const [url, options] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:4000/api/v1/token-access/player/cozy/bootstrap');
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store' });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      idempotencyKey: expect.stringMatching(/^cozy-[0-9a-f-]{36}$/u),
    });
  });

  it('never sends client prices, balances, or yields for a shop mutation', async () => {
    globalThis.fetch = vi.fn(async () =>
      success({
        transactionId: '22222222-2222-4222-8222-222222222222',
        operation: 'buy',
        itemSlug: 'moonbean-seed',
        quantity: 1,
        dustDelta: -8,
        dustBalance: 242,
        dustStateVersion: 2,
        inventoryStateVersion: 2,
        replayed: false,
      }),
    );

    await executeShopTransaction(
      'http://localhost:4000',
      'lantern-general-store',
      'buy',
      '33333333-3333-4333-8333-333333333333',
      { inventory: 1, dust: 1 },
    );

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      offerId: '33333333-3333-4333-8333-333333333333',
      quantity: 1,
      expectedInventoryStateVersion: 1,
      expectedDustStateVersion: 1,
    });
    expect(body).not.toHaveProperty('price');
    expect(body).not.toHaveProperty('balance');
    expect(body).not.toHaveProperty('yield');
  });

  it('sends plot identity and optimistic state only for watering', async () => {
    const plot = {
      id: '44444444-4444-4444-8444-444444444444',
      anchorId: 'moonpetal-plot-1',
      mapVersionId: '55555555-5555-4555-8555-555555555555',
      slot: 1,
      state: 'growing' as const,
      cropSlug: 'moonbean',
      plantedAt: now,
      wateredAt: now,
      growthStartedAt: now,
      readyAt: '2026-07-13T04:05:00.000Z',
      growthProgress: 0,
      stateVersion: 3,
      updatedAt: now,
    };
    globalThis.fetch = vi.fn(async () =>
      success({ plot: { ...plot, stateVersion: 4 }, inventoryStateVersion: 2, replayed: false }),
    );

    await mutateFarm('http://localhost:4000', 'water', plot);

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ plotId: plot.id, expectedStateVersion: 3 });
    expect(body).not.toHaveProperty('growthProgress');
    expect(body).not.toHaveProperty('readyAt');
  });
});
