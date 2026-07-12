import Link from 'next/link';

import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadWorldAssets } from '../../../lib/worlds/api';
import { parseWorldCatalogQuery, worldCatalogHref } from '../../../lib/worlds/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

export default async function WorldAssetsPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('assets.read');
  const query = parseWorldCatalogQuery(await props.searchParams);

  try {
    const catalog = await loadWorldAssets(query);
    return (
      <main className="operations-page" aria-labelledby="assets-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Approved asset boundary</p>
            <h1 id="assets-title">World Assets</h1>
            <p>
              Repository-owned procedural development assets referenced by stable keys. The browser
              receives only metadata; it never receives storage credentials or arbitrary upload
              paths.
            </p>
          </div>
          <span className="permission-badge">{catalog.total} asset(s)</span>
        </header>

        <aside className="phase-note asset-upload-note" aria-label="Asset upload availability">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Secure browser uploads are not available in this release.</strong>
            <p>
              Phase 6 uses the reviewed repository-owned catalog. Upload controls remain withheld
              until trusted decode, re-encode, hashing, malware inspection, and immutable storage
              processing are available end to end.
            </p>
          </div>
        </aside>

        <form className="player-filters" method="get" role="search">
          <label>
            Stable asset key
            <input defaultValue={query.search} maxLength={100} name="search" type="search" />
          </label>
          <input name="pageSize" type="hidden" value={query.pageSize} />
          <button className="button button--primary" type="submit">
            Search assets
          </button>
          <Link className="button button--quiet" href="/world-assets">
            Clear
          </Link>
        </form>

        {catalog.items.length === 0 ? (
          <section className="empty-state">
            <h2>No matching approved assets</h2>
            <p>No repository-owned catalog entry matches this bounded search.</p>
          </section>
        ) : (
          <ul className="world-asset-grid" aria-label="World asset catalog">
            {catalog.items.map((asset) => (
              <li key={asset.id}>
                <div className="asset-preview" aria-hidden="true">
                  <span>{asset.assetKey.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="asset-card__body">
                  <div className="section-heading-row">
                    <strong>{asset.assetKey}</strong>
                    <span className={`state-chip state-chip--${asset.approvalStatus}`}>
                      {asset.approvalStatus}
                    </span>
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Format</dt>
                      <dd>
                        {asset.sourceType === 'repository_procedural'
                          ? 'Procedural renderer'
                          : asset.mediaType.replace('image/', '').toUpperCase()}
                      </dd>
                    </div>
                    <div>
                      <dt>Dimensions</dt>
                      <dd>
                        {asset.width === null || asset.height === null
                          ? 'Runtime generated'
                          : `${asset.width} × ${asset.height}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>
                        {asset.fileSizeBytes === null
                          ? 'No uploaded file'
                          : formatBytes(asset.fileSizeBytes)}
                      </dd>
                    </div>
                    <div>
                      <dt>Provenance</dt>
                      <dd>
                        {asset.repositoryOwned ? 'Repository owned' : 'Restricted external record'}
                      </dd>
                    </div>
                    <div>
                      <dt>Hash</dt>
                      <dd>
                        <code>{asset.contentHash.slice(0, 16)}…</code>
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        )}

        <nav className="pagination" aria-label="World asset pages">
          {catalog.page <= 1 ? (
            <span aria-disabled="true" className="is-disabled">
              Previous
            </span>
          ) : (
            <Link href={worldCatalogHref('/world-assets', query, { page: catalog.page - 1 })}>
              Previous
            </Link>
          )}
          <span>
            Page {catalog.page} of {Math.max(1, catalog.totalPages)}
          </span>
          {catalog.page >= catalog.totalPages ? (
            <span aria-disabled="true" className="is-disabled">
              Next
            </span>
          ) : (
            <Link href={worldCatalogHref('/world-assets', query, { page: catalog.page + 1 })}>
              Next
            </Link>
          )}
        </nav>
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main className="operations-page" aria-labelledby="assets-title">
        <h1 id="assets-title">World Assets</h1>
        <section className="empty-state" role="alert">
          <h2>{forbidden ? 'Permission required' : 'Asset catalog unavailable'}</h2>
          <p>No unapproved or placeholder asset data is shown.</p>
          <Link className="button button--secondary" href="/world-assets">
            Try again
          </Link>
        </section>
      </main>
    );
  }
}
