import type { AdminPermissionKey } from '@starville/admin-auth';
import type { AdminHousingWorkspace } from '../lib/housing-api';
import {
  housingCorrectionAction,
  housingCorrectionApplyAction,
  housingLiveOpsAction,
  housingReconciliationAction,
  housingSimulationAction,
  housingUpgradeSuccessorAction,
  housingUpgradeTransitionAction,
} from '../app/actions/housing';

function text(record: Record<string, unknown>, key: string, fallback = '—') {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}
function numberValue(record: Record<string, unknown>, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === 'number' ? value : fallback;
}
function booleanValue(record: Record<string, unknown>, key: string) {
  return record[key] === true;
}
function objectValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function arrayText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').join(', ')
    : '—';
}
function records(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : [];
}
function can(permissions: readonly AdminPermissionKey[], key: AdminPermissionKey) {
  return permissions.includes(key);
}

export function HousingAdminDashboard({
  workspace,
  permissions,
  notice,
}: {
  readonly workspace: AdminHousingWorkspace;
  readonly permissions: readonly AdminPermissionKey[];
  readonly notice?: string;
}) {
  const liveOps = workspace.liveOps;
  const telemetry = workspace.telemetry;
  const selected = workspace.playerHome;
  const selectedHome = selected === null ? {} : objectValue(selected, 'home');
  const selectedLayout = selected === null ? {} : objectValue(selected, 'layout');
  return (
    <main className="operations-page housing-admin" aria-labelledby="housing-admin-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Gameplay · personal homes</p>
          <h1 id="housing-admin-title">Housing operations</h1>
          <p>
            Inspect furniture and World Asset linkage, templates, immutable layout revisions,
            storage, upgrades, player homes, reconciliation, and bounded live operations.
          </p>
        </div>
        <span className="state-chip state-chip--warning">Phase 11E · owner acceptance pending</span>
      </header>
      {notice === undefined ? null : (
        <p className="operations-notice" role="status">
          {notice.replaceAll('-', ' ')}
        </p>
      )}
      <aside className="detail-card immutable-warning">
        <strong>Immutable authority</strong>
        <p>
          Active layout revisions and player upgrade transactions are read-only. Successors and
          corrections preserve original history; referenced definitions are never destructively
          deleted.
        </p>
      </aside>
      <nav className="avatar-workflow-links detail-card" aria-label="Housing administration">
        <a href="#furniture">Furniture</a>
        <a href="#templates">Home Templates</a>
        <a href="#upgrades">Upgrade Paths</a>
        <a href="#storage">Storage Policies</a>
        <a href="#players">Player Homes</a>
        <a href="#revisions">Layout Revisions</a>
        <a href="#reconciliation">Reconciliation</a>
        <a href="#live-ops">Live Ops</a>
        <a href="#telemetry">Telemetry</a>
      </nav>
      <section className="economy-metrics-grid" aria-label="Housing telemetry">
        <article className="economy-metric-card">
          <span>Homes</span>
          <strong>{numberValue(telemetry, 'homes').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Layout saves · 7d</span>
          <strong>{numberValue(telemetry, 'layoutSaves7d').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Storage transfers · 7d</span>
          <strong>{numberValue(telemetry, 'storageTransfers7d').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Open reconciliation</span>
          <strong>{numberValue(telemetry, 'openReconciliation').toLocaleString()}</strong>
        </article>
      </section>
      <section className="detail-card" id="furniture">
        <h2>Furniture definitions</h2>
        <p>
          Item and World Asset management remain in their canonical workspaces. Housing shows
          linkage, placement policy, ownership, and reference counts.
        </p>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Furniture</th>
                <th>Item / asset</th>
                <th>Placement policy</th>
                <th>Usage</th>
                <th>Lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {workspace.furniture.map((entry) => {
                const footprint = objectValue(entry, 'footprint');
                return (
                  <tr key={text(entry, 'id')}>
                    <td>
                      <strong>{text(entry, 'name')}</strong>
                      <small>
                        {text(entry, 'key')} · {text(entry, 'category')}
                      </small>
                    </td>
                    <td>
                      <small>Item {text(entry, 'itemKey')}</small>
                      {text(entry, 'worldAssetId') === '—' ? (
                        <small>{text(entry, 'assetReadiness')}</small>
                      ) : (
                        <a href={`/world-assets/${text(entry, 'worldAssetId')}`}>
                          Inspect active World Asset
                        </a>
                      )}
                    </td>
                    <td>
                      {numberValue(footprint, 'width')}×{numberValue(footprint, 'height')} ·{' '}
                      {booleanValue(entry, 'blocksMovement') ? 'blocking' : 'decorative'}
                      <small>Zones: {arrayText(entry, 'allowedZones')}</small>
                      <small>Rotations: {arrayText(entry, 'rotations')}</small>
                    </td>
                    <td>
                      {numberValue(entry, 'inventoryOwnerCount')} owners ·{' '}
                      {numberValue(entry, 'placedCount')} placed
                    </td>
                    <td>
                      {booleanValue(entry, 'enabled') ? 'enabled' : 'disabled'} ·{' '}
                      {booleanValue(entry, 'released') ? 'released' : 'future'}
                      <small>Configuration {numberValue(entry, 'configurationRevision')}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="card-note">
          Furniture configuration successors require the canonical item-link uniqueness and asset
          validation policy; destructive deletion is unavailable.
        </p>
      </section>
      <section className="detail-card" id="templates">
        <h2>Home templates and zones</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Bounds / access</th>
                <th>Zones</th>
                <th>References</th>
              </tr>
            </thead>
            <tbody>
              {workspace.templates.map((entry) => {
                const bounds = objectValue(entry, 'bounds');
                return (
                  <tr key={text(entry, 'id')}>
                    <td>
                      <strong>{text(entry, 'name')}</strong>
                      <small>
                        {text(entry, 'key')} · immutable v{numberValue(entry, 'version')}
                      </small>
                    </td>
                    <td>
                      {numberValue(bounds, 'minX')},{numberValue(bounds, 'minY')} →{' '}
                      {numberValue(bounds, 'maxX')},{numberValue(bounds, 'maxY')}
                      <small>
                        {booleanValue(entry, 'developmentArt')
                          ? 'Development marker art'
                          : 'Production art'}
                      </small>
                    </td>
                    <td>
                      {records(entry, 'zones')
                        .map((zone) => `${text(zone, 'label')} (${text(zone, 'type')})`)
                        .join(' · ')}
                    </td>
                    <td>
                      {numberValue(entry, 'homeCount')} homes ·{' '}
                      {numberValue(entry, 'farmingTileCount')} farm tiles ·{' '}
                      {numberValue(entry, 'workstationCount')} workstation anchors
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Indoor-room zones are inspectable foundation data but remain disabled until a real indoor
          renderer is available. Template changes never rewrite existing homes silently.
        </p>
      </section>
      <section className="detail-card" id="upgrades">
        <h2>Versioned upgrade paths</h2>
        <p>
          Active versions are immutable. Create a draft successor, validate it, simulate impact, and
          activate only through authorized configuration workflow.
        </p>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Upgrade</th>
                <th>Cost / requirements</th>
                <th>Capacity</th>
                <th>Lifecycle</th>
                <th>Authorized workflow</th>
              </tr>
            </thead>
            <tbody>
              {workspace.upgrades.map((entry) => (
                <tr key={text(entry, 'versionId')}>
                  <td>
                    <strong>{text(entry, 'name')}</strong>
                    <small>
                      {text(entry, 'key')} · Tier {numberValue(entry, 'currentTier')}→
                      {numberValue(entry, 'targetTier')}
                    </small>
                  </td>
                  <td>
                    {numberValue(entry, 'dustCost')} DUST
                    <small>Player Level {numberValue(entry, 'requiredPlayerLevel')}</small>
                  </td>
                  <td>
                    {numberValue(entry, 'furnitureCapacity')} furniture ·{' '}
                    {numberValue(entry, 'storageCapacity')} storage
                    <small>
                      {arrayText(entry, 'unlockedZoneKeys')} · {text(entry, 'roomUnlock')}
                    </small>
                  </td>
                  <td>
                    {text(entry, 'status')} v{numberValue(entry, 'version')}
                    <small>{numberValue(entry, 'ownerCount')} owners</small>
                  </td>
                  <td>
                    {can(permissions, 'housing.upgrades.manage') ? (
                      <details>
                        <summary>Successor / transition</summary>
                        <form
                          action={housingUpgradeSuccessorAction}
                          className="progression-admin-form"
                        >
                          <input name="versionId" type="hidden" value={text(entry, 'versionId')} />
                          <input
                            name="expectedRevision"
                            type="hidden"
                            value={numberValue(entry, 'configurationRevision')}
                          />
                          <label>
                            Structured overrides
                            <textarea defaultValue="{}" name="configuration" rows={3} />
                          </label>
                          <label>
                            Reason
                            <input name="reason" minLength={20} required />
                          </label>
                          <button type="submit">Create draft successor</button>
                        </form>
                        <form
                          action={housingUpgradeTransitionAction}
                          className="progression-admin-form"
                        >
                          <input name="versionId" type="hidden" value={text(entry, 'versionId')} />
                          <input
                            name="expectedRevision"
                            type="hidden"
                            value={numberValue(entry, 'configurationRevision')}
                          />
                          <label>
                            Transition
                            <select name="transition">
                              <option value="validate">Validate</option>
                              <option value="activate">Activate</option>
                              <option value="archive">Archive draft</option>
                            </select>
                          </label>
                          <label>
                            Reason
                            <input name="reason" minLength={20} required />
                          </label>
                          <button type="submit">Submit transition</button>
                        </form>
                      </details>
                    ) : (
                      <span>Read only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can(permissions, 'housing.upgrades.inspect') ? (
          <form action={housingSimulationAction} className="progression-admin-form">
            <h3>Impact simulation</h3>
            <div className="detail-grid">
              <label>
                Tier 1 furniture
                <input name="tier1Furniture" type="number" defaultValue={8} />
              </label>
              <label>
                Tier 2 furniture
                <input name="tier2Furniture" type="number" defaultValue={12} />
              </label>
              <label>
                Tier 1 storage
                <input name="tier1Storage" type="number" defaultValue={16} />
              </label>
              <label>
                Tier 2 storage
                <input name="tier2Storage" type="number" defaultValue={24} />
              </label>
              <label>
                DUST cost
                <input name="dustCost" type="number" defaultValue={250} />
              </label>
              <label>
                Player DUST
                <input name="averageDust" type="number" defaultValue={500} />
              </label>
              <label>
                Placements
                <input name="placements" type="number" defaultValue={8} />
              </label>
              <label>
                Storage used
                <input name="storageUsed" type="number" defaultValue={15} />
              </label>
              <label>
                Payload bytes
                <input name="payloadBytes" type="number" defaultValue={8192} />
              </label>
              <label>
                Replay count
                <input name="replays" type="number" defaultValue={2} />
              </label>
              <label>
                Game Test
                <select name="gameTest" defaultValue="false">
                  <option value="false">Normal</option>
                  <option value="true">Game Test</option>
                </select>
              </label>
            </div>
            <button type="submit">Run non-mutating simulation</button>
          </form>
        ) : null}
      </section>
      <section className="detail-card" id="storage">
        <h2>Storage policy</h2>
        <dl className="cozy-admin-detail-list">
          <div>
            <dt>Starter capacity</dt>
            <dd>{numberValue(workspace.storagePolicy, 'starterCapacity')}</dd>
          </div>
          <div>
            <dt>Maximum</dt>
            <dd>{numberValue(workspace.storagePolicy, 'maximumCapacity')}</dd>
          </div>
          <div>
            <dt>Restricted categories</dt>
            <dd>{arrayText(workspace.storagePolicy, 'restrictedCategories')}</dd>
          </div>
          <div>
            <dt>Transfer rate</dt>
            <dd>{numberValue(workspace.storagePolicy, 'depositRateLimitPerMinute')} / minute</dd>
          </div>
          <div>
            <dt>Capacity violations</dt>
            <dd>{numberValue(workspace.storagePolicy, 'capacityViolationCount')}</dd>
          </div>
        </dl>
        <p>Capacity reduction below current usage is never applied automatically.</p>
      </section>
      <section className="detail-card" id="players">
        <h2>Player homes</h2>
        <form method="get" className="progression-admin-form">
          <label>
            Wallet
            <input name="wallet" minLength={32} maxLength={44} />
          </label>
          <label>
            Search
            <input name="search" maxLength={128} />
          </label>
          <button type="submit">Inspect bounded player home</button>
        </form>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Home / owner</th>
                <th>Tier / layout</th>
                <th>Furniture</th>
                <th>Storage</th>
              </tr>
            </thead>
            <tbody>
              {workspace.playerHomes.map((entry) => (
                <tr key={text(entry, 'homeId')}>
                  <td>
                    <strong>{text(entry, 'homeId')}</strong>
                    <small>{text(entry, 'walletAddress')}</small>
                  </td>
                  <td>
                    Tier {numberValue(entry, 'homeTier')} · revision{' '}
                    {numberValue(entry, 'layoutRevision')}
                  </td>
                  <td>
                    {numberValue(entry, 'furnitureCount')}/{numberValue(entry, 'furnitureCapacity')}
                  </td>
                  <td>
                    {numberValue(entry, 'storageUsed')}/{numberValue(entry, 'storageCapacity')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected === null ? null : (
          <aside className="detail-card">
            <h3>Selected private projection</h3>
            <p>
              Home {text(selectedHome, 'id')} · Tier {numberValue(selectedHome, 'homeTier')} ·
              authoritative revision{' '}
              {numberValue(objectValue(selectedLayout, 'activeRevision'), 'revisionNumber')}
            </p>
            <p>
              Storage, upgrade settlement, quest state, recent saves, reconciliation, and correction
              evidence are scoped to this authorized lookup.
            </p>
          </aside>
        )}
      </section>
      <section className="detail-card" id="revisions">
        <h2>Immutable layout revision inspection</h2>
        <p>
          Revision snapshots include parent, restoration source, change summary, validation result,
          placement settlement references, actor, and timestamp. Raw editing is unavailable.
        </p>
        {selected === null ? (
          <p>Choose an authorized player wallet above.</p>
        ) : (
          <pre className="admin-json-preview">
            {JSON.stringify(records(selected, 'recentSaves'), null, 2)}
          </pre>
        )}
      </section>
      <section className="detail-card" id="reconciliation">
        <h2>Reconciliation and corrections</h2>
        <div className="detail-grid">
          {can(permissions, 'housing.reconciliation.manage') ? (
            <form action={housingReconciliationAction} className="progression-admin-form">
              <h3>Request bounded reconciliation</h3>
              <label>
                Wallet
                <input name="wallet" minLength={32} maxLength={44} required />
              </label>
              <label>
                Type
                <select name="type">
                  <option value="full_home">Full home evidence</option>
                  <option value="layout_head">Layout head</option>
                  <option value="furniture_settlement">Furniture settlement</option>
                  <option value="storage_capacity">Storage capacity</option>
                  <option value="layout_validity">Layout validity</option>
                  <option value="upgrade_settlement">Upgrade settlement</option>
                  <option value="quest_authority">Quest authority</option>
                  <option value="preview_exclusion">Game Test exclusion</option>
                </select>
              </label>
              <label>
                Priority
                <input name="priority" type="number" min={1} max={100} defaultValue={50} />
              </label>
              <label>
                Reason
                <input name="reason" minLength={20} required />
              </label>
              <button type="submit">Queue reconciliation</button>
            </form>
          ) : null}
          {can(permissions, 'housing.corrections.manage') ? (
            <form action={housingCorrectionAction} className="progression-admin-form">
              <h3>Request correction · AAL2</h3>
              <label>
                Wallet
                <input name="wallet" minLength={32} maxLength={44} required />
              </label>
              <label>
                Type
                <select name="type">
                  <option value="repair_storage_mismatch">Repair storage mismatch</option>
                  <option value="retry_layout_settlement">Retry layout settlement</option>
                  <option value="recover_stranded_furniture">Recover stranded furniture</option>
                  <option value="restore_safe_layout">Restore safe layout as successor</option>
                  <option value="compensating_item_foundation">Compensation foundation</option>
                </select>
              </label>
              <label>
                Expected home revision
                <input name="expectedRevision" type="number" min={1} required />
              </label>
              <label>
                Impact preview
                <textarea name="impactPreview" defaultValue="{}" rows={3} />
              </label>
              <label>
                Reason
                <input name="reason" minLength={20} required />
              </label>
              <button type="submit">Request independent review</button>
            </form>
          ) : null}
        </div>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {workspace.reconciliation.map((entry) => (
                <tr key={text(entry, 'id')}>
                  <td>{text(entry, 'reconciliation_type')}</td>
                  <td>{text(entry, 'status')}</td>
                  <td>
                    <small>{JSON.stringify(entry['evidence'] ?? {})}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected === null || !can(permissions, 'housing.corrections.manage')
          ? null
          : records(selected, 'corrections').map((correction) => (
              <form
                key={text(correction, 'id')}
                action={housingCorrectionApplyAction}
                className="progression-admin-form"
              >
                <input name="correctionId" type="hidden" value={text(correction, 'id')} />
                <input
                  name="expectedRevision"
                  type="hidden"
                  value={numberValue(correction, 'state_version')}
                />
                <strong>
                  {text(correction, 'correction_type')} · {text(correction, 'status')}
                </strong>
                <label>
                  Independent review reason
                  <input name="reason" minLength={20} required />
                </label>
                <button type="submit">Review / apply safe correction</button>
              </form>
            ))}
      </section>
      <section className="detail-card" id="live-ops">
        <h2>Live Ops</h2>
        <p>
          Pause new starts independently. Existing layouts, storage contents, and upgrade history
          remain readable.
        </p>
        {can(permissions, 'housing.live_ops.manage') ? (
          <form action={housingLiveOpsAction} className="progression-admin-form">
            <input
              name="expectedRevision"
              type="hidden"
              value={
                numberValue(liveOps, 'configuration_revision') ||
                numberValue(liveOps, 'configurationRevision')
              }
            />
            <label>
              Settings JSON
              <textarea
                name="settings"
                rows={7}
                defaultValue={JSON.stringify(
                  {
                    decorationStartsEnabled: booleanValue(liveOps, 'decoration_starts_enabled'),
                    layoutSavesEnabled: booleanValue(liveOps, 'layout_saves_enabled'),
                    storageDepositsEnabled: booleanValue(liveOps, 'storage_deposits_enabled'),
                    storageWithdrawalsEnabled: booleanValue(liveOps, 'storage_withdrawals_enabled'),
                    upgradesEnabled: booleanValue(liveOps, 'upgrades_enabled'),
                  },
                  null,
                  2,
                )}
              />
            </label>
            <label>
              Reason
              <input name="reason" minLength={20} required />
            </label>
            <button type="submit">Update housing availability</button>
          </form>
        ) : (
          <p>Read-only availability view.</p>
        )}
      </section>
      <section className="detail-card" id="telemetry">
        <h2>Telemetry and audit</h2>
        <p>
          Aggregate trends omit broad private layout payloads. Audit records preserve actor, target,
          outcome, request identity, and bounded safe evidence.
        </p>
        <pre className="admin-json-preview">
          {JSON.stringify({ telemetry, audit: workspace.audit.slice(0, 20) }, null, 2)}
        </pre>
      </section>
    </main>
  );
}
