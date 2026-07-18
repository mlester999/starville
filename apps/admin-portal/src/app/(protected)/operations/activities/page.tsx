import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import {
  loadCooperativeActivities,
  loadCooperativeActivitySettings,
} from '../../../../lib/realtime/cooperative-activity-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParameters {
  readonly view?: string;
  readonly page?: string;
  readonly pageSize?: string;
  readonly status?: string;
  readonly search?: string;
}

function date(value: string | null): string {
  return value === null
    ? '—'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      );
}

export default async function CooperativeActivitiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParameters>;
}) {
  const context = await requireAuthorizedAdmin('cooperative_activities.read');
  const query = await searchParams;
  const view =
    (['catalog', 'instances', 'rewards', 'audit'] as const).find(
      (candidate) => candidate === query.view,
    ) ?? 'instances';
  if (view === 'audit') await requireAuthorizedAdmin('cooperative_activities.audit.read');
  const page = Math.max(1, Number(query.page ?? '1') || 1);
  const requestedPageSize = Number(query.pageSize ?? '10');
  const pageSize = ([10, 50, 100] as const).find((value) => value === requestedPageSize) ?? 10;
  const filters = {
    view,
    page,
    pageSize,
    status: query.status?.trim() || 'all',
    search: query.search?.trim() ?? '',
  };
  const records = await loadCooperativeActivities(filters);
  const settings = await loadCooperativeActivitySettings().catch(() => undefined);
  const totalPages = Math.ceil(records.total / records.pageSize);

  return (
    <main className="chat-moderation-page activity-admin-page" aria-labelledby="activities-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Private-party cooperative operations</p>
          <h1 id="activities-title">Cooperative activities</h1>
          <p>
            Versioned activity content, isolated runs, immutable completion receipts, and bounded
            audit evidence. This area has no reward-grant, DUST-edit, or inventory-edit control.
          </p>
        </div>
        {hasAdminPermission(context, 'cooperative_activities.edit') ? (
          <Link href="/operations/activities/editor">Structured editor</Link>
        ) : null}
      </header>

      <section className="activity-admin-status" aria-label="Activity service policy">
        <strong>{settings?.moduleEnabled === false ? 'Entry disabled' : 'Module enabled'}</strong>
        <span>Private party entry only</span>
        <span>Public queue disabled</span>
        <span>
          Existing instances{' '}
          {settings?.allowExistingInstancesToFinish === false ? 'pause' : 'may finish'}
        </span>
      </section>

      <nav className="social-admin-links" aria-label="Cooperative activity views">
        <Link href="?view=instances">Instances</Link>
        <Link href="?view=catalog">Catalog</Link>
        <Link href="?view=rewards">Reward receipts</Link>
        {hasAdminPermission(context, 'cooperative_activities.audit.read') ? (
          <Link href="?view=audit">Audit</Link>
        ) : null}
        {hasAdminPermission(context, 'cooperative_activities.settings.read') ? (
          <Link href="/operations/activities/settings">Settings</Link>
        ) : null}
      </nav>

      <form className="chat-report-filters" method="get">
        <input name="view" type="hidden" value={view} />
        <label>
          Status
          <input defaultValue={filters.status} maxLength={40} name="status" />
        </label>
        <label>
          Public ID, activity key, or player
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

      {records.rows.length === 0 ? (
        <section className="empty-state">
          <h2>No matching activity records</h2>
          <p>The bounded operations query returned no safe records.</p>
        </section>
      ) : records.view === 'catalog' ? (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Lifecycle</th>
                <th>Party</th>
                <th>Duration</th>
                <th>Reward policy</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {records.rows.map((activity) => (
                <tr key={activity.versionId}>
                  <td data-label="Activity">
                    <strong>{activity.name}</strong>
                    <small>{activity.activityKey}</small>
                  </td>
                  <td data-label="Lifecycle">
                    <span className={`state-chip state-chip--${activity.status}`}>
                      {activity.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td data-label="Party">
                    {activity.minimumPartySize}–{activity.maximumPartySize}
                  </td>
                  <td data-label="Duration">{Math.ceil(activity.durationSeconds / 60)} minutes</td>
                  <td data-label="Reward policy">
                    {activity.reward.dust} DUST · {activity.dailyRewardLimit}/day
                  </td>
                  <td data-label="Version">
                    v{activity.contentVersion} · r{activity.revision}
                    <small>{date(activity.publishedAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : records.view === 'instances' ? (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Activity</th>
                <th>Party</th>
                <th>Progress</th>
                <th>Participants</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {records.rows.map((instance) => (
                <tr key={instance.instanceId}>
                  <td data-label="Status">
                    <span className={`state-chip state-chip--${instance.status}`}>
                      {instance.status}
                    </span>
                  </td>
                  <td data-label="Activity">
                    {instance.activityName}
                    <small>{instance.activityKey}</small>
                  </td>
                  <td data-label="Party">
                    <code>{instance.partyId}</code>
                  </td>
                  <td data-label="Progress">
                    {instance.currentObjectiveKey?.replaceAll('-', ' ') ??
                      instance.resultCode ??
                      'Preparing'}
                    <small>revision {instance.revision}</small>
                  </td>
                  <td data-label="Participants">{instance.participantCount}</td>
                  <td data-label="Evidence">
                    <Link href={`/operations/activities/instances/${instance.instanceId}`}>
                      Open instance
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : records.view === 'rewards' ? (
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Player</th>
                <th>DUST</th>
                <th>Daily count</th>
                <th>Settled</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {records.rows.map((receipt) => (
                <tr key={receipt.receiptId}>
                  <td data-label="Status">
                    <span className={`state-chip state-chip--${receipt.status}`}>
                      {receipt.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td data-label="Player">
                    {receipt.displayName}
                    <small>{receipt.presenceId}</small>
                  </td>
                  <td data-label="DUST">{receipt.dust}</td>
                  <td data-label="Daily count">{receipt.dailyRewardNumber}</td>
                  <td data-label="Settled">{date(receipt.settledAt)}</td>
                  <td data-label="Receipt">
                    <code>{receipt.receiptId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="audit-list">
          {records.rows.map((entry) => (
            <li key={entry.entryNumber}>
              <strong>{entry.action.replaceAll('_', ' ')}</strong>
              <span>
                {entry.result} · revision {entry.revision ?? '—'} · {date(entry.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <nav className="pagination" aria-label="Activity result pages">
        {records.page > 1 ? (
          <Link
            href={`?view=${view}&page=${records.page - 1}&pageSize=${pageSize}&status=${encodeURIComponent(filters.status)}&search=${encodeURIComponent(filters.search)}`}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>
          Page {records.page} of {Math.max(totalPages, 1)} · {records.total} records
        </span>
        {records.page < totalPages ? (
          <Link
            href={`?view=${view}&page=${records.page + 1}&pageSize=${pageSize}&status=${encodeURIComponent(filters.status)}&search=${encodeURIComponent(filters.search)}`}
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
