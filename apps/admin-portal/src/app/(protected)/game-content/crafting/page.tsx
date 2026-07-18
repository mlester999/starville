import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  createRecipeSuccessorAction,
  requestCraftingReconciliationAction,
  updateCraftingLiveOpsAction,
  updateWorkstationAction,
} from '../../../actions/crafting';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminCraftingContent } from '../../../../lib/cozy-gameplay/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UnknownRecord = Record<string, unknown>;

function text(record: UnknownRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function number(record: UnknownRecord, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

function boolean(record: UnknownRecord, key: string): boolean {
  return record[key] === true;
}

function record(recordValue: unknown): UnknownRecord {
  return typeof recordValue === 'object' && recordValue !== null
    ? (recordValue as UnknownRecord)
    : {};
}

function choice(name: string, value: boolean, label: string) {
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

export default async function CraftingContentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('crafting.read');
  const content = await loadAdminCraftingContent();
  const { notice } = await searchParams;
  const canLiveOps = hasAdminPermission(context, 'crafting.liveops');
  const canManage = hasAdminPermission(context, 'crafting.content_manage');
  const canReconcile = hasAdminPermission(context, 'crafting.job_reconcile');
  const telemetry = content.telemetry;

  return (
    <main className="operations-page farming-admin-page" aria-labelledby="crafting-title">
      <header className="operations-intro">
        <div>
          <Link className="back-link" href="/game-content">
            ← Game content
          </Link>
          <p className="eyebrow">Server-authoritative offline jobs</p>
          <h1 id="crafting-title">Cooking and crafting</h1>
          <p>
            Inspect immutable recipe versions, owner-only workstation queues, pinned active jobs,
            tutorial settlement, and bounded reconciliation. No direct player-inventory or job-state
            mutation is exposed here.
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

      <section className="detail-card" aria-labelledby="crafting-telemetry-title">
        <h2 id="crafting-telemetry-title">Queue telemetry</h2>
        <div className="farming-policy-grid">
          <span>Running: {String(telemetry['runningJobs'] ?? 0)}</span>
          <span>Ready: {String(telemetry['readyJobs'] ?? 0)}</span>
          <span>Collected: {String(telemetry['collectedJobs'] ?? 0)}</span>
          <span>Failed: {String(telemetry['failedJobs'] ?? 0)}</span>
          <span>Ready over 7 days: {String(telemetry['abandonedReadyJobs'] ?? 0)}</span>
          <span>
            Inventory-full collections: {String(telemetry['inventoryFullCollectionFailures'] ?? 0)}
          </span>
        </div>
      </section>

      <section className="detail-card" aria-labelledby="crafting-liveops-title">
        <h2 id="crafting-liveops-title">Live operations</h2>
        <p className="card-note">
          Pausing starts never destroys queued jobs. Collection has its own explicit control so
          operators can preserve player outputs during an incident.
        </p>
        {canLiveOps ? (
          <form action={updateCraftingLiveOpsAction} className="farming-live-ops-form">
            <input
              name="expectedRevision"
              type="hidden"
              value={content.settings.configurationRevision}
            />
            {choice(
              'cookingStartsEnabled',
              content.settings.cookingStartsEnabled,
              'Cooking starts',
            )}
            {choice(
              'craftingStartsEnabled',
              content.settings.craftingStartsEnabled,
              'Crafting starts',
            )}
            {choice('collectionEnabled', content.settings.collectionEnabled, 'Collection')}
            {choice(
              'tutorialUnlocksEnabled',
              content.settings.tutorialUnlocksEnabled,
              'Tutorial unlocks',
            )}
            {choice(
              'tutorialRewardsEnabled',
              content.settings.tutorialRewardsEnabled,
              'Tutorial rewards',
            )}
            {choice('dustFeesEnabled', content.settings.dustFeesEnabled, 'DUST fees')}
            {choice(
              'useLocalDurations',
              content.settings.useLocalDurations,
              'Local development durations',
            )}
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
            <button type="submit">Record live-operations update</button>
          </form>
        ) : (
          <p className="card-note">Your role can inspect but cannot change live operations.</p>
        )}
      </section>

      <section className="detail-card" aria-labelledby="workstation-definitions-title">
        <h2 id="workstation-definitions-title">Workstations</h2>
        <div className="farming-management-list">
          {content.workstations.map((workstation) => (
            <details className="farming-management-card" key={text(workstation, 'id')}>
              <summary>
                <strong>{text(workstation, 'name')}</strong>
                <span>
                  {text(workstation, 'type').replaceAll('_', ' ')} ·{' '}
                  {number(workstation, 'activeJobCount')} active job(s)
                </span>
              </summary>
              <p>{text(workstation, 'description')}</p>
              <p className="card-note">
                {number(workstation, 'instanceCount')} owner instance(s) ·{' '}
                {number(workstation, 'linkedRecipeCount')} active recipe(s) ·{' '}
                {boolean(workstation, 'developmentMarker') ? 'development marker' : 'approved art'}
              </p>
              {canManage ? (
                <form action={updateWorkstationAction} className="farming-content-form">
                  <input name="workstationId" type="hidden" value={text(workstation, 'id')} />
                  <input
                    name="expectedConfigurationRevision"
                    type="hidden"
                    value={number(workstation, 'configurationRevision')}
                  />
                  <label>
                    Display name
                    <input
                      defaultValue={text(workstation, 'name')}
                      maxLength={80}
                      name="displayName"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      defaultValue={text(workstation, 'description')}
                      maxLength={280}
                      name="description"
                      required
                      rows={3}
                    />
                  </label>
                  <label>
                    Queue capacity
                    <input
                      defaultValue={number(workstation, 'queueCapacity')}
                      max={8}
                      min={1}
                      name="queueCapacity"
                      type="number"
                    />
                  </label>
                  <label>
                    Interaction radius
                    <input
                      defaultValue={number(workstation, 'interactionRadius')}
                      max={4}
                      min={1}
                      name="interactionRadius"
                      step="0.1"
                      type="number"
                    />
                  </label>
                  {choice('enabled', boolean(workstation, 'enabled'), 'New jobs')}
                  <label>
                    Audit reason
                    <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                  </label>
                  <button type="submit">Update bounded workstation policy</button>
                </form>
              ) : null}
            </details>
          ))}
        </div>
      </section>

      <section className="detail-card" aria-labelledby="recipe-versions-title">
        <h2 id="recipe-versions-title">Immutable recipe versions</h2>
        <div className="farming-management-list">
          {content.recipes.map((recipe) => {
            const output = record(recipe['output']);
            const ingredients = Array.isArray(recipe['ingredients'])
              ? recipe['ingredients'].map((ingredient) => {
                  const item = record(ingredient);
                  return { itemId: text(item, 'itemId'), quantity: number(item, 'quantity') };
                })
              : [];
            return (
              <details className="farming-management-card" key={text(recipe, 'versionId')}>
                <summary>
                  <strong>{text(recipe, 'name')}</strong>
                  <span>
                    v{number(recipe, 'versionNumber')} · {text(recipe, 'lifecycleStatus')} ·{' '}
                    {number(recipe, 'activeJobCount')} pinned active job(s)
                  </span>
                </summary>
                <p>{text(recipe, 'description')}</p>
                <pre>{JSON.stringify(recipe['validation'], null, 2)}</pre>
                {canManage && boolean(recipe, 'activeForNewJobs') ? (
                  <form action={createRecipeSuccessorAction} className="farming-content-form">
                    <input
                      name="recipeDefinitionId"
                      type="hidden"
                      value={text(recipe, 'definitionId')}
                    />
                    <input
                      name="expectedVersionId"
                      type="hidden"
                      value={text(recipe, 'versionId')}
                    />
                    <input
                      name="expectedConfigurationRevision"
                      type="hidden"
                      value={number(recipe, 'configurationRevision')}
                    />
                    <input
                      name="workstationType"
                      type="hidden"
                      value={text(recipe, 'workstationType')}
                    />
                    <input name="outputItemId" type="hidden" value={text(output, 'itemId')} />
                    <label>
                      Successor name
                      <input
                        defaultValue={text(recipe, 'name')}
                        maxLength={80}
                        name="name"
                        required
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        defaultValue={text(recipe, 'description')}
                        maxLength={280}
                        name="description"
                        required
                        rows={3}
                      />
                    </label>
                    <label>
                      Output quantity
                      <input
                        defaultValue={number(output, 'quantity')}
                        min={1}
                        name="outputQuantity"
                        type="number"
                      />
                    </label>
                    <label>
                      Production seconds
                      <input
                        defaultValue={number(recipe, 'productionDurationSeconds')}
                        min={1}
                        name="productionDurationSeconds"
                        type="number"
                      />
                    </label>
                    <label>
                      Local seconds
                      <input
                        defaultValue={number(recipe, 'localDurationSeconds')}
                        min={1}
                        name="localDurationSeconds"
                        type="number"
                      />
                    </label>
                    <label>
                      DUST fee
                      <input
                        defaultValue={number(recipe, 'dustFee')}
                        min={0}
                        name="dustFee"
                        type="number"
                      />
                    </label>
                    <label>
                      Unlock rule
                      <input defaultValue={text(recipe, 'unlockRule')} name="unlockRule" required />
                    </label>
                    <label>
                      Discovery policy
                      <input
                        defaultValue={text(recipe, 'discoveryPolicy')}
                        name="discoveryPolicy"
                        required
                      />
                    </label>
                    {choice(
                      'tutorialEligible',
                      boolean(recipe, 'tutorialEligible'),
                      'Tutorial eligible',
                    )}
                    {choice('repeatable', boolean(recipe, 'repeatable'), 'Repeatable')}
                    {choice('enabled', boolean(recipe, 'enabled'), 'New jobs')}
                    <label>
                      Maximum batch
                      <input
                        defaultValue={number(recipe, 'maximumBatchQuantity')}
                        max={99}
                        min={1}
                        name="maximumBatchQuantity"
                        type="number"
                      />
                    </label>
                    <label>
                      Ingredient snapshot
                      <textarea
                        defaultValue={JSON.stringify(ingredients, null, 2)}
                        name="ingredients"
                        rows={5}
                      />
                    </label>
                    <label>
                      Audit reason
                      <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                    </label>
                    <button type="submit">Validate and create active successor</button>
                  </form>
                ) : null}
              </details>
            );
          })}
        </div>
      </section>

      <section className="detail-card" aria-labelledby="recent-crafting-jobs-title">
        <h2 id="recent-crafting-jobs-title">Recent jobs</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Status</th>
                <th>Player</th>
                <th>Timing</th>
                <th>Safe action</th>
              </tr>
            </thead>
            <tbody>
              {content.jobs.map((job) => (
                <tr key={text(job, 'id')}>
                  <td>
                    <strong>{text(job, 'recipeName')}</strong>
                    <small>{text(job, 'id')}</small>
                  </td>
                  <td>{text(job, 'status')}</td>
                  <td>{text(job, 'playerId')}</td>
                  <td>
                    {text(job, 'startedAt')} → {text(job, 'completesAt')}
                  </td>
                  <td>
                    {canReconcile ? (
                      <form action={requestCraftingReconciliationAction}>
                        <input name="jobId" type="hidden" value={text(job, 'id')} />
                        <input
                          aria-label="Reconciliation audit reason"
                          minLength={12}
                          name="reason"
                          placeholder="Reason (12+ characters)"
                          required
                        />
                        <button type="submit">Request review</button>
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
      </section>

      <section className="detail-card" aria-labelledby="crafting-audit-title">
        <h2 id="crafting-audit-title">Append-only audit</h2>
        <ul className="cozy-definition-list">
          {content.audit.map((event) => (
            <li key={text(event, 'id')}>
              <strong>{text(event, 'actionKey')}</strong>
              <span>
                {text(event, 'reason')} · {text(event, 'createdAt')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
