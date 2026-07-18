import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadSocialGraph } from '../../../../../lib/realtime/social-graph-api';

export const dynamic = 'force-dynamic';

interface SearchParameters {
  readonly page?: string;
  readonly pageSize?: string;
  readonly status?: string;
  readonly search?: string;
}

export default async function PartiesOperationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParameters>;
}) {
  await requireAuthorizedAdmin('social_graph.read');
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? '1') || 1);
  const rawSize = Number(query.pageSize ?? '10');
  const pageSize = ([10, 50, 100] as const).find((size) => size === rawSize) ?? 10;
  const status =
    (['active', 'disbanded', 'expired'] as const).find((value) => value === query.status) ?? 'all';
  const search = query.search?.trim() ?? '';
  const graph = await loadSocialGraph({ page, pageSize, status, search });
  return (
    <main className="chat-moderation-page" aria-labelledby="parties-operations-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Friends and parties</p>
          <h1 id="parties-operations-title">Parties</h1>
          <p>
            Read-only party capacity, leadership, membership health, invitations, and reconnect
            state.
          </p>
        </div>
      </header>
      <nav className="social-admin-links" aria-label="Friends and parties operations">
        <Link href="/operations/social/friends">Friends</Link>
        <Link href="/operations/social/parties">Parties</Link>
        <Link href="/operations/social/audit">Audit</Link>
      </nav>
      <form className="chat-report-filters" method="get">
        <label>
          Status
          <select defaultValue={status} name="status">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disbanded">Disbanded</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label>
          Party ID or leader
          <input defaultValue={search} maxLength={80} name="search" />
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
      {graph.parties.length === 0 ? (
        <section className="empty-state">
          <h2>No matching parties</h2>
          <p>No party lifecycle records match these filters.</p>
        </section>
      ) : (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Leader</th>
                <th>Members</th>
                <th>Reconnects</th>
                <th>Invitations</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              {graph.parties.map((party) => (
                <tr key={party.partyId}>
                  <td data-label="Status">
                    <span className={`state-chip state-chip--${party.status}`}>{party.status}</span>
                  </td>
                  <td data-label="Leader">{party.leaderDisplayName}</td>
                  <td data-label="Members">
                    {party.memberCount}/{party.capacity}
                  </td>
                  <td data-label="Reconnects">{party.reconnectingCount}</td>
                  <td data-label="Invitations">{party.pendingInvitationCount}</td>
                  <td data-label="Audit">
                    <Link
                      className="table-link"
                      href={`/operations/social/parties/${party.partyId}`}
                    >
                      Open party
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pagination" aria-label="Party pages">
        <span>
          {graph.page > 1 ? (
            <Link
              href={`?page=${String(graph.page - 1)}&pageSize=${String(pageSize)}&status=${status}&search=${encodeURIComponent(search)}`}
            >
              Previous
            </Link>
          ) : null}
        </span>
        <span>
          Page {graph.page} of {Math.max(graph.totalPages, 1)} · {graph.total} records
        </span>
        <span>
          {graph.page < graph.totalPages ? (
            <Link
              href={`?page=${String(graph.page + 1)}&pageSize=${String(pageSize)}&status=${status}&search=${encodeURIComponent(search)}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </main>
  );
}
