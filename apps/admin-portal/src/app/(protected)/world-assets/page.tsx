import Link from 'next/link';

import { WorldAssetEmptyState } from '../../../components/world-asset-empty-state';
import { WorldAssetFilters } from '../../../components/world-asset-filters';
import { WorldAssetPagination } from '../../../components/world-asset-pagination';
import { WorldAssetTable } from '../../../components/world-asset-table';
import { AdminApiError } from '../../../lib/admin-api';
import { loadAssetDirectory } from '../../../lib/world-assets/api';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../lib/world-assets/authorization';
import { assetDirectoryHref, parseAssetDirectoryQuery } from '../../../lib/world-assets/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetsPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAssetManagerPermission('assets.read');
  const capabilities = assetManagerCapabilities(context);
  const query = parseAssetDirectoryQuery(await props.searchParams);

  try {
    const catalog = await loadAssetDirectory(query);
    const filtered =
      query.search !== '' ||
      query.assetType !== 'all' ||
      query.category !== '' ||
      query.lifecycle !== 'all' ||
      query.production !== 'all';
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="assets-title"
      >
        <header className="operations-intro world-assets-intro">
          <div>
            <p className="eyebrow">Versioned production-art pipeline</p>
            <h1 id="assets-title">World Assets</h1>
            <p>
              Upload, validate, review, activate, and safely reference approved non-pixel artwork.
              Private intake files and storage credentials are never shown here.
            </p>
          </div>
          <div className="world-assets-intro__actions">
            <span className="permission-badge">{catalog.total} asset(s)</span>
            {capabilities.canUpload ? (
              <Link className="button button--primary" href="/world-assets/upload">
                Upload asset
              </Link>
            ) : null}
            <Link className="button button--secondary" href="/world-assets/guide">
              Guide &amp; templates
            </Link>
            <Link className="button button--secondary" href="/world-assets/coverage">
              Coverage
            </Link>
            {capabilities.canReview ? (
              <Link className="button button--secondary" href="/world-assets/review">
                Review queue
              </Link>
            ) : null}
            {capabilities.canReadAudit ? (
              <Link className="button button--quiet" href="/world-assets/audit">
                Asset audit
              </Link>
            ) : null}
          </div>
        </header>

        <aside className="phase-note world-assets-security-note" aria-label="Asset safety boundary">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Draft upload does not make artwork live.</strong>
            <p>
              A sanitized version must pass trusted validation, human review, approval, and a
              separate activation step before it can be used for new World Editor placements.
            </p>
          </div>
        </aside>

        <WorldAssetFilters pathname="/world-assets" query={query} />

        {catalog.items.length === 0 ? (
          <WorldAssetEmptyState
            action={
              filtered ? (
                <Link className="button button--secondary" href="/world-assets">
                  Clear filters
                </Link>
              ) : capabilities.canUpload ? (
                <Link className="button button--primary" href="/world-assets/upload">
                  Upload the first asset
                </Link>
              ) : undefined
            }
            description={
              filtered
                ? 'No authorized asset matches these bounded filters.'
                : 'No production candidates or development markers are registered yet.'
            }
            title={filtered ? 'No matching assets' : 'The asset library is ready'}
          />
        ) : (
          <WorldAssetTable assets={catalog.items} />
        )}

        <WorldAssetPagination
          label="World asset pages"
          nextHref={
            catalog.page < catalog.totalPages
              ? assetDirectoryHref('/world-assets', query, { page: catalog.page + 1 })
              : null
          }
          page={catalog.page}
          previousHref={
            catalog.page > 1
              ? assetDirectoryHref('/world-assets', query, { page: catalog.page - 1 })
              : null
          }
          total={catalog.total}
          totalPages={catalog.totalPages}
        />
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="assets-title"
      >
        <h1 id="assets-title">World Assets</h1>
        <WorldAssetEmptyState
          action={
            <Link className="button button--secondary" href="/world-assets">
              Try again
            </Link>
          }
          alert
          description="No cached asset metadata, intake images, or synthetic records are shown."
          title={forbidden ? 'Permission required' : 'Asset library unavailable'}
        />
      </main>
    );
  }
}
