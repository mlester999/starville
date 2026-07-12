import Link from 'next/link';

import { WorldAuditList } from '../../../components/world-audit-list';
import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadWorldAudit } from '../../../lib/worlds/api';
import { parseWorldCatalogQuery, worldCatalogHref } from '../../../lib/worlds/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAuditPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('maps.audit_read');
  const query = parseWorldCatalogQuery(await props.searchParams);

  try {
    const audit = await loadWorldAudit(query);
    return (
      <main className="operations-page" aria-labelledby="world-audit-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Append-only world history</p>
            <h1 id="world-audit-title">World Audit</h1>
            <p>
              Search authorized publication, validation, preview, draft, and asset events. Audit
              records cannot be edited through this portal.
            </p>
          </div>
          <span className="permission-badge">{audit.total} event(s)</span>
        </header>

        <form className="player-filters" method="get" role="search">
          <label>
            Map, event, version, or request reference
            <input defaultValue={query.search} maxLength={100} name="search" type="search" />
          </label>
          <input name="pageSize" type="hidden" value={query.pageSize} />
          <button className="button button--primary" type="submit">
            Search audit
          </button>
          <Link className="button button--quiet" href="/world-audit">
            Clear
          </Link>
        </form>

        <section className="audit-section" aria-label="World audit events">
          <WorldAuditList events={audit.items} />
        </section>

        <nav className="pagination" aria-label="World audit pages">
          {audit.page <= 1 ? (
            <span aria-disabled="true" className="is-disabled">
              Previous
            </span>
          ) : (
            <Link href={worldCatalogHref('/world-audit', query, { page: audit.page - 1 })}>
              Previous
            </Link>
          )}
          <span>
            Page {audit.page} of {Math.max(1, audit.totalPages)}
          </span>
          {audit.page >= audit.totalPages ? (
            <span aria-disabled="true" className="is-disabled">
              Next
            </span>
          ) : (
            <Link href={worldCatalogHref('/world-audit', query, { page: audit.page + 1 })}>
              Next
            </Link>
          )}
        </nav>
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main className="operations-page" aria-labelledby="world-audit-title">
        <h1 id="world-audit-title">World Audit</h1>
        <section className="empty-state" role="alert">
          <h2>{forbidden ? 'Permission required' : 'World audit unavailable'}</h2>
          <p>No cached or synthetic audit records are shown.</p>
          <Link className="button button--secondary" href="/world-audit">
            Try again
          </Link>
        </section>
      </main>
    );
  }
}
