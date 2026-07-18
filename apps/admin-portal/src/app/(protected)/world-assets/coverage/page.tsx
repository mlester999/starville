import { STARVILLE_BUNDLED_ASSETS, bundledAssetAdminMediaPath } from '@starville/asset-management';
import Link from 'next/link';

import styles from '../../../../components/world-asset-bundled.module.css';
import { loadAssetDirectory } from '../../../../lib/world-assets/api';
import { requireAssetManagerPermission } from '../../../../lib/world-assets/authorization';
import { buildBundledAssetCoverageReport } from '../../../../lib/world-assets/bundled-coverage';
import {
  findStarvilleWorkspaceRoot,
  inspectBundledMediaFiles,
} from '../../../../lib/world-assets/bundled-media';
import type { WorldAssetSummary } from '../../../../lib/world-assets/contracts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const directoryQuery = {
  pageSize: 100,
  search: '',
  assetType: 'all',
  category: '',
  lifecycle: 'all',
  production: 'all',
  sort: 'friendly_name',
  direction: 'asc',
} as const;

async function loadAllRegisteredAssets(): Promise<readonly WorldAssetSummary[]> {
  const first = await loadAssetDirectory({ ...directoryQuery, page: 1 });
  if (first.totalPages <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      loadAssetDirectory({ ...directoryQuery, page: index + 2 }),
    ),
  );
  return [first, ...remaining].flatMap(({ items }) => items);
}

function byteLabel(bytes: number | null): string {
  if (bytes === null) return 'Not available';
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusClass(status: 'ready' | 'missing_source' | 'missing_thumbnail' | 'oversized') {
  if (status === 'ready') return styles['statusReady'];
  if (status === 'missing_source') return styles['statusMissing'];
  return styles['statusWarning'];
}

export default async function WorldAssetCoveragePage() {
  await requireAssetManagerPermission('assets.read');
  const workspaceRoot = findStarvilleWorkspaceRoot();
  const [directoryResult, evidence] = await Promise.all([
    loadAllRegisteredAssets().then(
      (assets) => ({ assets, available: true as const }),
      () => ({ assets: [] as readonly WorldAssetSummary[], available: false as const }),
    ),
    workspaceRoot === null
      ? Promise.resolve([])
      : inspectBundledMediaFiles(workspaceRoot, STARVILLE_BUNDLED_ASSETS),
  ]);
  const report = buildBundledAssetCoverageReport({
    manifestAssets: STARVILLE_BUNDLED_ASSETS,
    directoryAssets: directoryResult.assets,
    mediaEvidence: evidence,
  });
  const cards = [
    ['Stable keys', report.totals.stableKeys, 'Canonical bundled manifest'],
    ['Bundled ready', report.totals.bundledAvailable, 'Validated source WebP files'],
    ['Registered', report.totals.registeredKeys, 'Known World Asset records'],
    ['Overrides', report.totals.uploadedOverrides, 'Uploaded candidate or production records'],
    ['Active overrides', report.totals.activeOverrides, 'Approved active uploaded sources'],
    ['Missing assets', report.totals.missingSources, 'Bundled source unavailable or invalid'],
    ['Validation failures', report.totals.validationFailures, 'Keys with an invalid version'],
    ['Unused', report.totals.unusedAssets, 'Registered keys with no tracked references'],
    ['Missing thumbnail', report.totals.missingThumbnails, 'Operational preview gap'],
    ['Oversized', report.totals.oversized, 'Bundled sources above the derivative budget'],
    ['World usage', report.totals.referencedByWorlds, 'Keys referenced by worlds'],
    ['Furniture usage', report.totals.referencedByFurniture, 'Keys referenced by furniture'],
    ['Farming usage', report.totals.referencedByFarming, 'Keys referenced by farming'],
    ['Placeholders', report.totals.usingPlaceholders, 'Keys using development-marker material'],
  ] as const;

  return (
    <main
      className="operations-page world-assets-page admin-content-shell"
      aria-labelledby="coverage-title"
    >
      <Link className="back-link" href="/world-assets">
        ← World Assets
      </Link>
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Inspection and QA</p>
          <h1 id="coverage-title">Bundled Asset Coverage</h1>
          <p>
            Read-only coverage joins the canonical repository manifest, local generated files, and
            authorized World Asset directory metadata. Nothing on this page activates or mutates
            art.
          </p>
        </div>
        <span className="permission-badge">{report.totals.stableKeys} stable key(s)</span>
      </header>

      {!directoryResult.available ? (
        <aside className="phase-note" role="status">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Uploaded-directory evidence is unavailable.</strong>
            <p>Bundled file coverage remains exact; override and usage counts are not claimed.</p>
          </div>
        </aside>
      ) : null}

      <section className={styles['summaryGrid']} aria-label="Bundled coverage totals">
        {cards.map(([label, value, detail]) => (
          <article className={styles['summaryCard']} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="detail-card" aria-labelledby="coverage-table-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Canonical manifest rows</p>
            <h2 id="coverage-table-title">Stable-key evidence</h2>
          </div>
          <span className="permission-badge">
            {report.totals.developmentMarkers} registered development marker(s)
          </span>
        </div>
        <div
          className="data-table-region"
          role="region"
          aria-label="Bundled asset coverage table"
          tabIndex={0}
        >
          <table className={`data-table ${styles['coverageTable']}`}>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Bundled media</th>
                <th scope="col">Override</th>
                <th scope="col">Usage</th>
                <th scope="col">Quality</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.asset.key}>
                  <td data-label="Asset">
                    <div className="world-asset-table__identity">
                      <img
                        alt={`${row.asset.displayName} bundled thumbnail`}
                        decoding="async"
                        height={48}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={bundledAssetAdminMediaPath(row.asset.key, 'thumbnail')}
                        width={48}
                      />
                      <span>
                        <strong>{row.asset.displayName}</strong>
                        <code>{row.asset.key}</code>
                        <small>
                          {row.asset.category} · {row.asset.assetType}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td data-label="Bundled media">
                    <span className={statusClass(row.status)}>
                      {row.status.replaceAll('_', ' ')}
                    </span>
                    <small>
                      {byteLabel(row.sourceBytes)} · thumbnail{' '}
                      {row.thumbnailAvailable ? 'ready' : 'missing'}
                    </small>
                  </td>
                  <td data-label="Override">
                    {row.activeOverride
                      ? 'Active approved override'
                      : row.uploadedOverride
                        ? 'Uploaded version available'
                        : 'Bundled default'}
                    <small>
                      {row.registered === null
                        ? 'No directory record'
                        : `${row.registered.versionCount} version(s) · ${row.registered.productionStatus.replaceAll('_', ' ')}`}
                    </small>
                  </td>
                  <td data-label="Usage">
                    {row.registered?.referenceCount ?? 0} tracked reference(s)
                    <small>
                      Worlds {row.worldUsageCount} · furniture {row.furnitureUsageCount} · farming{' '}
                      {row.farmingUsageCount}
                    </small>
                    <small>{row.asset.usageLocations.join(', ')}</small>
                  </td>
                  <td data-label="Quality">
                    {row.asset.qualityStatus.replaceAll('_', ' ')}
                    <small>
                      {row.asset.replacementAllowed ? 'Replacement allowed' : 'Protected fallback'}{' '}
                      · {row.asset.variants.length} authored variant(s)
                    </small>
                    <small>
                      {row.validationFailure ? 'Validation failure present' : 'No invalid version'} ·{' '}
                      {row.usingPlaceholder ? 'development marker active' : 'production source active'}
                    </small>
                    {row.registered === null ? null : (
                      <Link className="table-link" href={`/world-assets/${row.registered.id}`}>
                        Inspect record
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
