import Link from 'next/link';

import {
  EconomyPageHeader,
  EmptyState,
  Pagination,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyAudit } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AuditQuery {
  readonly search?: string;
  readonly event?: string;
  readonly outcome?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page?: string;
  readonly pageSize?: string;
}

export default async function EconomyAuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<AuditQuery>;
}) {
  await requireAuthorizedAdmin('economy.audit.read');
  const query = await searchParams;
  const audit = await loadEconomyAudit(query);
  const eventFilter = query.event?.trim().toLowerCase() ?? '';
  const outcomeFilter = query.outcome?.trim().toLowerCase() ?? '';
  const from =
    query.dateFrom === undefined || query.dateFrom === ''
      ? null
      : new Date(`${query.dateFrom}T00:00:00.000Z`);
  const to =
    query.dateTo === undefined || query.dateTo === ''
      ? null
      : new Date(`${query.dateTo}T23:59:59.999Z`);
  const items = audit.items.filter(
    (item) =>
      (eventFilter === '' || item.eventKey.toLowerCase().includes(eventFilter)) &&
      (outcomeFilter === '' || item.outcome.toLowerCase() === outcomeFilter) &&
      (from === null || new Date(item.createdAt) >= from) &&
      (to === null || new Date(item.createdAt) <= to),
  );

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Review append-only evidence for drafts, edits, validation, review, approval, scheduling, publication, reconciliation, corrections, risk decisions, and simulations."
        eyebrow="Administrator evidence"
        title="Economy audit"
      />

      <aside className="economy-safety-note" aria-label="Audit immutability">
        <strong>Append-only history</strong>
        <p>
          Audit records cannot be edited through this portal. Filters are bounded and preserve safe
          request and target references.
        </p>
      </aside>

      <form className="economy-filter-grid" method="get">
        <label className="economy-filter-grid__search">
          Event, target, or request reference
          <input defaultValue={query.search ?? ''} maxLength={128} name="search" />
        </label>
        <label>
          Event category
          <input
            defaultValue={query.event ?? ''}
            maxLength={80}
            name="event"
            placeholder="shop, policy, correction…"
          />
        </label>
        <label>
          Outcome
          <select defaultValue={query.outcome ?? ''} name="outcome">
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <label>
          From
          <input defaultValue={query.dateFrom ?? ''} name="dateFrom" type="date" />
        </label>
        <label>
          To
          <input defaultValue={query.dateTo ?? ''} name="dateTo" type="date" />
        </label>
        <label>
          Rows
          <select defaultValue={query.pageSize ?? '10'} name="pageSize">
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <div className="economy-filter-grid__actions">
          <button type="submit">Apply filters</button>
          <Link href="/economy/audit">Clear</Link>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          description="No append-only economy events match the selected filters."
          title="No audit events"
        />
      ) : (
        <ol className="economy-audit-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="economy-audit-list__rail" aria-hidden="true">
                <span />
              </div>
              <article>
                <header>
                  <div>
                    <p className="eyebrow">{friendlyKey(item.eventKey)}</p>
                    <h2>{item.summary}</h2>
                  </div>
                  <StatusChip value={item.outcome} />
                </header>
                <dl className="economy-detail-list economy-detail-list--columns">
                  <div>
                    <dt>Administrator</dt>
                    <dd>{item.actorDisplayName ?? 'Trusted system worker'}</dd>
                  </div>
                  <div>
                    <dt>Recorded</dt>
                    <dd>{formatDate(item.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>
                      {item.targetType === null ? 'Economy' : friendlyKey(item.targetType)}
                      {item.targetId === null ? '' : ` · ${item.targetId}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Request</dt>
                    <dd>
                      <code>{item.requestId}</code>
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        page={audit.page}
        pathname="/economy/audit"
        query={query}
        totalPages={audit.totalPages}
      />
    </main>
  );
}
