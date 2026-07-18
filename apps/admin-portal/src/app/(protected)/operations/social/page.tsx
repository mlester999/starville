import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadSocialInteractions } from '../../../../lib/realtime/social-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParameters {
  readonly page?: string;
  readonly pageSize?: string;
  readonly type?: string;
  readonly status?: string;
  readonly search?: string;
}

function date(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default async function SocialInteractionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParameters>;
}) {
  await requireAuthorizedAdmin('social_interactions.read');
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? '1') || 1);
  const requestedPageSize = Number(query.pageSize ?? '10');
  const pageSize = ([10, 50, 100] as const).find((value) => value === requestedPageSize) ?? 10;
  const type = (['gift', 'trade'] as const).find((value) => value === query.type) ?? 'all';
  const filters = {
    page,
    pageSize,
    type,
    status: query.status ?? 'all',
    search: query.search?.trim() ?? '',
  } as const;
  const interactions = await loadSocialInteractions(filters);

  return (
    <main className="chat-moderation-page" aria-labelledby="social-interactions-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Server-authoritative transfers</p>
          <h1 id="social-interactions-title">Social interactions</h1>
          <p>
            Read-only gift and trade status, immutable receipts, and bounded audit evidence. No
            player inventory can be changed here.
          </p>
        </div>
      </header>

      <nav className="social-admin-links" aria-label="Social interaction views">
        <Link href="/operations/social">All</Link>
        <Link href="/operations/social/gifts">Gifts</Link>
        <Link href="/operations/social/trades">Trades</Link>
        <Link href="/operations/social/friends">Friends</Link>
        <Link href="/operations/social/parties">Parties</Link>
        <Link href="/operations/social/audit">Social graph audit</Link>
        <Link href="/operations/social/home-visits">Live home visits</Link>
      </nav>

      <form className="chat-report-filters" method="get">
        <label>
          Type
          <select defaultValue={filters.type} name="type">
            <option value="all">All</option>
            <option value="gift">Gifts</option>
            <option value="trade">Trades</option>
          </select>
        </label>
        <label>
          Status
          <select defaultValue={filters.status} name="status">
            <option value="all">All statuses</option>
            {[
              'pending',
              'negotiating',
              'completed',
              'declined',
              'cancelled',
              'expired',
              'invalidated',
              'failed',
            ].map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Interaction ID or display name
          <input defaultValue={filters.search} maxLength={80} name="search" />
        </label>
        <label>
          Page size
          <select defaultValue={String(pageSize)} name="pageSize">
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>

      {interactions.items.length === 0 ? (
        <section className="empty-state">
          <h2>No matching interactions</h2>
          <p>No protected transfer records match these filters.</p>
        </section>
      ) : (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Participants</th>
                <th>Revision</th>
                <th>Created</th>
                <th>Receipt and audit</th>
              </tr>
            </thead>
            <tbody>
              {interactions.items.map((interaction) => (
                <tr key={interaction.id}>
                  <td data-label="Status">
                    <span className={`state-chip state-chip--${interaction.status}`}>
                      {interaction.status}
                    </span>
                  </td>
                  <td data-label="Type">{interaction.kind}</td>
                  <td data-label="Participants">
                    {interaction.sender.displayName}
                    <small>with {interaction.target.displayName}</small>
                  </td>
                  <td data-label="Revision">{interaction.revision}</td>
                  <td data-label="Created">{date(interaction.createdAt)}</td>
                  <td data-label="Receipt and audit">
                    <Link className="table-link" href={`/operations/social/${interaction.id}`}>
                      Open evidence
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="pagination" aria-label="Social interaction pages">
        {interactions.page > 1 ? (
          <Link
            href={`?page=${String(interactions.page - 1)}&pageSize=${String(pageSize)}&type=${filters.type}&status=${filters.status}&search=${encodeURIComponent(filters.search)}`}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>
          Page {interactions.page} of {Math.max(interactions.totalPages, 1)} · {interactions.total}{' '}
          records
        </span>
        {interactions.page < interactions.totalPages ? (
          <Link
            href={`?page=${String(interactions.page + 1)}&pageSize=${String(pageSize)}&type=${filters.type}&status=${filters.status}&search=${encodeURIComponent(filters.search)}`}
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
