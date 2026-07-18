import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  economyShopCatalogEntryCreateAction,
  economyShopCatalogEntryRemoveAction,
  economyShopCatalogEntryAction,
  economyShopCatalogSuccessorAction,
  economyShopLiveOpsAction,
  economyShopOfferAction,
  economyShopReconciliationAction,
  economyShopRestockAction,
  economyShopTransitionAction,
} from '../../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  LifecycleStepper,
  StatusChip,
  formatDate,
  formatDuration,
  friendlyKey,
} from '../../../../../components/economy-admin-ui';
import { EconomyConfirmAction } from '../../../../../components/economy-confirm-action';
import { ConfirmedSubmitButton } from '../../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadEconomyShopDetail, loadEconomyShopOperations } from '../../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function dateTimeLocal(value: string): string {
  return new Date(value).toISOString().slice(0, 16);
}

export default async function EconomyShopDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly shopId: string }>;
  readonly searchParams: Promise<{ readonly version?: string; readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('economy.shop.read');
  const route = await params;
  const parsedId = z.uuid().safeParse(route.shopId);
  if (!parsedId.success) notFound();
  const [query, detail, operations] = await Promise.all([
    searchParams,
    loadEconomyShopDetail(parsedId.data),
    loadEconomyShopOperations(parsedId.data),
  ]);
  const selected =
    detail.versions.find((version) => version.id === query.version) ??
    detail.versions.find((version) =>
      ['draft', 'validated', 'in_review', 'approved', 'scheduled'].includes(version.status),
    ) ??
    detail.versions.find((version) => version.active) ??
    detail.versions[0];
  if (selected === undefined) notFound();
  const canEdit = hasAdminPermission(context, 'economy.shop.edit');
  const canPublish = hasAdminPermission(context, 'economy.shop.publish');
  const hasOpenDraft = detail.versions.some((version) =>
    ['draft', 'validated', 'in_review', 'approved', 'scheduled'].includes(version.status),
  );
  const activeVersion = detail.versions.find((version) => version.active);
  const selectedOperations = operations.versions.find(
    (version) => version.versionId === selected.id,
  );
  const selectedOfferIds = new Set(selectedOperations?.entries.map((entry) => entry.offerId) ?? []);
  const availableOffers = operations.availableOffers.filter(
    (offer) => !selectedOfferIds.has(offer.offerId) && (offer.buyEligible || offer.sellEligible),
  );

  return (
    <main className="economy-page economy-shop-detail" aria-labelledby="economy-page-title">
      <Link className="back-link" href="/economy/shops">
        ← All shops
      </Link>
      <EconomyPageHeader
        actions={<StatusChip value={selected.status} />}
        description={detail.shop.description}
        eyebrow={`${friendlyKey(detail.shop.ownerModule)} · ${detail.shop.slug}`}
        title={detail.shop.name}
      />
      <EconomyNotice notice={query.notice} />

      <nav aria-label="Shop versions" className="economy-version-nav">
        {detail.versions.map((version) => (
          <Link
            aria-current={version.id === selected.id ? 'page' : undefined}
            href={`/economy/shops/${detail.shop.shopDefinitionId}?version=${version.id}`}
            key={version.id}
          >
            v{version.versionNumber} · {friendlyKey(version.status)}
            {version.active ? ' · Active' : ''}
          </Link>
        ))}
      </nav>

      <section className="economy-panel" aria-labelledby="shop-general-heading">
        <div className="economy-panel__heading">
          <div>
            <p className="eyebrow">General</p>
            <h2 id="shop-general-heading">Version v{selected.versionNumber}</h2>
          </div>
          <StatusChip value={selected.active ? 'active' : selected.status} />
        </div>
        <LifecycleStepper kind="shop" status={selected.status} />
        <dl className="economy-detail-list economy-detail-list--columns">
          <div>
            <dt>Friendly name</dt>
            <dd>{selected.name}</dd>
          </div>
          <div>
            <dt>Interaction key</dt>
            <dd>
              <code>{selected.interactionKey}</code>
            </dd>
          </div>
          <div>
            <dt>Enabled state</dt>
            <dd>{selected.status === 'disabled' ? 'Disabled' : 'Enabled by active publication'}</dd>
          </div>
          <div>
            <dt>Availability window</dt>
            <dd>Effective {formatDate(selected.effectiveAt)}</dd>
          </div>
          <div>
            <dt>Required level</dt>
            <dd>Controlled by approved item definitions</dd>
          </div>
          <div>
            <dt>Owning module</dt>
            <dd>{friendlyKey(detail.shop.ownerModule)}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{selected.revision}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatDate(selected.publishedAt)}</dd>
          </div>
        </dl>
      </section>

      {!hasOpenDraft && canEdit && activeVersion !== undefined ? (
        <section className="economy-panel" aria-labelledby="shop-draft-heading">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Immutable publication</p>
              <h2 id="shop-draft-heading">Create a new draft</h2>
            </div>
          </div>
          <p>
            Copies the active offer set into a mutable draft. The active player shop does not
            change.
          </p>
          <form action={economyShopCatalogSuccessorAction} className="economy-form-grid">
            <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
            <input name="expectedActiveVersionId" type="hidden" value={activeVersion.id} />
            <label>
              Friendly name
              <input
                defaultValue={activeVersion.name}
                maxLength={80}
                minLength={3}
                name="name"
                required
              />
            </label>
            <label className="economy-form-grid__wide">
              Description
              <textarea
                defaultValue={activeVersion.description}
                maxLength={280}
                minLength={3}
                name="description"
                required
              />
            </label>
            <label className="economy-form-grid__wide">
              Change reason
              <textarea
                defaultValue="Create a reviewed successor without changing the active player catalog."
                maxLength={500}
                minLength={12}
                name="reason"
                required
              />
            </label>
            <div className="economy-form-grid__actions">
              <button type="submit">Create draft</button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="shop-offers-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Structured catalog</p>
            <h2 id="shop-offers-heading">Offers</h2>
          </div>
          <span>
            {selected.offers.length} approved item{selected.offers.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="economy-offer-grid">
          {selected.offers.map((offer) => (
            <article className="economy-offer-card" key={offer.offerId}>
              <header>
                <div className="economy-item-marker" aria-hidden="true">
                  ◇
                </div>
                <div>
                  <p className="eyebrow">{friendlyKey(offer.category)}</p>
                  <h3>{offer.itemName}</h3>
                  <small>{offer.itemSlug}</small>
                </div>
                <StatusChip value={offer.enabled ? 'enabled' : 'disabled'} />
              </header>
              <p>{offer.itemDescription}</p>
              {selected.status === 'draft' && canEdit ? (
                <form action={economyShopOfferAction} className="economy-offer-form">
                  <input
                    name="shopDefinitionId"
                    type="hidden"
                    value={detail.shop.shopDefinitionId}
                  />
                  <input name="versionId" type="hidden" value={selected.id} />
                  <input name="offerId" type="hidden" value={offer.offerId} />
                  <input name="expectedShopRevision" type="hidden" value={selected.revision} />
                  <label>
                    DUST price
                    <input
                      defaultValue={offer.unitPrice}
                      max={1_000_000}
                      min="1"
                      name="unitPrice"
                      required
                      type="number"
                    />
                  </label>
                  <label>
                    Purchase quantity
                    <input
                      defaultValue={offer.maximumQuantity}
                      max="99"
                      min="1"
                      name="maximumQuantity"
                      required
                      type="number"
                    />
                  </label>
                  <label>
                    Daily limit
                    <input
                      defaultValue={offer.dailyLimit}
                      max="999"
                      min="1"
                      name="dailyLimit"
                      required
                      type="number"
                    />
                  </label>
                  <label>
                    Cooldown seconds
                    <input
                      defaultValue={offer.cooldownSeconds}
                      max="86400"
                      min="0"
                      name="cooldownSeconds"
                      required
                      type="number"
                    />
                  </label>
                  <label className="economy-checkbox">
                    <input defaultChecked={offer.enabled} name="enabled" type="checkbox" /> Offer
                    enabled
                  </label>
                  <div className="economy-offer-form__actions">
                    <button type="submit">Save offer</button>
                  </div>
                </form>
              ) : (
                <dl className="economy-detail-list economy-detail-list--compact">
                  <div>
                    <dt>Price</dt>
                    <dd>{offer.unitPrice.toLocaleString()} DUST</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>Up to {offer.maximumQuantity}</dd>
                  </div>
                  <div>
                    <dt>Daily limit</dt>
                    <dd>{offer.dailyLimit}</dd>
                  </div>
                  <div>
                    <dt>Cooldown</dt>
                    <dd>{formatDuration(offer.cooldownSeconds)}</dd>
                  </div>
                  <div>
                    <dt>Inventory cost</dt>
                    <dd>{offer.inventoryCapacityCost}</dd>
                  </div>
                </dl>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="economy-panel" aria-labelledby="shop-placement-heading">
        <div className="economy-panel__heading">
          <div>
            <p className="eyebrow">Authoritative world instance</p>
            <h2 id="shop-placement-heading">Placement and shopkeeper</h2>
          </div>
          <StatusChip value={operations.shop.worldPlacement.artworkReadiness ?? 'missing_art'} />
        </div>
        <dl className="economy-detail-list economy-detail-list--columns">
          <div>
            <dt>Interaction ID</dt>
            <dd>
              <code>{operations.shop.worldPlacement.interactionId}</code>
            </dd>
          </div>
          <div>
            <dt>World object</dt>
            <dd>
              <code>{operations.shop.worldPlacement.worldObjectId}</code>
            </dd>
          </div>
          <div>
            <dt>World revision</dt>
            <dd>
              <code>{operations.shop.worldPlacement.worldRevisionId}</code>
            </dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>
              {operations.shop.worldPlacement.x}, {operations.shop.worldPlacement.y}
            </dd>
          </div>
          <div>
            <dt>Interaction radius</dt>
            <dd>{operations.shop.interactionRadius}</dd>
          </div>
          <div>
            <dt>Asset pin</dt>
            <dd>{operations.shop.worldPlacement.assetVersionId ?? 'Development marker only'}</dd>
          </div>
        </dl>
        <p>
          The player API validates this interaction ID, current world revision, proximity, and
          enabled state before exposing the active catalog. This page cannot publish a world or
          approve an asset.
        </p>
      </section>

      {selectedOperations === undefined ? null : (
        <section aria-labelledby="shop-catalog-operations-heading">
          <div className="economy-section-heading">
            <div>
              <p className="eyebrow">Phase 11C buy and sell catalog</p>
              <h2 id="shop-catalog-operations-heading">Catalog entries</h2>
            </div>
            <span>{selectedOperations.entries.length} entries</span>
          </div>
          {selected.status === 'draft' && canEdit ? (
            availableOffers.length === 0 ? (
              <p className="economy-unavailable">
                Every eligible item offer is already present in this draft.
              </p>
            ) : (
              <form action={economyShopCatalogEntryCreateAction} className="economy-form-grid">
                <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
                <input name="versionId" type="hidden" value={selected.id} />
                <input name="expectedVersionRevision" type="hidden" value={selected.revision} />
                <label>
                  Add approved item
                  <select name="offerId" required>
                    {availableOffers.map((offer) => (
                      <option key={offer.offerId} value={offer.offerId}>
                        {offer.itemName} · {offer.buyEligible ? 'buy' : ''}
                        {offer.buyEligible && offer.sellEligible ? ' / ' : ''}
                        {offer.sellEligible ? 'sell' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="economy-form-grid__wide">
                  Change reason
                  <input
                    defaultValue="Add an approved item offer to this successor draft."
                    maxLength={500}
                    minLength={12}
                    name="reason"
                    required
                  />
                </label>
                <div className="economy-form-grid__actions">
                  <button type="submit">Add entry</button>
                </div>
              </form>
            )
          ) : null}
          <div className="economy-offer-grid">
            {selectedOperations.entries.map((entry) => (
              <article className="economy-offer-card" key={entry.entryId}>
                <header>
                  <div className="economy-item-marker" aria-hidden="true">
                    ◇
                  </div>
                  <div>
                    <p className="eyebrow">{friendlyKey(entry.itemCategory)}</p>
                    <h3>{entry.itemName}</h3>
                    <small>{entry.itemSlug}</small>
                  </div>
                  <StatusChip value={entry.enabled ? 'enabled' : 'disabled'} />
                </header>
                {selected.status === 'draft' && canEdit ? (
                  <form action={economyShopCatalogEntryAction} className="economy-offer-form">
                    <input
                      name="shopDefinitionId"
                      type="hidden"
                      value={detail.shop.shopDefinitionId}
                    />
                    <input name="versionId" type="hidden" value={selected.id} />
                    <input name="entryId" type="hidden" value={entry.entryId} />
                    <input name="expectedRevision" type="hidden" value={entry.revision} />
                    <label className="economy-checkbox">
                      <input defaultChecked={entry.buyEnabled} name="buyEnabled" type="checkbox" />{' '}
                      Buy enabled
                    </label>
                    <label>
                      Buy price
                      <input
                        defaultValue={entry.buyPrice ?? ''}
                        max="1000000"
                        min="1"
                        name="buyPrice"
                        type="number"
                      />
                    </label>
                    <label className="economy-checkbox">
                      <input
                        defaultChecked={entry.sellEnabled}
                        name="sellEnabled"
                        type="checkbox"
                      />{' '}
                      Sell enabled
                    </label>
                    <label>
                      Sell price
                      <input
                        defaultValue={entry.sellPrice ?? ''}
                        max="1000000"
                        min="1"
                        name="sellPrice"
                        type="number"
                      />
                    </label>
                    <label>
                      Stock policy
                      <select defaultValue={entry.stockMode} name="stockMode">
                        <option value="unlimited">Unlimited</option>
                        <option value="global_limited">Global limited</option>
                        <option value="per_player_limited">Per-player limited</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </label>
                    <label>
                      Maximum stock
                      <input
                        defaultValue={entry.maximumStock ?? ''}
                        max="1000000"
                        min="1"
                        name="maximumStock"
                        type="number"
                      />
                    </label>
                    <label>
                      Restock policy
                      <select defaultValue={entry.restockMode} name="restockMode">
                        <option value="none">None</option>
                        <option value="fixed_interval">Fixed interval</option>
                        <option value="daily_utc">Daily UTC</option>
                        <option value="manual">Manual</option>
                      </select>
                    </label>
                    <label>
                      Restock amount
                      <input
                        defaultValue={entry.restockAmount ?? ''}
                        max="1000000"
                        min="1"
                        name="restockAmount"
                        type="number"
                      />
                    </label>
                    <label>
                      Interval seconds
                      <input
                        defaultValue={entry.restockIntervalSeconds ?? ''}
                        max="2592000"
                        min="60"
                        name="restockIntervalSeconds"
                        type="number"
                      />
                    </label>
                    <label>
                      Player buy daily limit
                      <input
                        defaultValue={entry.playerBuyDailyLimit}
                        max="9999"
                        min="1"
                        name="playerBuyDailyLimit"
                        required
                        type="number"
                      />
                    </label>
                    <label>
                      Player sell daily limit
                      <input
                        defaultValue={entry.playerSellDailyLimit}
                        max="9999"
                        min="1"
                        name="playerSellDailyLimit"
                        required
                        type="number"
                      />
                    </label>
                    <label>
                      Eligibility
                      <select defaultValue={entry.eligibilityRule} name="eligibilityRule">
                        <option value="ordinary_gameplay">Ordinary gameplay</option>
                        <option value="phase11a_complete">Phase 11A complete</option>
                        <option value="phase11b_complete">Phase 11B complete</option>
                        <option value="tutorial_only">Tutorial only</option>
                      </select>
                    </label>
                    <label>
                      Display order
                      <input
                        defaultValue={entry.displayOrder}
                        max="1000"
                        min="1"
                        name="displayOrder"
                        required
                        type="number"
                      />
                    </label>
                    <label className="economy-checkbox">
                      <input defaultChecked={entry.enabled} name="enabled" type="checkbox" /> Entry
                      enabled
                    </label>
                    <label>
                      Change reason
                      <input
                        defaultValue="Adjust reviewed General Store catalog entry."
                        maxLength={500}
                        minLength={12}
                        name="reason"
                        required
                      />
                    </label>
                    <div className="economy-offer-form__actions">
                      <button type="submit">Save entry</button>
                    </div>
                  </form>
                ) : (
                  <dl className="economy-detail-list economy-detail-list--compact">
                    <div>
                      <dt>Buy</dt>
                      <dd>
                        {entry.buyPrice === null
                          ? 'Disabled'
                          : `${entry.buyPrice.toLocaleString()} DUST`}
                      </dd>
                    </div>
                    <div>
                      <dt>Sell</dt>
                      <dd>
                        {entry.sellPrice === null
                          ? 'Disabled'
                          : `${entry.sellPrice.toLocaleString()} DUST`}
                      </dd>
                    </div>
                    <div>
                      <dt>Stock</dt>
                      <dd>{friendlyKey(entry.stockMode)}</dd>
                    </div>
                    <div>
                      <dt>Restock</dt>
                      <dd>{friendlyKey(entry.restockMode)}</dd>
                    </div>
                    <div>
                      <dt>Buy limit</dt>
                      <dd>{entry.playerBuyDailyLimit} / UTC day</dd>
                    </div>
                    <div>
                      <dt>Sell limit</dt>
                      <dd>{entry.playerSellDailyLimit} / UTC day</dd>
                    </div>
                    <div>
                      <dt>Eligibility</dt>
                      <dd>{friendlyKey(entry.eligibilityRule)}</dd>
                    </div>
                  </dl>
                )}
                {selected.status === 'draft' && canEdit ? (
                  <form
                    action={economyShopCatalogEntryRemoveAction}
                    className="economy-inline-form"
                  >
                    <input
                      name="shopDefinitionId"
                      type="hidden"
                      value={detail.shop.shopDefinitionId}
                    />
                    <input name="versionId" type="hidden" value={selected.id} />
                    <input name="entryId" type="hidden" value={entry.entryId} />
                    <input name="expectedVersionRevision" type="hidden" value={selected.revision} />
                    <input name="expectedEntryRevision" type="hidden" value={entry.revision} />
                    <input
                      aria-label={`Removal reason for ${entry.itemName}`}
                      defaultValue="Remove this item from the successor draft only."
                      maxLength={500}
                      minLength={12}
                      name="reason"
                      required
                    />
                    <ConfirmedSubmitButton
                      confirmation={`Remove ${entry.itemName} from this draft? Published catalogs and receipts are unaffected.`}
                    >
                      Remove from draft
                    </ConfirmedSubmitButton>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}

      {operations.liveOps === null ? null : (
        <section className="economy-panel" aria-labelledby="shop-live-ops-heading">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Independent safety controls</p>
              <h2 id="shop-live-ops-heading">Shop live ops</h2>
            </div>
            <StatusChip value={operations.liveOps.accessEnabled ? 'enabled' : 'paused'} />
          </div>
          {operations.permissions.liveOpsManage ? (
            <form action={economyShopLiveOpsAction} className="economy-form-grid">
              <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
              <input
                name="expectedRevision"
                type="hidden"
                value={operations.liveOps.configurationRevision}
              />
              {[
                ['accessEnabled', 'Shop access', operations.liveOps.accessEnabled],
                ['buyingEnabled', 'Buying', operations.liveOps.buyingEnabled],
                ['sellingEnabled', 'Selling', operations.liveOps.sellingEnabled],
                [
                  'stockDecrementEnabled',
                  'Stock decrement',
                  operations.liveOps.stockDecrementEnabled,
                ],
                ['restockEnabled', 'Automated restock', operations.liveOps.restockEnabled],
                [
                  'tutorialObjectivesEnabled',
                  'Tutorial objectives',
                  operations.liveOps.tutorialObjectivesEnabled,
                ],
                [
                  'tutorialRewardsEnabled',
                  'Tutorial rewards',
                  operations.liveOps.tutorialRewardsEnabled,
                ],
                [
                  'saleDustIssuanceEnabled',
                  'Sale DUST issuance',
                  operations.liveOps.saleDustIssuanceEnabled,
                ],
              ].map(([name, label, value]) => (
                <label className="economy-checkbox" key={String(name)}>
                  <input defaultChecked={Boolean(value)} name={String(name)} type="checkbox" />{' '}
                  {String(label)}
                </label>
              ))}
              <label>
                Global daily sale DUST cap
                <input
                  defaultValue={operations.liveOps.globalDailySaleDustCap}
                  max="1000000"
                  min="1"
                  name="globalDailySaleDustCap"
                  required
                  type="number"
                />
              </label>
              <label className="economy-form-grid__wide">
                Maintenance message
                <textarea
                  defaultValue={operations.liveOps.maintenanceMessage}
                  maxLength={280}
                  minLength={3}
                  name="maintenanceMessage"
                  required
                />
              </label>
              <label className="economy-form-grid__wide">
                Change reason
                <textarea
                  defaultValue="Review and update bounded General Store live-operations controls."
                  maxLength={1000}
                  minLength={12}
                  name="reason"
                  required
                />
              </label>
              <div className="economy-form-grid__actions">
                <ConfirmedSubmitButton confirmation="Apply these audited shop live-operations controls?">
                  Update live ops
                </ConfirmedSubmitButton>
              </div>
            </form>
          ) : (
            <p className="economy-unavailable">
              Live-operations controls are read only for this role.
            </p>
          )}
        </section>
      )}

      {operations.permissions.stockRead ? (
        <section aria-labelledby="shop-stock-heading">
          <div className="economy-section-heading">
            <div>
              <p className="eyebrow">Concurrency-safe inventory</p>
              <h2 id="shop-stock-heading">Stock and restock</h2>
            </div>
          </div>
          {operations.stock.length === 0 ? (
            <p className="economy-unavailable">No active stock rows.</p>
          ) : (
            <div className="economy-table-region">
              <table className="economy-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Policy</th>
                    <th>Stock</th>
                    <th>Restock</th>
                    <th>Revision</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.stock.map((stock) => (
                    <tr key={stock.entryId}>
                      <td data-label="Item">
                        <strong>{stock.itemName}</strong>
                        <small>{stock.itemSlug}</small>
                      </td>
                      <td data-label="Policy">{friendlyKey(stock.stockMode)}</td>
                      <td data-label="Stock">
                        {stock.currentStock === null
                          ? 'Unlimited'
                          : `${stock.currentStock} / ${stock.maximumStock}`}
                      </td>
                      <td data-label="Restock">
                        {stock.nextRestockAt === null
                          ? friendlyKey(stock.restockMode)
                          : formatDate(stock.nextRestockAt)}
                      </td>
                      <td data-label="Revision">{stock.stockRevision}</td>
                      <td data-label="Action">
                        {operations.permissions.stockManage && stock.maximumStock !== null ? (
                          <form action={economyShopRestockAction} className="economy-inline-form">
                            <input
                              name="shopDefinitionId"
                              type="hidden"
                              value={detail.shop.shopDefinitionId}
                            />
                            <input
                              name="catalogVersionId"
                              type="hidden"
                              value={stock.catalogVersionId}
                            />
                            <input name="entryId" type="hidden" value={stock.entryId} />
                            <input
                              name="expectedStockRevision"
                              type="hidden"
                              value={stock.stockRevision}
                            />
                            <input
                              aria-label={`Restock quantity for ${stock.itemName}`}
                              defaultValue={stock.restockAmount ?? 1}
                              max={stock.maximumStock}
                              min="1"
                              name="quantity"
                              required
                              type="number"
                            />
                            <input
                              aria-label={`Restock reason for ${stock.itemName}`}
                              defaultValue="Manual bounded restock after operator review."
                              maxLength={1000}
                              minLength={12}
                              name="reason"
                              required
                            />
                            <ConfirmedSubmitButton
                              confirmation={`Restock ${stock.itemName} without exceeding its maximum?`}
                            >
                              Restock
                            </ConfirmedSubmitButton>
                          </form>
                        ) : (
                          'Read only'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {operations.permissions.transactionsRead ? (
        <section aria-labelledby="shop-transactions-heading">
          <div className="economy-section-heading">
            <div>
              <p className="eyebrow">Immutable settlement evidence</p>
              <h2 id="shop-transactions-heading">Transactions</h2>
            </div>
          </div>
          {operations.transactions.length === 0 ? (
            <p className="economy-unavailable">No shop transactions yet.</p>
          ) : (
            <div className="economy-table-region">
              <table className="economy-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Direction</th>
                    <th>Item</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Receipt</th>
                    <th>Reconcile</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.transactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td data-label="Time">{formatDate(transaction.createdAt)}</td>
                      <td data-label="Direction">{friendlyKey(transaction.direction)}</td>
                      <td data-label="Item">
                        {friendlyKey(transaction.itemSlug)} × {transaction.quantity}
                      </td>
                      <td data-label="Total">{transaction.totalDust.toLocaleString()} DUST</td>
                      <td data-label="Status">
                        <StatusChip value={transaction.status} />
                      </td>
                      <td data-label="Receipt">{transaction.receiptId ?? 'None'}</td>
                      <td data-label="Reconcile">
                        {operations.permissions.reconciliationManage ? (
                          <form
                            action={economyShopReconciliationAction}
                            className="economy-inline-form"
                          >
                            <input
                              name="shopDefinitionId"
                              type="hidden"
                              value={detail.shop.shopDefinitionId}
                            />
                            <input
                              name="transactionId"
                              type="hidden"
                              value={transaction.transactionId}
                            />
                            <select
                              aria-label={`Reconciliation type for ${transaction.transactionId}`}
                              name="reconciliationType"
                            >
                              <option value="settlement_mismatch">Settlement</option>
                              <option value="receipt_mismatch">Receipt</option>
                              <option value="stock_mismatch">Stock</option>
                              <option value="limit_mismatch">Limit</option>
                              <option value="stuck_transaction">Stuck transaction</option>
                            </select>
                            <input
                              aria-label={`Reconciliation reason for ${transaction.transactionId}`}
                              defaultValue="Request exact transaction evidence reconciliation."
                              maxLength={1000}
                              minLength={12}
                              name="reason"
                              required
                            />
                            <button type="submit">Request</button>
                          </form>
                        ) : (
                          'Read only'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {operations.permissions.receiptsRead ? (
        <section aria-labelledby="shop-receipts-heading">
          <div className="economy-section-heading">
            <div>
              <p className="eyebrow">Player-facing evidence</p>
              <h2 id="shop-receipts-heading">Receipts</h2>
            </div>
          </div>
          {operations.receipts.length === 0 ? (
            <p className="economy-unavailable">No immutable shop receipts yet.</p>
          ) : (
            <div className="economy-table-region">
              <table className="economy-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Time</th>
                    <th>Direction</th>
                    <th>Item</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Support reference</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.receipts.map((receipt) => (
                    <tr key={receipt.receiptId}>
                      <td data-label="Receipt">
                        <code>{receipt.receiptId}</code>
                      </td>
                      <td data-label="Time">{formatDate(receipt.createdAt)}</td>
                      <td data-label="Direction">{friendlyKey(receipt.direction)}</td>
                      <td data-label="Item">
                        {receipt.itemName} × {receipt.quantity}
                      </td>
                      <td data-label="Total">{receipt.totalDust.toLocaleString()} DUST</td>
                      <td data-label="Status">
                        <StatusChip value={receipt.status} />
                      </td>
                      <td data-label="Support reference">{receipt.supportReference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="economy-panel" aria-labelledby="shop-validation-heading">
        <div className="economy-panel__heading">
          <div>
            <p className="eyebrow">Closed validation</p>
            <h2 id="shop-validation-heading">Validation and lifecycle</h2>
          </div>
        </div>
        <div className="economy-validation-layout">
          <div>
            {selected.validationResults === null ? (
              <p className="economy-unavailable">This version has not been validated yet.</p>
            ) : (
              <>
                <StatusChip
                  value={
                    selected.validationResults.valid === false ? 'validation_failed' : 'validated'
                  }
                />
                <ul>
                  {(selected.validationResults.checks ?? []).map((check) => (
                    <li key={check}>Passed · {friendlyKey(check)}</li>
                  ))}
                  {(selected.validationResults.errors ?? []).map((error) => (
                    <li key={error}>Issue · {error}</li>
                  ))}
                  {(selected.validationResults.warnings ?? []).map((warning) => (
                    <li key={warning}>Review · {warning}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="economy-lifecycle-actions">
            {selected.status === 'draft' && canEdit ? (
              <form action={economyShopTransitionAction}>
                <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
                <input name="versionId" type="hidden" value={selected.id} />
                <input name="expectedRevision" type="hidden" value={selected.revision} />
                <input name="action" type="hidden" value="validate" />
                <button type="submit">Validate draft</button>
              </form>
            ) : null}
            {selected.status === 'validated' && canEdit ? (
              <form action={economyShopTransitionAction}>
                <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
                <input name="versionId" type="hidden" value={selected.id} />
                <input name="expectedRevision" type="hidden" value={selected.revision} />
                <input name="action" type="hidden" value="submit_review" />
                <ConfirmedSubmitButton confirmation="Submit this exact validated shop revision for independent review?">
                  Submit for review
                </ConfirmedSubmitButton>
              </form>
            ) : null}
            {selected.status === 'in_review' && canPublish ? (
              <form action={economyShopTransitionAction}>
                <input name="shopDefinitionId" type="hidden" value={detail.shop.shopDefinitionId} />
                <input name="versionId" type="hidden" value={selected.id} />
                <input name="expectedRevision" type="hidden" value={selected.revision} />
                <input name="action" type="hidden" value="approve" />
                <ConfirmedSubmitButton confirmation="Approve this exact reviewed revision without publishing it?">
                  Approve reviewed version
                </ConfirmedSubmitButton>
              </form>
            ) : null}
            {selected.status === 'approved' && canPublish ? (
              <>
                <EconomyConfirmAction
                  action={economyShopTransitionAction}
                  confirmLabel="Publish now"
                  description="This explicit action activates this approved shop immediately for players and supersedes the prior active version. It can create no purchase by itself."
                  hiddenFields={{
                    shopDefinitionId: detail.shop.shopDefinitionId,
                    versionId: selected.id,
                    expectedRevision: selected.revision,
                    action: 'publish',
                  }}
                  title={`Publish ${selected.name} v${selected.versionNumber}?`}
                  triggerLabel="Publish now"
                />
                <EconomyConfirmAction
                  action={economyShopTransitionAction}
                  confirmLabel="Schedule activation"
                  description="The approved version remains inactive until its effective time. A trusted worker performs the bounded activation."
                  hiddenFields={{
                    shopDefinitionId: detail.shop.shopDefinitionId,
                    versionId: selected.id,
                    expectedRevision: selected.revision,
                    action: 'schedule',
                  }}
                  title={`Schedule ${selected.name} v${selected.versionNumber}?`}
                  triggerLabel="Schedule"
                >
                  <label>
                    Effective time
                    <input
                      defaultValue={dateTimeLocal(selected.effectiveAt)}
                      name="effectiveAt"
                      required
                      type="datetime-local"
                    />
                  </label>
                </EconomyConfirmAction>
                <EconomyConfirmAction
                  action={economyShopTransitionAction}
                  confirmLabel="Disable shop"
                  description="This reviewed version disables player availability. Existing receipts and historical versions remain intact."
                  hiddenFields={{
                    shopDefinitionId: detail.shop.shopDefinitionId,
                    versionId: selected.id,
                    expectedRevision: selected.revision,
                    action: 'disable',
                  }}
                  title={`Disable ${selected.name} through v${selected.versionNumber}?`}
                  tone="danger"
                  triggerLabel="Disable through this version"
                />
              </>
            ) : null}
            {selected.status === 'scheduled' && canPublish ? (
              <EconomyConfirmAction
                action={economyShopTransitionAction}
                confirmLabel="Publish immediately"
                description="This overrides the remaining schedule and explicitly activates the already approved shop version now."
                hiddenFields={{
                  shopDefinitionId: detail.shop.shopDefinitionId,
                  versionId: selected.id,
                  expectedRevision: selected.revision,
                  action: 'publish',
                }}
                title={`Publish scheduled v${selected.versionNumber} now?`}
                triggerLabel="Publish now"
              />
            ) : null}
            {selected.status === 'superseded' && canPublish ? (
              <EconomyConfirmAction
                action={economyShopTransitionAction}
                confirmLabel="Reactivate version"
                description="This controlled rollback reactivates the exact reviewed offers from this immutable published version and records an audit event."
                hiddenFields={{
                  shopDefinitionId: detail.shop.shopDefinitionId,
                  versionId: selected.id,
                  expectedRevision: selected.revision,
                  action: 'rollback',
                }}
                title={`Roll back to ${selected.name} v${selected.versionNumber}?`}
                tone="danger"
                triggerLabel="Roll back to this version"
              />
            ) : null}
            {!canEdit && !canPublish ? (
              <p className="economy-unavailable">You have read-only shop access.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="economy-panel" aria-labelledby="shop-preview-heading">
        <div className="economy-panel__heading">
          <div>
            <p className="eyebrow">Safe preview</p>
            <h2 id="shop-preview-heading">Exact draft presentation</h2>
          </div>
          <StatusChip value="preview_only" />
        </div>
        <p>
          Preview mode never deducts DUST, grants an item, creates a receipt, changes a limit, or
          exposes this draft to players.
        </p>
        <div className="economy-preview-states" aria-label="Shop preview states">
          {['Available', 'Not Enough DUST', 'Inventory Full', 'Purchase Limit Reached'].map(
            (state) => (
              <article key={state}>
                <span aria-hidden="true">◇</span>
                <strong>{state}</strong>
                <small>Operator presentation preview</small>
              </article>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="shop-history-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Immutable history</p>
            <h2 id="shop-history-heading">Versions and publication</h2>
          </div>
        </div>
        <div className="economy-table-region">
          <table className="economy-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Revision</th>
                <th>Created</th>
                <th>Reviewed</th>
                <th>Published</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((version) => (
                <tr key={version.id}>
                  <td data-label="Version">
                    <Link
                      href={`/economy/shops/${detail.shop.shopDefinitionId}?version=${version.id}`}
                    >
                      v{version.versionNumber}
                    </Link>
                  </td>
                  <td data-label="Status">
                    <StatusChip value={version.status} />
                  </td>
                  <td data-label="Revision">{version.revision}</td>
                  <td data-label="Created">{formatDate(version.createdAt)}</td>
                  <td data-label="Reviewed">{formatDate(version.reviewedAt)}</td>
                  <td data-label="Published">{formatDate(version.publishedAt)}</td>
                  <td data-label="Active">{version.active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
