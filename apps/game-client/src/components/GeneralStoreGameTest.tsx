import { useState } from 'react';

import type { GeneralStoreTransaction, GeneralStoreWorkspace } from '../app/economy-client';
import { GeneralStorePanel } from './GeneralStorePanel';

const FIXTURE_TIME = '2026-07-17T00:00:00.000Z';

// The deterministic fixture is exported beside its sole component consumer so
// component tests exercise the exact temporary Game Test workspace.
// eslint-disable-next-line react-refresh/only-export-components
export function createGeneralStoreGameTestWorkspace(
  worldRevisionId: string,
): GeneralStoreWorkspace {
  return {
    shop: {
      shopId: '74000000-0000-4000-8000-000000000001',
      interactionId: 'phase7-general-store',
      worldObjectId: 'phase7-general-store-object',
      slug: 'lantern-general-store',
      name: 'Lantern General Store',
      description: 'Temporary General Store fixture for an isolated Game Test session.',
      shopType: 'npc_general_store',
      shopkeeper: {
        id: '11c00000-0000-4000-8000-000000000001',
        slug: 'mira',
        name: 'Mira',
        introduction: 'Try the temporary shop. Nothing here reaches your real village account.',
      },
      worldId: 'lantern-square',
      worldRevisionId,
      x: 8,
      y: 8,
      interactionRadius: 1.75,
      assetRef: 'phase7-dev-general-store',
      assetVersionId: null,
      artworkReadiness: 'development_marker',
    },
    catalog: {
      catalogId: '11c00000-0000-4000-8000-000000000010',
      catalogKey: 'general-store-game-test',
      publicName: 'General Store Game Test catalog',
      versionId: '11c00000-0000-4000-8000-000000000011',
      versionNumber: 1,
      revision: 1,
      status: 'published',
      publishedAt: FIXTURE_TIME,
    },
    availability: {
      accessEnabled: true,
      buyingEnabled: true,
      sellingEnabled: true,
      message: 'Temporary preview data only.',
      serverTime: FIXTURE_TIME,
    },
    dust: { balance: 100, stateVersion: 1 },
    inventory: { stateVersion: 1, capacity: 12, usedSlots: 2 },
    entries: [
      {
        entryId: '11c00000-0000-4000-8000-000000000021',
        offerId: '74000000-0000-4000-8000-000000000011',
        itemId: '71000000-0000-4000-8000-000000000001',
        itemSlug: 'moonbean-seed',
        itemName: 'Moonbean Seed',
        itemDescription: 'A temporary starter seed packet for preview purchases.',
        itemCategory: 'seed',
        assetRef: 'phase7-dev-moonbean-seed',
        assetReadiness: 'development_marker',
        buyEnabled: true,
        sellEnabled: false,
        buyPrice: 8,
        sellPrice: null,
        currency: 'DUST',
        minimumQuantity: 1,
        maximumQuantity: 20,
        ownedQuantity: 2,
        stockMode: 'global_limited',
        stock: 5,
        maximumStock: 5,
        stockRevision: 1,
        nextRestockAt: null,
        playerBuyDailyLimit: 20,
        playerSellDailyLimit: 20,
        boughtToday: 0,
        soldToday: 0,
        remainingBuyToday: 20,
        remainingSellToday: 20,
        availabilityFrom: null,
        availabilityUntil: null,
        eligibilityRule: 'ordinary_gameplay',
        eligible: true,
        unavailableReason: null,
        entryRevision: 1,
        displayOrder: 1,
      },
      {
        entryId: '11c00000-0000-4000-8000-000000000022',
        offerId: '74000000-0000-4000-8000-000000000016',
        itemId: '71000000-0000-4000-8000-000000000004',
        itemSlug: 'moonbean',
        itemName: 'Moonbean',
        itemDescription: 'Temporary produce for preview sales.',
        itemCategory: 'crop',
        assetRef: 'phase7-dev-moonbean',
        assetReadiness: 'development_marker',
        buyEnabled: false,
        sellEnabled: true,
        buyPrice: null,
        sellPrice: 7,
        currency: 'DUST',
        minimumQuantity: 1,
        maximumQuantity: 20,
        ownedQuantity: 3,
        stockMode: 'unlimited',
        stock: null,
        maximumStock: null,
        stockRevision: 1,
        nextRestockAt: null,
        playerBuyDailyLimit: 20,
        playerSellDailyLimit: 20,
        boughtToday: 0,
        soldToday: 0,
        remainingBuyToday: 20,
        remainingSellToday: 20,
        availabilityFrom: null,
        availabilityUntil: null,
        eligibilityRule: 'ordinary_gameplay',
        eligible: true,
        unavailableReason: null,
        entryRevision: 1,
        displayOrder: 2,
      },
    ],
    receipts: [],
    nextReceiptCursor: null,
    tutorial: null,
    lastEventNumber: 0,
    generatedAt: FIXTURE_TIME,
  };
}

function publicReceiptId(prefix: 'STORE' | 'DUST'): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
}

export function GeneralStoreGameTest({
  worldRevisionId,
  onClose,
}: {
  readonly worldRevisionId: string;
  readonly onClose: () => void;
}) {
  const [workspace, setWorkspace] = useState(() =>
    createGeneralStoreGameTestWorkspace(worldRevisionId),
  );
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>();
  const selectedReceipt = workspace.receipts.find(
    (receipt) => receipt.receiptId === selectedReceiptId,
  );

  async function transact(
    entry: GeneralStoreWorkspace['entries'][number],
    direction: 'buy' | 'sell',
    quantity: number,
  ): Promise<GeneralStoreTransaction> {
    const unitPrice = direction === 'buy' ? entry.buyPrice : entry.sellPrice;
    if (unitPrice === null) throw new Error('This temporary item is unavailable.');
    const totalDust = unitPrice * quantity;
    if (direction === 'buy' && workspace.dust.balance < totalDust)
      throw new Error('The temporary Game Test balance is too low.');
    if (direction === 'sell' && entry.ownedQuantity < quantity)
      throw new Error('The temporary Game Test inventory is too low.');

    const transactionId = crypto.randomUUID();
    const receiptId = publicReceiptId('STORE');
    const resultingDustBalance =
      workspace.dust.balance + (direction === 'buy' ? -totalDust : totalDust);
    const resultingInventoryQuantity =
      entry.ownedQuantity + (direction === 'buy' ? quantity : -quantity);
    const stockRevision = entry.stockRevision + 1;
    const receipt = {
      receiptId,
      transactionId,
      shopName: workspace.shop.name,
      itemName: entry.itemName,
      itemSlug: entry.itemSlug,
      direction,
      quantity,
      unitPrice,
      totalDust,
      currency: 'DUST' as const,
      status: 'completed' as const,
      catalogVersion: workspace.catalog.versionNumber,
      resultingInventoryQuantity,
      resultingDustBalance,
      dustLedgerReceiptId: publicReceiptId('DUST'),
      supportReference: receiptId,
      correctionLinked: false,
      createdAt: new Date().toISOString(),
    };
    const result: GeneralStoreTransaction = {
      status: 'completed',
      replayed: false,
      transactionId,
      direction,
      itemSlug: entry.itemSlug,
      quantity,
      dustDelta: direction === 'buy' ? -totalDust : totalDust,
      dustBalance: resultingDustBalance,
      dustStateVersion: workspace.dust.stateVersion + 1,
      inventoryStateVersion: workspace.inventory.stateVersion + 1,
      stockRevision,
      receipt,
    };
    setWorkspace((current) => ({
      ...current,
      dust: { balance: resultingDustBalance, stateVersion: result.dustStateVersion },
      inventory: { ...current.inventory, stateVersion: result.inventoryStateVersion },
      entries: current.entries.map((candidate) =>
        candidate.entryId === entry.entryId
          ? {
              ...candidate,
              ownedQuantity: resultingInventoryQuantity,
              stock:
                direction === 'buy' && candidate.stock !== null
                  ? candidate.stock - quantity
                  : candidate.stock,
              stockRevision,
              boughtToday: candidate.boughtToday + (direction === 'buy' ? quantity : 0),
              soldToday: candidate.soldToday + (direction === 'sell' ? quantity : 0),
              remainingBuyToday: candidate.remainingBuyToday - (direction === 'buy' ? quantity : 0),
              remainingSellToday:
                candidate.remainingSellToday - (direction === 'sell' ? quantity : 0),
            }
          : candidate,
      ),
      receipts: [receipt, ...current.receipts],
      lastEventNumber: current.lastEventNumber + 1,
      generatedAt: new Date().toISOString(),
    }));
    return result;
  }

  return (
    <div className="world-overlay world-game-test-shop" role="presentation">
      <section aria-labelledby="game-test-shop-title" className="cozy-panel" role="dialog">
        <header className="world-game-test-shop__banner">
          <div>
            <p className="game-kicker">GAME TEST</p>
            <h2 id="game-test-shop-title">Temporary General Store</h2>
            <p>This shop uses temporary preview data.</p>
            <p>No inventory, DUST, stock, limits, receipts, or quest progress will be saved.</p>
          </div>
          <button autoFocus type="button" onClick={onClose}>
            Close temporary shop
          </button>
        </header>
        <GeneralStorePanel
          busy={false}
          workspace={workspace}
          onAcceptTutorial={async () => undefined}
          onInspectReceipt={async (receiptId) => setSelectedReceiptId(receiptId)}
          onTransaction={transact}
          onTurnInTutorial={async () => undefined}
        />
        {selectedReceipt === undefined ? null : (
          <dl aria-label="Temporary receipt detail" className="world-game-test-shop__receipt">
            <div>
              <dt>Receipt</dt>
              <dd>{selectedReceipt.receiptId}</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>
                {selectedReceipt.direction === 'buy' ? 'Bought' : 'Sold'} {selectedReceipt.quantity}{' '}
                × {selectedReceipt.itemName}
              </dd>
            </div>
            <div>
              <dt>Temporary DUST</dt>
              <dd>{selectedReceipt.totalDust}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
