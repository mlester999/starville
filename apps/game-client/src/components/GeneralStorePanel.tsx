import { useEffect, useMemo, useRef, useState } from 'react';

import type { GeneralStoreTransaction, GeneralStoreWorkspace } from '../app/economy-client';

type Entry = GeneralStoreWorkspace['entries'][number];
type Direction = 'buy' | 'sell';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function entryLimit(entry: Entry, direction: Direction): number {
  const directionRemaining =
    direction === 'buy' ? entry.remainingBuyToday : entry.remainingSellToday;
  const stock = direction === 'buy' && entry.stock !== null ? entry.stock : Number.MAX_SAFE_INTEGER;
  const owned = direction === 'sell' ? entry.ownedQuantity : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(entry.maximumQuantity, directionRemaining, stock, owned));
}

function unavailableReason(entry: Entry, direction: Direction): string | undefined {
  if (!entry.eligible) return entry.unavailableReason ?? 'Complete the listed village requirement.';
  if (direction === 'buy' && !entry.buyEnabled) return 'This item is not sold here.';
  if (direction === 'sell' && !entry.sellEnabled)
    return 'The General Store does not buy this item.';
  if (direction === 'buy' && entry.stock !== null && entry.stock < 1) return 'Out of stock.';
  if (direction === 'sell' && entry.ownedQuantity < 1) return 'None available in your inventory.';
  if (entryLimit(entry, direction) < 1) return 'The current daily limit has been reached.';
  return entry.unavailableReason ?? undefined;
}

export function GeneralStorePanel({
  workspace,
  busy,
  onTransaction,
  onInspectReceipt,
  onAcceptTutorial,
  onTurnInTutorial,
}: {
  readonly workspace: GeneralStoreWorkspace | undefined;
  readonly busy: boolean;
  readonly onTransaction: (
    entry: Entry,
    direction: Direction,
    quantity: number,
  ) => Promise<GeneralStoreTransaction>;
  readonly onInspectReceipt: (receiptId: string) => Promise<void>;
  readonly onAcceptTutorial: () => Promise<void>;
  readonly onTurnInTutorial: (stateVersion: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<'buy' | 'sell' | 'receipts'>('buy');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [quantities, setQuantities] = useState<Readonly<Record<string, number>>>({});
  const [pending, setPending] = useState<{
    readonly entry: Entry;
    readonly direction: Direction;
  }>();
  const [result, setResult] = useState<GeneralStoreTransaction>();
  const [attemptError, setAttemptError] = useState<string>();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => confirmRef.current?.focus(), [pending]);

  const categories = useMemo(
    () =>
      workspace === undefined
        ? []
        : [...new Set(workspace.entries.map((entry) => entry.itemCategory))].sort(),
    [workspace],
  );

  if (workspace === undefined) {
    return <p role="status">Mira is checking the current General Store catalog…</p>;
  }

  const tutorial = workspace.tutorial;
  const tutorialStateVersion = tutorial?.stateVersion ?? null;
  const direction: Direction = tab === 'sell' ? 'sell' : 'buy';
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const entries = workspace.entries.filter((entry) => {
    const supportsDirection = direction === 'buy' ? entry.buyEnabled : entry.sellEnabled;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      `${entry.itemName} ${entry.itemDescription}`.toLocaleLowerCase().includes(normalizedSearch);
    return (
      supportsDirection && matchesSearch && (category === 'all' || entry.itemCategory === category)
    );
  });
  const transactionEnabled =
    workspace.availability.accessEnabled &&
    (direction === 'buy'
      ? workspace.availability.buyingEnabled
      : workspace.availability.sellingEnabled);
  const pendingQuantity = pending === undefined ? 1 : (quantities[pending.entry.entryId] ?? 1);
  const pendingPrice =
    pending === undefined
      ? 0
      : pending.direction === 'buy'
        ? (pending.entry.buyPrice ?? 0)
        : (pending.entry.sellPrice ?? 0);

  async function confirmTransaction() {
    if (pending === undefined) return;
    setAttemptError(undefined);
    try {
      const next = await onTransaction(pending.entry, pending.direction, pendingQuantity);
      setResult(next);
      setPending(undefined);
    } catch (error) {
      setAttemptError(
        error instanceof Error ? error.message : 'The transaction could not be completed.',
      );
    }
  }

  return (
    <div className="cozy-panel__body general-store">
      <header className="general-store__hero">
        <div aria-hidden="true" className="general-store__portrait">
          M
        </div>
        <div>
          <p className="game-kicker">Lantern Square · {workspace.shop.shopkeeper.name}</p>
          <h3>{workspace.shop.name}</h3>
          <p>{workspace.shop.shopkeeper.introduction}</p>
          <small>
            Catalog v{workspace.catalog.versionNumber} · Prices, stock, limits, inventory, and DUST
            settle on the village server.
          </small>
        </div>
        <dl aria-label="General Store account summary">
          <div>
            <dt>DUST</dt>
            <dd>{workspace.dust.balance.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Bag</dt>
            <dd>
              {workspace.inventory.usedSlots}/{workspace.inventory.capacity}
            </dd>
          </div>
          <div>
            <dt>Store</dt>
            <dd>{workspace.availability.accessEnabled ? 'Open' : 'Paused'}</dd>
          </div>
        </dl>
      </header>

      {workspace.availability.accessEnabled ? null : (
        <p className="general-store__notice" role="status">
          {workspace.availability.message ?? 'The General Store is taking a short pause.'}
        </p>
      )}

      {tutorial === null ? null : (
        <section className="general-store__tutorial" aria-labelledby="shop-tutorial-title">
          <div>
            <p className="game-kicker">Village guide</p>
            <h4 id="shop-tutorial-title">{tutorial.name}</h4>
            <p>{tutorial.description}</p>
          </div>
          <ol>
            {tutorial.objectives.map((objective) => (
              <li className={objective.completed ? 'is-complete' : undefined} key={objective.key}>
                <span aria-hidden="true">{objective.completed ? '✓' : '○'}</span> {objective.label}
              </li>
            ))}
          </ol>
          {tutorial.status === 'available' ? (
            <button
              disabled={busy || !tutorial.eligible}
              type="button"
              onClick={() => void onAcceptTutorial()}
            >
              {tutorial.eligible ? 'Start tutorial' : 'Complete Hearth and Hands first'}
            </button>
          ) : tutorial.status === 'active' &&
            tutorial.objectives
              .filter(
                (objective) =>
                  objective.key !== 'return_to_shopkeeper' && objective.key !== 'receive_reward',
              )
              .every((objective) => objective.completed) &&
            tutorialStateVersion !== null ? (
            <button
              disabled={busy}
              type="button"
              onClick={() => void onTurnInTutorial(tutorialStateVersion)}
            >
              Finish tutorial · {tutorial.rewardDust} DUST
            </button>
          ) : null}
        </section>
      )}

      <div className="general-store__tabs" role="tablist" aria-label="General Store sections">
        {(['buy', 'sell', 'receipts'] as const).map((value) => (
          <button
            aria-selected={tab === value}
            key={value}
            role="tab"
            type="button"
            onClick={() => setTab(value)}
          >
            {value === 'buy' ? 'Buy' : value === 'sell' ? 'Sell' : 'Receipts'}
          </button>
        ))}
      </div>

      {tab === 'receipts' ? (
        <section className="general-store__receipts" aria-label="Shop receipt history">
          {workspace.receipts.length === 0 ? (
            <p>No General Store receipts yet. Completed purchases and sales will appear here.</p>
          ) : (
            <ol>
              {workspace.receipts.map((receipt) => (
                <li key={receipt.receiptId}>
                  <div>
                    <strong>
                      {receipt.direction === 'buy' ? 'Bought' : 'Sold'} {receipt.itemName}
                    </strong>
                    <span>
                      {receipt.quantity} × {receipt.unitPrice.toLocaleString()} DUST
                    </span>
                    <time dateTime={receipt.createdAt}>{formatDate(receipt.createdAt)}</time>
                  </div>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => void onInspectReceipt(receipt.receiptId)}
                  >
                    Inspect {receipt.receiptId}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <>
          <div className="general-store__filters">
            <label>
              Search
              <input
                type="search"
                value={search}
                placeholder={`Search ${direction === 'buy' ? 'catalog' : 'inventory'}`}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.currentTarget.value)}>
                <option value="all">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {entries.length === 0 ? (
            <p className="general-store__empty">
              {direction === 'buy'
                ? 'No catalog entries match these filters.'
                : 'No eligible inventory items match these filters.'}
            </p>
          ) : (
            <div className="general-store__grid" aria-label={`${direction} entries`}>
              {entries.map((entry) => {
                const limit = entryLimit(entry, direction);
                const quantity = Math.min(quantities[entry.entryId] ?? 1, Math.max(1, limit));
                const price = direction === 'buy' ? entry.buyPrice : entry.sellPrice;
                const reason = unavailableReason(entry, direction);
                return (
                  <article key={entry.entryId}>
                    <div className="general-store__item-art" aria-hidden="true">
                      ✦
                    </div>
                    <div>
                      <small>{entry.itemCategory.replaceAll('_', ' ')}</small>
                      <h4>{entry.itemName}</h4>
                      <p>{entry.itemDescription}</p>
                      <strong>{price?.toLocaleString()} DUST</strong>
                    </div>
                    <dl>
                      <div>
                        <dt>Owned</dt>
                        <dd>{entry.ownedQuantity}</dd>
                      </div>
                      <div>
                        <dt>Today</dt>
                        <dd>{limit} remaining</dd>
                      </div>
                      <div>
                        <dt>Stock</dt>
                        <dd>{entry.stock === null ? 'Available' : entry.stock}</dd>
                      </div>
                      <div>
                        <dt>Restock</dt>
                        <dd>
                          {entry.nextRestockAt === null ? '—' : formatDate(entry.nextRestockAt)}
                        </dd>
                      </div>
                    </dl>
                    {reason === undefined ? null : (
                      <p className="general-store__reason">{reason}</p>
                    )}
                    <div className="general-store__quantity">
                      <label htmlFor={`shop-${direction}-${entry.entryId}`}>Quantity</label>
                      <input
                        id={`shop-${direction}-${entry.entryId}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.max(1, limit)}
                        value={quantity}
                        disabled={busy || reason !== undefined || !transactionEnabled}
                        onChange={(event) => {
                          const next = Number(event.currentTarget.value);
                          setQuantities((current) => ({
                            ...current,
                            [entry.entryId]: Number.isInteger(next)
                              ? Math.max(1, Math.min(limit, next))
                              : 1,
                          }));
                        }}
                      />
                      <output>{((price ?? 0) * quantity).toLocaleString()} DUST total</output>
                      <button
                        disabled={busy || reason !== undefined || !transactionEnabled}
                        type="button"
                        onClick={() => setPending({ entry, direction })}
                      >
                        Review {direction}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {result === undefined ? null : (
        <section className="general-store__result" role="status">
          <strong>{result.direction === 'buy' ? 'Purchase' : 'Sale'} complete</strong>
          <span>
            {result.quantity} × {result.receipt.itemName} ·{' '}
            {result.receipt.totalDust.toLocaleString()} DUST
          </span>
          <span>
            Balance {result.dustBalance.toLocaleString()} DUST · Receipt {result.receipt.receiptId}
          </span>
          {result.replayed ? (
            <small>This saved receipt was restored; the transaction was not repeated.</small>
          ) : null}
          <button type="button" onClick={() => setResult(undefined)}>
            Dismiss
          </button>
        </section>
      )}

      {pending === undefined ? null : (
        <div className="general-store__dialog-layer" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="general-store-confirm-title"
          >
            <p className="game-kicker">Confirm with Mira</p>
            <h3 id="general-store-confirm-title">
              {pending.direction === 'buy' ? 'Buy' : 'Sell'} {pending.entry.itemName}?
            </h3>
            <p>
              {pendingQuantity} × {pendingPrice.toLocaleString()} DUST ={' '}
              {(pendingQuantity * pendingPrice).toLocaleString()} DUST
            </p>
            <p>
              The server will recheck the exact catalog revision, price, stock, limits, inventory,
              and DUST balance.
            </p>
            {attemptError === undefined ? null : <p role="alert">{attemptError}</p>}
            <div>
              <button
                ref={confirmRef}
                disabled={busy}
                type="button"
                onClick={() => void confirmTransaction()}
              >
                {busy ? 'Checking…' : `Confirm ${pending.direction}`}
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  setPending(undefined);
                  setAttemptError(undefined);
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
