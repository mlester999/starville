import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadSocialGraphAudit } from '../../../../../lib/realtime/social-graph-api';

export const dynamic = 'force-dynamic';

export default async function SocialGraphAuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly page?: string;
    readonly pageSize?: string;
    readonly search?: string;
  }>;
}) {
  await requireAuthorizedAdmin('social_graph.audit.read');
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? '1') || 1);
  const rawSize = Number(query.pageSize ?? '10');
  const pageSize = ([10, 50, 100] as const).find((size) => size === rawSize) ?? 10;
  const search = query.search?.trim() ?? '';
  const audit = await loadSocialGraphAudit({ page, pageSize, search });
  return (
    <main className="chat-moderation-page" aria-labelledby="social-audit-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Append-only evidence</p>
          <h1 id="social-audit-title">Friends and parties audit</h1>
          <p>
            Bounded lifecycle evidence without private friend lists, party chat text, or inventory
            data.
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
          Action, result, or exact party ID
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
      <div className="chat-report-table table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Entity</th>
              <th>Action</th>
              <th>Result</th>
              <th>Party</th>
              <th>Revision</th>
            </tr>
          </thead>
          <tbody>
            {audit.items.map((entry) => (
              <tr key={entry.id}>
                <td data-label="Time">{new Date(entry.createdAt).toLocaleString()}</td>
                <td data-label="Entity">{entry.entityType}</td>
                <td data-label="Action">{entry.action.replaceAll('_', ' ')}</td>
                <td data-label="Result">{entry.result}</td>
                <td data-label="Party">
                  {entry.partyId === null ? (
                    '—'
                  ) : (
                    <Link href={`/operations/social/parties/${entry.partyId}`}>
                      {entry.partyId}
                    </Link>
                  )}
                </td>
                <td data-label="Revision">{entry.partyRevision ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Social audit pages">
        <span>
          {audit.page > 1 ? (
            <Link
              href={`?page=${String(audit.page - 1)}&pageSize=${String(pageSize)}&search=${encodeURIComponent(search)}`}
            >
              Previous
            </Link>
          ) : null}
        </span>
        <span>
          Page {audit.page} of {Math.max(audit.totalPages, 1)} · {audit.total} records
        </span>
        <span>
          {audit.page < audit.totalPages ? (
            <Link
              href={`?page=${String(audit.page + 1)}&pageSize=${String(pageSize)}&search=${encodeURIComponent(search)}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </main>
  );
}
