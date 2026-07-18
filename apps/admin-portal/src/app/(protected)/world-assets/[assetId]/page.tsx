import { randomUUID } from 'node:crypto';

import { createLogger } from '@starville/logger';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldAssetEmptyState } from '../../../../components/world-asset-empty-state';
import { WorldAssetNewVersionUpload } from '../../../../components/world-asset-new-version-upload';
import { PlaceholderReplacementDisplay } from '../../../../components/world-asset-placeholder-selector';
import { WorldAssetReferenceList } from '../../../../components/world-asset-reference-list';
import { WorldAssetThumbnail } from '../../../../components/world-asset-thumbnail';
import { AdminApiError } from '../../../../lib/admin-api';
import {
  loadAssetDetail,
  loadAssetDirectory,
  loadAssetReferences,
} from '../../../../lib/world-assets/api';
import { availableAdminAssetMediaPath } from '../../../../lib/world-assets/media';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../../lib/world-assets/authorization';
import { toPlaceholderMarkerOptions } from '../../../../lib/world-assets/placeholder-markers';
import {
  assetCategoryLabel,
  assetTypeLabel,
  formatAssetBytes,
} from '../../../../lib/world-assets/profiles';
import {
  canonicalWorldAssetPath,
  canonicalWorldAssetVersionPath,
} from '../../../../lib/world-assets/version-recovery';
import {
  activeAssetVersion,
  assetArtworkLabel,
  candidateNextAction,
  latestAssetCandidate,
  safeAdministratorLabel,
  versionUsage,
} from '../../../../lib/world-assets/review-model';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const logger = createLogger({
  service: 'admin-portal',
  environment:
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development',
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});

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
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAssetManagerPermission('assets.read');
  const capabilities = assetManagerCapabilities(context);
  const parameters = await props.params;
  const assetId = z.uuid().safeParse(parameters.assetId);
  if (!assetId.success) notFound();
  const requestId = randomUUID();
  const searchParameters = await props.searchParams;
  const recoveredFromStaleVersion = searchParameters['recovery'] === 'stale-version';

  try {
    const [detail, referenceRecords] = await Promise.all([
      loadAssetDetail(assetId.data, requestId),
      loadAssetReferences(assetId.data, 1, 100, requestId),
    ]);
    const { asset } = detail;
    const activeVersion = activeAssetVersion(detail);
    const latestCandidate = latestAssetCandidate(detail);
    const activeUsage =
      activeVersion === null ? null : versionUsage(activeVersion.id, referenceRecords);
    const candidateUsage =
      latestCandidate === null ? null : versionUsage(latestCandidate.id, referenceRecords);
    const references = detail.referenceSummary;
    const openVersion = detail.versions.find(({ lifecycleStatus }) =>
      ['draft', 'processing', 'validation_failed', 'changes_requested'].includes(lifecycleStatus),
    );

    let resolvedMarker = null as ReturnType<typeof toPlaceholderMarkerOptions>[number] | null;
    let markerOptions = toPlaceholderMarkerOptions([]);
    try {
      const markers = await loadAssetDirectory({
        page: 1,
        pageSize: 100,
        search: asset.developmentMarkerReplacementKey ?? '',
        assetType: 'all',
        category: '',
        lifecycle: 'all',
        production: 'development_marker',
        sort: 'friendly_name',
        direction: 'asc',
      });
      markerOptions = toPlaceholderMarkerOptions(markers.items);
      if (asset.developmentMarkerReplacementKey !== null) {
        resolvedMarker =
          markerOptions.find((marker) => marker.key === asset.developmentMarkerReplacementKey) ??
          null;
        // Fallback: exact slug search may miss if search is fuzzy-limited; try direct match from items.
        if (resolvedMarker === null) {
          const exact = markers.items.find(
            (item) => item.slug === asset.developmentMarkerReplacementKey,
          );
          resolvedMarker =
            exact === undefined
              ? null
              : {
                  key: exact.slug,
                  friendlyName: exact.friendlyName,
                  assetType: exact.assetType,
                  category: exact.category,
                  lifecycleStatus: exact.lifecycleStatus,
                  productionStatus: exact.productionStatus,
                  thumbnailUrl: exact.thumbnailUrl,
                  assetId: exact.id,
                };
        }
      }
    } catch {
      resolvedMarker = null;
      markerOptions = toPlaceholderMarkerOptions([]);
    }

    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="asset-detail-title"
      >
        <Link className="back-link" href="/world-assets">
          ← World Assets
        </Link>
        {recoveredFromStaleVersion ? (
          <aside className="phase-note" role="status">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>Returned to the canonical asset.</strong>
              <p>
                The requested version no longer exists or was never committed. This page preserves
                the canonical record and active version without showing private intake data.
              </p>
              <Link className="button button--quiet" href={canonicalWorldAssetPath(asset.id)}>
                Clear recovery notice
              </Link>
            </div>
          </aside>
        ) : null}
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
                {assetCategoryLabel(asset.category)}
              </p>
            </div>
          </div>
          <div className="world-assets-intro__actions">
            <span className={`state-chip state-chip--${asset.lifecycleStatus}`}>
              {activeVersion === null ? 'No active version' : 'Asset has active version'}
            </span>
            <span
              className={`asset-production-badge asset-production-badge--${asset.productionStatus}`}
            >
              Active Artwork: {humanize(asset.productionStatus)}
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

        <section className="asset-active-candidate-grid" aria-label="Active and candidate versions">
          <article className="detail-card asset-version-spotlight asset-version-spotlight--active">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Current game artwork</p>
                <h2>Active Version</h2>
              </div>
              {activeVersion === null ? (
                <span className="state-chip state-chip--pending">None</span>
              ) : (
                <span className="state-chip state-chip--active">
                  Active Version: V{activeVersion.versionNumber}
                </span>
              )}
            </div>
            {activeVersion === null ? (
              <p>No version is currently available to the World Editor as this asset’s default.</p>
            ) : (
              <>
                <WorldAssetThumbnail
                  alt={`${asset.friendlyName} Version ${String(activeVersion.versionNumber)} current active artwork`}
                  fallback={asset.slug}
                  size="large"
                  source={availableAdminAssetMediaPath(
                    asset.id,
                    activeVersion.id,
                    'thumbnail',
                    activeVersion.thumbnailUrl,
                  )}
                />
                <dl className="detail-list">
                  <div>
                    <dt>Active version</dt>
                    <dd>Version {activeVersion.versionNumber}</dd>
                  </div>
                  <div>
                    <dt>Lifecycle</dt>
                    <dd>{humanize(activeVersion.lifecycleStatus)}</dd>
                  </div>
                  <div>
                    <dt>Artwork state</dt>
                    <dd>{assetArtworkLabel(activeVersion)}</dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd>{humanize(activeVersion.validationStatus)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {activeVersion.detectedMediaType?.replace('image/', '').toUpperCase() ??
                        activeVersion.processingStatus}
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(activeVersion.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>References</dt>
                    <dd>
                      {activeUsage === null
                        ? 'Not available'
                        : `${activeUsage.complete ? '' : 'At least '}${String(activeUsage.published)} published · ${String(activeUsage.drafts)} draft`}
                    </dd>
                  </div>
                </dl>
                {assetArtworkLabel(activeVersion) === 'Development Marker' ? (
                  <p className="field-hint">
                    Real managed artwork is not currently active for this asset.
                  </p>
                ) : null}
                <Link
                  className="button button--secondary"
                  href={canonicalWorldAssetVersionPath(asset.id, activeVersion.id)}
                >
                  Inspect Version {activeVersion.versionNumber}
                </Link>
              </>
            )}
          </article>

          <article className="detail-card asset-version-spotlight asset-version-spotlight--candidate">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Proposed artwork</p>
                <h2>Latest Candidate</h2>
              </div>
              {latestCandidate === null ? null : (
                <span className={`state-chip state-chip--${latestCandidate.lifecycleStatus}`}>
                  Candidate Status: {humanize(latestCandidate.lifecycleStatus)}
                </span>
              )}
            </div>
            {latestCandidate === null ? (
              <p>No newer candidate exists. Create a new draft version to propose a replacement.</p>
            ) : (
              <>
                <WorldAssetThumbnail
                  alt={`${asset.friendlyName} Version ${String(latestCandidate.versionNumber)} proposed candidate artwork, not active`}
                  fallback={asset.slug}
                  size="large"
                  source={availableAdminAssetMediaPath(
                    asset.id,
                    latestCandidate.id,
                    'thumbnail',
                    latestCandidate.thumbnailUrl,
                  )}
                />
                <dl className="detail-list">
                  <div>
                    <dt>Candidate</dt>
                    <dd>Version {latestCandidate.versionNumber}</dd>
                  </div>
                  <div>
                    <dt>Lifecycle</dt>
                    <dd>{humanize(latestCandidate.lifecycleStatus)}</dd>
                  </div>
                  <div>
                    <dt>Active</dt>
                    <dd>No — candidate is not active</dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd>{humanize(latestCandidate.validationStatus)}</dd>
                  </div>
                  <div>
                    <dt>Artwork</dt>
                    <dd>{assetArtworkLabel(latestCandidate)}</dd>
                  </div>
                  <div>
                    <dt>Dimensions</dt>
                    <dd>
                      {latestCandidate.width === null || latestCandidate.height === null
                        ? 'Processing'
                        : `${String(latestCandidate.width)} × ${String(latestCandidate.height)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted for review</dt>
                    <dd>{formatDate(latestCandidate.submittedAt)}</dd>
                  </div>
                  <div>
                    <dt>Submitted by</dt>
                    <dd>
                      {safeAdministratorLabel({
                        actorId: latestCandidate.submittedByAdminId,
                        currentAdministratorId: context.userId,
                        currentAdministratorName: context.displayName,
                        emptyLabel: 'Not submitted',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>Reviewer</dt>
                    <dd>
                      {safeAdministratorLabel({
                        actorId: latestCandidate.reviewedByAdminId,
                        currentAdministratorId: context.userId,
                        currentAdministratorName: context.displayName,
                        emptyLabel: 'Unassigned',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>References</dt>
                    <dd>
                      {candidateUsage === null
                        ? 'Not available'
                        : `${candidateUsage.complete ? '' : 'At least '}${String(candidateUsage.published + candidateUsage.drafts + candidateUsage.activeConfiguration)} tracked`}
                    </dd>
                  </div>
                </dl>
                <p>
                  Version {latestCandidate.versionNumber} is not active. The game and World Editor
                  continue using pinned world versions or active Version{' '}
                  {activeVersion?.versionNumber ?? 'none'}
                  until this candidate is separately approved and activated.
                </p>
                <p className="field-hint">{candidateNextAction(latestCandidate)}</p>
                <div className="asset-version-spotlight__actions">
                  <Link
                    className="button button--primary"
                    href={canonicalWorldAssetVersionPath(asset.id, latestCandidate.id)}
                  >
                    {latestCandidate.lifecycleStatus === 'in_review'
                      ? 'View review status'
                      : `Inspect Version ${String(latestCandidate.versionNumber)}`}
                  </Link>
                  {latestCandidate.lifecycleStatus === 'in_review' ? (
                    <Link
                      className="button button--quiet"
                      href={canonicalWorldAssetVersionPath(asset.id, latestCandidate.id)}
                    >
                      Inspect Version {latestCandidate.versionNumber}
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </article>
        </section>

        {activeVersion !== null && latestCandidate !== null ? (
          <section
            className="detail-card asset-version-comparison"
            aria-labelledby="asset-version-comparison-title"
          >
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">No automatic promotion</p>
                <h2 id="asset-version-comparison-title">Current Active vs Latest Candidate</h2>
              </div>
            </div>
            <div
              className="data-table-region"
              role="region"
              aria-label="Active and candidate comparison"
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Evidence</th>
                    <th scope="col">Current Active · V{activeVersion.versionNumber}</th>
                    <th scope="col">Latest Candidate · V{latestCandidate.versionNumber}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Lifecycle</th>
                    <td>{humanize(activeVersion.lifecycleStatus)}</td>
                    <td>{humanize(latestCandidate.lifecycleStatus)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Active status</th>
                    <td>Current active</td>
                    <td>Not active</td>
                  </tr>
                  <tr>
                    <th scope="row">Artwork</th>
                    <td>{assetArtworkLabel(activeVersion)}</td>
                    <td>{assetArtworkLabel(latestCandidate)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Source / dimensions</th>
                    <td>
                      {activeVersion.detectedMediaType?.replace('image/', '').toUpperCase() ??
                        activeVersion.processingStatus}{' '}
                      ·{' '}
                      {activeVersion.width === null || activeVersion.height === null
                        ? 'not recorded'
                        : `${String(activeVersion.width)} × ${String(activeVersion.height)}`}
                    </td>
                    <td>
                      {latestCandidate.detectedMediaType?.replace('image/', '').toUpperCase() ??
                        latestCandidate.processingStatus}{' '}
                      ·{' '}
                      {latestCandidate.width === null || latestCandidate.height === null
                        ? 'processing'
                        : `${String(latestCandidate.width)} × ${String(latestCandidate.height)}`}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Scale</th>
                    <td>{activeVersion.render.scale}</td>
                    <td>{latestCandidate.render.scale}</td>
                  </tr>
                  <tr>
                    <th scope="row">Foot anchor</th>
                    <td>
                      {activeVersion.render.footAnchor.x}, {activeVersion.render.footAnchor.y}
                    </td>
                    <td>
                      {latestCandidate.render.footAnchor.x}, {latestCandidate.render.footAnchor.y}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Depth anchor</th>
                    <td>
                      {activeVersion.render.depthAnchor.x}, {activeVersion.render.depthAnchor.y}
                    </td>
                    <td>
                      {latestCandidate.render.depthAnchor.x}, {latestCandidate.render.depthAnchor.y}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Collision</th>
                    <td>{humanize(activeVersion.collision.shape)}</td>
                    <td>{humanize(latestCandidate.collision.shape)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Validation / review</th>
                    <td>{humanize(activeVersion.validationStatus)} · historical active</td>
                    <td>
                      {humanize(latestCandidate.validationStatus)} ·{' '}
                      {humanize(latestCandidate.lifecycleStatus)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="detail-grid world-asset-detail-grid">
          <section className="detail-card">
            <h2>Identity</h2>
            <dl className="detail-list">
              <div>
                <dt>Asset ID</dt>
                <dd>
                  <code>{asset.slug}</code>
                  <small className="field-hint">Stable game identifier — does not change</small>
                </dd>
              </div>
              <div>
                <dt>Game identifier</dt>
                <dd>{asset.gameId}</dd>
              </div>
              <PlaceholderReplacementDisplay
                markerKey={asset.developmentMarkerReplacementKey}
                resolved={resolvedMarker}
              />
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
              {references.published} published reference(s) preserve their pinned version until a
              separate authorized world-draft update and publication. {references.drafts} editable
              draft reference(s) currently use this asset or version.{' '}
              {references.activeConfiguration}
              active configuration record(s) reference it. Historical versions remain available, so
              archival is {references.mayArchive ? 'eligible' : 'blocked by references'}.
            </p>
          </section>
        </div>

        <WorldAssetReferenceList references={referenceRecords} />

        {capabilities.canUpload ? (
          <section
            className="detail-card asset-placeholder-detail"
            aria-labelledby="asset-placeholder-title"
          >
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Development placeholders</p>
                <h2 id="asset-placeholder-title">Replace existing placeholder</h2>
              </div>
            </div>
            {asset.developmentMarkerReplacementKey === null ? (
              <>
                <p>
                  This asset is not connected to a development placeholder. Mapping is chosen during
                  Upload Asset using readable placeholder names — not technical keys.
                </p>
                <p className="field-hint">
                  {markerOptions.length === 0
                    ? 'No eligible development markers are registered yet.'
                    : `${String(markerOptions.length)} eligible placeholder(s) are available when creating a new asset.`}
                </p>
                <Link className="button button--secondary" href="/world-assets/upload">
                  Upload asset with placeholder mapping
                </Link>
              </>
            ) : (
              <>
                <p>
                  This asset is already connected to a development placeholder. The mapping is
                  preserved for reference and is not removed by ordinary version uploads.
                </p>
                <p className="field-hint">
                  Published worlds remain unchanged until a new world version is explicitly
                  published. Use the World Editor on an unpublished draft to update placements.
                </p>
              </>
            )}
          </section>
        ) : null}

        <div id="create-next-version">
          {capabilities.canUpload && activeVersion !== null && openVersion === undefined ? (
            <WorldAssetNewVersionUpload
              assetId={asset.id}
              assetRevision={asset.revision}
              assetType={asset.assetType}
              sourceVersionId={activeVersion.id}
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
                  href={canonicalWorldAssetVersionPath(asset.id, openVersion.id)}
                >
                  Open candidate
                </Link>
              </div>
            </aside>
          ) : null}
        </div>

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
                    <th scope="col">Role</th>
                    <th scope="col">Artwork</th>
                    <th scope="col">Source</th>
                    <th scope="col">References</th>
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
                      <td data-label="Role">
                        <strong>
                          {version.id === asset.activeVersionId
                            ? 'Current Active'
                            : version.id === latestCandidate?.id
                              ? 'Latest Candidate'
                              : 'Historical'}
                        </strong>
                        <small>
                          {version.id === asset.activeVersionId ? 'Active: Yes' : 'Active: No'}
                        </small>
                      </td>
                      <td data-label="Artwork">{assetArtworkLabel(version)}</td>
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
                      <td data-label="References">
                        {(() => {
                          const usage = versionUsage(version.id, referenceRecords);
                          const total = usage.published + usage.drafts + usage.activeConfiguration;
                          return `${usage.complete ? '' : 'At least '}${String(total)}`;
                        })()}
                      </td>
                      <td data-label="Created">{formatDate(version.createdAt)}</td>
                      <td data-label="Open">
                        <Link
                          className="table-link"
                          href={canonicalWorldAssetVersionPath(asset.id, version.id)}
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
    const errorCategory =
      error instanceof AdminApiError && error.status === 403
        ? 'permission_denied'
        : 'backend_unavailable';
    logger
      .child({
        requestId,
        canonicalAssetId: assetId.data,
        attemptedVersionId: null,
      })
      .warn('admin.asset.detail_read_failed', {
        requestStage: 'canonical_asset_detail_read',
        errorCategory,
      });
    const retryable = !(error instanceof AdminApiError) || error.status >= 500;
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="asset-detail-title"
      >
        <h1 id="asset-detail-title">World Asset</h1>
        <WorldAssetEmptyState
          action={
            <>
              {retryable ? (
                <Link
                  className="button button--primary"
                  href={canonicalWorldAssetPath(assetId.data)}
                >
                  Try again
                </Link>
              ) : null}{' '}
              <Link className="button button--secondary" href="/world-assets">
                Return to asset library
              </Link>
            </>
          }
          alert
          description="No private intake file, cached metadata, or synthetic record is shown."
          title={
            error instanceof AdminApiError && error.status === 403
              ? 'Permission required'
              : 'Asset record temporarily unavailable'
          }
        />
      </main>
    );
  }
}
