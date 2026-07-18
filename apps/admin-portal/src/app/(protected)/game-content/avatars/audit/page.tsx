import Link from 'next/link';

import { AvatarEmptyState, AvatarPageHeader } from '../../../../../components/avatar-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { loadAvatarAudit } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarAuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuthorizedAdmin('avatar_content.audit.read');
  const query = await searchParams;
  const rawPage = Array.isArray(query['page']) ? query['page'][0] : query['page'];
  const candidate = Number(rawPage);
  const page = Number.isInteger(candidate) && candidate > 0 ? candidate : 1;
  const result = await loadAvatarAudit(page);

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Read bounded append-only avatar content events without exposing private intake paths, session identifiers, player wallets, or raw database details."
        eyebrow="Append-only evidence"
        title="Avatar audit history"
      />
      {result.items.length === 0 ? (
        <AvatarEmptyState
          description="Lifecycle, preset, and settings events will appear here after authorized local operations."
          title="No audit events"
        />
      ) : (
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Target</th>
                <th>Actor</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((event) => (
                <tr key={event.eventId}>
                  <td>{formatDate(event.createdAt)}</td>
                  <td>
                    <code>{event.action}</code>
                  </td>
                  <td>{friendlyKey(event.targetType)}</td>
                  <td>{event.actorDisplayName}</td>
                  <td>{event.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Avatar audit pagination" className="economy-pagination">
        {result.page > 1 ? (
          <Link href={`/game-content/avatars/audit?page=${String(result.page - 1)}`}>Previous</Link>
        ) : (
          <span>Previous</span>
        )}
        <span>
          Page {result.page} of {Math.max(1, result.totalPages)} · {result.total.toLocaleString()}{' '}
          events
        </span>
        {result.page < result.totalPages ? (
          <Link href={`/game-content/avatars/audit?page=${String(result.page + 1)}`}>Next</Link>
        ) : (
          <span>Next</span>
        )}
      </nav>
    </main>
  );
}
