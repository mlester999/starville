import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldAssetEmptyState } from '../../../../components/world-asset-empty-state';
import { WorldAssetNewVersionUpload } from '../../../../components/world-asset-new-version-upload';
import { WorldAssetReferenceList } from '../../../../components/world-asset-reference-list';
import { WorldAssetThumbnail } from '../../../../components/world-asset-thumbnail';
import { AdminApiError } from '../../../../lib/admin-api';
import { loadAssetDetail, loadAssetReferences } from '../../../../lib/world-assets/api';
import { availableAdminAssetMediaPath } from '../../../../lib/world-assets/media';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../../lib/world-assets/authorization';
import { assetTypeLabel, formatAssetBytes } from '../../../../lib/world-assets/profiles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string | null): string {
  if (value === null) return 'Not recorded';
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export default async function WorldAssetDetailPage(props: {
  readonly params: Promise<{ readonly assetId: string }>;
}) {
  const context = await requireAssetManagerPermission('assets.read');
  const capabilities = assetManagerCapabilities(context);
  const parameters = await props.params;
  const assetId = z.uuid().safeParse(parameters.assetId);
  if (!assetId.success) notFound();

  try {
    const [detail, referenceRecords] = await Promise.all([
      loadAssetDetail(assetId.data),
      loadAssetReferences(assetId.data),
    ]);
    const { asset } = detail;
    const activeVersion =
      asset.activeVersionId === null
        ? null
        : (detail.versions.find(({ id }) => id === asset.activeVersionId) ?? null);
    const references = detail.referenceSummary;
    const openVersion = detail.versions.find(({ lifecycleStatus }) =>
      [
        'draft',
        'processing',
        'validation_failed',
        'validated',
        'in_review',
        'changes_requested',
        'approved',
      ].includes(lifecycleStatus),
    );

    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-detail-title">
        <Link className="back-link" href="/world-assets">
          ← World Assets
        </Link>
        <header className="operations-intro world-asset-detail-intro">
          <div className="world-asset-detail-intro__identity">
            <WorldAssetThumbnail
              alt={`${asset.friendlyName} active thumbnail`}
              fallback={asset.slug}
              size="large"
              source={
                activeVersion === null
                  ? null
                  : availableAdminAssetMediaPath(
                      asset.id,
                      activeVersion.id,
                      'thumbnail',
                      activeVersion.thumbnailUrl,
                    )
              }
            />
            <div>
              <p className="eyebrow">Versioned asset record</p>
              <h1 id="asset-detail-title">{asset.friendlyName}</h1>
              <p>
                <code>{asset.slug}</code> · {assetTypeLabel(asset.assetType)} ·{' '}
                {humanize(asset.category)}
              </p>
            </div>
          </div>
          <div className="world-assets-intro__actions">
            <span className={`state-chip state-chip--${asset.lifecycleStatus}`}>
              {humanize(asset.lifecycleStatus)}
            </span>
            <span
              className={`asset-production-badge asset-production-badge--${asset.productionStatus}`}
            >
              {humanize(asset.productionStatus)}
            </span>
            {capabilities.canUpload ? (
              <Link className="button button--secondary" href="/world-assets/upload">
                Upload new asset
              </Link>
            ) : null}
            {capabilities.canReadAudit ? (
              <Link
                className="button button--quiet"
                href={`/world-assets/audit?search=${encodeURIComponent(asset.slug)}`}
              >
                View audit
              </Link>
            ) : null}
          </div>
        </header>

        <div className="detail-grid world-asset-detail-grid">
          <section className="detail-card">
            <h2>Identity</h2>
            <dl className="detail-list">
              <div>
                <dt>Game identifier</dt>
                <dd>{asset.gameId}</dd>
              </div>
              <div>
                <dt>Marker replacement</dt>
                <dd>{asset.developmentMarkerReplacementKey ?? 'None'}</dd>
              </div>
              <div>
                <dt>Active-version tags</dt>
                <dd>{activeVersion?.tags.join(', ') || 'None'}</dd>
              </div>
              <div>
                <dt>Record revision</dt>
                <dd>{asset.revision}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(asset.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(asset.updatedAt)}</dd>
              </div>
            </dl>
          </section>
          <section className="detail-card">
            <h2>Reference safety</h2>
            <dl className="detail-list">
              <div>
                <dt>Published</dt>
                <dd>{references.published}</dd>
              </div>
              <div>
                <dt>Drafts</dt>
                <dd>{references.drafts}</dd>
              </div>
              <div>
                <dt>Active configuration</dt>
                <dd>{references.activeConfiguration}</dd>
              </div>
              <div>
                <dt>Archival eligibility</dt>
                <dd>{references.mayArchive ? 'No blocking reference' : 'Blocked by references'}</dd>
              </div>
            </dl>
            <p className="field-hint">
              Published references preserve their pinned version and block destructive archival.
            </p>
          </section>
        </div>

        <WorldAssetReferenceList references={referenceRecords} />

        {capabilities.canUpload && activeVersion !== null && openVersion === undefined ? (
          <WorldAssetNewVersionUpload
            assetId={asset.id}
            assetRevision={asset.revision}
            assetType={asset.assetType}
          />
        ) : capabilities.canUpload && openVersion !== undefined ? (
          <aside className="phase-note" aria-label="Open asset version">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>An open candidate already exists.</strong>
              <p>
                Continue Version {openVersion.versionNumber} before starting another immutable
                version.
              </p>
              <Link
                className="button button--quiet"
                href={`/world-assets/${asset.id}/versions/${openVersion.id}`}
              >
                Open candidate
              </Link>
            </div>
          </aside>
        ) : null}

        <section className="detail-card" aria-labelledby="asset-versions-title">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Immutable history</p>
              <h2 id="asset-versions-title">Versions ({detail.versions.length})</h2>
            </div>
            {activeVersion === null ? (
              <span className="state-chip state-chip--pending">No active version</span>
            ) : (
              <span className="state-chip state-chip--active">
                Active v{activeVersion.versionNumber}
              </span>
            )}
          </div>
          {detail.versions.length === 0 ? (
            <WorldAssetEmptyState
              description="The upload has not produced a version record yet."
              title="No asset versions"
            />
          ) : (
            <div
              className="data-table-region"
              role="region"
              aria-label="Asset version history"
              tabIndex={0}
            >
              <table className="data-table asset-version-table">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Validation</th>
                    <th scope="col">Source</th>
                    <th scope="col">Created</th>
                    <th scope="col">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.versions.map((version) => (
                    <tr key={version.id}>
                      <td data-label="Version">
                        <strong>Version {version.versionNumber}</strong>
                        <small>Revision {version.editVersion}</small>
                      </td>
                      <td data-label="Lifecycle">
                        <span className={`state-chip state-chip--${version.lifecycleStatus}`}>
                          {humanize(version.lifecycleStatus)}
                        </span>
                      </td>
                      <td data-label="Validation">
                        <span className={`state-chip state-chip--${version.validationStatus}`}>
                          {version.validationStatus}
                        </span>
                      </td>
                      <td data-label="Source">
                        {version.width === null || version.height === null
                          ? 'Processing'
                          : `${String(version.width)} × ${String(version.height)}`}
                        <small>
                          {formatAssetBytes(version.sourceSizeBytes)} ·{' '}
                          {version.detectedMediaType?.replace('image/', '').toUpperCase() ??
                            'Pending'}
                        </small>
                      </td>
                      <td data-label="Created">{formatDate(version.createdAt)}</td>
                      <td data-label="Open">
                        <Link
                          className="table-link"
                          href={`/world-assets/${asset.id}/versions/${version.id}`}
                        >
                          Inspect<span className="sr-only"> version {version.versionNumber}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-detail-title">
        <h1 id="asset-detail-title">World Asset</h1>
        <WorldAssetEmptyState
          action={
            <Link className="button button--secondary" href="/world-assets">
              Return to asset library
            </Link>
          }
          alert
          description="No private intake file, cached metadata, or synthetic record is shown."
          title={
            error instanceof AdminApiError && error.status === 403
              ? 'Permission required'
              : 'Asset record unavailable'
          }
        />
      </main>
    );
  }
}
