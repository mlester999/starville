import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneralStoreTransaction } from '../app/economy-client';
import { createGeneralStoreGameTestWorkspace } from './GeneralStoreGameTest';
import { GeneralStorePanel } from './GeneralStorePanel';

const worldRevisionId = '11c00000-0000-4000-8000-000000000099';

function transaction(direction: 'buy' | 'sell'): GeneralStoreTransaction {
  const buy = direction === 'buy';
  return {
    status: 'completed',
    replayed: false,
    transactionId: '11c00000-0000-4000-8000-000000000031',
    direction,
    itemSlug: buy ? 'moonbean-seed' : 'moonbean',
    quantity: 1,
    dustDelta: buy ? -8 : 7,
    dustBalance: buy ? 92 : 107,
    dustStateVersion: 2,
    inventoryStateVersion: 2,
    stockRevision: 2,
    receipt: {
      receiptId: 'STORE-0123456789ABCDEF0123',
      transactionId: '11c00000-0000-4000-8000-000000000031',
      shopName: 'Lantern General Store',
      itemName: buy ? 'Moonbean Seed' : 'Moonbean',
      itemSlug: buy ? 'moonbean-seed' : 'moonbean',
      direction,
      quantity: 1,
      unitPrice: buy ? 8 : 7,
      totalDust: buy ? 8 : 7,
      currency: 'DUST',
      status: 'completed',
      catalogVersion: 1,
      resultingInventoryQuantity: buy ? 3 : 2,
      resultingDustBalance: buy ? 92 : 107,
      dustLedgerReceiptId: 'DUST-0123456789ABCDEF0123',
      supportReference: 'STORE-0123456789ABCDEF0123',
      correctionLinked: false,
      createdAt: '2026-07-17T00:00:00.000Z',
    },
  };
}

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

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function renderPanel(overrides?: {
  readonly onTransaction?: () => Promise<GeneralStoreTransaction>;
}) {
  const onTransaction = vi.fn(overrides?.onTransaction ?? (async () => transaction('buy')));
  await act(async () => {
    root.render(
      <GeneralStorePanel
        busy={false}
        workspace={createGeneralStoreGameTestWorkspace(worldRevisionId)}
        onAcceptTutorial={vi.fn()}
        onInspectReceipt={vi.fn()}
        onTransaction={onTransaction}
        onTurnInTutorial={vi.fn()}
      />,
    );
  });
  return onTransaction;
}

describe('GeneralStorePanel', () => {
  it('renders canonical balance, owned quantity, stock, limits, search, and semantic tabs', async () => {
    await renderPanel();
    expect(container.textContent).toContain('Lantern General Store');
    expect(container.textContent).toContain('Mira');
    expect(container.textContent).toContain('100');
    expect(container.textContent).toContain('Moonbean Seed');
    expect(container.textContent).toContain('5 remaining');
    expect(container.textContent).toContain('Stock5');
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(button('Buy')?.getAttribute('aria-selected')).toBe('true');

    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'missing item');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('No catalog entries match these filters.');
  });

  it('confirms a purchase and announces the authoritative receipt and balance', async () => {
    const onTransaction = await renderPanel();
    await act(async () => button('Review buy')?.click());
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'server will recheck',
    );
    expect(document.activeElement?.textContent).toBe('Confirm buy');
    await act(async () => {
      button('Confirm buy')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ itemSlug: 'moonbean-seed' }),
      'buy',
      1,
    );
    expect(container.textContent).toContain('Purchase complete');
    expect(container.textContent).toContain('Balance 92 DUST');
    expect(container.textContent).toContain('STORE-0123456789ABCDEF0123');
  });

  it('supports sale confirmation, safe failure recovery, and receipts empty state', async () => {
    const onTransaction = await renderPanel({
      onTransaction: async () => Promise.reject(new Error('Authoritative sale limit reached.')),
    });
    await act(async () => button('Sell')?.click());
    expect(container.textContent).toContain('Moonbean');
    expect(container.textContent).toContain('3');
    await act(async () => button('Review sell')?.click());
    await act(async () => {
      button('Confirm sell')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ itemSlug: 'moonbean' }),
      'sell',
      1,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Authoritative sale limit reached.',
    );
    expect(container.textContent).not.toContain('Sale complete');
    await act(async () => button('Cancel')?.click());
    await act(async () => button('Receipts')?.click());
    expect(container.textContent).toContain('No General Store receipts yet.');
  });
});
