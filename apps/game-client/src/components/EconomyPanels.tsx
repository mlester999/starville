import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { Inventory, ItemCatalog, ShopCatalog } from '../app/cozy-gameplay-client';
import type {
  EconomyPurchaseResult,
  EconomyShopView,
  PlayerEconomyView,
} from '../app/economy-client';
import {
  deriveShopOfferStatus,
  dustHistoryEntryLabel,
  dustReferenceLabel,
  titleFromEconomyKey,
} from './economy-presentation';

type EconomyOffer = EconomyShopView['offers'][number];
type ItemDefinition = ItemCatalog['items'][number];
type Uuid = ReturnType<Crypto['randomUUID']>;

export type ShopPurchaseAttempt =
  | { readonly ok: true; readonly result: EconomyPurchaseResult }
  | { readonly ok: false; readonly message: string };

interface InventoryProjection {
  readonly ownedQuantity: number;
  readonly freeSlots: number;
  readonly additionalSlots: number;
  readonly fits: boolean;
}

function inventoryProjection(
  inventory: Inventory,
  item: ItemDefinition | undefined,
  itemSlug: string,
  quantity: number,
): InventoryProjection {
  const matchingStacks = inventory.stacks.filter((stack) => stack.item.slug === itemSlug);
  const ownedQuantity = matchingStacks.reduce((total, stack) => total + stack.quantity, 0);
  const freeSlots = Math.max(0, inventory.capacity.capacity - inventory.capacity.usedSlots);
  if (item === undefined) {
    return { ownedQuantity, freeSlots, additionalSlots: quantity, fits: false };
  }
  const existingSpace = item.stackable
    ? matchingStacks.reduce(
        (total, stack) => total + Math.max(0, item.maxStackSize - stack.quantity),
        0,
      )
    : 0;
  const remaining = Math.max(0, quantity - existingSpace);
  const additionalSlots = Math.ceil(remaining / item.maxStackSize);
  return {
    ownedQuantity,
    freeSlots,
    additionalSlots,
    fits: additionalSlots <= freeSlots,
  };
}

function formatCooldown(seconds: number): string {
  if (seconds === 0) return 'No wait between purchases';
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} between purchases`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} between purchases`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} between purchases`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function PurchaseConfirmation({
  item,
  offer,
  quantity,
  balance,
  inventory,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  readonly item: ItemDefinition | undefined;
  readonly offer: EconomyOffer;
  readonly quantity: number;
  readonly balance: number;
  readonly inventory: InventoryProjection;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const purchaseRef = useRef<HTMLButtonElement>(null);
  const totalPrice = offer.unitPrice * quantity;

  useEffect(() => purchaseRef.current?.focus(), []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return;
    const controls = [
      ...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'),
    ];
    const first = controls[0];
    const last = controls.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="cozy-purchase-confirmation-layer" role="presentation">
      <section
        ref={dialogRef}
        className="cozy-purchase-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="purchase-confirmation-title"
        aria-describedby="purchase-confirmation-description"
        onKeyDown={handleKeyDown}
      >
        <p className="game-kicker">Review your basket</p>
        <h3 id="purchase-confirmation-title">Confirm purchase</h3>
        <p id="purchase-confirmation-description">
          The village server makes the final price, limit, balance, and inventory checks.
        </p>

        <dl className="cozy-purchase-confirmation__summary">
          <div>
            <dt>Item</dt>
            <dd>{item?.name ?? offer.itemName}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{quantity.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total price</dt>
            <dd>{totalPrice.toLocaleString()} DUST</dd>
          </div>
          <div>
            <dt>Current DUST</dt>
            <dd>{balance.toLocaleString()} DUST</dd>
          </div>
          <div>
            <dt>Balance after purchase</dt>
            <dd>{Math.max(0, balance - totalPrice).toLocaleString()} DUST</dd>
          </div>
          <div>
            <dt>Inventory availability</dt>
            <dd>{inventory.fits ? 'Fits in your current bag' : 'Your bag is full'}</dd>
          </div>
        </dl>

        {error === undefined ? null : (
          <p className="cozy-purchase-confirmation__error" role="alert">
            {error}
          </p>
        )}

        <div className="cozy-purchase-confirmation__actions">
          <button
            disabled={busy || !inventory.fits}
            type="button"
            onClick={onConfirm}
            ref={purchaseRef}
          >
            {busy ? 'Purchasing…' : 'Purchase'}
          </button>
          <button disabled={busy} type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export function VillageSupplyShopPanel({
  catalog,
  economyCatalog,
  items,
  inventory,
  balance,
  busy,
  onPurchase,
  onSell,
}: {
  readonly catalog: ShopCatalog | undefined;
  readonly economyCatalog: EconomyShopView | undefined;
  readonly items: ItemCatalog;
  readonly inventory: Inventory;
  readonly balance: number;
  readonly busy: boolean;
  readonly onPurchase: (
    offer: EconomyOffer,
    quantity: number,
    idempotencyKey: Uuid,
  ) => Promise<ShopPurchaseAttempt>;
  readonly onSell: (offerId: string) => void;
}) {
  const [quantities, setQuantities] = useState<Readonly<Record<string, number>>>({});
  const [pending, setPending] = useState<{
    readonly offerId: string;
    readonly quantity: number;
    readonly idempotencyKey: Uuid;
  }>();
  const [attemptError, setAttemptError] = useState<string>();
  const [purchaseResult, setPurchaseResult] = useState<{
    readonly itemName: string;
    readonly result: EconomyPurchaseResult;
  }>();
  const submittingRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const itemBySlug = useMemo(
    () => new Map(items.items.map((item) => [item.slug, item] as const)),
    [items.items],
  );

  if (catalog === undefined || economyCatalog === undefined) {
    return <p role="status">Loading approved Village Supply Shop offers…</p>;
  }

  const shopOpen = (economyCatalog.availability ?? 'open') === 'open';
  const pendingOffer = economyCatalog.offers.find((offer) => offer.offerId === pending?.offerId);
  const pendingItem =
    pendingOffer === undefined ? undefined : itemBySlug.get(pendingOffer.itemSlug);
  const pendingInventory =
    pendingOffer === undefined || pending === undefined
      ? undefined
      : inventoryProjection(inventory, pendingItem, pendingOffer.itemSlug, pending.quantity);
  const sellOffers = catalog.offers.filter((offer) => offer.sellPrice !== null);

  function closeConfirmation() {
    if (submittingRef.current) return;
    setPending(undefined);
    setAttemptError(undefined);
    const returnTarget = returnFocusRef.current;
    queueMicrotask(() => returnTarget?.focus());
  }

  async function confirmPurchase() {
    if (
      pending === undefined ||
      pendingOffer === undefined ||
      pendingInventory === undefined ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    setAttemptError(undefined);
    try {
      const attempt = await onPurchase(pendingOffer, pending.quantity, pending.idempotencyKey);
      if (!attempt.ok) {
        setAttemptError(attempt.message);
        return;
      }
      setPurchaseResult({
        itemName: pendingItem?.name ?? pendingOffer.itemName,
        result: attempt.result,
      });
      setPending(undefined);
      const returnTarget = returnFocusRef.current;
      queueMicrotask(() => returnTarget?.focus());
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <div className="cozy-panel__body cozy-shop">
      <section className="cozy-shop__hero" aria-labelledby="village-supply-shop-title">
        <div className="cozy-shop__crest" aria-hidden="true">
          ✦
        </div>
        <div>
          <p className="game-kicker">Village counter · {catalog.shop.name}</p>
          <h3 id="village-supply-shop-title">{economyCatalog.shop.name}</h3>
          <p>{catalog.shop.description}</p>
          <p className="cozy-shop__authority-note">
            Approved prices and limits are checked by the village server when you purchase.
          </p>
        </div>
        <dl>
          <div>
            <dt>Current DUST</dt>
            <dd>
              <output>{balance.toLocaleString()} DUST</output>
            </dd>
          </div>
          <div>
            <dt>Bag space</dt>
            <dd>
              {inventory.capacity.usedSlots} of {inventory.capacity.capacity} slots used
            </dd>
          </div>
          <div>
            <dt>Shop</dt>
            <dd>{shopOpen ? 'Open' : 'Temporarily closed'}</dd>
          </div>
        </dl>
      </section>

      {purchaseResult === undefined ? null : (
        <section className="cozy-purchase-result" aria-labelledby="purchase-result-title">
          <div aria-hidden="true">✓</div>
          <div>
            <p className="game-kicker">Purchase Complete</p>
            <h3 id="purchase-result-title">
              {purchaseResult.result.receipt.quantity.toLocaleString()} × {purchaseResult.itemName}
            </h3>
            <p>
              Spent {purchaseResult.result.receipt.totalPrice.toLocaleString()} DUST · New balance{' '}
              {(purchaseResult.result.dustBalance ?? balance).toLocaleString()} DUST
            </p>
            <dl>
              <div>
                <dt>Shop receipt</dt>
                <dd>{purchaseResult.result.receipt.receiptId}</dd>
              </div>
              <div>
                <dt>DUST receipt</dt>
                <dd>{purchaseResult.result.receipt.ledgerReceiptId}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{formatDateTime(purchaseResult.result.receipt.settledAt)}</dd>
              </div>
            </dl>
            {purchaseResult.result.replayed ? (
              <small>
                This completed receipt was safely restored; the purchase was not repeated.
              </small>
            ) : null}
          </div>
          <button type="button" onClick={() => setPurchaseResult(undefined)}>
            Dismiss receipt
          </button>
        </section>
      )}

      {!shopOpen ? (
        <div className="cozy-shop__closed" role="status">
          <strong>Shop Temporarily Closed</strong>
          <span>Purchases are paused. Your DUST and inventory are safe.</span>
        </div>
      ) : null}

      {economyCatalog.offers.length === 0 ? (
        <p className="cozy-shop__empty">No approved offers are available right now.</p>
      ) : (
        <div className="cozy-shop__offer-grid" aria-label="Approved shop offers">
          {economyCatalog.offers.map((offer) => {
            const item = itemBySlug.get(offer.itemSlug);
            const quantityLimit = Math.max(
              1,
              Math.min(offer.maximumQuantity, offer.remainingToday ?? offer.maximumQuantity),
            );
            const quantity = Math.min(quantities[offer.offerId] ?? 1, quantityLimit);
            const totalPrice = offer.unitPrice * quantity;
            const projection = inventoryProjection(inventory, item, offer.itemSlug, quantity);
            const offerStatus = deriveShopOfferStatus({
              shopOpen,
              balance,
              totalPrice,
              inventoryFits: projection.fits,
              ...(offer.remainingToday === undefined
                ? {}
                : { remainingToday: offer.remainingToday }),
              ...(offer.availableAt === undefined ? {} : { availableAt: offer.availableAt }),
            });
            const titleId = `shop-offer-${offer.offerId}`;
            const quantityId = `shop-quantity-${offer.offerId}`;
            return (
              <article key={offer.offerId} aria-labelledby={titleId}>
                <div className="cozy-shop-card__art">
                  <span aria-hidden="true">✦</span>
                  <small>
                    {item?.assetReadiness === 'approved'
                      ? 'Artwork preview unavailable'
                      : 'Development artwork'}
                  </small>
                </div>
                <div className="cozy-shop-card__content">
                  <div className="cozy-shop-card__title">
                    <div>
                      <p>
                        {titleFromEconomyKey(
                          offer.itemCategory ?? item?.category ?? 'village-goods',
                        )}
                      </p>
                      <h4 id={titleId}>{item?.name ?? offer.itemName}</h4>
                    </div>
                    <strong>{offer.unitPrice.toLocaleString()} DUST</strong>
                  </div>
                  <p>
                    {offer.itemDescription ?? item?.description ?? 'An approved village supply.'}
                  </p>
                  <span
                    className={`cozy-shop-status cozy-shop-status--${offerStatus.key}`}
                    data-status={offerStatus.key}
                  >
                    {offerStatus.label}
                  </span>
                  <small className="cozy-shop-status__detail">{offerStatus.detail}</small>

                  <dl className="cozy-shop-card__facts">
                    <div>
                      <dt>Purchase limit</dt>
                      <dd>
                        Up to {offer.maximumQuantity} at once · {offer.dailyLimit} per UTC day
                      </dd>
                    </div>
                    <div>
                      <dt>Today</dt>
                      <dd>
                        {offer.remainingToday === undefined
                          ? 'Checked when you purchase'
                          : offer.purchasedToday === undefined
                            ? `${offer.remainingToday} remaining`
                            : `${offer.purchasedToday} purchased · ${offer.remainingToday} remaining`}
                      </dd>
                    </div>
                    <div>
                      <dt>Cooldown</dt>
                      <dd>{formatCooldown(offer.cooldownSeconds)}</dd>
                    </div>
                    <div>
                      <dt>Inventory</dt>
                      <dd>
                        {projection.ownedQuantity} owned ·{' '}
                        {projection.fits
                          ? `${projection.additionalSlots} new bag slot${projection.additionalSlots === 1 ? '' : 's'} needed`
                          : 'not enough bag space'}
                      </dd>
                    </div>
                  </dl>

                  <div className="cozy-shop-card__purchase">
                    <label htmlFor={quantityId}>Quantity</label>
                    <input
                      id={quantityId}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={quantityLimit}
                      step={1}
                      value={quantity}
                      disabled={busy || !shopOpen || offer.remainingToday === 0}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        setQuantities((current) => ({
                          ...current,
                          [offer.offerId]: Number.isInteger(next)
                            ? Math.min(quantityLimit, Math.max(1, next))
                            : 1,
                        }));
                      }}
                    />
                    <output htmlFor={quantityId}>{totalPrice.toLocaleString()} DUST total</output>
                    <button
                      type="button"
                      disabled={busy || !offerStatus.purchasable}
                      onClick={(event) => {
                        returnFocusRef.current = event.currentTarget;
                        setAttemptError(undefined);
                        setPending({
                          offerId: offer.offerId,
                          quantity,
                          idempotencyKey: crypto.randomUUID(),
                        });
                      }}
                    >
                      Review purchase
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sellOffers.length === 0 ? null : (
        <section className="cozy-shop__sell" aria-labelledby="village-sell-title">
          <div>
            <p className="game-kicker">Harvest counter</p>
            <h3 id="village-sell-title">Sell one item</h3>
            <p>Only eligible items already in your bag can be sold. The server checks each sale.</p>
          </div>
          <ul>
            {sellOffers.map((offer) => {
              const item = itemBySlug.get(offer.itemSlug);
              const owned = inventory.stacks
                .filter((stack) => stack.item.slug === offer.itemSlug)
                .reduce((total, stack) => total + stack.quantity, 0);
              return (
                <li key={offer.id}>
                  <span>
                    <strong>{item?.name ?? titleFromEconomyKey(offer.itemSlug)}</strong>
                    <small>{owned} in bag</small>
                  </span>
                  <button
                    disabled={busy || !shopOpen || owned < 1 || offer.sellPrice === null}
                    type="button"
                    onClick={() => onSell(offer.id)}
                  >
                    Sell one · {offer.sellPrice?.toLocaleString()} DUST
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pending !== undefined && pendingOffer !== undefined && pendingInventory !== undefined ? (
        <PurchaseConfirmation
          item={pendingItem}
          offer={pendingOffer}
          quantity={pending.quantity}
          balance={balance}
          inventory={pendingInventory}
          busy={busy}
          error={attemptError}
          onCancel={closeConfirmation}
          onConfirm={() => void confirmPurchase()}
        />
      ) : null}
    </div>
  );
}

export function DustHistoryPanel({
  economy,
  loadingMore = false,
  onLoadMore,
}: {
  readonly economy: PlayerEconomyView | undefined;
  readonly loadingMore?: boolean;
  readonly onLoadMore?: () => void;
}) {
  if (economy === undefined) return <p role="status">Reading your DUST receipts…</p>;
  const recentEarnings = economy.history.reduce(
    (total, entry) => total + (entry.delta > 0 ? entry.delta : 0),
    0,
  );
  const recentSpending = economy.history.reduce(
    (total, entry) => total + (entry.delta < 0 ? Math.abs(entry.delta) : 0),
    0,
  );
  return (
    <div className="cozy-panel__body cozy-dust-history">
      <header>
        <div>
          <span>Current balance</span>
          <strong>{economy.dustBalance.toLocaleString()} DUST</strong>
          <small>Off-chain game currency · not transferable or withdrawable</small>
        </div>
        <dl aria-label="Recent visible DUST activity summary">
          <div>
            <dt>Recent earnings</dt>
            <dd>+{recentEarnings.toLocaleString()} DUST</dd>
          </div>
          <div>
            <dt>Recent spending</dt>
            <dd>−{recentSpending.toLocaleString()} DUST</dd>
          </div>
        </dl>
      </header>
      {economy.history.length === 0 ? (
        <div className="cozy-dust-history__empty">
          <span aria-hidden="true">✦</span>
          <strong>No DUST activity yet</strong>
          <p>Your completed earnings and purchases will appear here with safe receipts.</p>
        </div>
      ) : (
        <ol aria-label="DUST activity">
          {economy.history.map((entry) => {
            const credit = entry.delta > 0;
            return (
              <li key={entry.publicReceiptId}>
                <div className="cozy-dust-history__entry-heading">
                  <span className="cozy-dust-history__glyph" aria-hidden="true">
                    {credit ? '✦' : '◇'}
                  </span>
                  <div>
                    <strong>{dustHistoryEntryLabel(entry)}</strong>
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  </div>
                </div>
                <div className="cozy-dust-history__amount">
                  <span>{credit ? 'Earned' : 'Spent'}</span>
                  <strong className={credit ? 'is-credit' : 'is-debit'}>
                    {credit ? '+' : '−'}
                    {Math.abs(entry.delta).toLocaleString()} DUST
                  </strong>
                  <small>Balance: {entry.balanceAfter.toLocaleString()} DUST</small>
                </div>
                <details>
                  <summary>Receipt details</summary>
                  <dl>
                    <div>
                      <dt>DUST receipt</dt>
                      <dd>{entry.publicReceiptId}</dd>
                    </div>
                    {entry.relatedPublicReceiptId === undefined ||
                    entry.relatedPublicReceiptId === null ? null : (
                      <div>
                        <dt>Related receipt</dt>
                        <dd>{entry.relatedPublicReceiptId}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Activity</dt>
                      <dd>{dustReferenceLabel(entry.referenceType)}</dd>
                    </div>
                    <div>
                      <dt>Balance change</dt>
                      <dd>
                        {entry.balanceBefore.toLocaleString()} →{' '}
                        {entry.balanceAfter.toLocaleString()} DUST
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>Completed</dd>
                    </div>
                  </dl>
                </details>
              </li>
            );
          })}
        </ol>
      )}
      {economy.nextCursor === null || onLoadMore === undefined ? null : (
        <button
          className="cozy-dust-history__more"
          disabled={loadingMore}
          type="button"
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading earlier activity…' : 'Load earlier activity'}
        </button>
      )}
    </div>
  );
}
