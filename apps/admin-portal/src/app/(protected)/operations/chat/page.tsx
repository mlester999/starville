import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadChatReports } from '../../../../lib/realtime/chat-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParameters {
  readonly page?: string;
  readonly pageSize?: string;
  readonly status?: string;
  readonly category?: string;
  readonly worldId?: string;
  readonly channelId?: string;
  readonly search?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

function one(value: string | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function date(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function pageHref(page: number, filters: Readonly<Record<string, unknown>>): string {
  const query = new URLSearchParams({ page: String(page), pageSize: String(filters['pageSize']) });
  for (const key of [
    'status',
    'category',
    'worldId',
    'channelId',
    'search',
    'dateFrom',
    'dateTo',
  ]) {
    const value = filters[key];
    if (typeof value === 'string' && value !== '' && value !== 'all') query.set(key, value);
  }
  return `?${query.toString()}`;
}

export default async function ChatReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParameters>;
}) {
  await requireAuthorizedAdmin('multiplayer_chat.reports.read');
  const query = await searchParams;
  const page = Math.max(1, Number(one(query.page, '1')) || 1);
  const requestedPageSize = Number(one(query.pageSize, '10'));
  const pageSize = ([10, 50, 100] as const).find((value) => value === requestedPageSize) ?? 10;
  const filters = {
    page,
    pageSize,
    status: one(query.status, 'all'),
    category: one(query.category, 'all'),
    worldId: query.worldId?.trim() ? query.worldId.trim() : 'all',
    ...(query.channelId === undefined ? {} : { channelId: query.channelId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
    search: one(query.search, ''),
  };
  const reports = await loadChatReports(filters);

  return (
    <main className="chat-moderation-page" aria-labelledby="chat-moderation-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Player safety</p>
          <h1 id="chat-moderation-title">Chat moderation</h1>
          <p>
            Protected player reports, exact server-captured evidence, and audited moderation
            actions. Wallets, emails, IP addresses, and session credentials are excluded.
          </p>
        </div>
        <span className="permission-badge">{reports.openCount} open reports</span>
      </header>

      <form className="chat-report-filters" method="get">
        <label>
          Status
          <select defaultValue={filters.status} name="status">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="under_review">Under review</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <label>
          Category
          <select defaultValue={filters.category} name="category">
            <option value="all">All categories</option>
            <option value="harassment">Harassment</option>
            <option value="hate_or_abuse">Hate or abusive language</option>
            <option value="spam">Spam</option>
            <option value="scam_or_suspicious_link">Scam or suspicious link</option>
            <option value="impersonation">Impersonation</option>
            <option value="sexual_content">Sexual content</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          World
          <input
            defaultValue={filters.worldId === 'all' ? '' : filters.worldId}
            name="worldId"
            placeholder="All worlds"
          />
        </label>
        <label>
          Message ID or display name
          <input defaultValue={filters.search} maxLength={128} name="search" />
        </label>
        <label>
          Channel ID
          <input defaultValue={filters.channelId ?? ''} name="channelId" />
        </label>
        <label>
          From
          <input defaultValue={filters.dateFrom ?? ''} name="dateFrom" type="date" />
        </label>
        <label>
          To
          <input defaultValue={filters.dateTo ?? ''} name="dateTo" type="date" />
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

      {reports.items.length === 0 ? (
        <section className="empty-state">
          <h2>No matching chat reports</h2>
          <p>The selected filters contain no protected report records.</p>
        </section>
      ) : (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Category</th>
                <th>Reported player</th>
                <th>Reporter</th>
                <th>World / channel</th>
                <th>Received</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {reports.items.map((report) => (
                <tr key={report.id}>
                  <td data-label="Status">
                    <span className={`state-chip state-chip--${report.status}`}>
                      {report.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td data-label="Category">{report.category.replaceAll('_', ' ')}</td>
                  <td data-label="Reported player">{report.reportedDisplayName}</td>
                  <td data-label="Reporter">{report.reporterDisplayName}</td>
                  <td data-label="World / channel">
                    {report.worldId}
                    <small>{report.channelId.slice(0, 8)}…</small>
                  </td>
                  <td data-label="Received">{date(report.createdAt)}</td>
                  <td data-label="Review">
                    <Link className="table-link" href={`/operations/chat/${report.id}`}>
                      Open report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="pagination" aria-label="Chat report pages">
        {reports.page > 1 ? (
          <Link href={pageHref(reports.page - 1, filters)}>Previous</Link>
        ) : (
          <span />
        )}
        <span>
          Page {reports.page} of {Math.max(reports.totalPages, 1)} · {reports.total} reports
        </span>
        {reports.page < reports.totalPages ? (
          <Link href={pageHref(reports.page + 1, filters)}>Next</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
