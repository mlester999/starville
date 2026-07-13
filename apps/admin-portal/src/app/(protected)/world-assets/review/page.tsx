import Link from 'next/link';

import { WorldAssetEmptyState } from '../../../../components/world-asset-empty-state';
import { WorldAssetFilters } from '../../../../components/world-asset-filters';
import { WorldAssetPagination } from '../../../../components/world-asset-pagination';
import { WorldAssetReviewTable } from '../../../../components/world-asset-review-table';
import { AdminApiError } from '../../../../lib/admin-api';
import { loadAssetReviewQueue } from '../../../../lib/world-assets/api';
import { requireAssetManagerPermission } from '../../../../lib/world-assets/authorization';
import { assetReviewQueueHref, parseAssetDirectoryQuery } from '../../../../lib/world-assets/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetReviewPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAssetManagerPermission('assets.review');
  const query = parseAssetDirectoryQuery(await props.searchParams);
  const reviewQuery = { page: query.page, pageSize: query.pageSize, search: query.search } as const;
  try {
    const queue = await loadAssetReviewQueue(reviewQuery);
    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-review-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Human quality gate</p>
            <h1 id="asset-review-title">Asset Review Queue</h1>
            <p>
              Inspect sanitized previews, validation results, duplicate candidates, metadata,
              anchors, collision, previous versions, and reference impact.
            </p>
          </div>
          <div className="world-assets-intro__actions">
            <span className="permission-badge">{queue.total} candidate(s)</span>
            <Link className="button button--quiet" href="/world-assets">
              Asset library
            </Link>
          </div>
        </header>
        <WorldAssetFilters pathname="/world-assets/review" query={query} reviewQueue />
        {queue.items.length === 0 ? (
          <WorldAssetEmptyState
            description="No validated production candidate currently needs your review."
            title="Review queue is clear"
          />
        ) : (
          <WorldAssetReviewTable candidates={queue.items} />
        )}
        <WorldAssetPagination
          label="Asset review queue pages"
          nextHref={
            queue.page < queue.totalPages
              ? assetReviewQueueHref(reviewQuery, { page: queue.page + 1 })
              : null
          }
          page={queue.page}
          previousHref={
            queue.page > 1 ? assetReviewQueueHref(reviewQuery, { page: queue.page - 1 }) : null
          }
          total={queue.total}
          totalPages={queue.totalPages}
        />
      </main>
    );
  } catch (error) {
    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-review-title">
        <h1 id="asset-review-title">Asset Review Queue</h1>
        <WorldAssetEmptyState
          action={
            <Link className="button button--secondary" href="/world-assets/review">
              Try again
            </Link>
          }
          alert
          description="No cached candidates or private intake previews are shown."
          title={
            error instanceof AdminApiError && error.status === 403
              ? 'Permission required'
              : 'Review queue unavailable'
          }
        />
      </main>
    );
  }
}
