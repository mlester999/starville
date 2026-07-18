import Link from 'next/link';

import { PremiumSelect } from '../../../../components/premium-select';
import { WorldAssetAuditList } from '../../../../components/world-asset-audit-list';
import { WorldAssetEmptyState } from '../../../../components/world-asset-empty-state';
import { WorldAssetPagination } from '../../../../components/world-asset-pagination';
import { AdminApiError } from '../../../../lib/admin-api';
import { loadAssetAudit } from '../../../../lib/world-assets/api';
import { requireAssetManagerPermission } from '../../../../lib/world-assets/authorization';
import {
  ASSET_DIRECTORY_PAGE_SIZES,
  assetAuditHref,
  parseAssetAuditQuery,
} from '../../../../lib/world-assets/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetAuditPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAssetManagerPermission('assets.audit.read');
  const query = parseAssetAuditQuery(await props.searchParams);
  try {
    const audit = await loadAssetAudit(query);
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="asset-audit-title"
      >
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Append-only production history</p>
            <h1 id="asset-audit-title">Asset Audit</h1>
            <p>
              Review uploads, validation, metadata, approval, activation, deprecation, replacement,
              and blocked-reference events. Binary data and private paths are never logged.
            </p>
          </div>
          <div className="world-assets-intro__actions">
            <span className="permission-badge">{audit.total} event(s)</span>
            <Link className="button button--quiet" href="/world-assets">
              Asset library
            </Link>
          </div>
        </header>
        <form className="world-asset-audit-filters" method="get" role="search">
          <div className="field world-asset-filters__search">
            <label htmlFor="asset-audit-search">Search</label>
            <input
              defaultValue={query.search}
              id="asset-audit-search"
              maxLength={100}
              name="search"
              placeholder="Asset, action, request, or administrator"
              type="search"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-audit-outcome">Outcome</label>
            <PremiumSelect
              defaultValue={query.outcome}
              id="asset-audit-outcome"
              name="outcome"
              options={[
                { value: 'all', label: 'All outcomes' },
                { value: 'success', label: 'Success' },
                { value: 'denied', label: 'Denied' },
                { value: 'error', label: 'Error' },
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="asset-audit-page-size">Page size</label>
            <PremiumSelect
              defaultValue={String(query.pageSize)}
              id="asset-audit-page-size"
              name="pageSize"
              options={ASSET_DIRECTORY_PAGE_SIZES.map((size) => ({
                value: String(size),
                label: `${String(size)} per page`,
              }))}
            />
          </div>
          <div className="world-asset-filters__actions">
            <button className="button button--primary" type="submit">
              Apply filters
            </button>
            <Link className="button button--quiet" href="/world-assets/audit">
              Clear
            </Link>
          </div>
        </form>
        {audit.items.length === 0 ? (
          <WorldAssetEmptyState
            description="No append-only asset audit event matches this authorized view."
            title="No matching asset activity"
          />
        ) : (
          <section className="audit-section" aria-label="World asset audit events">
            <WorldAssetAuditList events={audit.items} />
          </section>
        )}
        <WorldAssetPagination
          label="Asset audit pages"
          nextHref={
            audit.page < audit.totalPages ? assetAuditHref(query, { page: audit.page + 1 }) : null
          }
          page={audit.page}
          previousHref={audit.page > 1 ? assetAuditHref(query, { page: audit.page - 1 }) : null}
          total={audit.total}
          totalPages={audit.totalPages}
        />
      </main>
    );
  } catch (error) {
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="asset-audit-title"
      >
        <h1 id="asset-audit-title">Asset Audit</h1>
        <WorldAssetEmptyState
          action={
            <Link className="button button--secondary" href="/world-assets/audit">
              Try again
            </Link>
          }
          alert
          description="No cached or synthetic audit events are shown."
          title={
            error instanceof AdminApiError && error.status === 403
              ? 'Permission required'
              : 'Asset audit unavailable'
          }
        />
      </main>
    );
  }
}
