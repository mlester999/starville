import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Inventory, ItemCatalog, ShopCatalog } from '../app/cozy-gameplay-client';
import type {
  EconomyPurchaseResult,
  EconomyShopView,
  PlayerEconomyView,
} from '../app/economy-client';
import { deriveShopOfferStatus } from './economy-presentation';
import {
  DustHistoryPanel,
  VillageSupplyShopPanel,
  type ShopPurchaseAttempt,
} from './EconomyPanels';

const now = '2026-07-15T00:00:00.000Z';

const moonbeanSeed = {
  id: '71000000-0000-4000-8000-000000000001',
  slug: 'moonbean-seed',
  name: 'Moonbean Seed',
  description: 'A gentle meadow seed for Moonbeans.',
  category: 'seed' as const,
  stackable: true,
  maxStackSize: 99,
  buyEligible: true,
  sellEligible: false,
  giftable: true,
  tradable: true,
  accountBound: false,
  permanentTool: false,
  minimumTransferQuantity: 1,
  maximumTransferQuantity: 20,
  defaultBuyPrice: 8,
  defaultSellPrice: null,
  assetRef: 'phase7-dev-moonbean-seed',
  assetReadiness: 'development_marker' as const,
  active: true,
  contentVersion: 1,
  metadata: { kind: 'seed' as const, cropSlug: 'moonbean' },
};

const moonbean = {
  ...moonbeanSeed,
  id: '71000000-0000-4000-8000-000000000004',
  slug: 'moonbean',
  name: 'Moonbean',
  description: 'A crisp bean gathered under soft evening light.',
  category: 'crop' as const,
  buyEligible: false,
  sellEligible: true,
  defaultBuyPrice: null,
  defaultSellPrice: 7,
  assetRef: 'phase7-dev-moonbean',
  metadata: { kind: 'crop' as const, cropSlug: 'moonbean' },
};

const itemCatalog = {
  contentVersion: 1,
  generatedAt: now,
  items: [moonbeanSeed, moonbean],
} satisfies ItemCatalog;

const inventory = {
  capacity: { capacity: 24, usedSlots: 2, stateVersion: 3 },
  stacks: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      item: moonbeanSeed,
      quantity: 2,
      acquiredAt: now,
      updatedAt: now,
      stateVersion: 1,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      item: moonbean,
      quantity: 3,
      acquiredAt: now,
      updatedAt: now,
      stateVersion: 1,
    },
  ],
} satisfies Inventory;

const shopCatalog = {
  shop: {
    id: '74000000-0000-4000-8000-000000000001',
    slug: 'lantern-general-store',
    name: 'Lantern General Store',
    description: 'Seeds, pantry goods, materials, and starter furnishings.',
    active: true,
    contentVersion: 1,
  },
  offers: [
    {
      id: '74000000-0000-4000-8000-000000000011',
      shopSlug: 'lantern-general-store',
      itemSlug: 'moonbean-seed',
      buyPrice: 8,
      sellPrice: null,
      minimumQuantity: 1,
      maximumQuantity: 20,
      active: true,
      availableFrom: null,
      availableUntil: null,
      contentVersion: 1,
    },
    {
      id: '74000000-0000-4000-8000-000000000016',
      shopSlug: 'lantern-general-store',
      itemSlug: 'moonbean',
      buyPrice: null,
      sellPrice: 7,
      minimumQuantity: 1,
      maximumQuantity: 20,
      active: true,
      availableFrom: null,
      availableUntil: null,
      contentVersion: 1,
    },
  ],
  generatedAt: now,
} satisfies ShopCatalog;

const economyCatalog = {
  shop: {
    shopKey: 'village-supply-shop',
    name: 'Village Supply Shop',
    versionId: '99000000-0000-4000-8000-000000000031',
    versionNumber: 1,
    revision: 1,
    status: 'published' as const,
    interactionKey: 'phase7-general-store',
    publishedAt: now,
  },
  offers: [
    {
      offerId: '74000000-0000-4000-8000-000000000011',
      itemSlug: 'moonbean-seed',
      itemName: 'Moonbean Seed',
      itemDescription: 'A gentle meadow seed for Moonbeans.',
      itemCategory: 'seed',
      unitPrice: 8,
      maximumQuantity: 20,
      dailyLimit: 40,
      purchasedToday: 2,
      remainingToday: 38,
      cooldownSeconds: 0,
      availableAt: null,
      inventoryCapacityCost: 1,
      protectedItem: false as const,
      enabled: true,
      revision: 1,
    },
  ],
  availability: 'open' as const,
  generatedAt: now,
} satisfies EconomyShopView;

const purchaseResult = {
  status: 'updated' as const,
  replayed: false,
  transactionId: '90000000-0000-4000-8000-000000000001',
  operation: 'buy' as const,
  itemSlug: 'moonbean-seed',
  quantity: 3,
  dustDelta: -24,
  dustBalance: 226,
  dustStateVersion: 4,
  inventoryStateVersion: 4,
  receipt: {
    receiptId: 'SHOP-0123456789ABCDEF0123',
    shopVersionId: '99000000-0000-4000-8000-000000000031',
    offerId: '74000000-0000-4000-8000-000000000011',
    itemSlug: 'moonbean-seed',
    quantity: 3,
    unitPrice: 8,
    totalPrice: 24,
    ledgerReceiptId: 'DUST-0123456789ABCDEF0123',
    settledAt: now,
  },
} satisfies EconomyPurchaseResult;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function button(label: string, scope: ParentNode = container): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
}

describe('VillageSupplyShopPanel', () => {
  it('shows trusted offer details and performs one confirmed quantity purchase', async () => {
    const onPurchase = vi.fn(
      async (
        _offer: EconomyShopView['offers'][number],
        _quantity: number,
        _idempotencyKey: ReturnType<Crypto['randomUUID']>,
      ): Promise<ShopPurchaseAttempt> =>
        Promise.resolve({ ok: true as const, result: purchaseResult }),
    );
    const onSell = vi.fn();
    await act(async () => {
      root.render(
        <VillageSupplyShopPanel
          catalog={shopCatalog}
          economyCatalog={economyCatalog}
          items={itemCatalog}
          inventory={inventory}
          balance={250}
          busy={false}
          onPurchase={onPurchase}
          onSell={onSell}
        />,
      );
    });

    expect(container.textContent).toContain('Village Supply Shop');
    expect(container.textContent).toContain('Lantern General Store');
    expect(container.textContent).toContain('250 DUST');
    expect(container.textContent).toContain('A gentle meadow seed for Moonbeans.');
    expect(container.textContent).toContain('Artwork preview unavailable');
    expect(container.textContent).toContain('40 per UTC day');
    expect(container.textContent).toContain('2 purchased · 38 remaining');
    expect(container.textContent).toContain('No wait between purchases');
    expect(container.textContent).toContain('2 owned');
    expect(container.textContent).toContain('Available');
    expect(container.textContent).not.toContain('Published shop version');
    expect(container.textContent).not.toContain(economyCatalog.shop.versionId);

    const quantity = container.querySelector<HTMLInputElement>(
      '#shop-quantity-74000000-0000-4000-8000-000000000011',
    );
    expect(quantity).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(quantity, '3');
      quantity?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(quantity?.value).toBe('3');
    expect(container.textContent).toContain('24 DUST total');

    const review = button('Review purchase');
    review?.focus();
    await act(async () => review?.click());
    const confirmation = container.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(confirmation?.textContent).toContain('Confirm purchase');
    expect(confirmation?.textContent).toContain('Quantity3');
    expect(confirmation?.textContent).toContain('Total price24 DUST');
    expect(confirmation?.textContent).toContain('Current DUST250 DUST');
    expect(confirmation?.textContent).toContain('Balance after purchase226 DUST');
    expect(confirmation?.textContent).toContain('Fits in your current bag');
    expect(document.activeElement?.textContent).toBe('Purchase');

    const purchase = button('Purchase', confirmation ?? container);
    await act(async () => {
      purchase?.click();
      purchase?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onPurchase).toHaveBeenCalledTimes(1);
    expect(onPurchase.mock.calls[0]?.[1]).toBe(3);
    expect(onPurchase.mock.calls[0]?.[2]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.textContent).toContain('Purchase Complete');
    expect(container.textContent).toContain('3 × Moonbean Seed');
    expect(container.textContent).toContain('Spent 24 DUST · New balance 226 DUST');
    expect(container.textContent).toContain('SHOP-0123456789ABCDEF0123');
    expect(container.textContent).toContain('DUST-0123456789ABCDEF0123');

    const sell = button('Sell one · 7 DUST');
    await act(async () => sell?.click());
    expect(onSell).toHaveBeenCalledWith('74000000-0000-4000-8000-000000000016');
  });

  it('keeps a failed purchase key for a safe retry and restores focus on Escape', async () => {
    const onPurchase = vi.fn(
      async (
        _offer: EconomyShopView['offers'][number],
        _quantity: number,
        _idempotencyKey: ReturnType<Crypto['randomUUID']>,
      ): Promise<ShopPurchaseAttempt> =>
        Promise.resolve({ ok: true as const, result: purchaseResult }),
    );
    onPurchase.mockResolvedValueOnce({
      ok: false as const,
      message: 'This offer is no longer available.',
    });
    await act(async () => {
      root.render(
        <VillageSupplyShopPanel
          catalog={shopCatalog}
          economyCatalog={economyCatalog}
          items={itemCatalog}
          inventory={inventory}
          balance={250}
          busy={false}
          onPurchase={onPurchase}
          onSell={vi.fn()}
        />,
      );
    });

    const review = button('Review purchase');
    review?.focus();
    await act(async () => review?.click());
    let confirmation = container.querySelector<HTMLElement>('[role="alertdialog"]');
    await act(async () => {
      button('Purchase', confirmation ?? container)?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(confirmation?.textContent).toContain('This offer is no longer available.');
    const firstKey = onPurchase.mock.calls[0]?.[2];
    await act(async () => {
      button('Purchase', confirmation ?? container)?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onPurchase.mock.calls[1]?.[2]).toBe(firstKey);

    await act(async () => button('Dismiss receipt')?.click());
    await act(async () => review?.click());
    confirmation = container.querySelector<HTMLElement>('[role="alertdialog"]');
    await act(async () => {
      confirmation?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(review);
  });

  it('keeps approved offers readable but disables purchases while the shop is closed', async () => {
    await act(async () => {
      root.render(
        <VillageSupplyShopPanel
          catalog={shopCatalog}
          economyCatalog={{ ...economyCatalog, availability: 'closed' }}
          items={itemCatalog}
          inventory={inventory}
          balance={250}
          busy={false}
          onPurchase={async () => ({ ok: false, message: 'The shop is closed.' })}
          onSell={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Shop Temporarily Closed');
    expect(container.textContent).toContain(
      'Purchases are paused. Your DUST and inventory are safe.',
    );
    expect(container.textContent).toContain('Moonbean Seed');
    expect(button('Review purchase')?.disabled).toBe(true);
  });

  it.each([
    [
      'Shop Temporarily Closed',
      { shopOpen: false, balance: 250, totalPrice: 8, inventoryFits: true },
    ],
    [
      'Daily Limit Reached',
      { shopOpen: true, balance: 250, totalPrice: 8, inventoryFits: true, remainingToday: 0 },
    ],
    [
      'Available Again Soon',
      {
        shopOpen: true,
        balance: 250,
        totalPrice: 8,
        inventoryFits: true,
        availableAt: '2099-07-15T00:00:00.000Z',
      },
    ],
    ['Inventory Full', { shopOpen: true, balance: 250, totalPrice: 8, inventoryFits: false }],
    ['Not Enough DUST', { shopOpen: true, balance: 2, totalPrice: 8, inventoryFits: true }],
    ['Available', { shopOpen: true, balance: 250, totalPrice: 8, inventoryFits: true }],
  ])('derives the visible %s state without treating it as settlement authority', (label, input) => {
    expect(deriveShopOfferStatus(input).label).toBe(label);
  });
});

function historyEntry(
  input: Partial<PlayerEconomyView['history'][number]> &
    Pick<
      PlayerEconomyView['history'][number],
      'publicReceiptId' | 'delta' | 'balanceBefore' | 'balanceAfter'
    >,
): PlayerEconomyView['history'][number] {
  return {
    operationKey: 'system_refund',
    sourceKey: 'system-refund',
    sinkKey: null,
    referenceType: 'system_operation',
    referenceId: '90000000-0000-4000-8000-000000000001',
    correlationId: 'private-correlation-value',
    createdAt: now,
    ...input,
  };
}

describe('DustHistoryPanel', () => {
  it('uses human-readable activity names, summaries, and public receipt details only', async () => {
    const onLoadMore = vi.fn();
    const economy = {
      dustBalance: 260,
      dustStateVersion: 6,
      policyVersion: 1,
      nextCursor: 42,
      generatedAt: now,
      history: [
        historyEntry({
          publicReceiptId: 'DUST-00000000000000000001',
          operationKey: 'starter_grant',
          sourceKey: 'starter-grant',
          delta: 250,
          balanceBefore: 0,
          balanceAfter: 250,
          referenceType: 'player_bootstrap',
        }),
        historyEntry({
          publicReceiptId: 'DUST-00000000000000000002',
          operationKey: 'moonpetal_harvest_help',
          sourceKey: 'moonpetal-harvest-help',
          referenceLabel: 'Moonpetal Harvest Help',
          delta: 15,
          balanceBefore: 250,
          balanceAfter: 265,
          referenceType: 'activity_completion',
        }),
        historyEntry({
          publicReceiptId: 'DUST-00000000000000000003',
          operationKey: 'shop_purchase',
          sourceKey: null,
          sinkKey: 'village-supply-shop',
          relatedPublicReceiptId: 'SHOP-00000000000000000003',
          delta: -20,
          balanceBefore: 265,
          balanceAfter: 245,
          referenceType: 'shop_transaction',
        }),
        historyEntry({
          publicReceiptId: 'DUST-00000000000000000004',
          delta: 20,
          balanceBefore: 245,
          balanceAfter: 265,
        }),
        historyEntry({
          publicReceiptId: 'DUST-00000000000000000005',
          operationKey: 'administrative_correction',
          sourceKey: null,
          sinkKey: 'administrative-correction-debit',
          relatedPublicReceiptId: 'CORR-00000000000000000005',
          delta: -5,
          balanceBefore: 265,
          balanceAfter: 260,
          referenceType: 'correction_settlement',
        }),
      ],
    } satisfies PlayerEconomyView;

    await act(async () => {
      root.render(
        <DustHistoryPanel economy={economy} onLoadMore={onLoadMore} loadingMore={false} />,
      );
    });

    expect(container.textContent).toContain('Current balance260 DUST');
    expect(container.textContent).toContain('Recent earnings+285 DUST');
    expect(container.textContent).toContain('Recent spending−25 DUST');
    expect(container.textContent).toContain('Starter Balance');
    expect(container.textContent).toContain('Moonpetal Harvest Help');
    expect(container.textContent).toContain('Village Supply Shop');
    expect(container.textContent).toContain('System Refund');
    expect(container.textContent).toContain('Administrative Correction');
    expect(container.textContent).toContain('+250 DUST');
    expect(container.textContent).toContain('−20 DUST');
    expect(container.textContent).toContain('SHOP-00000000000000000003');
    expect(container.textContent).toContain('CORR-00000000000000000005');
    expect(container.textContent).toContain('DUST-00000000000000000003');
    expect(container.textContent).toContain('Village shop transaction');
    expect(container.textContent).not.toContain('90000000-0000-4000-8000-000000000001');
    expect(container.textContent).not.toContain('private-correlation-value');
    expect(container.textContent).not.toContain('shop_purchase');
    await act(async () => button('Load earlier activity')?.click());
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a truthful empty state', async () => {
    await act(async () => {
      root.render(
        <DustHistoryPanel
          economy={{
            dustBalance: 0,
            dustStateVersion: 1,
            policyVersion: 1,
            history: [],
            nextCursor: null,
            generatedAt: now,
          }}
        />,
      );
    });
    expect(container.textContent).toContain('No DUST activity yet');
    expect(container.textContent).toContain('completed earnings and purchases');
  });
});
