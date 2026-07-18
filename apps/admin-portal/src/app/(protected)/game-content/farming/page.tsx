import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  createFarmingPlotTemplateSuccessorAction,
  createStarterQuestSuccessorAction,
  updateFarmingCropAction,
  updateFarmingItemAction,
  updateFarmingLiveOpsAction,
} from '../../../actions/farming';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminFarmingContent } from '../../../../lib/cozy-gameplay/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function enabled(value: boolean): string {
  return value ? 'Enabled' : 'Paused';
}

function ToggleField({
  label,
  name,
  value,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: boolean;
}) {
  return (
    <label>
      {label}
      <select defaultValue={String(value)} name={name}>
        <option value="true">Enabled</option>
        <option value="false">Paused</option>
      </select>
    </label>
  );
}

function JsonField({
  label,
  name,
  value,
  rows = 5,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: unknown;
  readonly rows?: number;
}) {
  return (
    <label className="farming-json-field">
      {label}
      <textarea defaultValue={JSON.stringify(value, null, 2)} name={name} rows={rows} />
    </label>
  );
}

export default async function FarmingContentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('farming.read');
  const content = await loadAdminFarmingContent();
  const { notice } = await searchParams;
  const canManageLiveOps = hasAdminPermission(context, 'farming.liveops');
  const canManageContent = hasAdminPermission(context, 'farming.content_manage');
  const canManageRewards = hasAdminPermission(context, 'farming.reward_manage');
  const itemDefinitions = content.items.map((item) => item.definition);
  const seedItems = itemDefinitions.filter((item) => item.category === 'seed');
  const produceItems = itemDefinitions.filter((item) => item.category === 'crop');
  const hoeItems = itemDefinitions.filter(
    (item) => item.metadata.kind === 'permanent_tool' && item.metadata.toolType === 'hoe',
  );
  const wateringCanItems = itemDefinitions.filter(
    (item) => item.metadata.kind === 'permanent_tool' && item.metadata.toolType === 'watering_can',
  );

  return (
    <main className="operations-page farming-admin-page" aria-labelledby="farming-title">
      <header className="operations-intro">
        <div>
          <Link className="back-link" href="/game-content">
            ← Game content
          </Link>
          <p className="eyebrow">Server-authoritative personal plots</p>
          <h1 id="farming-title">Farming and starter quest</h1>
          <p>
            Inspect and safely manage version-pinned crops, canonical starter items, successor plot
            templates, immutable quest versions, and bounded live operations. Existing planted
            crops, player homes, and accepted quests retain their stored version or configuration
            snapshot.
          </p>
        </div>
        <span className="state-chip state-chip--active">
          Revision {content.settings.configurationRevision}
        </span>
      </header>

      {notice ? (
        <p className="notice" role="status">
          {notice.replaceAll('-', ' ')}
        </p>
      ) : null}

      <section className="detail-card" aria-labelledby="farming-live-ops-title">
        <h2 id="farming-live-ops-title">Live operations</h2>
        <div className="farming-policy-grid">
          <span>Planting: {enabled(content.settings.plantingEnabled)}</span>
          <span>Harvesting: {enabled(content.settings.harvestingEnabled)}</span>
          <span>Plot provisioning: {enabled(content.settings.plotProvisioningEnabled)}</span>
          <span>Starter quest: {enabled(content.settings.starterQuestEnabled)}</span>
          <span>Tutorial DUST: {enabled(content.settings.tutorialRewardsEnabled)}</span>
        </div>
        {content.settings.maintenanceMessage ? <p>{content.settings.maintenanceMessage}</p> : null}
        {canManageLiveOps ? (
          <form action={updateFarmingLiveOpsAction} className="farming-live-ops-form">
            <input
              name="expectedRevision"
              type="hidden"
              value={content.settings.configurationRevision}
            />
            <ToggleField
              label="Planting"
              name="plantingEnabled"
              value={content.settings.plantingEnabled}
            />
            <ToggleField
              label="Harvesting"
              name="harvestingEnabled"
              value={content.settings.harvestingEnabled}
            />
            <ToggleField
              label="Plot provisioning"
              name="plotProvisioningEnabled"
              value={content.settings.plotProvisioningEnabled}
            />
            <ToggleField
              label="Starter quest"
              name="starterQuestEnabled"
              value={content.settings.starterQuestEnabled}
            />
            <ToggleField
              label="Tutorial DUST settlement"
              name="tutorialRewardsEnabled"
              value={content.settings.tutorialRewardsEnabled}
            />
            <label>
              Maintenance explanation
              <textarea
                defaultValue={content.settings.maintenanceMessage ?? ''}
                maxLength={280}
                name="maintenanceMessage"
                rows={3}
              />
            </label>
            <label>
              Audit reason
              <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
            </label>
            <p className="card-note">
              This changes only bounded availability flags. It does not delete crops, change player
              inventory, or edit DUST balances.
            </p>
            <button type="submit">Record live-operations update</button>
          </form>
        ) : (
          <p className="card-note">Your role can inspect but cannot change farming availability.</p>
        )}
      </section>

      <section className="detail-card" aria-labelledby="starter-items-title">
        <h2 id="starter-items-title">Item definitions</h2>
        <p className="card-note">
          Item UUIDs and slugs remain canonical. Referenced category or tool-metadata changes and
          unsafe stack-limit reductions are rejected; destructive deletion is not exposed.
        </p>
        <div className="farming-management-list">
          {content.items.map(({ definition: item, referenceImpact }) => (
            <details key={item.id} className="farming-management-card">
              <summary>
                <strong>{item.name}</strong>
                <span>
                  {item.category.replaceAll('_', ' ')} · v{item.contentVersion} ·{' '}
                  {item.active ? 'enabled' : 'disabled'}
                </span>
              </summary>
              <p>{item.description}</p>
              <p className="card-note">
                {referenceImpact.inventoryStackCount} inventory stack(s) ·{' '}
                {referenceImpact.cropDefinitionCount} crop link(s) ·{' '}
                {referenceImpact.questVersionCount} quest version link(s) ·{' '}
                {referenceImpact.recipeCount} recipe link(s) · {referenceImpact.shopOfferCount} shop
                offer(s)
              </p>
              {canManageContent ? (
                <form action={updateFarmingItemAction} className="farming-content-form">
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="expectedContentVersion" type="hidden" value={item.contentVersion} />
                  <label>
                    Display name
                    <input defaultValue={item.name} maxLength={80} name="name" required />
                  </label>
                  <label>
                    Description
                    <textarea
                      defaultValue={item.description}
                      maxLength={280}
                      name="description"
                      required
                      rows={3}
                    />
                  </label>
                  <label>
                    Category
                    <select defaultValue={item.category} name="category">
                      {[
                        'seed',
                        'crop',
                        'ingredient',
                        'cooked_food',
                        'crafted_material',
                        'furniture',
                        'permanent_tool',
                        'special',
                      ].map((category) => (
                        <option key={category} value={category}>
                          {category.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <JsonField label="Typed metadata" name="metadata" value={item.metadata} />
                  <ToggleField label="Stackable" name="stackable" value={item.stackable} />
                  <label>
                    Maximum stack size
                    <input
                      defaultValue={item.maxStackSize}
                      max={999}
                      min={1}
                      name="maxStackSize"
                      type="number"
                    />
                  </label>
                  <ToggleField label="Buy eligible" name="buyEligible" value={item.buyEligible} />
                  <label>
                    Default buy price
                    <input
                      defaultValue={item.defaultBuyPrice ?? ''}
                      min={1}
                      name="defaultBuyPrice"
                      type="number"
                    />
                  </label>
                  <ToggleField
                    label="Sell eligible"
                    name="sellEligible"
                    value={item.sellEligible}
                  />
                  <label>
                    Default sell price
                    <input
                      defaultValue={item.defaultSellPrice ?? ''}
                      min={1}
                      name="defaultSellPrice"
                      type="number"
                    />
                  </label>
                  <ToggleField label="Giftable" name="giftable" value={item.giftable} />
                  <ToggleField label="Tradable" name="tradable" value={item.tradable} />
                  <ToggleField
                    label="Account bound"
                    name="accountBound"
                    value={item.accountBound}
                  />
                  <ToggleField
                    label="Permanent tool"
                    name="permanentTool"
                    value={item.permanentTool}
                  />
                  <label>
                    Minimum transfer quantity
                    <input
                      defaultValue={item.minimumTransferQuantity}
                      max={999}
                      min={1}
                      name="minimumTransferQuantity"
                      type="number"
                    />
                  </label>
                  <label>
                    Maximum transfer quantity
                    <input
                      defaultValue={item.maximumTransferQuantity}
                      max={999}
                      min={1}
                      name="maximumTransferQuantity"
                      type="number"
                    />
                  </label>
                  <label>
                    Asset reference
                    <input defaultValue={item.assetRef ?? ''} maxLength={80} name="assetRef" />
                  </label>
                  <label>
                    Asset readiness
                    <select defaultValue={item.assetReadiness} name="assetReadiness">
                      <option value="approved">Approved</option>
                      <option value="development_marker">Development marker</option>
                      <option value="missing">Missing</option>
                    </select>
                  </label>
                  <ToggleField label="Lifecycle" name="active" value={item.active} />
                  <label className="farming-form-wide">
                    Audit reason
                    <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                  </label>
                  <button type="submit">Save audited item revision</button>
                </form>
              ) : null}
            </details>
          ))}
        </div>
      </section>

      <section className="detail-card" aria-labelledby="starter-crops-title">
        <h2 id="starter-crops-title">Crop definitions</h2>
        <p className="card-note">
          Crop edits increment the configuration revision. Already planted crops keep their stored
          seed, produce, timing, stage, watering, and yield snapshot.
        </p>
        <div className="farming-management-list">
          {content.crops.map((crop) => (
            <details key={crop.definition.id} className="farming-management-card">
              <summary>
                <strong>{crop.definition.name}</strong>
                <span>
                  configuration r{crop.configurationRevision} · {crop.activeInstanceCount} active
                  snapshot-pinned crop(s)
                </span>
              </summary>
              {canManageContent ? (
                <form action={updateFarmingCropAction} className="farming-content-form">
                  <input name="cropId" type="hidden" value={crop.definition.id} />
                  <input
                    name="expectedConfigurationRevision"
                    type="hidden"
                    value={crop.configurationRevision}
                  />
                  <label>
                    Display name
                    <input
                      defaultValue={crop.definition.name}
                      maxLength={80}
                      name="name"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      defaultValue={crop.definition.description}
                      maxLength={280}
                      name="description"
                      required
                      rows={3}
                    />
                  </label>
                  <label>
                    Seed item
                    <select
                      defaultValue={
                        seedItems.find((item) => item.slug === crop.definition.seedItemSlug)?.id
                      }
                      name="seedItemId"
                    >
                      {seedItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Produce item
                    <select
                      defaultValue={
                        produceItems.find((item) => item.slug === crop.definition.harvestItemSlug)
                          ?.id
                      }
                      name="produceItemId"
                    >
                      {produceItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Production growth seconds
                    <input
                      defaultValue={crop.productionGrowthDurationSeconds}
                      max={2592000}
                      min={10}
                      name="productionGrowthDurationSeconds"
                      type="number"
                    />
                  </label>
                  <label>
                    Local test growth seconds
                    <input
                      defaultValue={crop.localGrowthDurationSeconds}
                      max={3600}
                      min={1}
                      name="localGrowthDurationSeconds"
                      type="number"
                    />
                  </label>
                  <label>
                    Growth stages
                    <input
                      defaultValue={crop.definition.growthStageCount}
                      max={8}
                      min={2}
                      name="growthStageCount"
                      type="number"
                    />
                  </label>
                  <label>
                    Deterministic yield
                    <input
                      defaultValue={crop.definition.deterministicYield}
                      max={10000}
                      min={1}
                      name="deterministicYield"
                      type="number"
                    />
                  </label>
                  <label>
                    Watering policy
                    <select defaultValue={crop.wateringPolicy} name="wateringPolicy">
                      <option value="water_once_to_start">Water once to start</option>
                    </select>
                  </label>
                  <ToggleField
                    label="Tutorial eligible"
                    name="tutorialEligible"
                    value={crop.tutorialEligible}
                  />
                  <label>
                    Asset reference
                    <input
                      defaultValue={crop.definition.assetRef ?? ''}
                      maxLength={80}
                      name="assetRef"
                    />
                  </label>
                  <label>
                    Asset readiness
                    <select defaultValue={crop.definition.assetReadiness} name="assetReadiness">
                      <option value="approved">Approved</option>
                      <option value="development_marker">Development marker</option>
                      <option value="missing">Missing</option>
                    </select>
                  </label>
                  <ToggleField label="Lifecycle" name="active" value={crop.definition.active} />
                  <label className="farming-form-wide">
                    Audit reason
                    <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                  </label>
                  <button type="submit">Save crop configuration revision</button>
                </form>
              ) : (
                <p>{crop.definition.description}</p>
              )}
            </details>
          ))}
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-card" aria-labelledby="starter-plot-template-title">
          <h2 id="starter-plot-template-title">Plot template versions</h2>
          <p>
            <strong>{content.plotTemplate.template.name}</strong> · active template v
            {content.plotTemplate.template.templateVersion} · {content.plotTemplate.activePlotCount}{' '}
            pinned active plot(s)
          </p>
          <p className="card-note">
            Validation: {content.plotTemplate.validation.valid ? 'valid' : 'invalid'} · World Asset
            references:{' '}
            {content.plotTemplate.worldAssetRefs.length || 'none (development geometry)'}
          </p>
          <ul className="cozy-definition-list">
            {content.plotTemplateVersions.map((template) => (
              <li key={template.template.id}>
                <strong>Version {template.template.templateVersion}</strong>
                <span>
                  {template.activeForProvisioning
                    ? 'Active for new plots'
                    : 'Historical and pinned'}{' '}
                  · {template.activePlotCount} plot(s) ·{' '}
                  {template.validation.valid ? 'valid' : 'invalid'}
                </span>
              </li>
            ))}
          </ul>
          {canManageContent ? (
            <details className="farming-management-card">
              <summary>Create validated successor</summary>
              <form
                action={createFarmingPlotTemplateSuccessorAction}
                className="farming-content-form"
              >
                <input
                  name="expectedTemplateId"
                  type="hidden"
                  value={content.plotTemplate.template.id}
                />
                <input
                  name="expectedTemplateVersion"
                  type="hidden"
                  value={content.plotTemplate.template.templateVersion}
                />
                <label>
                  Template name
                  <input
                    defaultValue={content.plotTemplate.template.name}
                    maxLength={80}
                    name="name"
                    required
                  />
                </label>
                <JsonField
                  label="Bounds"
                  name="bounds"
                  value={content.plotTemplate.template.bounds}
                />
                <JsonField
                  label="Entry spawn"
                  name="spawn"
                  value={content.plotTemplate.template.spawn}
                />
                <JsonField label="Exit" name="exit" value={content.plotTemplate.template.exit} />
                <JsonField
                  label="Blocked cells"
                  name="blockedCells"
                  value={content.plotTemplate.template.blockedCells}
                />
                <JsonField
                  label="Eight farming tiles"
                  name="tiles"
                  rows={14}
                  value={content.plotTemplate.tiles.map(({ tileKey, slot, x, y }) => ({
                    tileKey,
                    slot,
                    x,
                    y,
                  }))}
                />
                <ToggleField
                  label="Development art"
                  name="developmentArt"
                  value={content.plotTemplate.template.developmentArt}
                />
                <label className="farming-form-wide">
                  Audit reason
                  <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                </label>
                <p className="card-note">
                  Creating a successor moves only future provisioning. Existing player homes are not
                  rewritten.
                </p>
                <button type="submit">Validate and activate successor</button>
              </form>
            </details>
          ) : null}
        </section>

        <section className="detail-card" aria-labelledby="starter-quest-config-title">
          <h2 id="starter-quest-config-title">Starter quest versions</h2>
          <p>
            <strong>{content.quest.name}</strong> · active v{content.quest.versionNumber} ·{' '}
            {content.quest.rewardDust} DUST
          </p>
          <p className="card-note">
            {content.quest.acceptedCount} accepted · {content.quest.completionCount} completed ·{' '}
            {content.quest.settlementFailureCount} settlement failure(s)
          </p>
          <ul className="cozy-definition-list">
            {content.questVersions.map((quest) => (
              <li key={quest.versionId}>
                <strong>Version {quest.versionNumber}</strong>
                <span>
                  {quest.activeForNewPlayers ? 'Active for new players' : 'Historical and pinned'} ·{' '}
                  {quest.acceptedCount} accepted · {quest.rewardDust} DUST
                </span>
              </li>
            ))}
          </ul>
          {canManageContent ? (
            <details className="farming-management-card">
              <summary>Create immutable successor</summary>
              <form action={createStarterQuestSuccessorAction} className="farming-content-form">
                <input name="expectedVersionId" type="hidden" value={content.quest.versionId} />
                <input
                  name="expectedVersionNumber"
                  type="hidden"
                  value={content.quest.versionNumber}
                />
                <label>
                  Quest name
                  <input defaultValue={content.quest.name} maxLength={80} name="name" required />
                </label>
                <label>
                  Quest text
                  <textarea
                    defaultValue={content.quest.description}
                    maxLength={280}
                    name="description"
                    required
                    rows={4}
                  />
                </label>
                <label>
                  Starter hoe
                  <select defaultValue={content.quest.starterHoeItemId} name="starterHoeItemId">
                    {hoeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Starter watering can
                  <select
                    defaultValue={content.quest.starterWateringCanItemId}
                    name="starterWateringCanItemId"
                  >
                    {wateringCanItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Starter seed
                  <select defaultValue={content.quest.starterSeedItemId} name="starterSeedItemId">
                    {seedItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Delivery produce
                  <select defaultValue={content.quest.deliveryItemId} name="deliveryItemId">
                    {produceItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Starter seed quantity
                  <input
                    defaultValue={content.quest.starterSeedQuantity}
                    max={99}
                    min={2}
                    name="starterSeedQuantity"
                    type="number"
                  />
                </label>
                <label>
                  Delivery quantity
                  <input
                    defaultValue={content.quest.deliveryQuantity}
                    max={99}
                    min={1}
                    name="deliveryQuantity"
                    type="number"
                  />
                </label>
                <label>
                  DUST reward
                  <input
                    defaultValue={content.quest.rewardDust}
                    max={10000}
                    min={1}
                    name="rewardDust"
                    readOnly={!canManageRewards}
                    type="number"
                  />
                </label>
                <JsonField
                  label="Ordered objectives"
                  name="objectives"
                  rows={18}
                  value={content.quest.objectives}
                />
                <label className="farming-form-wide">
                  Audit reason
                  <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                </label>
                <p className="card-note">
                  Reward changes require the separate farming reward permission and create a paired
                  immutable economy-source version. Existing accepted quests stay pinned.
                </p>
                <button type="submit">Publish quest successor</button>
              </form>
            </details>
          ) : null}
        </section>
      </div>

      <section className="detail-card" aria-labelledby="farming-audit-title">
        <h2 id="farming-audit-title">Append-only farming configuration audit</h2>
        {content.audit.length === 0 ? (
          <p>No farming configuration changes have been recorded.</p>
        ) : (
          <ol className="audit-list audit-list--compact">
            {content.audit.map((event) => (
              <li key={event.id}>
                <strong>{event.actionKey.replaceAll('.', ' ')}</strong>
                <p>{event.reason}</p>
                <small>{new Date(event.createdAt).toISOString()}</small>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
